/**
 * Airtable sink. Token, base, and table from Settings (DB) then env.
 * Prefer Avatar / Copy / Model / Tokens. If those columns are missing
 * (PAT cannot create fields), fall back to Name / Notes / Status.
 * Generate never writes posts — send is on-demand via POST /api/airtable/send.
 * Schema wipe/create is Settings-only.
 */
import { getSetting } from "@/lib/config";

export async function airtableConfig(): Promise<{ token: boolean; baseId: string; table: string; ready: boolean }> {
  const token = await getSetting("AIRTABLE_TOKEN");
  const baseId = await getSetting("AIRTABLE_BASE_ID");
  const table = (await getSetting("AIRTABLE_TABLE")) || "Posts";
  return { token: Boolean(token), baseId, table, ready: Boolean(token && baseId) };
}

export type AirtablePost = {
  hook: string;
  script: string;
  on_screen_text?: string[] | string;
  cta?: string;
  outputTokens?: number;
};

export type AirtableWriteMode = "canonical" | "legacy";

export type AirtableWriteResult = {
  rows: number;
  error?: string;
  mode?: AirtableWriteMode;
};

/** Persona/avatar display name — never emoji+handle. */
export function avatarName(name: string, handle = ""): string {
  const n = name.trim();
  if (n) return n;
  return handle.trim();
}

/**
 * Paste-ready copy: hook + script. Skip on-screen captions (those are overlays).
 * Append a short CTA only when it still reads as part of the same post.
 */
export function formatCopy(p: AirtablePost): string {
  const hook = (p.hook ?? "").trim();
  const script = (p.script ?? "").trim();
  let body = "";
  if (hook && script) {
    const hookNorm = hook.replace(/\s+/g, " ").toLowerCase();
    const scriptNorm = script.replace(/\s+/g, " ").toLowerCase();
    body = scriptNorm.startsWith(hookNorm) ? script : `${hook}\n\n${script}`;
  } else {
    body = hook || script;
  }

  const cta = (p.cta ?? "").trim();
  if (cta && cta.length <= 80 && !body.toLowerCase().includes(cta.toLowerCase())) {
    body = body ? `${body}\n\n${cta}` : cta;
  }
  return body.trim();
}

/** Spread batch/round output tokens across N posts. Remainder goes to the first rows. */
export function splitOutputTokens(totalOutput: number, count: number): number[] {
  const n = Math.max(0, Math.floor(count));
  if (n === 0) return [];
  const total = Math.max(0, Math.round(Number(totalOutput) || 0));
  const base = Math.floor(total / n);
  const rem = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}

export type PostFieldValues = {
  Avatar: string;
  Copy: string;
  Model: string;
  Tokens: number;
};

export type LegacyFieldValues = {
  Name: string;
  Notes: string;
  Status: string;
};

type FieldRecord = Record<string, string | number>;

/** Model + token count as a Notes footer until schema sync can add real columns. */
export function notesWithMeta(copy: string, model: string, tokens: number): string {
  const modelBit = (model ?? "").trim();
  const tokenBit = tokens > 0 ? `${tokens} tokens` : "";
  const footer = [modelBit, tokenBit].filter(Boolean).join(" · ");
  if (!footer) return copy;
  return copy ? `${copy}\n\n— ${footer}` : `— ${footer}`;
}

export function buildPostFields(opts: { persona: string; model: string; outputTokens: number }, p: AirtablePost): PostFieldValues {
  return {
    Avatar: avatarName(opts.persona),
    Copy: formatCopy(p),
    Model: (opts.model ?? "").trim(),
    Tokens: Math.max(0, Math.round(Number(opts.outputTokens) || 0)),
  };
}

export function buildLegacyFields(opts: { persona: string; model: string; outputTokens: number }, p: AirtablePost): LegacyFieldValues {
  const tokens = Math.max(0, Math.round(Number(opts.outputTokens) || 0));
  return {
    Name: avatarName(opts.persona),
    Notes: notesWithMeta(formatCopy(p), opts.model, tokens),
    Status: "draft",
  };
}

export function dropStatus(fields: LegacyFieldValues): { Name: string; Notes: string } {
  return { Name: fields.Name, Notes: fields.Notes };
}

export function unknownFieldName(body: string): string | null {
  try {
    const data = JSON.parse(body) as { error?: { message?: string; type?: string } };
    const msg = data?.error?.message ?? "";
    const parsed = msg.match(/Unknown field name: "([^"]+)"/i);
    if (parsed) return parsed[1];
    if (data?.error?.type === "UNKNOWN_FIELD_NAME") return "unknown";
  } catch {
    /* raw text */
  }
  const m = body.match(/Unknown field name: \\?"([^"\\]+)\\?"/i);
  return m?.[1] ?? null;
}

type WriteMode = "canonical" | "legacy" | "legacy-no-status";
let writeModeCache: { key: string; mode: WriteMode } | null = null;

export function clearAirtableWriteModeCache(): void {
  writeModeCache = null;
}

async function postChunk(
  token: string,
  baseId: string,
  table: string,
  records: FieldRecord[],
): Promise<{ written: number; error?: string; unknownField?: string }> {
  if (!records.length) return { written: 0 };
  try {
    const res = await fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ records: records.map((fields) => ({ fields })), typecast: true }),
      signal: AbortSignal.timeout(20_000),
    });
    const body = await res.text().catch(() => "");
    if (res.ok) {
      const data = JSON.parse(body || "{}");
      return { written: Array.isArray(data.records) ? data.records.length : 0 };
    }
    const unknown = unknownFieldName(body);
    if (unknown) {
      return {
        written: 0,
        unknownField: unknown,
        error: `Airtable table is missing “${unknown}”.`,
      };
    }
    return { written: 0, error: `Airtable ${res.status}: ${body.replace(/\s+/g, " ").trim().slice(0, 180)}` };
  } catch (e) {
    return { written: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

async function writeRecords(
  token: string,
  baseId: string,
  table: string,
  canonical: PostFieldValues[],
  legacy: LegacyFieldValues[],
  preferred: WriteMode | null,
): Promise<{ written: number; mode?: WriteMode; error?: string; unknownField?: string }> {
  const tryLegacy = async (withStatus: boolean) => {
    const rows = withStatus ? legacy : legacy.map(dropStatus);
    return postChunk(token, baseId, table, rows);
  };

  const order: WriteMode[] =
    preferred === "legacy-no-status"
      ? ["legacy-no-status", "legacy", "canonical"]
      : preferred === "legacy"
        ? ["legacy", "legacy-no-status", "canonical"]
        : ["canonical", "legacy", "legacy-no-status"];

  let lastError: string | undefined;
  let lastUnknown: string | undefined;

  for (const mode of order) {
    const result =
      mode === "canonical"
        ? await postChunk(token, baseId, table, canonical)
        : await tryLegacy(mode === "legacy");
    if (result.written) return { written: result.written, mode };
    lastError = result.error;
    lastUnknown = result.unknownField;
    // Status is optional — any failure there still retries Name/Notes.
    if (mode === "legacy") continue;
    if (result.unknownField || /UNKNOWN_FIELD_NAME/i.test(result.error ?? "")) continue;
    break;
  }

  return { written: 0, error: lastError ?? "Airtable write failed.", unknownField: lastUnknown };
}

export async function appendPosts(opts: {
  persona: string;
  model: string;
  posts: AirtablePost[];
  outputTokens?: number;
}): Promise<AirtableWriteResult> {
  const token = await getSetting("AIRTABLE_TOKEN");
  const baseId = await getSetting("AIRTABLE_BASE_ID");
  const table = (await getSetting("AIRTABLE_TABLE")) || "Posts";
  if (!token || !baseId) return { rows: 0, error: "Airtable is not configured (token or base missing)." };
  if (!opts.posts.length) return { rows: 0 };

  const tokens = opts.posts.map((p, i) => {
    if (p.outputTokens != null) return Math.max(0, Math.round(Number(p.outputTokens) || 0));
    return splitOutputTokens(opts.outputTokens ?? 0, opts.posts.length)[i] ?? 0;
  });

  const cacheKey = `${baseId}:${table}`;
  let preferred: WriteMode | null = writeModeCache?.key === cacheKey ? writeModeCache.mode : null;

  let written = 0;
  let mode: WriteMode | undefined;
  let lastError: string | undefined;

  for (let i = 0; i < opts.posts.length; i += 10) {
    const chunk = opts.posts.slice(i, i + 10);
    const meta = chunk.map((p, j) => ({
      persona: opts.persona,
      model: opts.model,
      outputTokens: tokens[i + j] ?? 0,
    }));
    const canonical = chunk.map((p, j) => buildPostFields(meta[j]!, p));
    const legacy = chunk.map((p, j) => buildLegacyFields(meta[j]!, p));
    const result = await writeRecords(token, baseId, table, canonical, legacy, preferred);
    if (result.written) {
      written += result.written;
      mode = result.mode;
      if (result.mode) {
        preferred = result.mode;
        writeModeCache = { key: cacheKey, mode: result.mode };
      }
      continue;
    }
    lastError = result.error ?? "Airtable write failed.";
    console.error("airtable write failed", lastError);
    break;
  }

  const publicMode: AirtableWriteMode | undefined = mode === "canonical" ? "canonical" : mode ? "legacy" : undefined;
  return { rows: written, error: written ? undefined : lastError, mode: publicMode };
}

export type AirtableSendSource = {
  batchId: number;
  hook: string;
  script: string;
  onScreenText?: string[] | string;
  cta?: string;
  personaName: string;
  personaHandle?: string;
  model: string;
  batchOutputTokens: number;
};

export type AirtableSendGroup = {
  persona: string;
  model: string;
  posts: AirtablePost[];
};

/** Split each batch’s output tokens across its posts, then group by persona + model. */
export function groupPostsForAirtable(sources: AirtableSendSource[]): AirtableSendGroup[] {
  const byBatch = new Map<number, AirtableSendSource[]>();
  for (const s of sources) {
    const list = byBatch.get(s.batchId) ?? [];
    list.push(s);
    byBatch.set(s.batchId, list);
  }

  const groups = new Map<string, AirtableSendGroup>();
  for (const [, list] of byBatch) {
    const tokens = splitOutputTokens(list[0]?.batchOutputTokens ?? 0, list.length);
    for (let i = 0; i < list.length; i++) {
      const s = list[i]!;
      const persona = avatarName(s.personaName, s.personaHandle ?? "");
      const key = `${persona}\0${s.model}`;
      const g = groups.get(key) ?? { persona, model: s.model, posts: [] };
      g.posts.push({
        hook: s.hook,
        script: s.script,
        on_screen_text: s.onScreenText,
        cta: s.cta,
        outputTokens: tokens[i] ?? 0,
      });
      groups.set(key, g);
    }
  }
  return [...groups.values()];
}

export async function appendGroupedPosts(groups: AirtableSendGroup[]): Promise<AirtableWriteResult> {
  let rows = 0;
  let error: string | undefined;
  let mode: AirtableWriteMode | undefined;
  for (const g of groups) {
    const written = await appendPosts({
      persona: g.persona,
      model: g.model,
      posts: g.posts,
    });
    rows += written.rows;
    if (written.mode) mode = written.mode;
    if (written.error) {
      error = written.error;
      break;
    }
  }
  return { rows, error, mode };
}

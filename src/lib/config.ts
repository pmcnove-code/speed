/**
 * Runtime config: Settings UI writes to app_settings; readers prefer DB, then env.
 * Changing keys here takes effect on the next generate/Airtable call — no redeploy.
 */
import { eq } from "drizzle-orm";
import { db, t } from "@/db";

/** Accepts appXXX-style project numbers or lowercase GCP project ids. */
function looksLikeCloudProject(value: string): boolean {
  const v = value.trim();
  if (/^\d{6,}$/.test(v)) return true;
  return /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(v);
}

export type ConfigGroup =
  | "venice"
  | "deepseek"
  | "grok"
  | "gemini"
  | "experimental"
  | "airtable"
  | "transcription"
  | "generation";

export type ConfigField = {
  key: string;
  label: string;
  group: ConfigGroup;
  secret?: boolean;
  default?: string;
  placeholder?: string;
  hint?: string;
};

export const CONFIG_FIELDS: ConfigField[] = [
  {
    key: "VENICE_API_KEY",
    label: "API key",
    group: "venice",
    secret: true,
    placeholder: "sk-…",
  },
  {
    key: "VENICE_MODEL_ID",
    label: "Model ID",
    group: "venice",
    default: "venice-uncensored-1-2",
    placeholder: "venice-uncensored-1-2",
  },
  {
    key: "DEEPSEEK_API_KEY",
    label: "API key",
    group: "deepseek",
    secret: true,
    placeholder: "sk-…",
  },
  {
    key: "DEEPSEEK_MODEL_ID",
    label: "Model ID",
    group: "deepseek",
    default: "deepseek-chat",
    placeholder: "deepseek-chat",
  },
  {
    key: "GROK_API_KEY",
    label: "API key",
    group: "grok",
    secret: true,
    placeholder: "xai-…",
    hint: "From console.x.ai. Used when you pick Grok on Generate.",
  },
  {
    key: "GROK_MODEL_ID",
    label: "Model ID",
    group: "grok",
    default: "grok-4.6",
    placeholder: "grok-4.6",
    hint: "Grok 4.6 is the current chat model — strong for punchy voice. Change if you want another Grok id.",
  },
  {
    key: "GEMINI_API_KEY",
    label: "API key",
    group: "gemini",
    secret: true,
    placeholder: "AIza… or AQ.…",
    hint: "Paste a Gemini API key. That is enough for Experimental reels.",
  },
  {
    key: "GEMINI_CLOUD_PROJECT",
    label: "Google Cloud project ID",
    group: "gemini",
    placeholder: "my-gcp-project",
    hint: "Optional. Experimental only needs the API key.",
  },
  {
    key: "AIRTABLE_TOKEN",
    label: "Personal access token",
    group: "airtable",
    secret: true,
    placeholder: "pat…",
    hint: "Needs data.records:write plus schema.bases:read and schema.bases:write on this base.",
  },
  {
    key: "AIRTABLE_BASE_ID",
    label: "Base ID",
    group: "airtable",
    placeholder: "appXXXXXXXXXXXXXX",
    hint: "Paste the Airtable URL or app…/tbl… — we store the base and table ids.",
  },
  {
    key: "AIRTABLE_TABLE",
    label: "Table",
    group: "airtable",
    default: "Posts",
    placeholder: "Posts or tbl…",
    hint: "Filled from the URL (tbl…). Sync replaces other columns with Avatar, Copy, Model, Tokens.",
  },
  {
    key: "DEEPGRAM_API_KEY",
    label: "API key",
    group: "transcription",
    secret: true,
    placeholder: "Deepgram key",
    hint: "Used when a YouTube video has no captions.",
  },
  {
    key: "DEEPGRAM_MODEL",
    label: "Model",
    group: "transcription",
    default: "nova-3",
    placeholder: "nova-3",
  },
  {
    key: "GEN_CHUNK",
    label: "Posts per model call",
    group: "generation",
    default: "2",
    hint: "1–8. Smaller chunks fail less often.",
  },
  {
    key: "GEN_MAX_TOKENS",
    label: "Max tokens",
    group: "generation",
    default: "2200",
  },
  {
    key: "GEN_TEMPERATURE",
    label: "Temperature",
    group: "generation",
    default: "0.9",
    hint: "0–2. Higher = more variation.",
  },
  {
    key: "GEN_UNIQUE_DROP",
    label: "Drop similar copies",
    group: "generation",
    default: "1",
    hint: "1 = drop near-duplicates (default). 0 = keep similar posts.",
  },
];

const FIELD_BY_KEY = new Map(CONFIG_FIELDS.map((f) => [f.key, f]));

/** Older Settings writes used these keys; still read as fallback. */
const LEGACY_KEYS: Record<string, string> = {
  AIRTABLE_BASE_ID: "airtable_base_id",
  AIRTABLE_TABLE: "airtable_table",
};

export async function readSetting(key: string): Promise<string> {
  try {
    const [row] = await db.select().from(t.appSettings).where(eq(t.appSettings.key, key));
    return row?.value ?? "";
  } catch {
    return "";
  }
}

export async function writeSetting(key: string, value: string): Promise<void> {
  await db
    .insert(t.appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: t.appSettings.key, set: { value } });
}

export type SettingSource = "db" | "env" | "default" | "unset";

export async function resolveSetting(key: string): Promise<{ value: string; source: SettingSource }> {
  const field = FIELD_BY_KEY.get(key);
  const dbVal = (await readSetting(key)).trim();
  let resolved: { value: string; source: SettingSource };
  if (dbVal) resolved = { value: dbVal, source: "db" };
  else {
    const legacy = LEGACY_KEYS[key];
    const old = legacy ? (await readSetting(legacy)).trim() : "";
    if (old) resolved = { value: old, source: "db" };
    else {
      const envVal = (process.env[key] ?? "").trim();
      if (envVal) resolved = { value: envVal, source: "env" };
      else if (key === "GROK_API_KEY" && (process.env.XAI_API_KEY ?? "").trim()) {
        resolved = { value: (process.env.XAI_API_KEY ?? "").trim(), source: "env" };
      } else if (key === "GEMINI_API_KEY" && (process.env.GOOGLE_API_KEY ?? "").trim()) {
        resolved = { value: (process.env.GOOGLE_API_KEY ?? "").trim(), source: "env" };
      } else if (
        key === "GEMINI_CLOUD_PROJECT" &&
        (process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT ?? "").trim()
      ) {
        resolved = {
          value: (process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT ?? "").trim(),
          source: "env",
        };
      } else if (field?.default) resolved = { value: field.default, source: "default" };
      else resolved = { value: "", source: "unset" };
    }
  }
  return resolved;
}

export async function getSetting(key: string): Promise<string> {
  return (await resolveSetting(key)).value;
}

export function maskSecret(value: string): string {
  if (!value) return "";
  if (value.length <= 8) return "••••";
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export type PublicField = {
  key: string;
  label: string;
  group: ConfigGroup;
  secret: boolean;
  set: boolean;
  source: SettingSource;
  value: string;
  hint: string;
  placeholder?: string;
  help?: string;
};

export async function publicConfig(): Promise<PublicField[]> {
  return Promise.all(
    CONFIG_FIELDS.map(async (f) => {
      const { value: raw, source } = await resolveSetting(f.key);
      return {
        key: f.key,
        label: f.label,
        group: f.group,
        secret: Boolean(f.secret),
        set: Boolean(raw),
        source,
        value: f.secret ? "" : raw,
        hint: f.secret ? maskSecret(raw) : "",
        placeholder: f.placeholder,
        help: f.hint,
      };
    }),
  );
}

/** Accepts appXXX, appXXX/tblYYY[/viwZZZ], or a full airtable.com URL (view ids ignored). */
export function parseAirtableRef(raw: string): { baseId: string; tableId?: string; viewId?: string } | null {
  const s = raw.trim();
  if (!s) return null;
  const fromPath = s.match(
    /(?:^|\/|airtable\.com\/)(app[A-Za-z0-9]+)(?:\/(tbl[A-Za-z0-9]+))?(?:\/(viw[A-Za-z0-9]+))?/i,
  );
  if (fromPath?.[1]) {
    return {
      baseId: fromPath[1],
      ...(fromPath[2] ? { tableId: fromPath[2] } : {}),
      ...(fromPath[3] ? { viewId: fromPath[3] } : {}),
    };
  }
  return null;
}

const BOOL_ON = new Set(["1", "true", "on", "yes"]);
const BOOL_OFF = new Set(["0", "false", "off", "no"]);

/** "1"/"true"/"on" → true; "0"/"false"/"off" → false; empty uses fallback. */
export function parseEnabled(value: string, fallback = true): boolean {
  const v = value.trim().toLowerCase();
  if (!v) return fallback;
  if (BOOL_OFF.has(v)) return false;
  if (BOOL_ON.has(v)) return true;
  return fallback;
}

export function normalizeConfigValues(values: Record<string, string>): Record<string, string> {
  const next = { ...values };
  const fromBase = parseAirtableRef(String(next.AIRTABLE_BASE_ID ?? ""));
  const fromTable = parseAirtableRef(String(next.AIRTABLE_TABLE ?? ""));
  if (fromBase) {
    next.AIRTABLE_BASE_ID = fromBase.baseId;
    if (fromBase.tableId) next.AIRTABLE_TABLE = fromBase.tableId;
  }
  if (fromTable?.baseId && !fromBase) next.AIRTABLE_BASE_ID = fromTable.baseId;
  if (fromTable?.tableId) next.AIRTABLE_TABLE = fromTable.tableId;
  if ("GEN_UNIQUE_DROP" in next) {
    const raw = String(next.GEN_UNIQUE_DROP ?? "").trim().toLowerCase();
    if (BOOL_ON.has(raw)) next.GEN_UNIQUE_DROP = "1";
    else if (BOOL_OFF.has(raw)) next.GEN_UNIQUE_DROP = "0";
  }
  return next;
}

export function validateConfigValue(key: string, value: string): string | null {
  if (key === "AIRTABLE_BASE_ID" && value && !parseAirtableRef(value)) {
    return "Base ID looks wrong. Paste the Airtable URL, or app… / app…/tbl….";
  }
  if (key === "GEMINI_CLOUD_PROJECT" && value && !looksLikeCloudProject(value)) {
    return "Use the Cloud project ID from AI Studio → API keys (lowercase id or numeric project number).";
  }
  if (key === "GEN_CHUNK") {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 1 || n > 8) return "Posts per call must be 1–8.";
  }
  if (key === "GEN_MAX_TOKENS") {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 256 || n > 16000) return "Max tokens must be 256–16000.";
  }
  if (key === "GEN_TEMPERATURE") {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || n > 2) return "Temperature must be 0–2.";
  }
  if (key === "GEN_UNIQUE_DROP" && value) {
    const v = value.trim().toLowerCase();
    if (!BOOL_ON.has(v) && !BOOL_OFF.has(v)) return "Use 1 (drop similar copies) or 0 (keep them).";
  }
  return null;
}

export async function saveConfig(values: Record<string, string>): Promise<{ error?: string }> {
  values = normalizeConfigValues(values);
  for (const field of CONFIG_FIELDS) {
    if (!(field.key in values)) continue;
    const raw = String(values[field.key] ?? "").trim();
    if (field.secret && !raw) continue;
    if (raw) {
      const err = validateConfigValue(field.key, raw);
      if (err) return { error: err };
    }
    await writeSetting(field.key, raw);
    const legacy = LEGACY_KEYS[field.key];
    if (legacy) await writeSetting(legacy, raw);
  }
  return {};
}

export async function uniqueDropEnabled(): Promise<boolean> {
  return parseEnabled(await getSetting("GEN_UNIQUE_DROP"), true);
}

export async function genOptions(): Promise<{
  chunk: number;
  maxTokens: number;
  temperature: number;
  uniqueDrop: boolean;
}> {
  const chunk = Number(await getSetting("GEN_CHUNK"));
  const maxTokens = Number(await getSetting("GEN_MAX_TOKENS"));
  const temperature = Number(await getSetting("GEN_TEMPERATURE"));
  return {
    chunk: Number.isFinite(chunk) ? Math.max(1, Math.min(8, chunk)) : 2,
    maxTokens: Number.isFinite(maxTokens) ? maxTokens : 2200,
    temperature: Number.isFinite(temperature) ? temperature : 0.9,
    uniqueDrop: await uniqueDropEnabled(),
  };
}

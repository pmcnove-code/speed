/**
 * Ensure the configured Airtable table has Avatar / Copy / Model / Tokens.
 * Settings save + Sync can reset the table (delete leftover columns).
 * Generate only adds missing fields — never requires schema write to succeed.
 */
import { getSetting, writeSetting } from "@/lib/config";

export const SCHEMA_SCOPE_ERROR =
  "Airtable token needs schema.bases:read and schema.bases:write on this base (and the base must be granted to the PAT). We create Avatar, Copy, Model, and Tokens columns.";

export type RequiredFieldSpec = {
  name: "Avatar" | "Copy" | "Model" | "Tokens";
  type: "singleLineText" | "multilineText" | "number";
  options?: { precision: number };
};

export const REQUIRED_POST_FIELDS: RequiredFieldSpec[] = [
  { name: "Avatar", type: "singleLineText" },
  { name: "Copy", type: "multilineText" },
  { name: "Model", type: "singleLineText" },
  { name: "Tokens", type: "number", options: { precision: 0 } },
];

const KEEP_NAMES = new Set(REQUIRED_POST_FIELDS.map((f) => f.name.toLowerCase()));

const COMPUTED_TYPES = new Set([
  "aiText",
  "formula",
  "lookup",
  "multipleLookupValues",
  "rollup",
  "count",
  "button",
  "autoNumber",
]);

export type SchemaSyncResult = {
  ok: boolean;
  created: string[];
  existing: string[];
  deleted: string[];
  renamed: string[];
  kept: string[];
  missing: string[];
  tableId?: string;
  tableName?: string;
  error?: string;
};

type MetaField = { id: string; name: string; type: string };
type MetaTable = { id: string; name: string; primaryFieldId?: string; fields: MetaField[] };

type CacheEntry = { key: string; result: SchemaSyncResult };
let cache: CacheEntry | null = null;

export function clearAirtableSchemaCache(): void {
  cache = null;
}

function emptyResult(error?: string): SchemaSyncResult {
  return { ok: !error, created: [], existing: [], deleted: [], renamed: [], kept: [], missing: [], error };
}

function metaHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

export function isSchemaPermissionError(status: number, body: string): boolean {
  const u = body.toUpperCase();
  if (u.includes("INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND")) return true;
  if (u.includes("INVALID_PERMISSIONS")) return true;
  if (status === 401 || status === 403) return true;
  return false;
}

export function isFieldDeleteUnsupported(status: number, body: string): boolean {
  if (status === 404 || status === 405) return true;
  const u = body.toUpperCase();
  return u.includes("NOT_FOUND") || u.includes("METHOD_NOT_ALLOWED") || u.includes("NOT SUPPORTED");
}

export function isDuplicateFieldError(status: number, body: string): boolean {
  if (status === 422 || status === 400) {
    const u = body.toUpperCase();
    if (u.includes("DUPLICATE")) return true;
    if (u.includes("ALREADY EXISTS")) return true;
    if (u.includes("FIELD NAME") && (u.includes("TAKEN") || u.includes("EXIST"))) return true;
  }
  return false;
}

function schemaFail(status: number, body: string, fallback: string): string {
  if (isSchemaPermissionError(status, body)) return SCHEMA_SCOPE_ERROR;
  const snippet = body.replace(/\s+/g, " ").trim().slice(0, 180);
  return snippet ? `${fallback} (${status}): ${snippet}` : `${fallback} (${status}).`;
}

function findTable(tables: MetaTable[], table: string): MetaTable | undefined {
  const want = table.trim();
  if (!want) return undefined;
  return tables.find((x) => x.id === want || x.name.toLowerCase() === want.toLowerCase());
}

function fieldNames(table: Pick<MetaTable, "fields">): Set<string> {
  return new Set(table.fields.map((f) => f.name.toLowerCase()));
}

export function fieldsToDelete(table: Pick<MetaTable, "primaryFieldId" | "fields">): MetaField[] {
  const primaryId = table.primaryFieldId ?? table.fields[0]?.id;
  return table.fields.filter((f) => f.id !== primaryId && !KEEP_NAMES.has(f.name.toLowerCase()));
}

/** Delete dependents (AI / formula / lookup) before Attachments and other sources. */
export function sortFieldsForDelete(fields: MetaField[]): MetaField[] {
  const rank = (f: MetaField) => {
    if (COMPUTED_TYPES.has(f.type)) return 0;
    if (f.type === "multipleAttachments") return 2;
    return 1;
  };
  return [...fields].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

export function schemaGaps(table: Pick<MetaTable, "primaryFieldId" | "fields">): { missing: string[]; extras: string[] } {
  const names = fieldNames(table);
  return {
    missing: REQUIRED_POST_FIELDS.map((f) => f.name).filter((n) => !names.has(n.toLowerCase())),
    extras: fieldsToDelete(table).map((f) => f.name),
  };
}

async function listTables(token: string, baseId: string): Promise<{ tables: MetaTable[]; error?: string }> {
  try {
    const res = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
      headers: metaHeaders(token),
      signal: AbortSignal.timeout(20_000),
    });
    const body = await res.text().catch(() => "");
    if (!res.ok) return { tables: [], error: schemaFail(res.status, body, "Airtable schema read failed") };
    const data = JSON.parse(body || "{}") as { tables?: MetaTable[] };
    return { tables: Array.isArray(data.tables) ? data.tables : [] };
  } catch (e) {
    return { tables: [], error: e instanceof Error ? e.message : String(e) };
  }
}

async function loadTable(
  token: string,
  baseId: string,
  tableRef: string,
): Promise<{ table?: MetaTable; error?: string }> {
  const listed = await listTables(token, baseId);
  if (listed.error) return { error: listed.error };
  const table = findTable(listed.tables, tableRef);
  if (!table) return { error: `Airtable table “${tableRef}” was not found in this base.` };
  return { table };
}

async function createField(
  token: string,
  baseId: string,
  tableId: string,
  spec: RequiredFieldSpec,
): Promise<{ error?: string; duplicate?: boolean }> {
  try {
    const payload: Record<string, unknown> = { name: spec.name, type: spec.type };
    if (spec.options) payload.options = spec.options;
    const res = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables/${tableId}/fields`, {
      method: "POST",
      headers: metaHeaders(token),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    });
    const body = await res.text().catch(() => "");
    if (res.ok) return {};
    if (isDuplicateFieldError(res.status, body)) return { duplicate: true };
    const error = schemaFail(res.status, body, `Could not create column “${spec.name}”`);
    console.error("airtable schema create failed", spec.name, error);
    return { error };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("airtable schema create failed", spec.name, error);
    return { error };
  }
}

async function updateField(
  token: string,
  baseId: string,
  tableId: string,
  fieldId: string,
  patch: Record<string, unknown>,
): Promise<{ error?: string }> {
  try {
    const res = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables/${tableId}/fields/${fieldId}`, {
      method: "PATCH",
      headers: metaHeaders(token),
      body: JSON.stringify(patch),
      signal: AbortSignal.timeout(20_000),
    });
    const body = await res.text().catch(() => "");
    if (res.ok) return {};
    return { error: schemaFail(res.status, body, "Could not update Airtable column") };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

async function deleteField(
  token: string,
  baseId: string,
  tableId: string,
  field: MetaField,
): Promise<{ error?: string; unsupported?: boolean }> {
  try {
    const res = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables/${tableId}/fields/${field.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000),
    });
    const body = await res.text().catch(() => "");
    if (res.ok) return {};
    if (isFieldDeleteUnsupported(res.status, body)) {
      const error = `Airtable cannot delete column “${field.name}” via API (${res.status}).`;
      console.error("airtable schema delete unsupported", field.name, field.type, error);
      return { error, unsupported: true };
    }
    const error = schemaFail(res.status, body, `Could not delete column “${field.name}”`);
    console.error("airtable schema delete failed", field.name, field.type, error);
    return { error };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("airtable schema delete failed", field.name, error);
    return { error };
  }
}

async function createPostsTable(
  token: string,
  baseId: string,
  name: string,
): Promise<{ table?: MetaTable; error?: string }> {
  try {
    const res = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
      method: "POST",
      headers: metaHeaders(token),
      body: JSON.stringify({
        name,
        fields: REQUIRED_POST_FIELDS.map((f) => {
          const row: Record<string, unknown> = { name: f.name, type: f.type };
          if (f.options) row.options = f.options;
          return row;
        }),
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const body = await res.text().catch(() => "");
    if (!res.ok) return { error: schemaFail(res.status, body, "Could not create Airtable table") };
    const table = JSON.parse(body || "{}") as MetaTable;
    if (!table.id) return { error: "Airtable created a table but returned no id." };
    return { table };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

async function persistTableId(tableId: string): Promise<void> {
  await writeSetting("AIRTABLE_TABLE", tableId);
  await writeSetting("airtable_table", tableId);
}

function migrateRecordFields(fields: Record<string, unknown>): Record<string, string | number> | null {
  const avatar = String(fields.Avatar ?? fields.Name ?? "").trim();
  const copy = String(fields.Copy ?? fields.Notes ?? "").trim();
  const model = String(fields.Model ?? "").trim();
  const tokens = Math.max(0, Math.round(Number(fields.Tokens) || 0));
  if (!avatar && !copy && !model && !tokens) return null;
  return { Avatar: avatar, Copy: copy, Model: model, Tokens: tokens };
}

async function copyRecords(
  token: string,
  baseId: string,
  fromTableId: string,
  toTableId: string,
): Promise<{ rows: number; error?: string }> {
  const rows: Record<string, string | number>[] = [];
  let offset: string | undefined;
  try {
    do {
      const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(fromTableId)}`);
      url.searchParams.set("pageSize", "100");
      if (offset) url.searchParams.set("offset", offset);
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(20_000),
      });
      const body = await res.text().catch(() => "");
      if (!res.ok) return { rows: 0, error: schemaFail(res.status, body, "Could not read Airtable rows to copy") };
      const data = JSON.parse(body || "{}") as {
        records?: { fields?: Record<string, unknown> }[];
        offset?: string;
      };
      for (const rec of data.records ?? []) {
        const mapped = migrateRecordFields(rec.fields ?? {});
        if (mapped) rows.push(mapped);
      }
      offset = data.offset;
    } while (offset);
  } catch (e) {
    return { rows: 0, error: e instanceof Error ? e.message : String(e) };
  }

  let written = 0;
  for (let i = 0; i < rows.length; i += 10) {
    const chunk = rows.slice(i, i + 10);
    try {
      const res = await fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(toTableId)}`, {
        method: "POST",
        headers: metaHeaders(token),
        body: JSON.stringify({ records: chunk.map((fields) => ({ fields })), typecast: true }),
        signal: AbortSignal.timeout(20_000),
      });
      const body = await res.text().catch(() => "");
      if (!res.ok) return { rows: written, error: schemaFail(res.status, body, "Could not copy rows to the new table") };
      const data = JSON.parse(body || "{}") as { records?: unknown[] };
      written += Array.isArray(data.records) ? data.records.length : 0;
    } catch (e) {
      return { rows: written, error: e instanceof Error ? e.message : String(e) };
    }
  }
  return { rows: written };
}

/**
 * Rename the primary field to Avatar (Airtable always keeps one primary).
 * Type change is best-effort — the Meta API only documents name/description/options.
 * Delete leftover columns; 404 means the public API cannot delete fields (not success).
 */
async function resetTableColumns(
  token: string,
  baseId: string,
  table: MetaTable,
): Promise<{ deleted: string[]; renamed: string[]; kept: string[]; error?: string }> {
  const deleted: string[] = [];
  const renamed: string[] = [];
  const primaryId = table.primaryFieldId ?? table.fields[0]?.id;
  if (!primaryId) return { deleted, renamed, kept: [], error: "Airtable table has no primary field." };

  const extrasNamedAvatar = table.fields.filter((f) => f.id !== primaryId && f.name.toLowerCase() === "avatar");
  for (const f of extrasNamedAvatar) {
    const gone = await deleteField(token, baseId, table.id, f);
    if (gone.error) {
      if (gone.unsupported) break;
      return { deleted, renamed, kept: extrasNamedAvatar.map((x) => x.name), error: gone.error };
    }
    deleted.push(f.name);
    table.fields = table.fields.filter((x) => x.id !== f.id);
  }

  const primary = table.fields.find((f) => f.id === primaryId);
  if (primary && primary.name !== "Avatar") {
    const upd = await updateField(token, baseId, table.id, primary.id, { name: "Avatar" });
    if (upd.error) return { deleted, renamed, kept: [], error: upd.error };
    renamed.push(`${primary.name}→Avatar`);
    primary.name = "Avatar";
  }
  if (primary && primary.type !== "singleLineText") {
    const typed = await updateField(token, baseId, table.id, primary.id, { type: "singleLineText" });
    if (typed.error) {
      console.error("airtable schema primary type change skipped", primary.type, typed.error);
    } else {
      primary.type = "singleLineText";
    }
  }

  const remaining = () => sortFieldsForDelete(fieldsToDelete(table));
  let pending = remaining();
  let unsupported = false;
  for (let pass = 0; pass < 3 && pending.length; pass++) {
    let progressed = false;
    const still: MetaField[] = [];
    for (const f of pending) {
      const gone = await deleteField(token, baseId, table.id, f);
      if (!gone.error) {
        deleted.push(f.name);
        table.fields = table.fields.filter((x) => x.id !== f.id);
        progressed = true;
        continue;
      }
      if (gone.unsupported) unsupported = true;
      still.push(f);
    }
    pending = still;
    if (!progressed) break;
  }

  const kept = remaining().map((f) => f.name);
  if (kept.length && !unsupported) {
    return {
      deleted,
      renamed,
      kept,
      error: `Could not delete leftover columns: ${kept.join(", ")}.`,
    };
  }
  return { deleted, renamed, kept };
}

async function addMissingFields(
  token: string,
  baseId: string,
  table: MetaTable,
): Promise<{ created: string[]; error?: string }> {
  const created: string[] = [];
  const names = fieldNames(table);
  for (const spec of REQUIRED_POST_FIELDS) {
    if (names.has(spec.name.toLowerCase())) continue;
    const added = await createField(token, baseId, table.id, spec);
    if (added.duplicate) {
      names.add(spec.name.toLowerCase());
      continue;
    }
    if (added.error) {
      if (spec.name === "Avatar") {
        console.error("airtable schema skip Avatar create", added.error);
        continue;
      }
      return { created, error: added.error };
    }
    created.push(spec.name);
    names.add(spec.name.toLowerCase());
  }
  return { created };
}

async function replaceWithCleanTable(
  token: string,
  baseId: string,
  source: MetaTable,
): Promise<{ table?: MetaTable; copied: number; error?: string }> {
  const listed = await listTables(token, baseId);
  if (listed.error) return { copied: 0, error: listed.error };

  const cleanExisting = listed.tables.find((t) => {
    if (t.id === source.id) return false;
    const gaps = schemaGaps(t);
    return gaps.missing.length === 0 && gaps.extras.length === 0;
  });
  if (cleanExisting) {
    const copied = await copyRecords(token, baseId, source.id, cleanExisting.id);
    await persistTableId(cleanExisting.id);
    return { table: cleanExisting, copied: copied.rows, error: copied.error };
  }

  const taken = new Set(listed.tables.map((t) => t.name.toLowerCase()));
  const candidates = ["Posts", "Copy Studio Posts", "Posts Sync"];
  let table: MetaTable | undefined;
  let lastError: string | undefined;
  for (const name of candidates) {
    if (taken.has(name.toLowerCase())) continue;
    const made = await createPostsTable(token, baseId, name);
    if (made.table) {
      table = made.table;
      break;
    }
    lastError = made.error;
  }
  if (!table) return { copied: 0, error: lastError ?? "Could not create a clean Airtable table." };

  const copied = await copyRecords(token, baseId, source.id, table.id);
  await persistTableId(table.id);
  return { table, copied: copied.rows, error: copied.error };
}

function finish(
  table: MetaTable | undefined,
  parts: Omit<SchemaSyncResult, "ok" | "existing" | "missing" | "tableId" | "tableName"> & { error?: string },
): SchemaSyncResult {
  const gaps = table ? schemaGaps(table) : { missing: REQUIRED_POST_FIELDS.map((f) => f.name), extras: [] };
  const kept = parts.kept.length ? parts.kept : gaps.extras;
  const missing = gaps.missing;
  const existing = REQUIRED_POST_FIELDS.map((f) => f.name).filter(
    (n) => !missing.includes(n) && !parts.created.includes(n),
  );
  let error = parts.error;
  if (!error && missing.length) {
    error = `Airtable table is missing ${missing.join(", ")}.`;
  } else if (!error && kept.length) {
    error = `Airtable leftover columns could not be deleted: ${kept.join(", ")}.`;
  }
  const result: SchemaSyncResult = {
    ok: !error && missing.length === 0 && kept.length === 0,
    created: parts.created,
    existing,
    deleted: parts.deleted,
    renamed: parts.renamed,
    kept,
    missing,
    tableId: table?.id,
    tableName: table?.name,
    error,
  };
  if (!result.ok) {
    console.error("airtable schema incomplete", {
      missing: result.missing,
      kept: result.kept,
      error: result.error,
      tableId: result.tableId,
    });
  } else {
    console.info("airtable schema ready", {
      tableId: result.tableId,
      created: result.created,
      deleted: result.deleted,
      renamed: result.renamed,
    });
  }
  return result;
}

/**
 * Add Avatar / Copy / Model / Tokens to the configured table.
 * `reset: true` (Settings save / Sync) deletes unused columns first.
 * Generate should call without reset so a missing schema scope never blocks writes.
 */
export async function ensurePostTableSchema(opts?: { force?: boolean; reset?: boolean }): Promise<SchemaSyncResult> {
  const token = await getSetting("AIRTABLE_TOKEN");
  const baseId = await getSetting("AIRTABLE_BASE_ID");
  const tableRef = (await getSetting("AIRTABLE_TABLE")) || "Posts";
  if (!token || !baseId) {
    return emptyResult("Airtable is not configured (token or base missing).");
  }

  const key = `${baseId}:${tableRef}:${opts?.reset ? "reset" : "add"}`;
  if (!opts?.force && cache?.key === key && cache.result.ok) return cache.result;

  let listed = await listTables(token, baseId);
  if (listed.error) {
    const result = emptyResult(listed.error);
    cache = { key, result };
    return result;
  }

  let table = findTable(listed.tables, tableRef);
  const created: string[] = [];
  const deleted: string[] = [];
  const renamed: string[] = [];
  let kept: string[] = [];

  if (!table && !/^tbl[A-Za-z0-9]+$/.test(tableRef)) {
    const made = await createPostsTable(token, baseId, tableRef);
    if (made.error || !made.table) {
      const result = { ...emptyResult(made.error ?? "Could not create Airtable table."), created, deleted, renamed };
      cache = { key, result };
      return result;
    }
    table = made.table;
    created.push(...REQUIRED_POST_FIELDS.map((f) => f.name));
    await persistTableId(table.id);
  }

  if (!table) {
    const result = emptyResult(`Airtable table “${tableRef}” was not found in this base.`);
    cache = { key, result };
    return result;
  }

  await persistTableId(table.id);

  if (opts?.reset) {
    const wiped = await resetTableColumns(token, baseId, table);
    deleted.push(...wiped.deleted);
    renamed.push(...wiped.renamed);
    kept = wiped.kept;
    const refreshed = await loadTable(token, baseId, table.id);
    if (refreshed.table) table = refreshed.table;
    if (wiped.error && !wiped.kept.length) {
      const added = await addMissingFields(token, baseId, table);
      created.push(...added.created);
      const latest = await loadTable(token, baseId, table.id);
      const result = finish(latest.table ?? table, { created, deleted, renamed, kept, error: wiped.error });
      cache = { key, result };
      return result;
    }
  }

  const added = await addMissingFields(token, baseId, table);
  created.push(...added.created);
  if (added.error) {
    const latest = await loadTable(token, baseId, table.id);
    const result = finish(latest.table ?? table, { created, deleted, renamed, kept, error: added.error });
    cache = { key, result };
    return result;
  }

  let latest = await loadTable(token, baseId, table.id);
  if (latest.table) table = latest.table;
  let gaps = schemaGaps(table);

  if (opts?.reset && gaps.extras.length) {
    console.error("airtable schema extras remain; creating a clean table", gaps.extras);
    const replaced = await replaceWithCleanTable(token, baseId, table);
    if (replaced.error && !replaced.table) {
      const result = finish(table, {
        created,
        deleted,
        renamed,
        kept: gaps.extras,
        error: `${replaced.error} Leftover columns: ${gaps.extras.join(", ")}. Delete them in Airtable or allow a new Posts table.`,
      });
      cache = { key, result };
      return result;
    }
    if (replaced.table) {
      renamed.push(`${table.name}→${replaced.table.name}`);
      table = replaced.table;
      if (replaced.error) {
        console.error("airtable schema row copy failed", replaced.error);
      }
      latest = await loadTable(token, baseId, table.id);
      if (latest.table) table = latest.table;
      gaps = schemaGaps(table);
      kept = gaps.extras;
    }
  } else {
    kept = gaps.extras;
  }

  const result = finish(table, { created, deleted, renamed, kept });
  cache = { key: `${baseId}:${(await getSetting("AIRTABLE_TABLE")) || tableRef}:${opts?.reset ? "reset" : "add"}`, result };
  return result;
}

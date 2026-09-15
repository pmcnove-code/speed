/**
 * Prod check: schema reset + one write + delete. Never prints secrets.
 */
import { getSetting } from "../src/lib/config";
import { airtableConfig, buildLegacyFields, buildPostFields, dropStatus } from "../src/lib/airtable";
import { ensurePostTableSchema } from "../src/lib/airtable-schema";

const MARKER = `copy-studio-probe-${Date.now()}`;

async function main() {
  const cfg = await airtableConfig();
  console.log(`ready=${cfg.ready} table=${cfg.table.startsWith("tbl") ? "tbl…" : cfg.table}`);
  if (!cfg.ready) {
    console.error("airtable not configured");
    process.exitCode = 1;
    return;
  }

  const schema = await ensurePostTableSchema({ force: true, reset: true });
  console.log(
    `schema ok=${schema.ok} created=${schema.created.join(",") || "(none)"} deleted=${schema.deleted.join(",") || "(none)"} renamed=${schema.renamed.join(",") || "(none)"} error=${schema.error ? "yes" : "no"}`,
  );
  if (schema.error) console.log(`schema_error=${schema.error}`);

  const token = await getSetting("AIRTABLE_TOKEN");
  const baseId = await getSetting("AIRTABLE_BASE_ID");
  const table = (await getSetting("AIRTABLE_TABLE")) || "Posts";
  const post = { hook: MARKER, script: "probe row — delete me", cta: "" };
  const meta = { persona: "Probe", model: "probe", outputTokens: 1 };
  const attempts = [buildPostFields(meta, post), buildLegacyFields(meta, post), dropStatus(buildLegacyFields(meta, post))];

  let recordId = "";
  let mode = "";
  for (const fields of attempts) {
    const res = await fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ records: [{ fields }], typecast: true }),
    });
    const body = await res.text().catch(() => "");
    if (!res.ok) {
      console.log(`write_attempt status=${res.status} unknown=${/Unknown field name/i.test(body)}`);
      continue;
    }
    const data = JSON.parse(body || "{}") as { records?: { id?: string }[] };
    recordId = data.records?.[0]?.id ?? "";
    mode = "Avatar" in fields ? "canonical" : "Status" in fields ? "legacy" : "legacy-no-status";
    break;
  }

  if (!recordId) {
    console.error("write failed");
    process.exitCode = 1;
    return;
  }
  console.log(`write ok mode=${mode} id=${recordId.slice(0, 6)}…`);

  const del = await fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}/${recordId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log(`delete status=${del.status} ok=${del.ok}`);
  if (!del.ok) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});

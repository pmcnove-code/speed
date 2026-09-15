/**
 * One-shot schema sync for the configured Airtable table.
 * Uses Settings (DB) token first — never prints secrets.
 */
import { ensurePostTableSchema } from "../src/lib/airtable-schema";
import { airtableConfig } from "../src/lib/airtable";

async function main() {
  const cfg = await airtableConfig();
  console.log(`Airtable ready=${cfg.ready} base=${cfg.baseId || "(none)"} table=${cfg.table}`);
  const result = await ensurePostTableSchema({ force: true, reset: true });
  if (result.error) {
    console.error(`schema sync failed: ${result.error}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `schema sync ok table=${result.tableId ?? cfg.table} created=${result.created.join(",") || "(none)"} deleted=${result.deleted.join(",") || "(none)"} renamed=${result.renamed.join(",") || "(none)"} kept=${result.kept.join(",") || "(none)"} missing=${result.missing.join(",") || "(none)"}`,
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});

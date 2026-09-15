/** Programmatic migrator — reliable in CI/container where the drizzle-kit CLI spinner stalls. */
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL ?? "postgres://copy:copy@localhost:5432/copystudio",
  });
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("migrations applied");
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

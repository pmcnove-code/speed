/** Programmatic migrator — reliable in CI/container where the drizzle-kit CLI spinner stalls. */
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

interface MigrationError extends Error {
  cause?: { code?: string };
  code?: string;
}

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL ?? "postgres://copy:copy@localhost:5432/copystudio",
  });
  const db = drizzle(pool);
  
  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    console.log("migrations applied");
  } catch (error) {
    const err = error as unknown as MigrationError;
    // Ignore "column already exists" errors (42701) - partial migrations are recoverable
    if (err?.cause?.code === '42701' || err?.code === '42701' || 
        (err instanceof Error && err.message?.includes('already exists'))) {
      console.log("INFO: Skipping duplicate column error (partial migration state); continuing startup");
    } else {
      throw error;
    }
  }
  
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

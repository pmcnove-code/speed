import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pool?: Pool };

export const pool =
  globalForDb.pool ??
  new Pool({
    connectionString: process.env.DATABASE_URL ?? "postgres://copy:copy@localhost:5432/copystudio",
    max: 10,
  });
globalForDb.pool = pool;

export const db = drizzle(pool, { schema });
export * as t from "./schema";

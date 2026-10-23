import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const connectionString =
  process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL or POSTGRES_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString,
  max: process.env.VERCEL ? 1 : 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});
export const db = drizzle(pool, { schema });

export * from "./schema";

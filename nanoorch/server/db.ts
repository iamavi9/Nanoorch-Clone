import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";
import { loadSecret } from "./lib/secrets";

const { Pool } = pg;

const databaseUrl = loadSecret("DATABASE_URL") ?? process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL must be set (or DATABASE_URL_FILE pointing to a file containing the URL). " +
    "Did you forget to provision a database?"
  );
}

export const pool = new Pool({ connectionString: databaseUrl });
export const db = drizzle(pool, { schema });

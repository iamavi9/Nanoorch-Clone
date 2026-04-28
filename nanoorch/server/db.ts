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

// Validate the URL before handing it to pg.  pg-connection-string silently
// swallows new URL() exceptions, leaving an undefined reference that later
// surfaces as the confusing "Cannot read properties of undefined (reading
// 'searchParams')" crash.  Failing here gives a clear, actionable message.
try {
  new URL(databaseUrl);
} catch {
  throw new Error(
    `DATABASE_URL is not a valid URL: "${databaseUrl}". ` +
    "Make sure it follows the format: postgres://user:password@host:5432/dbname. " +
    "If the password contains special characters (@, #, /, ?, etc.) they must be " +
    "percent-encoded (e.g. @ → %40)."
  );
}

export const pool = new Pool({ connectionString: databaseUrl });
export const db = drizzle(pool, { schema });

import "dotenv/config";
import { Pool, type PoolConfig } from "pg";

/**
 * The jobs table is the queue - no separate broker (see apps/api's
 * JobRepository doc comment). This worker and apps/api's Spring Boot process
 * are independent services that only agree on the table's shape.
 *
 * Prefers discrete PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD fields over a
 * single DATABASE_URL connection string: a raw password field never needs
 * URL-encoding, whereas a special character in a password (a real rotated
 * Neon password included one) breaks a combined connection string's syntax
 * with an opaque "Invalid URL" - confirmed by hitting exactly that. Falls
 * back to DATABASE_URL if the discrete fields aren't set, for anyone whose
 * password happens to be URL-safe and prefers that format.
 *
 * PGSSLMODE=require enables SSL (needed for Neon/Supabase/most hosted free
 * tiers); left unset, no SSL is requested, matching a plain local/Docker
 * Postgres that doesn't speak SSL at all.
 */
function buildPoolConfig(): PoolConfig | undefined {
  if (process.env.PGHOST) {
    return {
      host: process.env.PGHOST,
      port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
      database: process.env.PGDATABASE,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : undefined,
    };
  }
  if (process.env.DATABASE_URL) {
    return { connectionString: process.env.DATABASE_URL };
  }
  return undefined; // pg.Pool() falls back to its own PG*-env-var defaults
}

export const pool = new Pool(buildPoolConfig());

import "dotenv/config";
import { promises as fs } from "node:fs";
import { pool } from "./db.js";
import { generateProject } from "./generate.js";
import type { JobInput } from "./types.js";

/** Just enough of pg.Pool's surface to be fakeable in tests without a real Postgres. */
export interface QueryableDb {
  query<T = unknown>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

/**
 * Polls apps/api's Postgres jobs table directly - the table doubles as the
 * queue (see apps/api's JobRepository doc comment), so this is the other half
 * of a contract expressed only in SQL, not a client library shared between
 * the two services. Runs as its own long-lived process (npm run queue),
 * separate from the CLI/HTTP direct-invocation paths in cli.ts/server.ts,
 * which keep working unchanged for local testing.
 */

interface ClaimedJobRow {
  id: string;
  project_name: string;
  app_url: string;
  test_case_sheet_path: string;
  has_credentials: boolean;
  credentials_path: string | null;
}

export async function claimNextJob(db: QueryableDb = pool): Promise<ClaimedJobRow | null> {
  const result = await db.query<ClaimedJobRow>(`
    UPDATE jobs SET status = 'GENERATING', updated_at = now()
    WHERE id = (
      SELECT id FROM jobs WHERE status = 'QUEUED'
      ORDER BY created_at
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id, project_name, app_url, test_case_sheet_path, has_credentials, credentials_path
  `);
  return result.rows[0] ?? null;
}

export async function updateJobStatus(
  id: string,
  status: string,
  fields: Record<string, unknown> = {},
  db: QueryableDb = pool
): Promise<void> {
  const setClauses = ["status = $2", "updated_at = now()"];
  const values: unknown[] = [id, status];
  let paramIndex = 3;
  for (const [column, value] of Object.entries(fields)) {
    setClauses.push(`${column} = $${paramIndex}`);
    values.push(value);
    paramIndex++;
  }
  await db.query(`UPDATE jobs SET ${setClauses.join(", ")} WHERE id = $1`, values);
}

/** Matches JobStorageService.storeCredentials's plain "key=value\n" format exactly. */
export function parseCredentialsFile(raw: string): { username?: string; password?: string } {
  const result: { username?: string; password?: string } = {};
  for (const line of raw.split("\n")) {
    const [key, ...rest] = line.split("=");
    const value = rest.join("=");
    if (key === "username") result.username = value;
    if (key === "password") result.password = value;
  }
  return result;
}

export async function processJob(
  job: ClaimedJobRow,
  db: QueryableDb = pool,
  generate: typeof generateProject = generateProject
): Promise<void> {
  console.log(`[queue] claimed job ${job.id} (${job.project_name})`);

  try {
    const testCaseSheet = await fs.readFile(job.test_case_sheet_path);

    let username: string | undefined;
    let password: string | undefined;
    if (job.has_credentials && job.credentials_path) {
      const raw = await fs.readFile(job.credentials_path, "utf8");
      ({ username, password } = parseCredentialsFile(raw));
    }

    const input: JobInput = {
      projectName: job.project_name,
      appUrl: job.app_url,
      username,
      password,
      testCaseSheet,
    };

    const result = await generate(input, (status) => updateJobStatus(job.id, status, {}, db));

    // Only known at the terminal state (validation runs before packaging, and
    // progress updates in between only touch the status column) - see Job.java's
    // validation_report doc comment for why this is stored as a distinct field
    // rather than folded into summary.
    const validationReport = result.validation ? JSON.stringify(result.validation) : null;

    if (result.success && result.zipPath) {
      await updateJobStatus(
        job.id,
        "READY",
        { zip_path: result.zipPath, summary: result.summary, validation_report: validationReport },
        db
      );
      console.log(`[queue] job ${job.id} READY`);
    } else {
      await updateJobStatus(
        job.id,
        "FAILED",
        { error_message: result.error, summary: result.summary, validation_report: validationReport },
        db
      );
      console.log(`[queue] job ${job.id} FAILED: ${result.error}`);
    }
  } catch (err) {
    await updateJobStatus(job.id, "FAILED", { error_message: (err as Error).message }, db);
    console.error(`[queue] job ${job.id} threw:`, err);
  } finally {
    // The worker is the only consumer of the plaintext credentials file (see
    // JobStorageService's doc comment) - delete it now that it's been read,
    // regardless of whether generation succeeded.
    if (job.credentials_path) {
      await fs.unlink(job.credentials_path).catch(() => {});
    }
  }
}

async function pollLoop(intervalMs: number): Promise<never> {
  console.log(`[queue] polling every ${intervalMs}ms...`);
  for (;;) {
    const job = await claimNextJob().catch((err) => {
      console.error("[queue] claim failed:", (err as Error).message);
      return null;
    });

    if (job) {
      await processJob(job);
    } else {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
}

// Only auto-start when this file is run directly (npm run queue), not when
// its functions are imported elsewhere - importing used to unconditionally
// kick off a real poll loop against a real (possibly nonexistent, from a
// test's perspective) Postgres, discovered when a verification script hung
// trying to import claimNextJob/processJob for testing.
const isEntryPoint = process.argv[1] && import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}`;
if (isEntryPoint) {
  pollLoop(Number(process.env.QUEUE_POLL_INTERVAL_MS ?? 3000)).catch((err) => {
    console.error("[queue] fatal:", err);
    process.exit(1);
  });
}

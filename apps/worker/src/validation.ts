import { exec } from "node:child_process";
import { promisify } from "node:util";
import { buildMavenEnv } from "./mavenEnv.js";
import { readTestResults } from "./testResults.js";
import { scanForSecretsAndUnexpectedFiles, checkCoreFilesUnmodified } from "./fileSafety.js";
import type { ValidationResult } from "./types.js";

const execAsync = promisify(exec);

/**
 * Runs entirely outside the agent's own session, using our own process to
 * call mvn directly - the "deterministic component is authoritative for
 * source validity" half of the platform design, independent of whatever the
 * agent already claimed inside its own transcript. Compile is re-checked even
 * though the agent already ran it once, because trusting the agent's
 * self-report is exactly the failure mode this project already learned the
 * hard way not to repeat (see the SecureBank saga: "it compiles" was never
 * proof "it works").
 *
 * runLiveTests defaults to true (opt-out, not opt-in) to match discovery.ts's
 * convention - but be aware this runs the real generated suite against the
 * live target app (real logins, real form submissions, whatever the test
 * steps do), the same caveat discovery's login attempt already carries.
 */
export async function runIndependentValidation(
  workspaceDir: string,
  projectName: string,
  options: { runLiveTests?: boolean } = {}
): Promise<ValidationResult> {
  const runLiveTests = options.runLiveTests ?? true;
  const env = buildMavenEnv();
  const execOptions = { cwd: workspaceDir, env, maxBuffer: 10 * 1024 * 1024 };

  let compileOk = true;
  let compileError: string | undefined;
  try {
    await execAsync("mvn -q test-compile", { ...execOptions, timeout: 120_000 });
  } catch (err) {
    compileOk = false;
    const failure = err as { stdout?: string; stderr?: string; message: string };
    compileError = failure.stdout || failure.stderr || failure.message;
  }

  if (compileOk && runLiveTests) {
    // A failing exit code here just means some test failed - readTestResults below is
    // the real signal, not this catch (mvn test exits non-zero on any test failure).
    await execAsync("mvn -q test", { ...execOptions, timeout: 300_000 }).catch(() => {});
  }

  const [testResults, secretScan, coreFileIssues] = await Promise.all([
    readTestResults(workspaceDir),
    scanForSecretsAndUnexpectedFiles(workspaceDir),
    checkCoreFilesUnmodified(workspaceDir, projectName),
  ]);

  return {
    compileOk,
    compileError,
    testResults,
    fileSafetyIssues: [...secretScan.issues, ...coreFileIssues],
  };
}

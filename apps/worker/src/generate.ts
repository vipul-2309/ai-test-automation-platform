import path from "node:path";
import { assertConfigured, config } from "./config.js";
import { loadSkillContext } from "./skillLoader.js";
import { parseTestCaseSheet } from "./testCaseSheet.js";
import { buildPrompt, buildRepairPrompt } from "./promptBuilder.js";
import { createJobId, provisionWorkspace } from "./workspace.js";
import { runGenerationAgent } from "./agentRunner.js";
import { discoverApplication } from "./discovery.js";
import { runIndependentValidation } from "./validation.js";
import { packageWorkspace } from "./packager.js";
import type { DiscoveryResult, GenerationResult, JobInput, ValidationResult } from "./types.js";

const PROJECT_NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function validateInput(input: JobInput): void {
  if (!input.projectName || !PROJECT_NAME_PATTERN.test(input.projectName)) {
    throw new Error(
      `projectName must be lowercase and hyphen-separated (e.g. "globex-crm"); got "${input.projectName}".`
    );
  }
  if (!input.appUrl || !/^https?:\/\//i.test(input.appUrl)) {
    throw new Error(`appUrl must be an absolute http(s) URL; got "${input.appUrl}".`);
  }
  if (!input.testCaseSheet || input.testCaseSheet.length === 0) {
    throw new Error("testCaseSheet is required and must not be empty.");
  }
}

/**
 * Discovery is an enhancement, not a hard dependency: a bad heuristic-login
 * match, a slow/unreachable target, or an SSRF-guard rejection should degrade
 * to the old blind-guessing prompt path rather than fail the whole job -
 * exactly the "AI only interprets, deterministic components inspect" split
 * the platform design calls for still needs the AI generation step to work
 * even when the deterministic step comes back empty.
 */
async function runDiscoverySafely(
  input: JobInput,
  jobId: string,
  transcript: string[]
): Promise<DiscoveryResult | undefined> {
  if (input.skipDiscovery) {
    transcript.push("[discovery] skipped (skipDiscovery set)");
    return undefined;
  }

  try {
    const outputDir = path.join(config.workspacesDir, `${jobId}_discovery`);
    const result = await discoverApplication({
      appUrl: input.appUrl,
      username: input.username,
      password: input.password,
      outputDir,
    });
    transcript.push(
      `[discovery] ${result.pages.length} page(s) captured` +
        (result.warnings.length > 0 ? `; warnings: ${result.warnings.join(" | ")}` : "")
    );
    return result;
  } catch (err) {
    transcript.push(`[discovery] failed, continuing without it: ${(err as Error).message}`);
    return undefined;
  }
}

function stillFailing(validation: ValidationResult): boolean {
  return !validation.compileOk || (validation.testResults.ran && validation.testResults.failed > 0);
}

/**
 * Bounded repair loop: each iteration is a fresh Copilot session (real cost -
 * this is why it's gated behind JobInput.enableRepairLoop rather than
 * automatic), told exactly what validation.ts found wrong and nothing else,
 * then re-validated. Stops as soon as nothing's failing, the cap is reached,
 * or a repair session itself fails to complete - matching the skill's own
 * "escalate honestly rather than keep guessing" standard (#11), applied here
 * to app-specific failures instead of framework gaps.
 */
export async function runRepairLoopSafely(
  workspaceDir: string,
  projectName: string,
  systemPrompt: string,
  runLiveTests: boolean,
  initialValidation: ValidationResult,
  transcript: string[],
  // Dependency-injected with the real implementations by default so
  // generateProject() below needs no special wiring, but overridable in
  // tests to exercise this loop's actual attempt-counting/termination logic
  // without opening a real Copilot session - see scripts/ for how.
  deps: {
    runAgent: typeof runGenerationAgent;
    runValidation: typeof runIndependentValidation;
  } = { runAgent: runGenerationAgent, runValidation: runIndependentValidation }
): Promise<ValidationResult> {
  let validation = initialValidation;
  const maxAttempts = config.agentMaxRepairAttempts;

  let attempt = 0;
  while (attempt < maxAttempts && stillFailing(validation)) {
    attempt++;
    transcript.push(`[repair] attempt ${attempt}/${maxAttempts}`);

    const repairUserPrompt = buildRepairPrompt({
      projectName,
      compileError: validation.compileOk ? undefined : validation.compileError,
      testFailures: validation.compileOk ? validation.testResults.failures : undefined,
      attempt,
      maxAttempts,
    });

    const repairResult = await deps.runAgent({ systemPrompt, userPrompt: repairUserPrompt, cwd: workspaceDir });
    transcript.push(...repairResult.transcript);

    if (!repairResult.success) {
      transcript.push(`[repair] attempt ${attempt} session did not complete: ${repairResult.errorMessage}`);
      break; // don't keep spending attempts if the session itself is broken
    }

    validation = await deps.runValidation(workspaceDir, projectName, { runLiveTests });
  }

  if (attempt > 0) {
    transcript.push(
      stillFailing(validation)
        ? `[repair] still failing after ${attempt} attempt(s) - stopping rather than continuing to guess.`
        : `[repair] resolved after ${attempt} attempt(s).`
    );
  }

  return validation;
}

/** Fired at each meaningful phase transition - queueWorker.ts uses this to reflect real progress in apps/api's jobs table instead of the row sitting at GENERATING for the whole run. */
export type ProgressCallback = (status: "VERIFYING" | "REPAIRING" | "PACKAGING") => void | Promise<void>;

/**
 * The whole Phase 1 pipeline, per architecture doc §12 Phase 1 and §06's sequence
 * (the queue now exists - see queueWorker.ts - as a separate caller on top of
 * this function, not folded into it, so direct CLI/HTTP invocation still
 * works exactly as before). Live-app verification now exists as the
 * deterministic discovery pass below rather than an agent-driven Playwright
 * MCP connection, per the later build-order decision to keep AI out of that
 * step entirely.
 */
export async function generateProject(input: JobInput, onProgress?: ProgressCallback): Promise<GenerationResult> {
  assertConfigured();
  validateInput(input);

  const jobId = createJobId();
  const workspaceDir = await provisionWorkspace(jobId, input.projectName);
  const transcript: string[] = [];

  try {
    const [skill, testCases, discovery] = await Promise.all([
      loadSkillContext(),
      parseTestCaseSheet(input.testCaseSheet),
      runDiscoverySafely(input, jobId, transcript),
    ]);

    const { systemPrompt, userPrompt } = buildPrompt({ skill, testCases, input, discovery });

    const agentResult = await runGenerationAgent({ systemPrompt, userPrompt, cwd: workspaceDir });

    if (!agentResult.success) {
      return {
        jobId,
        projectName: input.projectName,
        success: false,
        workspaceDir,
        summary: agentResult.summary,
        transcript: [...transcript, ...agentResult.transcript],
        error: agentResult.errorMessage ?? "Agent session ended without success and without a specific error.",
      };
    }

    // Independent of anything the agent claimed - re-checks compile itself, and
    // (only if runLiveValidation was explicitly requested) runs the real suite
    // against the live app too. See validation.ts's doc comment on why this
    // step exists and why runLiveTests defaults differently than discovery.
    const runLiveTests = input.runLiveValidation ?? false;
    await onProgress?.("VERIFYING");
    let validation = await runIndependentValidation(workspaceDir, input.projectName, { runLiveTests });
    transcript.push(
      `[validation] compile=${validation.compileOk ? "OK" : "FAILED"}, ` +
        `tests=${validation.testResults.ran ? `${validation.testResults.passed}/${validation.testResults.total} passed` : "not run"}, ` +
        `fileSafetyIssues=${validation.fileSafetyIssues.length}`
    );

    if (input.enableRepairLoop && stillFailing(validation)) {
      await onProgress?.("REPAIRING");
      validation = await runRepairLoopSafely(
        workspaceDir,
        input.projectName,
        systemPrompt,
        runLiveTests,
        validation,
        transcript
      );
    }

    await onProgress?.("PACKAGING");
    const zipPath = await packageWorkspace(workspaceDir, input.projectName);

    return {
      jobId,
      projectName: input.projectName,
      success: true,
      workspaceDir,
      zipPath,
      summary: agentResult.summary,
      transcript: [...transcript, ...agentResult.transcript],
      validation,
    };
  } catch (err) {
    return {
      jobId,
      projectName: input.projectName,
      success: false,
      workspaceDir,
      transcript,
      error: (err as Error).message,
    };
  }
}

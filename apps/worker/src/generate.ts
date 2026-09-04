import { assertConfigured } from "./config.js";
import { loadSkillContext } from "./skillLoader.js";
import { parseTestCaseSheet } from "./testCaseSheet.js";
import { buildPrompt } from "./promptBuilder.js";
import { createJobId, provisionWorkspace } from "./workspace.js";
import { runGenerationAgent } from "./agentRunner.js";
import { packageWorkspace } from "./packager.js";
import type { GenerationResult, JobInput } from "./types.js";

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
 * The whole Phase 1 pipeline, per architecture doc §12 Phase 1 and §06's sequence
 * (minus the queue and the live-app Playwright MCP verification step, both
 * explicitly deferred — see README.md "What Phase 1 deliberately leaves out").
 */
export async function generateProject(input: JobInput): Promise<GenerationResult> {
  assertConfigured();
  validateInput(input);

  const jobId = createJobId();
  const workspaceDir = await provisionWorkspace(jobId, input.projectName);

  try {
    const [skill, testCases] = await Promise.all([
      loadSkillContext(),
      parseTestCaseSheet(input.testCaseSheet),
    ]);

    const { systemPrompt, userPrompt } = buildPrompt({ skill, testCases, input });

    const agentResult = await runGenerationAgent({ systemPrompt, userPrompt, cwd: workspaceDir });

    if (!agentResult.success) {
      return {
        jobId,
        projectName: input.projectName,
        success: false,
        workspaceDir,
        summary: agentResult.summary,
        transcript: agentResult.transcript,
        error: agentResult.errorMessage ?? "Agent session ended without success and without a specific error.",
      };
    }

    const zipPath = await packageWorkspace(workspaceDir, input.projectName);

    return {
      jobId,
      projectName: input.projectName,
      success: true,
      workspaceDir,
      zipPath,
      summary: agentResult.summary,
      transcript: agentResult.transcript,
    };
  } catch (err) {
    return {
      jobId,
      projectName: input.projectName,
      success: false,
      workspaceDir,
      transcript: [],
      error: (err as Error).message,
    };
  }
}

import "dotenv/config";
import path from "node:path";

function resolveFrameworkRepoPath(): string {
  if (process.env.FRAMEWORK_REPO_PATH && process.env.FRAMEWORK_REPO_PATH.trim() !== "") {
    return process.env.FRAMEWORK_REPO_PATH;
  }
  // Sibling-repo convention: ai-test-automation-platform and
  // Demo-Test-Automation-Framework live next to each other under the same parent
  // directory. This file runs from apps/worker/, so climb back up to the
  // ai-test-automation-platform repo root's parent (worker -> apps -> repo root ->
  // parent) before descending into the sibling repo.
  return path.resolve(process.cwd(), "..", "..", "..", "Demo-Test-Automation-Framework");
}

export const config = {
  frameworkRepoPath: resolveFrameworkRepoPath(),
  mavenBinDir: process.env.MAVEN_BIN_DIR?.trim() || undefined,
  /** Tried first, ahead of copilotModel.ts's PREFERRED_CLAUDE_MODELS fallback list, if set. */
  agentModel: process.env.AGENT_MODEL?.trim() || undefined,
  /**
   * GitHub's own Copilot spend unit, not USD - there's no direct equivalent to the
   * old Claude-Agent-SDK-specific per-run USD budget cap. Left unset by default
   * (no SDK-enforced limit) rather than guessing a number in an unfamiliar unit;
   * set AGENT_MAX_AI_CREDITS explicitly once you know your org's convention.
   */
  agentMaxAiCredits: process.env.AGENT_MAX_AI_CREDITS
    ? Number(process.env.AGENT_MAX_AI_CREDITS)
    : undefined,
  agentTimeoutMs: Number(process.env.AGENT_TIMEOUT_MS ?? 900_000),
  port: Number(process.env.PORT ?? 4000),
  workspacesDir: path.resolve(process.cwd(), "workspaces"),
} as const;

export function assertConfigured(): void {
  // No key to check here: @github/copilot-sdk authenticates via the bundled
  // Copilot CLI's own stored login (`gh auth login` / `copilot auth login`) or
  // the GH_TOKEN/GITHUB_TOKEN/COPILOT_GITHUB_TOKEN env vars - this codebase
  // never handles a raw credential directly. runGenerationAgent surfaces a
  // clear session.error event if auth is actually missing when a run starts.
}

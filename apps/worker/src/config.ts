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
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  frameworkRepoPath: resolveFrameworkRepoPath(),
  mavenBinDir: process.env.MAVEN_BIN_DIR?.trim() || undefined,
  agentModel: process.env.AGENT_MODEL?.trim() || "claude-opus-5",
  agentMaxTurns: Number(process.env.AGENT_MAX_TURNS ?? 40),
  agentMaxBudgetUsd: Number(process.env.AGENT_MAX_BUDGET_USD ?? 3),
  agentTimeoutMs: Number(process.env.AGENT_TIMEOUT_MS ?? 900_000),
  port: Number(process.env.PORT ?? 4000),
  workspacesDir: path.resolve(process.cwd(), "workspaces"),
} as const;

export function assertConfigured(): void {
  if (!config.anthropicApiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Copy .env.example to .env and fill it in " +
        "(the Agent SDK reads it from process env, not from .env automatically — " +
        "this project loads .env for you via `import \"dotenv/config\"`)."
    );
  }
}

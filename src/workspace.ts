import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { config } from "./config.js";

/** Directories excluded when seeding a job workspace from the reference framework repo. */
const EXCLUDED_DIR_NAMES = new Set([
  ".git",
  "target",
  "test-output",
  ".idea",
  ".vscode",
  ".playwright-mcp",
  "node_modules",
  ".claude", // the skill itself is injected into the prompt, not copied into the workspace
]);

export function createJobId(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${stamp}_${randomUUID().slice(0, 8)}`;
}

/**
 * Copies the reference framework repo into a fresh per-job directory under
 * workspaces/, so the agent has a real, compilable Maven project to extend —
 * this stands in for architecture doc §03's "ephemeral sandbox, pre-baked with
 * ... a checkout of this framework repo as the starting tree" until Phase 2
 * adds real container isolation.
 */
export async function provisionWorkspace(jobId: string): Promise<string> {
  const workspaceDir = path.join(config.workspacesDir, jobId);
  await fs.mkdir(workspaceDir, { recursive: true });

  await fs.cp(config.frameworkRepoPath, workspaceDir, {
    recursive: true,
    filter: (source) => {
      const base = path.basename(source);
      return !EXCLUDED_DIR_NAMES.has(base);
    },
  });

  return workspaceDir;
}

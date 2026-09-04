import { promises as fs } from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { toJavaPackageSegment } from "./packageName.js";
import { CORE_FILES, rewriteCorePackage } from "./workspace.js";
import type { FileSafetyIssue, FileSafetyResult } from "./types.js";

// Not exhaustive - a pragmatic first line of defense against the clearest cases
// (a real key hardcoded instead of read from config.properties), not a
// substitute for a dedicated secret-scanning product.
const SECRET_PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: "AWS Access Key ID", pattern: /AKIA[0-9A-Z]{16}/ },
  { name: "private key header", pattern: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: "Slack token", pattern: /xox[baprs]-[0-9A-Za-z-]{10,}/ },
  { name: "GitHub token", pattern: /gh[pousr]_[A-Za-z0-9]{36,}/ },
  {
    name: "hardcoded API key/secret assignment",
    pattern: /(api[_-]?key|secret[_-]?key|access[_-]?token)\s*[:="']\s*["']?[A-Za-z0-9/+=_-]{16,}["']?/i,
  },
];

const ALLOWED_EXTENSIONS = new Set([".java", ".xml", ".json", ".properties", ".md", ".txt", ""]);
// TestNG's META-INF/services SPI file is named after the fully-qualified interface it
// implements (org.testng.ITestNGListener) - real dots, not an extension in the usual
// sense, so it would otherwise always false-positive as "unexpected .ITestNGListener".
const KNOWN_EXTENSIONLESS_FILENAMES = new Set(["org.testng.ITestNGListener"]);
const EXCLUDED_DIRS = new Set(["target", ".git", "output", "node_modules"]);
const TEXT_FILE_MAX_BYTES = 2 * 1024 * 1024;

/**
 * Walks every generated file (excluding build/output noise) and flags likely
 * hardcoded secrets and unexpected file types - a project's config.properties
 * legitimately holds credentials in plaintext today (see README's "what this
 * deliberately leaves out"), so this isn't "no secrets anywhere," it's
 * "nothing that looks like a *real* leaked key" (AWS/GitHub/Slack/private-key
 * shapes), which a plain test password would never match.
 */
export async function scanForSecretsAndUnexpectedFiles(workspaceDir: string): Promise<FileSafetyResult> {
  const issues: FileSafetyIssue[] = [];

  for await (const relativePath of walk(workspaceDir, workspaceDir)) {
    const ext = path.extname(relativePath);
    if (!ALLOWED_EXTENSIONS.has(ext) && !KNOWN_EXTENSIONLESS_FILENAMES.has(path.basename(relativePath))) {
      issues.push({
        severity: "warning",
        file: relativePath,
        reason: `Unexpected file extension "${ext || "(none)"}" - not in the allowlist. Review before treating it as a normal generated source/resource file.`,
      });
    }

    const absolutePath = path.join(workspaceDir, relativePath);
    const stat = await fs.stat(absolutePath).catch(() => undefined);
    if (!stat || !stat.isFile() || stat.size > TEXT_FILE_MAX_BYTES) continue;

    const content = await fs.readFile(absolutePath, "utf8").catch(() => undefined);
    if (content === undefined) continue; // likely binary, not utf8-decodable

    for (const { name, pattern } of SECRET_PATTERNS) {
      if (pattern.test(content)) {
        issues.push({
          severity: "block",
          file: relativePath,
          reason: `Matches a ${name} pattern - looks like a real secret hardcoded in source rather than read from config.properties.`,
        });
      }
    }
  }

  return { issues, hasBlockingIssues: issues.some((issue) => issue.severity === "block") };
}

async function* walk(dir: string, root: string): AsyncGenerator<string> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      yield* walk(path.join(dir, entry.name), root);
    } else if (entry.isFile()) {
      yield path.relative(root, path.join(dir, entry.name)).split(path.sep).join("/");
    }
  }
}

/**
 * Re-derives what each CORE_FILES entry should still contain (source repo
 * content + the same package rewrite provisionWorkspace applied) and diffs it
 * against what's actually in the workspace now - "never modify shared core"
 * is an instruction to the agent, not an enforced constraint, so this is the
 * check that actually verifies it held, independent of the agent's own
 * self-report.
 *
 * Only valid immediately after generation, against the same framework repo
 * state the workspace was provisioned from - confirmed empirically against an
 * older workspace, where BasePage.java showed as "modified" purely because
 * the framework repo gained a new helper afterward, not because the agent
 * touched it. Re-checking a stale workspace after the framework repo has
 * since changed will produce false positives for exactly that reason.
 */
export async function checkCoreFilesUnmodified(workspaceDir: string, projectName: string): Promise<FileSafetyIssue[]> {
  const packageSegment = toJavaPackageSegment(projectName);
  const issues: FileSafetyIssue[] = [];

  for (const relativeSource of CORE_FILES) {
    const sourcePath = path.join(config.frameworkRepoPath, ...relativeSource.split("/"));
    const rawContent = await fs.readFile(sourcePath, "utf8").catch(() => undefined);
    if (rawContent === undefined) continue; // shouldn't happen; provisioning would already have failed

    const { relativePath, content: expectedContent } = rewriteCorePackage(
      relativeSource.split("/").join(path.sep),
      rawContent,
      packageSegment
    );

    const actualContent = await fs.readFile(path.join(workspaceDir, relativePath), "utf8").catch(() => undefined);
    if (actualContent !== expectedContent) {
      issues.push({
        severity: "block",
        file: relativePath,
        reason:
          actualContent === undefined
            ? "Shared core file is missing from the workspace."
            : "Shared core file was modified - the agent was instructed never to touch these.",
      });
    }
  }

  return issues;
}

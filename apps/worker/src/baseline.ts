import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "./config.js";
import { CORE_FILES, rewriteCorePackage } from "./workspace.js";
import { toJavaPackageSegment } from "./packageName.js";
import type { TestCase } from "./types.js";

/**
 * Per-project store of the last independently-verified-passing generated files, keyed by
 * projectName (see architecture doc's original "carry-forward baseline" idea). A
 * re-submission for the same project with an unchanged test-case sheet reuses this
 * instead of spending a Copilot session at all - see generate.ts's use of these.
 *
 * Mirrors packager.ts's own exclusions (target/.git/node_modules/test-output/output are
 * build artifacts or already-excluded from the deliverable) plus workspace.ts's
 * CORE_FILES allowlist (the shared framework core, re-seeded fresh by provisionWorkspace
 * on every run, never project-specific).
 */

const EXCLUDED_TOP_LEVEL = new Set(["target", ".git", "node_modules", "test-output", "output"]);
const META_FILE = ".baseline-meta.json";

interface BaselineMeta {
  sheetHash: string;
  promotedAt: string;
}

export function computeSheetHash(testCases: TestCase[]): string {
  return crypto.createHash("sha256").update(JSON.stringify(testCases)).digest("hex");
}

function baselineDir(projectName: string): string {
  return path.join(config.verifiedProjectsDir, projectName);
}

function corePathsFor(projectName: string): Set<string> {
  const packageSegment = toJavaPackageSegment(projectName);
  const rewritten = CORE_FILES.map((relativeSource) => {
    const { relativePath } = rewriteCorePackage(relativeSource.split("/").join(path.sep), "", packageSegment);
    return relativePath.split(path.sep).join("/");
  });
  return new Set(rewritten);
}

async function readMeta(projectName: string): Promise<BaselineMeta | undefined> {
  try {
    const raw = await fs.readFile(path.join(baselineDir(projectName), META_FILE), "utf8");
    return JSON.parse(raw) as BaselineMeta;
  } catch {
    return undefined;
  }
}

/** The stored sheet hash for this project's baseline, or undefined if no baseline exists yet. */
export async function readBaselineSheetHash(projectName: string): Promise<string | undefined> {
  return (await readMeta(projectName))?.sheetHash;
}

async function walkAll(dir: string, base: string = dir): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkAll(full, base)));
    } else {
      files.push(path.relative(base, full));
    }
  }
  return files;
}

/**
 * Copies this project's baseline (if one exists) into a freshly-provisioned workspace,
 * on top of the shared core provisionWorkspace already seeded. Overwrites the minimal
 * placeholder testng.xml/config.properties with the baseline's real, already-verified
 * versions. Returns whether a baseline existed to apply - callers use this both for the
 * unchanged-sheet fast path and as a head start when the sheet has changed but a
 * previous run's files are still a useful starting point for the agent to extend.
 */
export async function applyBaseline(projectName: string, workspaceDir: string): Promise<boolean> {
  const dir = baselineDir(projectName);
  const meta = await readMeta(projectName);
  if (!meta) {
    return false;
  }

  const files = await walkAll(dir);
  for (const relPath of files) {
    if (relPath === META_FILE) continue;
    const dest = path.join(workspaceDir, relPath);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(path.join(dir, relPath), dest);
  }
  return true;
}

async function listProjectFiles(workspaceDir: string, corePaths: Set<string>): Promise<string[]> {
  const results: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(workspaceDir, full);
      const topLevel = rel.split(path.sep)[0];
      if (EXCLUDED_TOP_LEVEL.has(topLevel)) continue;

      if (entry.isDirectory()) {
        await walk(full);
      } else if (!corePaths.has(rel.split(path.sep).join("/"))) {
        results.push(rel);
      }
    }
  }

  await walk(workspaceDir);
  return results;
}

/**
 * Promotes a workspace's project-specific files (everything except the shared framework
 * core and build artifacts) to this project's baseline, replacing whatever was there
 * before. Only called after independent validation confirms the run actually passed
 * (see generate.ts) - a failing run must never become the thing a future unchanged-sheet
 * submission silently reuses.
 */
export async function promoteToBaseline(projectName: string, workspaceDir: string, sheetHash: string): Promise<void> {
  const dir = baselineDir(projectName);
  await fs.rm(dir, { recursive: true, force: true });

  const corePaths = corePathsFor(projectName);
  const files = await listProjectFiles(workspaceDir, corePaths);
  for (const relPath of files) {
    const dest = path.join(dir, relPath);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(path.join(workspaceDir, relPath), dest);
  }

  const meta: BaselineMeta = { sheetHash, promotedAt: new Date().toISOString() };
  await fs.writeFile(path.join(dir, META_FILE), JSON.stringify(meta, null, 2), "utf8");
}

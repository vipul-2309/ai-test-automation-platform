import { promises as fs } from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import type { SkillContext } from "./types.js";

const SKILL_RELATIVE_PATH = path.join(".claude", "skills", "test-automation-framework", "SKILL.md");
const TEMPLATES_RELATIVE_DIR = path.join(".claude", "skills", "test-automation-framework", "references", "templates");

/**
 * Reads SKILL.md and every file under references/templates/ from the reference
 * framework repo (config.frameworkRepoPath) — the same two sources a human or
 * Copilot onboarding a project would read. See architecture doc §04.
 */
export async function loadSkillContext(): Promise<SkillContext> {
  const skillPath = path.join(config.frameworkRepoPath, SKILL_RELATIVE_PATH);
  const templatesDir = path.join(config.frameworkRepoPath, TEMPLATES_RELATIVE_DIR);

  let skillMarkdown: string;
  try {
    skillMarkdown = await fs.readFile(skillPath, "utf8");
  } catch (err) {
    throw new Error(
      `Could not read SKILL.md at ${skillPath}. Is FRAMEWORK_REPO_PATH set correctly ` +
        `(currently "${config.frameworkRepoPath}")? Original error: ${(err as Error).message}`
    );
  }

  const templates: Record<string, string> = {};
  let templateFiles: string[];
  try {
    templateFiles = await fs.readdir(templatesDir);
  } catch (err) {
    throw new Error(
      `Could not read templates directory at ${templatesDir}. Original error: ${(err as Error).message}`
    );
  }

  for (const fileName of templateFiles) {
    const filePath = path.join(templatesDir, fileName);
    const stat = await fs.stat(filePath);
    if (stat.isFile()) {
      templates[fileName] = await fs.readFile(filePath, "utf8");
    }
  }

  if (Object.keys(templates).length === 0) {
    throw new Error(`No template files found under ${templatesDir}.`);
  }

  return { skillMarkdown, templates };
}

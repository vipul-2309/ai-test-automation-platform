import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { toJavaPackageSegment } from "./packageName.js";

/**
 * The shared framework core only - deliberately an allowlist, not a "copy everything
 * except a denylist." The reference repo also contains a worked example (saucedemo) and
 * repo-level docs (README-equivalents, an architecture PDF, CI/agent config) that are
 * reference material for a human or this generator to read, never something a generated
 * project should ship. An allowlist means a new file added to the reference repo for its
 * own purposes (like that PDF) can never silently leak into every future generated
 * project the way a denylist would require remembering to update.
 *
 * Paths are relative to the framework repo root, using forward slashes (normalized to the
 * host OS by path.join below).
 */
export const CORE_FILES: readonly string[] = [
  "pom.xml",
  ".gitignore",
  "src/main/resources/META-INF/services/org.testng.ITestNGListener",
  "src/main/java/com/platform/config/FrameworkConfig.java",
  "src/main/java/com/platform/utils/JsonDataReader.java",
  "src/main/java/com/platform/listeners/TestListener.java",
  "src/main/java/com/platform/listeners/RetryAnalyzer.java",
  "src/main/java/com/platform/listeners/RetryAnnotationTransformer.java",
  "src/main/java/com/platform/apilibrary/APIHelper.java",
  "src/main/java/com/platform/apilibrary/RestUtils.java",
  "src/main/java/com/platform/apilibrary/URLGenerator.java",
  "src/main/java/com/platform/uilibrary/Pages/BasePage.java",
  "src/test/java/com/platform/uitests/base/BaseUiTest.java",
];

const MINIMAL_TESTNG_XML = `<!DOCTYPE suite SYSTEM "https://testng.org/testng-1.0.dtd" >
<suite name="Playwright UI Suite" parallel="false">
    <!-- Generation adds one <test> block here per onboarded project. -->
</suite>
`;

function minimalConfigProperties(): string {
  return [
    "# ui.base.url / ui.username / ui.password are set by the generation run for this project.",
    "ui.base.url=",
    "ui.username=",
    "ui.password=",
    "ui.browser=chromium",
    "ui.headless=true",
    "ui.slow.mo=0",
    "ui.timeout.ms=10000",
    "ui.download.dir=target\\\\downloads",
    "",
  ].join("\n");
}

export function createJobId(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${stamp}_${randomUUID().slice(0, 8)}`;
}

/**
 * Rewrites the literal package prefix "com.platform" to "com.<packageSegment>" in file
 * content (package/import declarations in .java files, and the fully-qualified listener
 * class name in the plain-text TestNG service file) and in the destination path (so the
 * directory tree itself moves from com/platform/... to com/<packageSegment>/...). Every
 * generated project ends up fully self-contained under its own package - not nested under
 * the reference repo's generic "platform" name - since a delivered project has no runtime
 * dependency back on the platform repo (see architecture doc: zip-and-deliver, not a
 * shared library).
 */
export function rewriteCorePackage(relativePath: string, content: string, packageSegment: string): {
  relativePath: string;
  content: string;
} {
  const rewrittenPath = relativePath
    .split(/[\\/]/)
    .map((part) => (part === "platform" ? packageSegment : part))
    .join(path.sep);

  return {
    relativePath: rewrittenPath,
    content: content.split("com.platform").join(`com.${packageSegment}`),
  };
}

/**
 * Seeds a fresh per-job workspace with just the shared framework core (renamed onto the
 * project's own package), plus a minimal testng.xml/config.properties for the generation
 * run to fill in. This stands in for architecture doc §03's "ephemeral sandbox, pre-baked
 * with a checkout of this framework repo" until Phase 2 adds real container isolation -
 * except seeded from an allowlist of core files, not the whole repo.
 */
export async function provisionWorkspace(jobId: string, projectName: string): Promise<string> {
  const packageSegment = toJavaPackageSegment(projectName);
  const workspaceDir = path.join(config.workspacesDir, jobId);
  await fs.mkdir(workspaceDir, { recursive: true });

  for (const relativeSource of CORE_FILES) {
    const sourcePath = path.join(config.frameworkRepoPath, ...relativeSource.split("/"));
    const rawContent = await fs.readFile(sourcePath, "utf8");
    const { relativePath, content } = rewriteCorePackage(relativeSource.split("/").join(path.sep), rawContent, packageSegment);

    const destPath = path.join(workspaceDir, relativePath);
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    await fs.writeFile(destPath, content, "utf8");
  }

  const testngPath = path.join(workspaceDir, "testng.xml");
  await fs.writeFile(testngPath, MINIMAL_TESTNG_XML, "utf8");

  const configPropertiesPath = path.join(workspaceDir, "src", "main", "resources", "config.properties");
  await fs.mkdir(path.dirname(configPropertiesPath), { recursive: true });
  await fs.writeFile(configPropertiesPath, minimalConfigProperties(), "utf8");

  return workspaceDir;
}

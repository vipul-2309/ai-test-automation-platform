import { toJavaPackageSegment } from "./packageName.js";
import type { DiscoveryResult, JobInput, SkillContext, TestCase, TestFailure } from "./types.js";

export interface BuiltPrompt {
  systemPrompt: string;
  userPrompt: string;
}

function renderTestCases(testCases: TestCase[]): string {
  return JSON.stringify(testCases, null, 2);
}

/**
 * Renders discovery.ts's structured output into the prompt as ground-truth
 * locator data. Discovery is a deterministic, non-AI crawl (see discovery.ts's
 * own doc comment) that only reaches what it's bounded to reach - typically
 * the entry page and, with credentials, one page past login - so this is
 * additive to, not a replacement for, the existing infer-from-steps
 * instruction: anything discovery didn't cover still needs it.
 */
function renderDiscovery(discovery: DiscoveryResult | undefined): string {
  if (!discovery || discovery.pages.length === 0) {
    return "";
  }

  const pagesBlock = discovery.pages
    .map((page) => {
      const elementLines = page.elements
        .map((el) => {
          const label = el.accessibleName ?? el.text ?? `(unlabeled ${el.tag})`;
          const locatorPool = el.locators.slice(0, 4).map((locator) => `"${locator}"`).join(", ");
          return `  - ${label} [${el.tag}${el.elementType ? `/${el.elementType}` : ""}]: ${locatorPool}`;
        })
        .join("\n");
      return `### ${page.title} (${page.url})\n${elementLines}`;
    })
    .join("\n\n");

  const warningsBlock =
    discovery.warnings.length > 0
      ? `\n\nDiscovery warnings (informational, not necessarily blocking):\n${discovery.warnings
          .map((warning) => `- ${warning}`)
          .join("\n")}`
      : "";

  return `

==================== LIVE APPLICATION DISCOVERY ====================
A deterministic (non-AI) crawl of the real application captured the pages below before this
session started, including real accessible names and locator candidates already in priority
order (role > test id > placeholder > id > name > text) as ready-to-use Playwright selector
strings. This only covers what the crawl actually reached (typically the entry page and, if
credentials were provided, the page immediately after login) — it does not cover deeper flows
(a multi-step form, a confirmation modal, etc). Treat it as ground truth for the pages/elements
it lists; for anything not listed, fall back to inferring from the test steps as usual and flag
it with // TODO(verify-locator).

${pagesBlock}${warningsBlock}
==================== END LIVE APPLICATION DISCOVERY ====================`;
}

function projectNamePascalCase(projectName: string): string {
  return projectName
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

/**
 * Assembles the agent's system + user prompt in the order fixed by architecture
 * doc §04: (1) the skill verbatim, (2) the scaffolding templates, (3) the job's
 * structured test cases, (4) base URL + a credential reference (not the raw
 * secret value baked into a large, cached system prompt — see the Phase 1
 * caveat in README.md about where credentials actually end up).
 */
export function buildPrompt(params: {
  skill: SkillContext;
  testCases: TestCase[];
  input: Pick<JobInput, "projectName" | "appUrl" | "username" | "password">;
  discovery?: DiscoveryResult;
}): BuiltPrompt {
  const { skill, testCases, input, discovery } = params;
  const hasDiscovery = Boolean(discovery && discovery.pages.length > 0);
  const projectName = input.projectName;
  const ProjectName = projectNamePascalCase(projectName);
  const packageSegment = toJavaPackageSegment(projectName);
  const packageRoot = `com.${packageSegment}`;

  const templatesBlock = Object.entries(skill.templates)
    .map(([fileName, content]) => `#### ${fileName}\n\n\`\`\`\n${content}\n\`\`\``)
    .join("\n\n");

  const systemPrompt = `You are the automated generation worker for an internal test-automation platform.
Your job is to onboard exactly one new project onto the shared framework whose complete
operating manual follows. Follow it precisely — coding standards and package layout are not
suggestions, they are the contract this platform's downstream consumers depend on.

One thing about this run's workspace differs from the reference repo the skill below
describes: this generated project is a fully independent, standalone deliverable with no
runtime dependency back on the platform/reference repo (it's handed to its own team as a
zip, not linked against a shared library), so its package root is this project's own name,
not the reference repo's generic placeholder package. The shared framework core already
exists in your current working directory, already renamed onto that root:
${packageRoot}.config.FrameworkConfig, ${packageRoot}.utils.JsonDataReader,
${packageRoot}.listeners.* (TestListener/RetryAnalyzer/RetryAnnotationTransformer),
${packageRoot}.apilibrary.* (stubs), ${packageRoot}.uilibrary.Pages.BasePage, and
${packageRoot}.uitests.base.BaseUiTest. Wherever the skill below says "com.testautomation"
or references the shared core's package, read it as ${packageRoot} instead — the class
names, responsibilities, and rules are unchanged, only the package root differs for this
run. Because the whole tree is already this project's own, do NOT nest another
"${projectName}" segment under Pages/uitests/etc. the way the skill's generic template
shows for a multi-project shared repo — put your new files directly under
${packageRoot}.uilibrary.Pages, ${packageRoot}.uitests, and
${packageRoot}.uitests.assertions.

You are only ADDING the files the skill's onboarding checklist calls for. Never modify a
file already present (that's the shared core, listed above).

==================== FRAMEWORK SKILL (SKILL.md) ====================
${skill.skillMarkdown}
==================== END FRAMEWORK SKILL ====================

==================== SCAFFOLDING TEMPLATES (references/templates/) ====================
${templatesBlock}
==================== END SCAFFOLDING TEMPLATES ====================`;

  const userPrompt = `Onboard a new project onto the framework with these inputs:

- Project name (already lowercase, hyphen-separated): ${projectName}
- Java package segment for this project (hyphens aren't legal in Java identifiers): ${packageSegment}
- Java/package-safe PascalCase form for class names: ${ProjectName}
- Application base URL: ${input.appUrl}
- Login credentials: ${
    input.username
      ? `username "${input.username}" / password provided separately below`
      : "not provided as separate fields for this run — if the test steps or expected results " +
        "below reference login credentials (e.g. a login test case that enters a username and " +
        "password), extract the exact values from there and use those same values consistently " +
        "in both the generated test data JSON and config.properties. Do not assume the app has " +
        "no login just because no credentials were passed separately."
  }
${input.password ? `- Password: ${input.password}` : ""}

Structured test cases parsed from the submitted TestCases.xlsx (Test Case ID, Pre-Condition,
Description, and ordered Steps with Description + Expected Result each):

${renderTestCases(testCases)}
${renderDiscovery(discovery)}

Do the following, in order, using the skill's onboarding checklist and templates above:

1. Create one page object per distinct screen/page implied by the test steps, under
   src/main/java/com/${packageSegment}/uilibrary/Pages/ (package ${packageRoot}.uilibrary.Pages),
   each extending BasePage, using self-healing locator pools. ${
     hasDiscovery
       ? "A live discovery pass captured real locators for some pages (see LIVE APPLICATION " +
         "DISCOVERY above) — use those directly as your primary locator pool entries (already " +
         "priority-ordered) for any page/element they cover. For anything discovery didn't reach, " +
         "infer reasonable locators from the test steps (prefer data-testid/id/name/role-based " +
         "selectors) and leave a `// TODO(verify-locator)` comment."
       : "You do not have live browser access in this run — infer reasonable primary locators " +
         "(prefer data-testid/id/name/role-based selectors mentioned or implied by the steps) " +
         "with a sensible CSS/XPath fallback, and leave a `// TODO(verify-locator)` comment on " +
         "any locator you are not confident about so a human reviewer can confirm it against the " +
         "live app."
   }
2. Extract every input value referenced in step descriptions into
   src/main/resources/ui/${projectName}-ui-test-data.json, nested to mirror the test flow.
3. Extract every value from the Expected Result column into
   src/test/java/com/${packageSegment}/uitests/assertions/${ProjectName}ExpectedResults.java
   (package ${packageRoot}.uitests.assertions; final class, private constructor, public
   static final String constants only, grouped by page).
4. Write one test class per logical test-case group under
   src/test/java/com/${packageSegment}/uitests/ (package ${packageRoot}.uitests), extending
   BaseUiTest, one @Test per Test Case ID, steps in sheet order.
5. Set ui.base.url (and ui.username/ui.password if credentials were provided above) in
   src/main/resources/config.properties — it currently has empty placeholder values
   specifically for you to fill in.
6. Add a <test name="..."> block naming your new test classes to testng.xml — it currently
   has an empty <suite> with no <test> blocks yet.
7. Finally, using a shell command, run \`mvn -q test-compile\` from the project root. If it
   fails, read the compiler output, fix the files you generated, and re-run it until it
   passes. Do not modify any file that already existed before you started (that's the
   shared core).

When completely done, reply with a concise summary: which files you created, which locators
you left a TODO(verify-locator) comment on and why, and confirmation that
\`mvn -q test-compile\` passed.`;

  return { systemPrompt, userPrompt };
}

/**
 * Reuses the original systemPrompt (same skill grounding, same "never touch shared
 * core" rule) with a new, narrowly-scoped userPrompt covering just this chunk's test
 * cases, telling the agent to read what earlier chunks already added instead of
 * re-sending the whole onboarding checklist or every prior chunk's test cases. Each
 * call is a fresh session (see generate.ts's chunkTestCases/chunking loop), not a
 * resumed conversation - the same "fresh session, rediscover from the workspace"
 * pattern buildRepairPrompt below already uses for repair attempts.
 */
export function buildChunkPrompt(params: {
  projectName: string;
  chunkIndex: number;
  chunkCount: number;
  testCases: TestCase[];
  priorCompileError?: string;
}): string {
  const { projectName, chunkIndex, chunkCount, testCases, priorCompileError } = params;

  const compileNote = priorCompileError
    ? `\n\nThe project currently fails to compile because of the previous chunk's changes. Fix ` +
      `this first, then continue with this chunk's test cases below:\n\n\`\`\`\n${priorCompileError.slice(0, 4000)}\n\`\`\`\n`
    : "";

  return `This is chunk ${chunkIndex + 1} of ${chunkCount} for onboarding the "${projectName}" project -
earlier chunks in this same run already added page objects, test classes, test data,
expected-results constants, and testng.xml/config.properties entries for other test cases from
the same sheet.
${compileNote}
Before writing anything, read the files already in this workspace (page objects under
uilibrary/Pages/, test classes under uitests/, the *-ui-test-data.json file, the
*ExpectedResults.java file, testng.xml) so you reuse existing page objects, test data, and
expected-result constants for screens/values already covered instead of recreating them. Only
add new page objects for screens genuinely not covered yet, extend the existing test-data JSON
and ExpectedResults file rather than replacing them, and add a new <test> block (or extend the
existing one) in testng.xml for your new test class(es).

Structured test cases for this chunk only (Test Case ID, Pre-Condition, Description, and ordered
Steps with Description + Expected Result each):

${renderTestCases(testCases)}

Follow the same conventions, package layout, and self-healing locator approach as the rest of
this project. When done, run \`mvn -q test-compile\` from the project root and fix any failures
before finishing.

Reply with a concise summary: which files you added or extended for this chunk, and confirmation
that \`mvn -q test-compile\` passed.`;
}

/**
 * Reuses the original systemPrompt (same skill grounding, same "never touch
 * shared core" rule) with a new, narrowly-scoped userPrompt describing
 * exactly what independent validation (validation.ts) found wrong, rather
 * than re-sending the whole onboarding checklist - the agent still has the
 * workspace's actual files to read via its own tools. Each call is a fresh
 * session (see generate.ts's repair loop), not a resumed conversation.
 */
export function buildRepairPrompt(params: {
  projectName: string;
  compileError?: string;
  testFailures?: TestFailure[];
  attempt: number;
  maxAttempts: number;
}): string {
  const { projectName, compileError, testFailures, attempt, maxAttempts } = params;

  const failureBlock = compileError
    ? `The project fails to compile. Maven's output:\n\n\`\`\`\n${compileError.slice(0, 6000)}\n\`\`\``
    : `The project compiles, but ${testFailures?.length ?? 0} test(s) failed when run against the live application:\n\n` +
      (testFailures ?? [])
        .map(
          (failure) =>
            `- ${failure.testName}${failure.description ? ` (${failure.description})` : ""}: ${
              failure.message ?? "(no message captured)"
            }`
        )
        .join("\n");

  return `This is repair attempt ${attempt} of ${maxAttempts} for the "${projectName}" project already
present in this workspace. Do NOT regenerate from scratch or rewrite files unrelated to the
failure below — fix only what's actually broken, following the same conventions as the original
generation. Never modify a shared-core file (BasePage, BaseUiTest, FrameworkConfig,
JsonDataReader, listeners, apilibrary/*, pom.xml) — if the failure looks like a genuine framework
core gap rather than something fixable in your own generated files, say so in your summary
instead of touching the shared core.

${failureBlock}

Diagnose the specific cause by reading the relevant generated file(s) — for a live-app test
failure, consider that the locator itself may be wrong even though the code compiles. Fix it,
then re-run \`mvn -q test-compile\` (and, if the original failure was a live test failure rather
than a compile error, \`mvn -q test\` too) to confirm before finishing.

Reply with a concise summary: what was actually wrong, what you changed, and whether your fix is
confirmed by a passing re-run.`;
}

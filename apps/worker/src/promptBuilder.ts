import { toJavaPackageSegment } from "./packageName.js";
import type { JobInput, SkillContext, TestCase } from "./types.js";

export interface BuiltPrompt {
  systemPrompt: string;
  userPrompt: string;
}

function renderTestCases(testCases: TestCase[]): string {
  return JSON.stringify(testCases, null, 2);
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
}): BuiltPrompt {
  const { skill, testCases, input } = params;
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

Do the following, in order, using the skill's onboarding checklist and templates above:

1. Create one page object per distinct screen/page implied by the test steps, under
   src/main/java/com/${packageSegment}/uilibrary/Pages/ (package ${packageRoot}.uilibrary.Pages),
   each extending BasePage, using self-healing locator pools. You do not have live browser
   access in this run — infer reasonable primary locators (prefer data-testid/id/name/
   role-based selectors mentioned or implied by the steps) with a sensible CSS/XPath
   fallback, and leave a \`// TODO(verify-locator)\` comment on any locator you are not
   confident about so a human reviewer can confirm it against the live app.
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
7. Finally, using the Bash tool, run \`mvn -q test-compile\` from the project root. If it
   fails, read the compiler output, fix the files you generated, and re-run it until it
   passes. Do not modify any file that already existed before you started (that's the
   shared core).

When completely done, reply with a concise summary: which files you created, which locators
you left a TODO(verify-locator) comment on and why, and confirmation that
\`mvn -q test-compile\` passed.`;

  return { systemPrompt, userPrompt };
}

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

  const templatesBlock = Object.entries(skill.templates)
    .map(([fileName, content]) => `#### ${fileName}\n\n\`\`\`\n${content}\n\`\`\``)
    .join("\n\n");

  const systemPrompt = `You are the automated generation worker for an internal test-automation platform.
Your job is to onboard exactly one new project onto the shared framework whose complete
operating manual follows. Follow it precisely — package layout, coding standards, and
folder structure are not suggestions, they are the contract this platform's downstream
consumers depend on. You are working inside a working copy of this same framework repo,
already checked out at your current working directory, so the shared core (com.testautomation,
BasePage, BaseUiTest, FrameworkConfig, JsonDataReader, listeners/) already exists — you are
only ADDING the files the skill's onboarding checklist calls for. Never modify a file the
skill marks as shared / do-not-modify.

==================== FRAMEWORK SKILL (SKILL.md) ====================
${skill.skillMarkdown}
==================== END FRAMEWORK SKILL ====================

==================== SCAFFOLDING TEMPLATES (references/templates/) ====================
${templatesBlock}
==================== END SCAFFOLDING TEMPLATES ====================`;

  const userPrompt = `Onboard a new project onto the framework with these inputs:

- Project name (already lowercase, hyphen-separated): ${projectName}
- Java/package-safe PascalCase form for class names: ${ProjectName}
- Application base URL: ${input.appUrl}
- Login credentials: ${
    input.username
      ? `username "${input.username}" / password provided separately below`
      : "none provided — this app does not require login, or credentials are not yet available"
  }
${input.password ? `- Password: ${input.password}` : ""}

Structured test cases parsed from the submitted TestCases.xlsx (Test Case ID, Pre-Condition,
Description, and ordered Steps with Description + Expected Result each):

${renderTestCases(testCases)}

Do the following, in order, using the skill's onboarding checklist and templates above:

1. Create one page object per distinct screen/page implied by the test steps, under
   uilibrary/Pages/${projectName}/, each extending BasePage, using self-healing locator pools.
   You do not have live browser access in this run — infer reasonable primary locators
   (prefer data-test/id/name/role-based selectors mentioned or implied by the steps) with a
   sensible CSS/XPath fallback, and leave a \`// TODO(verify-locator)\` comment on any locator
   you are not confident about so a human reviewer can confirm it against the live app.
2. Extract every input value referenced in step descriptions into
   resources/ui/${projectName}-ui-test-data.json, nested to mirror the test flow.
3. Extract every value from the Expected Result column into
   uitests/assertions/${ProjectName}ExpectedResults.java (final class, private constructor,
   public static final String constants only, grouped by page).
4. Write one test class per logical test-case group under uitests/${projectName}/, extending
   BaseUiTest, one @Test per Test Case ID, steps in sheet order, matching the style of the
   existing saucedemo LoginTests/CheckoutFlowTests.
5. Update src/main/resources/config.properties with this project's ui.base.url (and
   ui.username/ui.password if credentials were provided above) — do not remove or break the
   existing saucedemo configuration if this file already configures another project; if the
   file is a single flat config shared by the whole suite, prefer this project's values and
   leave a comment noting the prior project's values in case they need restoring.
6. Add a new <test name="..."> block to testng.xml listing the new test classes, without
   removing any existing <test> blocks.
7. Save the original test case sheet's structured content is not needed as a file — skip
   writing a TestCases.xlsx (this run received the data directly, not as a file to place in
   resources/${projectName}/).
8. Finally, using the Bash tool, run \`mvn -q test-compile\` from the project root. If it
   fails, read the compiler output, fix the files you generated, and re-run it until it
   passes. Do not modify any shared core file to make the build pass.

When completely done, reply with a concise summary: which files you created, which locators
you left a TODO(verify-locator) comment on and why, and confirmation that
\`mvn -q test-compile\` passed.`;

  return { systemPrompt, userPrompt };
}

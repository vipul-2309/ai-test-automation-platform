import { promises as fs } from "node:fs";
import { generateProject } from "./generate.js";

/**
 * Local test harness for the generation pipeline, no HTTP required:
 *   npm run generate -- --project=globex-crm --url=https://example.com --sheet=./TestCases.xlsx \
 *     [--username=u --password=p] [--skip-discovery] [--run-live-validation]
 *
 * --run-live-validation actually executes the generated suite against the live
 * app (real logins/submissions, whatever the test steps do) as part of
 * independent verification - off by default, since that's a heavier action
 * than discovery's single login. See validation.ts.
 */
function parseArgs(argv: string[]): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  for (const arg of argv) {
    const kv = /^--([a-zA-Z-]+)=(.*)$/.exec(arg);
    if (kv) {
      args[kv[1]] = kv[2];
      continue;
    }
    const flag = /^--([a-zA-Z-]+)$/.exec(arg);
    if (flag) args[flag[1]] = true;
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!args.project || !args.url || !args.sheet) {
    console.error(
      "Usage: npm run generate -- --project=<name> --url=<app-url> --sheet=<path-to-xlsx> " +
        "[--username=u] [--password=p] [--skip-discovery]"
    );
    process.exit(1);
  }

  const testCaseSheet = await fs.readFile(args.sheet as string);

  console.log(`Generating project "${args.project}" against ${args.url} ...`);
  const result = await generateProject({
    projectName: args.project as string,
    appUrl: args.url as string,
    username: args.username as string | undefined,
    password: args.password as string | undefined,
    testCaseSheet,
    skipDiscovery: Boolean(args["skip-discovery"]),
    runLiveValidation: Boolean(args["run-live-validation"]),
  });

  console.log("\n---- transcript ----");
  for (const line of result.transcript) console.log(line);
  console.log("---- end transcript ----\n");

  if (!result.success) {
    console.error(`FAILED: ${result.error ?? "unknown error"}`);
    console.error(`Workspace left at: ${result.workspaceDir} (inspect for partial output).`);
    process.exit(1);
  }

  console.log(`SUCCESS — zip at: ${result.zipPath}`);
  if (result.summary) console.log(`\nAgent summary:\n${result.summary}`);

  if (result.validation) {
    const v = result.validation;
    console.log(`\n---- independent validation ----`);
    console.log(`Compile: ${v.compileOk ? "OK" : `FAILED — ${v.compileError}`}`);
    console.log(
      `Live tests: ${v.testResults.ran ? `${v.testResults.passed}/${v.testResults.total} passed` : "not run"}`
    );
    for (const failure of v.testResults.failures) {
      console.log(`  FAIL ${failure.testName}${failure.description ? ` (${failure.description})` : ""}: ${failure.message}`);
    }
    if (v.fileSafetyIssues.length > 0) {
      console.log(`File safety issues:`);
      for (const issue of v.fileSafetyIssues) {
        console.log(`  [${issue.severity}] ${issue.file}: ${issue.reason}`);
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

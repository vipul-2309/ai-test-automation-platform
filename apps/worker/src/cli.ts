import { promises as fs } from "node:fs";
import { generateProject } from "./generate.js";

/**
 * Local test harness for the generation pipeline, no HTTP required:
 *   npm run generate -- --project=globex-crm --url=https://example.com --sheet=./TestCases.xlsx [--username=u --password=p]
 */
function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (const arg of argv) {
    const match = /^--([a-zA-Z-]+)=(.*)$/.exec(arg);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!args.project || !args.url || !args.sheet) {
    console.error(
      "Usage: npm run generate -- --project=<name> --url=<app-url> --sheet=<path-to-xlsx> [--username=u] [--password=p]"
    );
    process.exit(1);
  }

  const testCaseSheet = await fs.readFile(args.sheet);

  console.log(`Generating project "${args.project}" against ${args.url} ...`);
  const result = await generateProject({
    projectName: args.project,
    appUrl: args.url,
    username: args.username,
    password: args.password,
    testCaseSheet,
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
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

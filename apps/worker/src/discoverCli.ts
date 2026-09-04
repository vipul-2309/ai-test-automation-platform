import "dotenv/config";
import path from "node:path";
import { discoverApplication } from "./discovery.js";

/**
 * Standalone test harness for discovery.ts - no AI/Copilot session involved,
 * so this is free to run as often as needed while iterating on the crawler
 * itself. Usage:
 *   npm run discover -- --url=https://qaplayground.com/bank/login --username=standard_user --password=bank_sauce
 */
function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (const arg of argv) {
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (match) {
      args[match[1]] = match[2];
    }
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.url) {
    console.error("Usage: npm run discover -- --url=<appUrl> [--username=<u>] [--password=<p>]");
    process.exit(1);
  }

  const outputDir = path.resolve(process.cwd(), "discovery-output", new Date().toISOString().replace(/[:.]/g, "-"));

  console.log(`Discovering ${args.url} ...`);
  const result = await discoverApplication({
    appUrl: args.url,
    username: args.username,
    password: args.password,
    outputDir,
  });

  console.log(`\n${result.pages.length} page(s) discovered, screenshots + full JSON in ${outputDir}\n`);

  for (const [index, page] of result.pages.entries()) {
    console.log(`---- Page ${index}: ${page.title} (${page.url}) ----`);
    for (const el of page.elements) {
      console.log(`  ${el.tag}${el.elementType ? `[${el.elementType}]` : ""}: ${el.accessibleName ?? "(no accessible name)"}`);
      console.log(`    locators: ${el.locators.join(", ")}`);
    }
  }

  if (result.warnings.length > 0) {
    console.log("\nWarnings:");
    for (const warning of result.warnings) {
      console.log(`  - ${warning}`);
    }
  }

  const fs = await import("node:fs/promises");
  await fs.writeFile(path.join(outputDir, "discovery-result.json"), JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error("Discovery failed:", err);
  process.exit(1);
});

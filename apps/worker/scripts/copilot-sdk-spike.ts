/**
 * Phase 0 spike, part 2: does the Copilot SDK's session have built-in file/shell
 * tools (like Claude Agent SDK's Read/Write/Edit/Bash), or do we need to build our
 * own via defineTool? Testing empirically since the SDK's types document
 * `workingDirectory` and `excludedTools` but not the actual built-in tool names.
 */
import { CopilotClient, approveAll } from "@github/copilot-sdk";
import { resolveCopilotModel } from "../src/copilotModel.js";
import { mkdtempSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function main(): Promise<void> {
  const workDir = mkdtempSync(join(tmpdir(), "copilot-spike-"));
  console.log("[spike] workDir:", workDir);

  const client = new CopilotClient();
  await client.start();

  const model = await resolveCopilotModel(client);
  console.log(`[spike] resolved model: ${model}`);

  const session = await client.createSession({
    model,
    workingDirectory: workDir,
    onPermissionRequest: approveAll,
  });

  console.log("[spike] sending prompt (no custom tools registered)...");
  const response = await session.sendAndWait({
    prompt:
      "Create a file named hello.txt in the current working directory containing exactly the text " +
      "HELLO_FROM_AGENT (no extra whitespace or newline). Then run a shell command to list the files " +
      "in the current directory. Reply with exactly: DONE",
  });

  console.log("[spike] response:", JSON.stringify(response?.data, null, 2));

  const filePath = join(workDir, "hello.txt");
  if (existsSync(filePath)) {
    console.log("[spike] hello.txt exists! content:", JSON.stringify(readFileSync(filePath, "utf8")));
  } else {
    console.log("[spike] hello.txt does NOT exist - built-in file write did not happen.");
  }

  const errors = await client.stop();
  if (errors.length > 0) {
    console.error("[spike] cleanup errors:", errors);
  }

  rmSync(workDir, { recursive: true, force: true });
}

main().catch((err) => {
  console.error("[spike] FAILED:", err);
  process.exit(1);
});

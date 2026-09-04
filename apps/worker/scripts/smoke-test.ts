import "dotenv/config";
import { CopilotClient } from "@github/copilot-sdk";
import { resolveCopilotModel } from "../src/copilotModel.js";

async function main(): Promise<void> {
  const client = new CopilotClient();
  await client.start();

  const model = await resolveCopilotModel(client);
  const session = await client.createSession({ model });

  const response = await session.sendAndWait({ prompt: "Reply with exactly the single word: OK" });
  await client.stop();

  if (response?.data?.content?.trim() === "OK") {
    console.log(`AUTH OK — model "${model}" replied: ${response.data.content.trim()}`);
  } else {
    console.error(`AUTH/SESSION FAILED — unexpected response: ${JSON.stringify(response?.data)}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("AUTH FAILED —", err.message ?? err);
  process.exit(1);
});

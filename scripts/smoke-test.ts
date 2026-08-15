import "dotenv/config";
import { query } from "@anthropic-ai/claude-agent-sdk";

async function main(): Promise<void> {
  const stream = query({
    prompt: "Reply with exactly the single word: OK",
    options: { maxTurns: 1, model: "claude-opus-5" },
  }) as AsyncIterable<any>;

  for await (const message of stream) {
    if (message.type === "result") {
      if (message.subtype === "success") {
        console.log(`AUTH OK — model replied: ${String(message.result).trim()}`);
      } else {
        console.error(`AUTH/SESSION FAILED — subtype: ${message.subtype}`);
        process.exit(1);
      }
    }
  }
}

main().catch((err) => {
  console.error("AUTH FAILED —", err.message ?? err);
  process.exit(1);
});

import { query } from "@anthropic-ai/claude-agent-sdk";
import { config } from "./config.js";
import type { AgentRunResult } from "./types.js";

function buildAgentEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env };
  if (config.mavenBinDir) {
    const sep = process.platform === "win32" ? ";" : ":";
    env.PATH = `${config.mavenBinDir}${sep}${env.PATH ?? ""}`;
  }
  return env;
}

/**
 * Runs one Claude Agent SDK session against an already-provisioned workspace.
 * `cwd` scopes every built-in tool call (Read/Write/Edit/Bash/Glob/Grep) to that
 * directory — this is the Phase 1 stand-in for architecture doc §03's ephemeral
 * sandbox. permissionMode "acceptEdits" auto-approves file edits and filesystem
 * Bash commands so the session runs unattended (there is no human to answer a
 * permission prompt in a headless job).
 *
 * Message shapes below are read defensively (loosely typed, checked at runtime
 * by `.type`) rather than imported from the SDK's own types, since the exact
 * exported type names are the installed package's source of truth, not this
 * file's guess at them — see the TypeScript reference at
 * https://code.claude.com/docs/en/agent-sdk/typescript.
 */
export async function runGenerationAgent(params: {
  systemPrompt: string;
  userPrompt: string;
  cwd: string;
}): Promise<AgentRunResult> {
  const { systemPrompt, userPrompt, cwd } = params;

  const abortController = new AbortController();
  const timer = setTimeout(() => abortController.abort(), config.agentTimeoutMs);

  const transcript: string[] = [];
  let success = false;
  let summary: string | undefined;
  let subtype: string | undefined;

  try {
    const stream = query({
      prompt: userPrompt,
      options: {
        systemPrompt,
        cwd,
        env: buildAgentEnv(),
        model: config.agentModel,
        maxTurns: config.agentMaxTurns,
        maxBudgetUsd: config.agentMaxBudgetUsd,
        permissionMode: "acceptEdits",
        allowedTools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
        abortController,
      },
    }) as AsyncIterable<any>;

    for await (const message of stream) {
      switch (message.type) {
        case "assistant": {
          const content = message.message?.content ?? [];
          for (const block of content) {
            if (block?.type === "text" && typeof block.text === "string") {
              transcript.push(block.text);
            } else if (block?.type === "tool_use") {
              const inputPreview = JSON.stringify(block.input ?? {}).slice(0, 300);
              transcript.push(`[tool] ${block.name} ${inputPreview}`);
            }
          }
          break;
        }
        case "result": {
          subtype = message.subtype;
          success = message.subtype === "success";
          summary = typeof message.result === "string" ? message.result : undefined;
          break;
        }
        case "system": {
          if (message.subtype === "init") {
            const toolCount = Array.isArray(message.tools) ? message.tools.length : "?";
            transcript.push(`[init] model=${message.model ?? config.agentModel} tools=${toolCount}`);
          }
          break;
        }
        default:
          break;
      }
    }
  } catch (err) {
    transcript.push(`[error] ${(err as Error).message}`);
    success = false;
  } finally {
    clearTimeout(timer);
  }

  return { success, summary, subtype, transcript };
}

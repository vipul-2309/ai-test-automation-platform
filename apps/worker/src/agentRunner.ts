import { CopilotClient, approveAll } from "@github/copilot-sdk";
import { config } from "./config.js";
import { resolveCopilotModel, PREFERRED_CLAUDE_MODELS } from "./copilotModel.js";
import type { AgentRunResult } from "./types.js";

/**
 * Runs one GitHub Copilot SDK session against an already-provisioned workspace,
 * targeting a Claude model served through the org's Copilot license rather than
 * a direct Anthropic API key - the whole point of this integration is routing
 * around an org network that blocks api.anthropic.com but already allows
 * Copilot traffic (see the Phase 0 spike this replaces).
 *
 * `workingDirectory` scopes every built-in tool call (file read/write/edit,
 * shell) to that directory, the same role `cwd` played for the previous Claude
 * Agent SDK integration - confirmed empirically that these built-ins exist
 * without registering any custom tools, unlike the SDK's own examples (which
 * are about *adding* extra tools, not about needing them for basic file/shell
 * access). `onPermissionRequest: approveAll` auto-approves everything so the
 * session runs unattended (there is no human to answer a permission prompt in
 * a headless job) - the same role `permissionMode: "acceptEdits"` played
 * before. `systemMessage: { mode: "replace", ... }` hands the session our full
 * skill-grounded prompt in place of the CLI's own default system message,
 * matching the old `systemPrompt` option's full-replacement behavior exactly.
 */
export async function runGenerationAgent(params: {
  systemPrompt: string;
  userPrompt: string;
  cwd: string;
}): Promise<AgentRunResult> {
  const { systemPrompt, userPrompt, cwd } = params;

  const transcript: string[] = [];
  let errorMessage: string | undefined;

  const client = new CopilotClient();

  try {
    await client.start();

    const preferredModels = config.agentModel
      ? [config.agentModel, ...PREFERRED_CLAUDE_MODELS]
      : PREFERRED_CLAUDE_MODELS;
    const model = await resolveCopilotModel(client, preferredModels);
    transcript.push(`[init] model=${model}`);

    const session = await client.createSession({
      model,
      workingDirectory: cwd,
      systemMessage: { mode: "replace", content: systemPrompt },
      onPermissionRequest: approveAll,
      ...(config.agentMaxAiCredits !== undefined
        ? { sessionLimits: { maxAiCredits: config.agentMaxAiCredits } }
        : {}),
    });

    session.on("assistant.message", (event) => {
      const content = event.data?.content;
      if (typeof content === "string" && content.length > 0) {
        transcript.push(content);
      }
    });

    session.on("tool.execution_start", (event) => {
      const inputPreview = JSON.stringify(event.data.arguments ?? {}).slice(0, 300);
      transcript.push(`[tool] ${event.data.toolName} ${inputPreview}`);
    });

    session.on("tool.execution_complete", (event) => {
      if (!event.data.success) {
        transcript.push(`[tool-error] ${event.data.error?.message ?? "unknown error"}`);
      }
    });

    session.on("session.error", (event) => {
      errorMessage = `${event.data.errorType}: ${event.data.message}`;
      transcript.push(`[error] ${errorMessage}`);
    });

    const response = await session.sendAndWait({ prompt: userPrompt }, config.agentTimeoutMs);
    const stopErrors = await client.stop();
    for (const stopError of stopErrors) {
      transcript.push(`[cleanup-error] ${stopError.message}`);
    }

    if (response === undefined) {
      return {
        success: false,
        errorMessage: errorMessage ?? `Session timed out after ${config.agentTimeoutMs}ms with no response.`,
        transcript,
      };
    }

    return {
      success: errorMessage === undefined,
      summary: response.data?.content,
      errorMessage,
      transcript,
    };
  } catch (err) {
    transcript.push(`[error] ${(err as Error).message}`);
    try {
      await client.stop();
    } catch {
      // best-effort cleanup; the primary error is already captured above
    }
    return { success: false, errorMessage: (err as Error).message, transcript };
  }
}

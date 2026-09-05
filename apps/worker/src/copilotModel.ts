import type { CopilotClient } from "@github/copilot-sdk";

/**
 * Model ids are account/catalog-specific strings (e.g. "claude-sonnet-5", not
 * "claude-sonnet-4.5") and GitHub can rename or deprecate them at any time - a
 * hardcoded guess broke outright the first time it didn't match this account's
 * actual catalog, with a clear error rather than a silent fallback. Resolve
 * against the live catalog instead of hardcoding one, preferring the first
 * available match from an ordered list of acceptable ids.
 *
 * Deliberately Sonnet-only, no Opus entries at any fallback position - a cost
 * policy decision (Opus 5 bills at roughly 2.5x Sonnet 5's per-token rate; see
 * the platform's AI-credit-usage writeup), not an availability guess. If
 * claude-sonnet-5 isn't in this account's catalog, resolveCopilotModel below
 * throws a clear error rather than silently spending on a pricier model.
 */
export const PREFERRED_CLAUDE_MODELS = ["claude-sonnet-5"];

export async function resolveCopilotModel(
  client: CopilotClient,
  preferredIds: string[] = PREFERRED_CLAUDE_MODELS
): Promise<string> {
  const models = await client.listModels();
  const available = new Set(models.map((model) => model.id));

  for (const id of preferredIds) {
    if (available.has(id)) {
      return id;
    }
  }

  throw new Error(
    `None of the preferred models [${preferredIds.join(", ")}] are available on this ` +
      `account/catalog. Available: [${[...available].join(", ")}]. Check that the ` +
      `Anthropic Claude policy is enabled for this Copilot account.`
  );
}

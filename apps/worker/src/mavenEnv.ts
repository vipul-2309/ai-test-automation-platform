import { config } from "./config.js";

/**
 * Shared PATH-augmentation for anything that shells out to `mvn` - both the
 * agent's own shell tool (agentRunner.ts) and this repo's own independent
 * verification pass (validation.ts) need `mvn` resolvable, and MAVEN_BIN_DIR
 * is how a developer machine without mvn globally on PATH opts in. Extracted
 * once so both call sites (and any future one) can't drift.
 */
export function buildMavenEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env };
  if (config.mavenBinDir) {
    const sep = process.platform === "win32" ? ";" : ":";
    env.PATH = `${config.mavenBinDir}${sep}${env.PATH ?? ""}`;
  }
  return env;
}

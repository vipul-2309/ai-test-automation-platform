# AI Test Automation Platform

A generation engine that turns a project name, app URL, and test-case
spreadsheet into a framework-compliant, `mvn test`-ready Playwright/TestNG
project — the AI layer described in the architecture doc, now being built out
into the full platform (Spring Boot API + React UI + async job queue) around
it. This repo is a monorepo:

```
apps/
├── worker/   # the generation engine (Node/TypeScript) - this README's focus
└── api/      # Spring Boot job submission/status/download API (Phase 2)
```

`apps/worker` is grounded in
[`Demo-Test-Automation-Framework`](../Demo-Test-Automation-Framework)'s
`.claude/skills/test-automation-framework/SKILL.md` and its
`references/templates/` — that repo is a **required sibling dependency**, not
vendored in here.

## AI provider: GitHub Copilot SDK, targeting Claude

`apps/worker` runs generation through `@github/copilot-sdk`, which drives a
Claude model (Opus/Sonnet, whichever `src/copilotModel.ts` resolves as
available) through the caller's own GitHub Copilot license rather than a
direct Anthropic API key. This was a deliberate swap from an earlier
`@anthropic-ai/claude-agent-sdk` integration, made specifically so this can run
on a network that blocks direct access to `api.anthropic.com` but already
allows Copilot traffic — the request reaches real Claude via GitHub's backend
instead. See `src/agentRunner.ts`'s doc comment for the full mechanics.

**Requires**: a GitHub Copilot license (Business/Enterprise or an individual
paid tier) with the Anthropic Claude policy enabled by an org admin — Copilot's
default free tier does not include Claude access, and requesting an
unavailable model fails with a clear error rather than silently falling back.

## Prerequisites

- Node.js `^20.19.0 || >=22.12.0` in `apps/worker` (the `@github/copilot-sdk`
  dependency needs `Promise.withResolvers`, unavailable before those versions —
  `apps/worker/.npmrc` sets `engine-strict=true` so `npm install` fails loudly
  on an older Node instead of a confusing runtime crash later). If your system
  Node is older and you'd rather not touch it, a portable build works fine with
  no admin rights: download the Windows zip from
  https://nodejs.org/dist/, extract it anywhere, and prepend its folder to
  `PATH` for your terminal session, e.g.
  `$env:Path = "C:\path\to\node-v22.23.2-win-x64;$env:Path"` (PowerShell).
- A JDK and Maven capable of building `Demo-Test-Automation-Framework` itself
  (this machine has JDK 25 + Maven 3.9.9 already; set `MAVEN_BIN_DIR` in `.env`
  if `mvn` isn't on your `PATH`)
- GitHub CLI (`gh`) authenticated (`gh auth login`) with an account that has
  the Copilot license described above — `@github/copilot-sdk` reuses its
  stored token by default (or set `GH_TOKEN`/`GITHUB_TOKEN` explicitly; see
  `.env.example`)

## Setup

```bash
cd apps/worker
npm install
cp .env.example .env
# edit .env: FRAMEWORK_REPO_PATH if this repo isn't sitting next to
# Demo-Test-Automation-Framework as a sibling folder; everything else has a
# working default
```

## Run it

**Option A — CLI (fastest way to test):**

```bash
npm run generate -- \
  --project=saucedemo-clone \
  --url=https://www.saucedemo.com \
  --sheet=../../Demo-Test-Automation-Framework/src/main/resources/Sample_TestCase.xlsx
```

**Option B — API endpoint:**

```bash
npm run dev
# in another terminal:
curl -F projectName=saucedemo-clone \
     -F appUrl=https://www.saucedemo.com \
     -F testCaseSheet=@../../Demo-Test-Automation-Framework/src/main/resources/Sample_TestCase.xlsx \
     http://localhost:4000/api/projects -o out.zip
```

Either way, the pipeline is: parse the sheet → load the skill + templates →
provision a workspace seeded from the framework repo's shared core (package
renamed onto `com.<project-name>`) → run one Copilot SDK session (built-in
file/shell tools, scoped to that workspace — confirmed empirically to work
without registering any custom tools) → the agent runs `mvn -q test-compile`
itself and fixes what it broke → zip the result. A run typically takes a few
minutes; `AGENT_TIMEOUT_MS` in `.env` is the safety rail (see below), and
`AGENT_MAX_AI_CREDITS` if you want to cap GitHub's own Copilot spend unit for a
single run.

## What this deliberately leaves out

Matches architecture doc §12 Phase 1's explicit exclusions, plus two
generation-quality tradeoffs worth knowing about before you read the output:

- **No live-app locator verification.** The agent infers locators from the
  test-case steps alone and leaves a `// TODO(verify-locator)` comment
  wherever it isn't confident. Treat every generated page object as needing a
  human pass (or the discovery/live-verification phases from the build plan,
  once built) against the live app before trusting it.
- **Credentials are not protected per §08.** They're passed straight through
  in the job prompt text and end up in the generated `config.properties` in
  plain text, same as the framework already does for `saucedemo`. §08's
  per-job secrets store, sandbox-only injection, and log redaction are later
  build-order work (see the plan's Phase 3).
- **No queue, sandbox container, auth, or UI in `apps/worker` itself** — `apps/api`
  is where the job queue/persistence/API contract lives; `apps/worker`'s CLI
  and Express entry points remain direct-invocation for local testing.
- **Cost/time governance is a stand-in.** `AGENT_TIMEOUT_MS` caps wall-clock
  time; `AGENT_MAX_AI_CREDITS` is optional and unset by default (no SDK-enforced
  spend limit) since GitHub's AI Credits unit doesn't map directly to a USD
  figure worth guessing at — set it once you know your org's convention.

## Project layout (`apps/worker/src/`)

```
config.ts          # env-driven config (paths, model preference, timeout/credit caps)
types.ts            # shared interfaces
testCaseSheet.ts     # .xlsx -> structured TestCase[] (forward-fills merged cells)
skillLoader.ts        # reads SKILL.md + references/templates/ from the framework repo
workspace.ts           # seeds workspaces/<jobId>/ from the framework repo's shared core
promptBuilder.ts        # assembles system+user prompt
copilotModel.ts          # resolves an available Claude model id from the account's live catalog
agentRunner.ts             # runs the Copilot SDK session
packager.ts                 # zips the generated project
generate.ts                  # orchestrates the pipeline end to end
server.ts                     # Express POST /api/projects (Option B above)
└── cli.ts                    # local test harness (Option A above)
```

`workspaces/` is git-ignored and accumulates one directory per run (source
tree + `output/<project>.zip`) — inspect a failed run there directly; nothing
deletes them automatically yet.

## Next steps

See the build-order plan discussed alongside this repo: `apps/api`'s Spring
Boot skeleton exists (job submission/status/download, Postgres-backed job
table); next is wiring `apps/worker` to poll and claim jobs from that table
instead of being invoked directly, then the React UI, then the deterministic
application-discovery phase, then a live-verification/repair loop.

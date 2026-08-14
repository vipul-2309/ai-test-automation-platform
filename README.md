# AI Test Automation Platform — Phase 1

Phase 1 of the platform described in the architecture doc: a **generation engine
only**, no UI, no queue, no auth — a single trusted internal caller (you, right
now) submits four inputs and gets back a framework-compliant, `mvn test`-ready
project zip. Everything here exists to validate the AI layer before Phases
2–4 build the queue, sandbox hardening, React UI, and SSO/secrets-vault
production hardening around it.

It is grounded in [`Demo-Test-Automation-Framework`](../Demo-Test-Automation-Framework)'s
`.claude/skills/test-automation-framework/SKILL.md` and its `references/templates/`
— that repo is a **required sibling dependency**, not vendored in here.

## Prerequisites

- Node.js 18+ (tested on 20.13)
- A JDK and Maven capable of building `Demo-Test-Automation-Framework` itself
  (this machine has JDK 25 + Maven 3.9.9 already; set `MAVEN_BIN_DIR` in `.env`
  if `mvn` isn't on your `PATH`)
- An `ANTHROPIC_API_KEY` (per the architecture doc's open decision on Chromosome
  AI vs. an org-owned key — this uses whatever key you export for now; nothing
  in this codebase is Anthropic-specific beyond `src/agentRunner.ts`)

## Setup

```bash
npm install
cp .env.example .env
# edit .env: set ANTHROPIC_API_KEY, and FRAMEWORK_REPO_PATH if this repo isn't
# sitting next to Demo-Test-Automation-Framework as a sibling folder
```

## Run it

**Option A — CLI (fastest way to test):**

```bash
npm run generate -- \
  --project=saucedemo-clone \
  --url=https://www.saucedemo.com \
  --sheet=../Demo-Test-Automation-Framework/src/main/resources/Sample_TestCase.xlsx
```

**Option B — API endpoint:**

```bash
npm run dev
# in another terminal:
curl -F projectName=saucedemo-clone \
     -F appUrl=https://www.saucedemo.com \
     -F testCaseSheet=@../Demo-Test-Automation-Framework/src/main/resources/Sample_TestCase.xlsx \
     http://localhost:4000/api/projects -o out.zip
```

Either way, the pipeline is architecture doc §06's sequence, minus the queue:
parse the sheet → load the skill + templates → provision a workspace seeded
from a copy of the framework repo → run one Claude Agent SDK session (file
tools + Bash, scoped to that workspace) → the agent runs `mvn -q test-compile`
itself and fixes what it broke → zip the result. A run typically takes a few
minutes and costs real Anthropic API spend — `AGENT_MAX_BUDGET_USD` and
`AGENT_TIMEOUT_MS` in `.env` are the safety rails (see below).

## What Phase 1 deliberately leaves out

Matches architecture doc §12 Phase 1's explicit exclusions, plus two
generation-quality tradeoffs worth knowing about before you read the output:

- **No live-app locator verification.** §03 describes a Playwright MCP
  connection so the agent can navigate the real app before writing locators.
  That's wired into the architecture but **not yet into this codebase** — the
  agent infers locators from the test-case steps alone and leaves a
  `// TODO(verify-locator)` comment wherever it isn't confident. Treat every
  generated page object as needing a human pass against the live app before
  trusting it. This is consistent with §11's still-open "verification
  strictness" decision and §12's own Phase 4 row ("mandatory live-app
  verification loop") — Phase 1 is explicitly the best-effort end of that
  range, not a regression from a promise made elsewhere in the doc.
- **Credentials are not protected per §08.** They're passed straight through
  in the job prompt text and end up in the generated `config.properties` in
  plain text, same as the framework already does for `saucedemo`. §08's
  per-job secrets store, sandbox-only injection, and log redaction are Phase
  3 work. Don't point this at anything with real production credentials yet.
- **No queue, sandbox container, auth, or UI.** The HTTP request blocks for
  the whole generation; there's no isolation between this process and your
  machine (the agent's Bash tool runs directly on your host, scoped only by
  `cwd`); anyone who can reach the port can submit a job.
- **Cost/time governance is a stand-in, not §11's real answer.**
  `AGENT_MAX_BUDGET_USD` (default $3) and `AGENT_TIMEOUT_MS` (default 15 min)
  cap a single run so a stuck session can't run away unbounded, but there's no
  per-team quota, dashboard, or budget alert — §11 flags that as still open.

## Project layout

```
src/
├── config.ts          # env-driven config (paths, model, budget/timeout caps)
├── types.ts            # shared interfaces
├── testCaseSheet.ts     # .xlsx -> structured TestCase[] (forward-fills merged cells)
├── skillLoader.ts        # reads SKILL.md + references/templates/ from the framework repo
├── workspace.ts           # copies the framework repo into workspaces/<jobId>/
├── promptBuilder.ts        # assembles system+user prompt per architecture doc §04's order
├── agentRunner.ts            # runs the Claude Agent SDK session
├── packager.ts                 # zips the generated project
├── generate.ts                  # orchestrates the pipeline end to end
├── server.ts                     # Express POST /api/projects (Option B above)
└── cli.ts                         # local test harness (Option A above)
```

`workspaces/` is git-ignored and accumulates one directory per run (source
tree + `output/<project>.zip`) — inspect a failed run there directly; nothing
deletes them automatically yet (retention policy is §11/§08, Phase 3).

## Next steps toward Phase 2

Per architecture doc §12: wrap `generateProject()` in a job queue instead of
calling it synchronously from the HTTP handler, persist job state (currently
nothing survives a restart), add the React form + status/download pages, and
move workspace provisioning into a real per-job container instead of a bare
directory on the host running this process.

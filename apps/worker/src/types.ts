export interface TestStep {
  stepNo: string;
  description: string;
  expectedResult: string;
}

export interface TestCase {
  testCaseId: string;
  preCondition: string;
  description: string;
  steps: TestStep[];
}

export interface JobInput {
  /** Lowercase, hyphen-separated — becomes the <project-name> placeholder everywhere. */
  projectName: string;
  appUrl: string;
  username?: string;
  password?: string;
  /** Raw bytes of the uploaded .xlsx test-case sheet. */
  testCaseSheet: Buffer;
  /** Skip the deterministic discovery crawl (e.g. the target performs real side effects you don't want triggered twice, or discovery's generic login heuristic doesn't fit this app). */
  skipDiscovery?: boolean;
  /**
   * Opt-in (not opt-out like skipDiscovery): independent compile-check and
   * file-safety scanning always run regardless, but actually executing the
   * generated suite against the live app is a heavier action (the full test
   * suite's real logins/submissions, not just one), so it stays off by
   * default rather than mirroring discovery's single-login footprint.
   */
  runLiveValidation?: boolean;
}

export interface SkillContext {
  skillMarkdown: string;
  /** Filename -> file contents, for everything under references/templates/. */
  templates: Record<string, string>;
}

export interface AgentRunResult {
  success: boolean;
  /** The agent's final message text when the session completed without a session.error event. */
  summary?: string;
  /** Human-readable failure reason (session.error's "errorType: message", a timeout, or a thrown exception). */
  errorMessage?: string;
  /** Ordered log of assistant text + tool calls, for the debug transcript. */
  transcript: string[];
}

/** One interactive element found on a discovered page, with locator candidates in priority order. */
export interface DiscoveredElement {
  tag: string;
  elementType?: string;
  role?: string;
  accessibleName?: string;
  placeholder?: string;
  testId?: string;
  id?: string;
  name?: string;
  text?: string;
  /** Playwright selector strings, most-preferred first - role > test id > placeholder > id > name > text. */
  locators: string[];
}

export interface DiscoveredPage {
  url: string;
  title: string;
  screenshotPath?: string;
  elements: DiscoveredElement[];
}

export interface DiscoveryResult {
  pages: DiscoveredPage[];
  warnings: string[];
}

export interface TestFailure {
  testName: string;
  description?: string;
  message?: string;
}

export interface TestResults {
  /** False when no testng-results.xml exists yet (compile failed before any test ran, or live tests were skipped). */
  ran: boolean;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  failures: TestFailure[];
}

export interface FileSafetyIssue {
  severity: "warning" | "block";
  file: string;
  reason: string;
}

export interface FileSafetyResult {
  issues: FileSafetyIssue[];
  hasBlockingIssues: boolean;
}

export interface GenerationResult {
  jobId: string;
  projectName: string;
  success: boolean;
  workspaceDir: string;
  zipPath?: string;
  summary?: string;
  transcript: string[];
  error?: string;
  /** Independent verification (see validation.ts) - informational, doesn't gate success/zipPath above. */
  validation?: ValidationResult;
}

export interface ValidationResult {
  compileOk: boolean;
  compileError?: string;
  testResults: TestResults;
  fileSafetyIssues: FileSafetyIssue[];
}

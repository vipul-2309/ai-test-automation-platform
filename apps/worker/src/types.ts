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

export interface GenerationResult {
  jobId: string;
  projectName: string;
  success: boolean;
  workspaceDir: string;
  zipPath?: string;
  summary?: string;
  transcript: string[];
  error?: string;
}

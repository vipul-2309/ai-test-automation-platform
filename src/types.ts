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
  /** Claude's final summary text when the session ended with subtype "success". */
  summary?: string;
  /** SDKResultMessage.subtype, e.g. "success" | "error_max_turns" | "error_during_execution". */
  subtype?: string;
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

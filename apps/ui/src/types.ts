export type JobStatus =
  | "QUEUED"
  | "GENERATING"
  | "VERIFYING"
  | "REPAIRING"
  | "PACKAGING"
  | "READY"
  | "FAILED"

export interface TestFailure {
  testName: string
  description?: string
  message?: string
}

export interface TestResults {
  ran: boolean
  total: number
  passed: number
  failed: number
  skipped: number
  failures: TestFailure[]
}

export interface FileSafetyIssue {
  severity: 'warning' | 'block'
  file: string
  reason: string
}

export interface ValidationResult {
  compileOk: boolean
  compileError?: string
  testResults: TestResults
  fileSafetyIssues: FileSafetyIssue[]
}

export interface JobResponse {
  id: string
  projectName: string
  appUrl: string
  status: JobStatus
  errorMessage?: string
  summary?: string
  createdAt: string
  updatedAt: string
  downloadUrl?: string
  filesUrl?: string
  validationReport?: ValidationResult
}

export interface FileNode {
  name: string
  type: 'file' | 'dir'
  children: FileNode[]
}

export interface TestStep {
  stepNo: string
  description: string
  expectedResult: string
}

export interface TestCase {
  testCaseId: string
  preCondition: string
  description: string
  steps: TestStep[]
}

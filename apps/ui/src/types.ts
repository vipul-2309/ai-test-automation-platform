export type JobStatus =
  | "QUEUED"
  | "GENERATING"
  | "VERIFYING"
  | "REPAIRING"
  | "PACKAGING"
  | "READY"
  | "FAILED"

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

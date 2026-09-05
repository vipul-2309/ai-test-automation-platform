import type { JobResponse, TestCase } from './types'

// Two separate backends, per the actual current architecture: apps/api owns
// job submission/status/download; apps/worker owns sheet parsing (the only
// place that logic exists - see the Phase 2 decision not to duplicate it in
// Java), so the sheet-preview endpoint lives there instead.
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'
const WORKER_BASE = import.meta.env.VITE_WORKER_BASE_URL ?? 'http://localhost:4000'

async function readErrorMessage(res: Response, fallbackField: 'message' | 'error'): Promise<string> {
  const body = await res.json().catch(() => undefined)
  const message = body?.[fallbackField] ?? body?.message ?? body?.error
  return typeof message === 'string' ? message : `Request failed (${res.status})`
}

export interface SubmitJobParams {
  projectName: string
  appUrl: string
  username?: string
  password?: string
  testCaseSheet: File
}

export async function submitJob(params: SubmitJobParams): Promise<{ jobId: string }> {
  const form = new FormData()
  form.set('projectName', params.projectName)
  form.set('appUrl', params.appUrl)
  if (params.username) form.set('username', params.username)
  if (params.password) form.set('password', params.password)
  form.set('testCaseSheet', params.testCaseSheet)

  const res = await fetch(`${API_BASE}/api/projects`, { method: 'POST', body: form })
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, 'message'))
  }
  return res.json()
}

export async function getJobStatus(id: string): Promise<JobResponse> {
  const res = await fetch(`${API_BASE}/api/projects/${id}`)
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, 'message'))
  }
  return res.json()
}

/** JobResponse.downloadUrl is API-relative (e.g. "/api/projects/{id}/download?token=..."); this makes it absolute. */
export function absoluteDownloadUrl(job: JobResponse): string | undefined {
  return job.downloadUrl ? `${API_BASE}${job.downloadUrl}` : undefined
}

export async function previewSheet(file: File): Promise<{ testCases: TestCase[] }> {
  const form = new FormData()
  form.set('testCaseSheet', file)

  const res = await fetch(`${WORKER_BASE}/api/preview`, { method: 'POST', body: form })
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, 'error'))
  }
  return res.json()
}

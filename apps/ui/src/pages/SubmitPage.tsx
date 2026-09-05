import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { previewSheet, submitJob } from '../api'
import type { TestCase } from '../types'

// Mirrors apps/api's JobController.PROJECT_NAME_PATTERN exactly - kept in sync
// manually since it's a third copy (Java, apps/worker's generate.ts, and now
// here), each in a different language/process.
const PROJECT_NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

export function SubmitPage() {
  const navigate = useNavigate()

  const [projectName, setProjectName] = useState('')
  const [appUrl, setAppUrl] = useState('')
  const [showCredentials, setShowCredentials] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [file, setFile] = useState<File | undefined>()

  const [previewCases, setPreviewCases] = useState<TestCase[] | undefined>()
  const [previewError, setPreviewError] = useState<string | undefined>()
  const [previewing, setPreviewing] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | undefined>()

  const projectNameError =
    projectName.length > 0 && !PROJECT_NAME_PATTERN.test(projectName)
      ? 'Lowercase letters, numbers, and hyphens only (e.g. "globex-crm").'
      : undefined

  const appUrlError =
    appUrl.length > 0 && !/^https?:\/\//i.test(appUrl) ? 'Must be an absolute http(s) URL.' : undefined

  const canSubmit =
    projectName.length > 0 && !projectNameError && appUrl.length > 0 && !appUrlError && file !== undefined

  async function handlePreview() {
    if (!file) return
    setPreviewing(true)
    setPreviewError(undefined)
    setPreviewCases(undefined)
    try {
      const { testCases } = await previewSheet(file)
      setPreviewCases(testCases)
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : String(err))
    } finally {
      setPreviewing(false)
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!file || !canSubmit) return
    setSubmitting(true)
    setSubmitError(undefined)
    try {
      const { jobId } = await submitJob({
        projectName,
        appUrl,
        username: showCredentials ? username || undefined : undefined,
        password: showCredentials ? password || undefined : undefined,
        testCaseSheet: file,
      })
      navigate(`/jobs/${jobId}`)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err))
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">
        Generate a test automation project
      </h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        Submit an application URL and a test-case sheet (.xlsx or .csv). A framework-compliant
        Playwright/TestNG project will be generated and made available for download.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-6">
        <div>
          <label htmlFor="projectName" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Project name
          </label>
          <input
            id="projectName"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="globex-crm"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
          {projectNameError && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{projectNameError}</p>}
        </div>

        <div>
          <label htmlFor="appUrl" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Application URL
          </label>
          <input
            id="appUrl"
            value={appUrl}
            onChange={(e) => setAppUrl(e.target.value)}
            placeholder="https://example.com/login"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
          {appUrlError && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{appUrlError}</p>}
        </div>

        <div>
          <button
            type="button"
            onClick={() => setShowCredentials((v) => !v)}
            className="text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
          >
            {showCredentials ? '− Hide login credentials' : '+ Add login credentials (optional)'}
          </button>
          {showCredentials && (
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Username"
                className="rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                type="password"
                className="rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
          )}
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
            If omitted, credentials referenced in the test steps themselves will be used instead.
          </p>
        </div>

        <div>
          <label htmlFor="sheet" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Test case sheet
          </label>
          <input
            id="sheet"
            type="file"
            accept=".xlsx,.csv"
            onChange={(e) => {
              setFile(e.target.files?.[0])
              setPreviewCases(undefined)
              setPreviewError(undefined)
            }}
            className="mt-1 block w-full text-sm text-slate-600 file:mr-4 file:rounded-md file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100 dark:text-slate-400 dark:file:bg-indigo-950 dark:file:text-indigo-300"
          />
          {file && (
            <button
              type="button"
              onClick={handlePreview}
              disabled={previewing}
              className="mt-3 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {previewing ? 'Parsing…' : 'Preview parsed sheet'}
            </button>
          )}
        </div>

        {previewError && (
          <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {previewError}
          </div>
        )}

        {previewCases && <SheetPreview testCases={previewCases} />}

        {submitError && (
          <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {submitError}
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit || submitting}
          className="w-full rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Submitting…' : 'Generate project'}
        </button>
      </form>
    </div>
  )
}

function SheetPreview({ testCases }: { testCases: TestCase[] }) {
  return (
    <div className="rounded-md border border-slate-200 dark:border-slate-700">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
        {testCases.length} test case{testCases.length === 1 ? '' : 's'} parsed
      </div>
      <div className="max-h-64 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-700">
        {testCases.map((tc) => (
          <details key={tc.testCaseId} className="px-4 py-2">
            <summary className="cursor-pointer text-sm font-medium text-slate-800 dark:text-slate-100">
              {tc.testCaseId} — {tc.description || '(no description)'}{' '}
              <span className="text-slate-400">({tc.steps.length} step{tc.steps.length === 1 ? '' : 's'})</span>
            </summary>
            <ol className="mt-2 space-y-1 pl-4 text-xs text-slate-600 dark:text-slate-400">
              {tc.steps.map((step, i) => (
                <li key={i}>
                  <span className="font-medium">Step {step.stepNo || i + 1}:</span> {step.description} →{' '}
                  {step.expectedResult}
                </li>
              ))}
            </ol>
          </details>
        ))}
      </div>
    </div>
  )
}

import { useState, type DragEvent, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronDown,
  ChevronRight,
  Eye,
  FileSpreadsheet,
  FolderKanban,
  Globe,
  KeyRound,
  Loader2,
  Sparkles,
  UploadCloud,
  User,
  X,
} from 'lucide-react'
import { previewSheet, submitJob } from '../api'
import type { TestCase } from '../types'
import { useToast } from '../components/Toast'

// Mirrors apps/api's JobController.PROJECT_NAME_PATTERN exactly - kept in sync
// manually since it's a third copy (Java, apps/worker's generate.ts, and now
// here), each in a different language/process.
const PROJECT_NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

export function SubmitPage() {
  const navigate = useNavigate()
  const pushToast = useToast()

  const [projectName, setProjectName] = useState('')
  const [appUrl, setAppUrl] = useState('')
  const [showCredentials, setShowCredentials] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [file, setFile] = useState<File | undefined>()
  const [dragActive, setDragActive] = useState(false)

  const [previewCases, setPreviewCases] = useState<TestCase[] | undefined>()
  const [previewing, setPreviewing] = useState(false)

  const [submitting, setSubmitting] = useState(false)

  const projectNameError =
    projectName.length > 0 && !PROJECT_NAME_PATTERN.test(projectName)
      ? 'Lowercase letters, numbers, and hyphens only (e.g. "globex-crm").'
      : undefined

  const appUrlError =
    appUrl.length > 0 && !/^https?:\/\//i.test(appUrl) ? 'Must be an absolute http(s) URL.' : undefined

  const canSubmit =
    projectName.length > 0 && !projectNameError && appUrl.length > 0 && !appUrlError && file !== undefined

  function handleFileChosen(selected: File | undefined) {
    setFile(selected)
    setPreviewCases(undefined)
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    setDragActive(false)
    const dropped = event.dataTransfer.files?.[0]
    if (dropped) handleFileChosen(dropped)
  }

  async function handlePreview() {
    if (!file) return
    setPreviewing(true)
    setPreviewCases(undefined)
    try {
      const { testCases } = await previewSheet(file)
      setPreviewCases(testCases)
    } catch (err) {
      pushToast(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setPreviewing(false)
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!file || !canSubmit) return
    setSubmitting(true)
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
      pushToast(err instanceof Error ? err.message : String(err), 'error')
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="animate-fade-in-up">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300">
          <Sparkles className="h-3 w-3" />
          New project
        </span>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
          Generate a test automation project
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Submit an application URL and a test-case sheet (.xlsx or .csv). A framework-compliant
          Playwright/TestNG project will be generated and made available for download.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="animate-fade-in-up mt-8 space-y-6 rounded-2xl border border-slate-200/70 bg-white/70 p-6 shadow-sm shadow-slate-200/50 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/60 sm:p-8"
      >
        <div>
          <label htmlFor="projectName" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Project name
          </label>
          <div className="relative mt-1">
            <FolderKanban className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="projectName"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="globex-crm"
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
          {projectNameError && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{projectNameError}</p>}
        </div>

        <div>
          <label htmlFor="appUrl" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Application URL
          </label>
          <div className="relative mt-1">
            <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="appUrl"
              value={appUrl}
              onChange={(e) => setAppUrl(e.target.value)}
              placeholder="https://example.com/login"
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
          {appUrlError && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{appUrlError}</p>}
        </div>

        <div>
          <button
            type="button"
            onClick={() => setShowCredentials((v) => !v)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
          >
            <KeyRound className="h-3.5 w-3.5" />
            {showCredentials ? 'Hide login credentials' : 'Add login credentials (optional)'}
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showCredentials ? 'rotate-180' : ''}`} />
          </button>
          {showCredentials && (
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Username"
                  className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  type="password"
                  className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
            </div>
          )}
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
            If omitted, credentials referenced in the test steps themselves will be used instead.
          </p>
        </div>

        <div>
          <span className="block text-sm font-medium text-slate-700 dark:text-slate-300">Test case sheet</span>
          <label
            htmlFor="sheet"
            onDragOver={(e) => {
              e.preventDefault()
              setDragActive(true)
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            className={
              'mt-1 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ' +
              (dragActive
                ? 'border-indigo-400 bg-indigo-50 dark:border-indigo-500 dark:bg-indigo-950/40'
                : 'border-slate-300 bg-slate-50/50 hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-800/30')
            }
          >
            <UploadCloud className="h-6 w-6 text-slate-400" />
            <div className="text-sm text-slate-600 dark:text-slate-400">
              <span className="font-medium text-indigo-600 dark:text-indigo-400">Click to upload</span> or drag and
              drop
            </div>
            <p className="text-xs text-slate-400">.xlsx or .csv</p>
            <input
              id="sheet"
              type="file"
              accept=".xlsx,.csv"
              onChange={(e) => handleFileChosen(e.target.files?.[0])}
              className="hidden"
            />
          </label>

          {file && (
            <div className="mt-3 flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
              <span className="flex min-w-0 items-center gap-2 text-slate-700 dark:text-slate-200">
                <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-500" />
                <span className="truncate">{file.name}</span>
              </span>
              <div className="flex shrink-0 items-center gap-3">
                <button
                  type="button"
                  onClick={handlePreview}
                  disabled={previewing}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-500 disabled:opacity-50 dark:text-indigo-400"
                >
                  {previewing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                  {previewing ? 'Parsing…' : 'Preview'}
                </button>
                <button
                  type="button"
                  onClick={() => handleFileChosen(undefined)}
                  className="text-slate-400 hover:text-red-500"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {previewCases && <SheetPreview testCases={previewCases} />}

        <button
          type="submit"
          disabled={!canSubmit || submitting}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-500/30 transition hover:shadow-md hover:shadow-indigo-500/40 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {submitting ? 'Submitting…' : 'Generate project'}
        </button>
      </form>
    </div>
  )
}

function SheetPreview({ testCases }: { testCases: TestCase[] }) {
  return (
    <div className="animate-fade-in-up overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
        {testCases.length} test case{testCases.length === 1 ? '' : 's'} parsed
      </div>
      <div className="max-h-64 divide-y divide-slate-200 overflow-y-auto dark:divide-slate-700">
        {testCases.map((tc) => (
          <details key={tc.testCaseId} className="group px-4 py-2">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-slate-800 [&::-webkit-details-marker]:hidden dark:text-slate-100">
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform group-open:rotate-90" />
              <span className="truncate">
                {tc.testCaseId} — {tc.description || '(no description)'}
              </span>
              <span className="shrink-0 text-slate-400">
                ({tc.steps.length} step{tc.steps.length === 1 ? '' : 's'})
              </span>
            </summary>
            <ol className="mt-2 space-y-1 pl-8 text-xs text-slate-600 dark:text-slate-400">
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

import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ClipboardList, Download, ExternalLink, FolderTree } from 'lucide-react'
import { absoluteDownloadUrl, getFileTree, getJobStatus } from '../api'
import type { FileNode, JobResponse } from '../types'
import { StatusStepper } from '../components/StatusStepper'
import { FileTree } from '../components/FileTree'
import { ValidationReport } from '../components/ValidationReport'
import { Card } from '../components/Card'

const POLL_INTERVAL_MS = 3000
const TERMINAL_STATUSES = new Set(['READY', 'FAILED'])

export function JobStatusPage() {
  const { id } = useParams<{ id: string }>()
  const [job, setJob] = useState<JobResponse | undefined>()
  const [error, setError] = useState<string | undefined>()
  const [fileTree, setFileTree] = useState<FileNode | undefined>()
  const [fileTreeError, setFileTreeError] = useState<string | undefined>()

  useEffect(() => {
    if (!id) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    async function poll() {
      try {
        const result = await getJobStatus(id!)
        if (cancelled) return
        setJob(result)
        setError(undefined)
        if (!TERMINAL_STATUSES.has(result.status)) {
          timer = setTimeout(poll, POLL_INTERVAL_MS)
        }
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
        timer = setTimeout(poll, POLL_INTERVAL_MS)
      }
    }

    poll()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [id])

  useEffect(() => {
    if (!job || job.status !== 'READY' || !job.filesUrl) return
    let cancelled = false

    getFileTree(job)
      .then((tree) => {
        if (!cancelled) setFileTree(tree)
      })
      .catch((err) => {
        if (!cancelled) setFileTreeError(err instanceof Error ? err.message : String(err))
      })

    return () => {
      cancelled = true
    }
  }, [job?.id, job?.status, job?.filesUrl])

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
      >
        <ArrowLeft className="h-4 w-4" />
        New submission
      </Link>

      <div className="animate-fade-in-up mt-4">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
          {job?.projectName ?? 'Loading job…'}
        </h1>
        {job && (
          <a
            href={job.appUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400"
          >
            {job.appUrl}
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      <div className="mt-8">
        {job ? (
          <StatusStepper status={job.status} />
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">Fetching status…</p>
        )}
      </div>

      {error && (
        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Couldn't reach the status endpoint just now, retrying… ({error})
        </div>
      )}

      {job?.status === 'FAILED' && job.errorMessage && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {job.errorMessage}
        </div>
      )}

      {job?.summary && (
        <Card title="Summary" icon={<ClipboardList className="h-3.5 w-3.5" />} className="mt-6">
          <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">{job.summary}</p>
        </Card>
      )}

      {job?.validationReport && <ValidationReport report={job.validationReport} />}

      {job?.status === 'READY' && (
        <a
          href={absoluteDownloadUrl(job)}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-500/30 transition hover:shadow-md hover:shadow-emerald-500/40"
        >
          <Download className="h-4 w-4" />
          Download project (.zip)
        </a>
      )}

      {job?.status === 'READY' && (
        <Card title="Generated files" icon={<FolderTree className="h-3.5 w-3.5" />} className="mt-6">
          {fileTreeError && <p className="text-sm text-red-600 dark:text-red-400">{fileTreeError}</p>}
          {fileTree && (
            <div className="max-h-80 overflow-auto">
              <FileTree root={fileTree} />
            </div>
          )}
          {!fileTree && !fileTreeError && (
            <p className="text-sm text-slate-500 dark:text-slate-400">Loading file list…</p>
          )}
        </Card>
      )}
    </div>
  )
}

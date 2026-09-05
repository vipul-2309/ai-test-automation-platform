import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { absoluteDownloadUrl, getJobStatus } from '../api'
import type { JobResponse } from '../types'
import { StatusStepper } from '../components/StatusStepper'

const POLL_INTERVAL_MS = 3000
const TERMINAL_STATUSES = new Set(['READY', 'FAILED'])

export function JobStatusPage() {
  const { id } = useParams<{ id: string }>()
  const [job, setJob] = useState<JobResponse | undefined>()
  const [error, setError] = useState<string | undefined>()

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

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link to="/" className="text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400">
        ← New submission
      </Link>

      <h1 className="mt-4 text-2xl font-semibold text-slate-900 dark:text-slate-50">
        {job?.projectName ?? 'Loading job…'}
      </h1>
      {job && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{job.appUrl}</p>}

      <div className="mt-8">
        {job ? (
          <StatusStepper status={job.status} />
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">Fetching status…</p>
        )}
      </div>

      {error && (
        <div className="mt-6 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Couldn't reach the status endpoint just now, retrying… ({error})
        </div>
      )}

      {job?.status === 'FAILED' && job.errorMessage && (
        <div className="mt-6 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {job.errorMessage}
        </div>
      )}

      {job?.summary && (
        <div className="mt-6 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Summary
          </h2>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">{job.summary}</p>
        </div>
      )}

      {job?.status === 'READY' && (
        <a
          href={absoluteDownloadUrl(job)}
          className="mt-8 inline-block rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500"
        >
          Download project (.zip)
        </a>
      )}
    </div>
  )
}

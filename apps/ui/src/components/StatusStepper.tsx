import { Check, Loader2, XCircle } from 'lucide-react'
import type { JobStatus } from '../types'

const STEP_ORDER: { status: JobStatus; label: string }[] = [
  { status: 'QUEUED', label: 'Queued' },
  { status: 'GENERATING', label: 'Generating' },
  { status: 'VERIFYING', label: 'Verifying' },
  { status: 'REPAIRING', label: 'Repairing' },
  { status: 'PACKAGING', label: 'Packaging' },
  { status: 'READY', label: 'Ready' },
]

/**
 * Index-based progress across a fixed step order - REPAIRING only actually
 * happens for some jobs (repair loop opt-in, see generate.ts), so a job that
 * skips straight from VERIFYING to PACKAGING will render REPAIRING as
 * "passed through" rather than tracking real per-job history, which the
 * status endpoint doesn't expose. A reasonable simplification for a status
 * bar, not a claim that repair actually ran.
 */
export function StatusStepper({ status }: { status: JobStatus }) {
  if (status === 'FAILED') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
        <XCircle className="h-5 w-5" />
        <span className="font-medium">Failed</span>
      </div>
    )
  }

  const currentIndex = STEP_ORDER.findIndex((step) => step.status === status)
  const progressFraction = STEP_ORDER.length <= 1 ? 0 : currentIndex / (STEP_ORDER.length - 1)

  return (
    <div className="overflow-x-auto pb-1">
      <div className="relative min-w-[560px] px-2 pt-4">
        <div className="absolute left-6 right-6 top-8 h-0.5 bg-slate-200 dark:bg-slate-700" />
        <div
          className="absolute left-6 top-8 h-0.5 bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-700 ease-out"
          style={{ width: `calc((100% - 3rem) * ${progressFraction})` }}
        />
        <ol className="relative flex justify-between">
          {STEP_ORDER.map((step, index) => {
            const state = index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'pending'
            return (
              <li
                key={step.status}
                className="flex flex-col items-center gap-2"
                style={{ width: `${100 / STEP_ORDER.length}%` }}
              >
                <span
                  className={
                    'flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold shadow-sm transition-colors ' +
                    (state === 'done'
                      ? 'bg-emerald-500 text-white'
                      : state === 'current'
                        ? 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white'
                        : 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400')
                  }
                >
                  {state === 'done' ? (
                    <Check className="h-4 w-4" />
                  ) : state === 'current' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    index + 1
                  )}
                </span>
                <span
                  className={
                    'text-xs font-medium ' +
                    (state === 'pending' ? 'text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-slate-100')
                  }
                >
                  {step.label}
                </span>
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}

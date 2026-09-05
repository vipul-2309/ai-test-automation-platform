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
      <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />
        <span className="font-medium">Failed</span>
      </div>
    )
  }

  const currentIndex = STEP_ORDER.findIndex((step) => step.status === status)

  return (
    <ol className="flex flex-wrap items-center gap-y-3">
      {STEP_ORDER.map((step, index) => {
        const state = index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'pending'
        return (
          <li key={step.status} className="flex items-center">
            <div className="flex items-center gap-2">
              <span
                className={
                  'flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ' +
                  (state === 'done'
                    ? 'bg-emerald-500 text-white'
                    : state === 'current'
                      ? 'bg-indigo-600 text-white animate-pulse'
                      : 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400')
                }
              >
                {state === 'done' ? '✓' : index + 1}
              </span>
              <span
                className={
                  'text-sm ' +
                  (state === 'pending'
                    ? 'text-slate-400 dark:text-slate-500'
                    : 'text-slate-800 dark:text-slate-100 font-medium')
                }
              >
                {step.label}
              </span>
            </div>
            {index < STEP_ORDER.length - 1 && (
              <span className="mx-3 h-px w-8 bg-slate-300 dark:bg-slate-600" />
            )}
          </li>
        )
      })}
    </ol>
  )
}

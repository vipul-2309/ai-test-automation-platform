import { AlertTriangle, CheckCircle2, ShieldAlert, XCircle } from 'lucide-react'
import type { ValidationResult } from '../types'
import { Card } from './Card'

type Tone = 'good' | 'bad' | 'warn' | 'neutral'

const TONE_STYLES: Record<Tone, string> = {
  good: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300',
  bad: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300',
  warn: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200',
  neutral: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
}

function StatTile({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string
  value: string
  tone: Tone
  icon: typeof CheckCircle2
}) {
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${TONE_STYLES[tone]}`}>
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide opacity-80">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  )
}

export function ValidationReport({ report }: { report: ValidationResult }) {
  const { testResults } = report

  return (
    <Card title="Validation report" className="mt-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="Compile"
          value={report.compileOk ? 'OK' : 'Failed'}
          tone={report.compileOk ? 'good' : 'bad'}
          icon={report.compileOk ? CheckCircle2 : XCircle}
        />
        <StatTile
          label="Tests"
          value={testResults.ran ? `${testResults.passed}/${testResults.total}` : 'Not run'}
          tone={!testResults.ran ? 'neutral' : testResults.failed === 0 ? 'good' : 'bad'}
          icon={CheckCircle2}
        />
        <StatTile
          label="Failed"
          value={String(testResults.failed)}
          tone={testResults.failed > 0 ? 'bad' : 'good'}
          icon={XCircle}
        />
        <StatTile
          label="File safety"
          value={String(report.fileSafetyIssues.length)}
          tone={report.fileSafetyIssues.length > 0 ? 'warn' : 'good'}
          icon={ShieldAlert}
        />
      </div>

      {!report.compileOk && report.compileError && (
        <pre className="mt-4 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-100 p-3 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300">
          {report.compileError}
        </pre>
      )}

      {testResults.failures.length > 0 && (
        <ul className="mt-4 space-y-2">
          {testResults.failures.map((failure, i) => (
            <li
              key={`${failure.testName}-${i}`}
              className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
            >
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <span className="font-medium">{failure.testName}</span>
                {failure.message ? `: ${failure.message}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}

      {report.fileSafetyIssues.length > 0 && (
        <ul className="mt-4 space-y-2">
          {report.fileSafetyIssues.map((issue, i) => (
            <li
              key={`${issue.file}-${i}`}
              className={
                'flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ' +
                (issue.severity === 'block'
                  ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300'
                  : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200')
              }
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <span className="font-medium">{issue.file}</span>: {issue.reason}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

import type { ValidationResult } from '../types'

export function ValidationReport({ report }: { report: ValidationResult }) {
  const { testResults } = report

  return (
    <div className="mt-6 rounded-md border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Validation report
      </h2>

      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-slate-500 dark:text-slate-400">Compile</dt>
          <dd className={report.compileOk ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
            {report.compileOk ? 'OK' : 'Failed'}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500 dark:text-slate-400">Tests</dt>
          <dd className="text-slate-800 dark:text-slate-100">
            {testResults.ran ? `${testResults.passed}/${testResults.total} passed` : 'Not run'}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500 dark:text-slate-400">Failed</dt>
          <dd className="text-slate-800 dark:text-slate-100">{testResults.failed}</dd>
        </div>
        <div>
          <dt className="text-slate-500 dark:text-slate-400">File safety issues</dt>
          <dd className="text-slate-800 dark:text-slate-100">{report.fileSafetyIssues.length}</dd>
        </div>
      </dl>

      {!report.compileOk && report.compileError && (
        <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-slate-100 p-2 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300">
          {report.compileError}
        </pre>
      )}

      {testResults.failures.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {testResults.failures.map((failure, i) => (
            <li key={`${failure.testName}-${i}`} className="text-red-600 dark:text-red-400">
              {failure.testName}
              {failure.message ? `: ${failure.message}` : ''}
            </li>
          ))}
        </ul>
      )}

      {report.fileSafetyIssues.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {report.fileSafetyIssues.map((issue, i) => (
            <li
              key={`${issue.file}-${i}`}
              className={issue.severity === 'block' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}
            >
              [{issue.severity}] {issue.file}: {issue.reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

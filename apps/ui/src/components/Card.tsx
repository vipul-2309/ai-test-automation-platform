import type { ReactNode } from 'react'

export function Card({
  title,
  icon,
  children,
  className = '',
}: {
  title?: string
  icon?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`animate-fade-in-up rounded-2xl border border-slate-200/70 bg-white/70 p-5 shadow-sm shadow-slate-200/50 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/60 ${className}`}
    >
      {title && (
        <h2 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {icon}
          {title}
        </h2>
      )}
      {children}
    </div>
  )
}

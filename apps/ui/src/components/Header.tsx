import { Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'

export function Header() {
  return (
    <header className="sticky top-0 z-10 border-b border-slate-200/70 bg-slate-50/80 backdrop-blur dark:border-slate-800/70 dark:bg-slate-950/80">
      <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-4">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm">
            <Sparkles className="h-4 w-4" />
          </span>
          <span className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            AI Test Automation Platform
          </span>
        </Link>
      </div>
    </header>
  )
}

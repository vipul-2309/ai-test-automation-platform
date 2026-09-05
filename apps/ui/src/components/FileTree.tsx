import { useState } from 'react'
import { ChevronRight, File, Folder } from 'lucide-react'
import type { FileNode } from '../types'

function FileTreeNode({ node, depth }: { node: FileNode; depth: number }) {
  const [open, setOpen] = useState(true)

  if (node.type === 'file') {
    return (
      <li
        className="flex items-center gap-1.5 py-1 text-slate-600 dark:text-slate-300"
        style={{ paddingLeft: `${depth * 1.25 + 0.25}rem` }}
      >
        <File className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        <span className="truncate">{node.name}</span>
      </li>
    )
  }

  const sortedChildren = [...node.children].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return (
    <li>
      {depth > 0 && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-1 py-1 text-left font-medium text-slate-800 hover:text-indigo-600 dark:text-slate-100 dark:hover:text-indigo-400"
          style={{ paddingLeft: `${(depth - 1) * 1.25 + 0.25}rem` }}
        >
          <ChevronRight className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
          <Folder className="h-3.5 w-3.5 shrink-0 text-indigo-400" />
          <span className="truncate">{node.name}</span>
        </button>
      )}
      {open && (
        <ul>
          {sortedChildren.map((child) => (
            <FileTreeNode key={child.name} node={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  )
}

export function FileTree({ root }: { root: FileNode }) {
  return (
    <ul className="font-mono text-xs">
      <FileTreeNode node={root} depth={0} />
    </ul>
  )
}

import type { FileNode } from '../types'

function FileTreeNode({ node, depth }: { node: FileNode; depth: number }) {
  if (node.type === 'file') {
    return (
      <li style={{ paddingLeft: `${depth * 1.25}rem` }} className="py-0.5 text-slate-600 dark:text-slate-300">
        {node.name}
      </li>
    )
  }

  const sortedChildren = [...node.children].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return (
    <li style={{ paddingLeft: `${depth * 1.25}rem` }} className="py-0.5">
      {depth > 0 && <span className="font-medium text-slate-800 dark:text-slate-100">{node.name}/</span>}
      <ul>
        {sortedChildren.map((child) => (
          <FileTreeNode key={child.name} node={child} depth={depth + 1} />
        ))}
      </ul>
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

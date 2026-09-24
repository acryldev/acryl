/**
 * Tree — a hierarchical tree view with expand/collapse.
 * Self-contained; no cross-item imports. Built on ACRYL's --dsw-alias-* tokens.
 * See manifest.yml.
 */
import { useState, type ReactNode } from 'react'
import clsx from 'clsx'
import css from './Tree.module.css'

export interface TreeNode {
  /** Unique id. */
  id: string
  /** Display label. */
  label: ReactNode
  /** Child nodes. */
  children?: TreeNode[]
  /** Whether this node starts expanded. */
  defaultExpanded?: boolean
  /** Optional icon shown before the label. */
  icon?: ReactNode
}

export interface TreeProps {
  /** Root nodes. */
  nodes: TreeNode[]
  /** Extra class name. */
  className?: string
}

function TreeItem({ node, depth }: { node: TreeNode; depth: number }) {
  const [expanded, setExpanded] = useState(node.defaultExpanded ?? false)
  const hasChildren = node.children !== undefined && node.children.length > 0

  return (
    <li className={css.item}>
      <div
        className={css.row}
        style={{ paddingLeft: 8 + depth * 20 }}
      >
        {hasChildren ? (
          <button
            type="button"
            className={clsx(css.toggle, expanded && css['toggle--expanded'])}
            onClick={() => { setExpanded(v => !v) }}
            aria-label={expanded ? 'Collapse' : 'Expand'}
            aria-expanded={expanded}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        ) : (
          <span className={css.spacer} />
        )}
        {node.icon !== undefined && <span className={css.icon}>{node.icon}</span>}
        <span className={css.label}>{node.label}</span>
      </div>
      {hasChildren && expanded && (
        <ul className={css.children} role="group">
          {node.children!.map(child => (
            <TreeItem key={child.id} node={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  )
}

/**
 * A hierarchical tree view.
 */
export function Tree({ nodes, className }: TreeProps) {
  return (
    <ul className={clsx(css.tree, className)} role="tree">
      {nodes.map(node => (
        <TreeItem key={node.id} node={node} depth={0} />
      ))}
    </ul>
  )
}

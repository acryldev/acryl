/**
 * The mark shown for each built-in agent: a small, simple SVG that tells agents apart at a glance.
 * They are drawn here as plain geometric shapes (not copies of vendor artwork). Marks that would vanish on
 * a light or a dark theme use `currentColor`, so they follow the theme.
 */

import type { ReactNode } from 'react'
import type { WorkspacePtyCommandId } from '../../pty/contract.ts'

const line = { fill: 'none', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

/** Eight rays of alternating length around a centre. */
const CLAUDE_RAYS = Array.from({ length: 8 }, (_, i) => {
  const angle = (i * Math.PI) / 4
  const inner = 3.2
  const outer = i % 2 === 0 ? 10 : 7.6
  return { x1: 12 + Math.cos(angle) * inner, y1: 12 + Math.sin(angle) * inner, x2: 12 + Math.cos(angle) * outer, y2: 12 + Math.sin(angle) * outer }
})

export const AGENT_MARKS: Record<WorkspacePtyCommandId, ReactNode> = {
  shell: <path d="M5 7l5 5-5 5M12 18h7" stroke="currentColor" {...line} />,
  claude: (
    <g stroke="#d97757" strokeWidth={2.2} strokeLinecap="round">
      {CLAUDE_RAYS.map(ray => <line key={`${String(ray.x2)}`} {...ray} />)}
    </g>
  ),
  codex: (
    <g stroke="#10a37f" {...line}>
      <path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z" />
      <path d="M9.5 10.5l2 1.5-2 1.5M13 14h2" />
    </g>
  ),
  opencode: (
    <g>
      <rect x="4.5" y="3.5" width="15" height="17" rx="1.5" fill="none" stroke="currentColor" strokeWidth={1.8} />
      <rect x="9" y="8" width="6" height="8" fill="currentColor" />
    </g>
  ),
  gemini: <path d="M12 2.5c.8 5.6 3.9 8.7 9.5 9.5-5.6.8-8.7 3.9-9.5 9.5-.8-5.6-3.9-8.7-9.5-9.5 5.6-.8 8.7-3.9 9.5-9.5z" fill="#4285f4" />,
  pi: <path d="M5 7.5h14M9 7.5v9.5M15 7.5v7.5c0 1.6 1 2.2 2.6 2" stroke="#a78bfa" {...line} />,
  grok: (
    <g stroke="currentColor" {...line}>
      <path d="M12 3l9 9-9 9-9-9z" />
      <path d="M8 16l8-8" />
    </g>
  ),
  aider: <path d="M5.5 19L12 5l6.5 14M8.4 14h7.2" stroke="#34d399" {...line} />,
  goose: (
    <g stroke="#f59e0b" {...line}>
      <circle cx="10.5" cy="9.5" r="4" />
      <path d="M14.5 8v8.5a3.5 3.5 0 0 1-3.5 3.5H8" />
    </g>
  ),
  amp: <path d="M13.5 2.5L5.5 13.5h6l-1 8 8-11h-6z" fill="#ef4444" />,
  kimi: (
    <g stroke="#38bdf8" {...line}>
      <rect x="4" y="5" width="16" height="14" rx="3" />
      <circle cx="9.2" cy="11.5" r=".6" fill="#38bdf8" />
      <circle cx="14.8" cy="11.5" r=".6" fill="#38bdf8" />
    </g>
  ),
  cursor: (
    <g stroke="currentColor" {...line}>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
      <path d="M12 12l8-4.5M12 12L4 7.5M12 12v9" />
    </g>
  ),
  hermes: <path d="M3.5 11.5l17-8-5.5 17-3.5-7z" fill="#fb923c" />,
  qwen: (
    <g stroke="#8b5cf6" {...line}>
      <circle cx="11.5" cy="11.5" r="6.5" />
      <path d="M15.5 15.5L20 20" />
    </g>
  ),
}

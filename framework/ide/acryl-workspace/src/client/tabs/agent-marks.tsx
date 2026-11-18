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

/** A mark per agent that has one; the rest show their letter badge (`known-agents.ts`). */
export const AGENT_MARKS: Partial<Record<WorkspacePtyCommandId, ReactNode>> = {
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
  copilot: (
    <g stroke="#a78bfa" {...line}>
      <path d="M8 15c0-4 1.8-8 4-8s4 4 4 8" />
      <circle cx="9" cy="15.5" r="1.6" fill="#a78bfa" stroke="none" />
      <circle cx="15" cy="15.5" r="1.6" fill="#a78bfa" stroke="none" />
    </g>
  ),
  ante: <path d="M12 4l7 15H5z" stroke="#fb923c" {...line} />,
  omp: (
    <g stroke="#a78bfa" {...line}>
      <path d="M4 17V7l4 6 4-6 4 6 4-6v10" />
    </g>
  ),
  antigravity: (
    <g stroke="#4285f4" {...line}>
      <path d="M12 3v8M8 8l4 3 4-3" />
      <path d="M6 21c0-4 2.5-7 6-7s6 3 6 7" />
    </g>
  ),
  kilo: (
    <g stroke="#f59e0b" {...line}>
      <path d="M12 3l7 4v10l-7 4-7-4V7z" />
      <path d="M12 3v18M5 7l7 4 7-4" />
    </g>
  ),
  crush: (
    <g stroke="#a78bfa" {...line}>
      <rect x="4.5" y="4.5" width="15" height="15" rx="4" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </g>
  ),
  'command-code': (
    <g stroke="#94a3b8" {...line}>
      <rect x="4" y="6" width="16" height="12" rx="2" />
      <path d="M8 10.5h1.5M8 13.5h5" />
    </g>
  ),
  droid: (
    <g stroke="#94a3b8" {...line}>
      <rect x="6" y="8" width="12" height="10" rx="2.5" />
      <path d="M9 8V5h6v3M9.5 12.5h.01M14.5 12.5h.01" />
    </g>
  ),
  'mistral-vibe': (
    <g stroke="#fb923c" {...line}>
      <path d="M4 15l2.5-8 2.5 8M5 12h3M14 15V7h3a3 3 0 0 1 0 6h-3l3.5 2" />
    </g>
  ),
  'mimo-code': (
    <g stroke="#94a3b8" {...line}>
      <circle cx="9" cy="12" r="4" />
      <circle cx="15" cy="12" r="4" />
    </g>
  ),
  trae: (
    <g stroke="#34d399" {...line}>
      <path d="M4 6h16M12 6v14M8 20h8" />
    </g>
  ),
  kiro: (
    <g stroke="#a78bfa" {...line}>
      <path d="M12 3l2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4z" />
    </g>
  ),
  aug: (
    <g stroke="#94a3b8" {...line}>
      <path d="M6 18l6-13 6 13M8.5 13h7" />
    </g>
  ),
  autohand: (
    <g stroke="#94a3b8" {...line}>
      <path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V12M11 12V5a1.5 1.5 0 0 1 3 0v7M14 12V6.5a1.5 1.5 0 0 1 3 0V14a5 5 0 0 1-5 5h-1a5 5 0 0 1-4-2l-2.5-3.5c-.6-.8.5-1.8 1.3-1.2L8 14" />
    </g>
  ),
  cline: (
    <g stroke="#94a3b8" {...line}>
      <path d="M15 6l-6 6 6 6" />
    </g>
  ),
  codebuff: (
    <g stroke="#94a3b8" {...line}>
      <path d="M8 8l-4 4 4 4M16 8l4 4-4 4M14 6l-4 12" />
    </g>
  ),
  continue: (
    <g stroke="#94a3b8" {...line}>
      <path d="M6 5v14l12-7z" />
    </g>
  ),
  rovo: (
    <g stroke="#4285f4" {...line}>
      <path d="M6 18V9a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v9" />
      <path d="M9 15l3 3 3-3" />
    </g>
  ),
  devin: (
    <g stroke="#34d399" {...line}>
      <circle cx="12" cy="8.5" r="3" />
      <path d="M6 19c0-3.3 2.7-6 6-6s6 2.7 6 6" />
    </g>
  ),
  openclaw: (
    <g stroke="#ef4444" {...line}>
      <path d="M5 5l4 8M9 5l2 8M13 5l0 8M17 5l-2 8M6.5 13h11l-1.5 6h-8z" />
    </g>
  ),
}

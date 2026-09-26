/**
 * A small badge that tells agents apart at a glance. Each agent has its own letter and colour; these are
 * plain neutral badges, not vendor logos.
 */

import type { WorkspacePtyCommandId } from '../../pty/contract.ts'

interface Badge {
  readonly letter: string
  readonly color: string
}

const BADGES: Record<WorkspacePtyCommandId, Badge> = {
  shell: { letter: '>', color: '#94a3b8' },
  claude: { letter: 'C', color: '#d97757' },
  codex: { letter: 'X', color: '#10a37f' },
  opencode: { letter: 'O', color: '#64748b' },
  gemini: { letter: 'G', color: '#4285f4' },
  pi: { letter: 'π', color: '#a78bfa' },
  grok: { letter: 'K', color: '#e2e8f0' },
  aider: { letter: 'A', color: '#34d399' },
  goose: { letter: 'g', color: '#f59e0b' },
  amp: { letter: 'M', color: '#ef4444' },
  kimi: { letter: 'k', color: '#38bdf8' },
  cursor: { letter: 'U', color: '#cbd5e1' },
  hermes: { letter: 'H', color: '#fb923c' },
  qwen: { letter: 'Q', color: '#8b5cf6' },
}

export function AgentIcon({ commandId }: { readonly commandId: WorkspacePtyCommandId }) {
  const badge = BADGES[commandId]
  return (
    <span className="dshWorkspaceAgentIcon" style={{ color: badge.color, borderColor: badge.color }} aria-hidden="true" data-agent={commandId}>
      {badge.letter}
    </span>
  )
}

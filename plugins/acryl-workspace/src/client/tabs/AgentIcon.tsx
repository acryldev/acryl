/**
 * The badge that tells agents apart. Built-in agents show their own mark (`agent-marks.tsx`); a custom
 * agent shows the letter and colour its author chose.
 */

import type { AgentBadge } from '../../agents/definition.ts'
import { isWorkspacePtyCommandId } from '../../pty/contract.ts'
import { AGENT_MARKS } from './agent-marks.tsx'

/** @param custom - the badge of a custom agent; built-in agents use their own mark. */
export function AgentIcon({ commandId, custom }: { readonly commandId: string; readonly custom?: AgentBadge | undefined }) {
  if (custom === undefined && isWorkspacePtyCommandId(commandId)) {
    return (
      <span className="dshWorkspaceAgentMark" aria-hidden="true" data-agent={commandId}>
        <svg viewBox="0 0 24 24" width="100%" height="100%">{AGENT_MARKS[commandId]}</svg>
      </span>
    )
  }
  const badge = custom ?? { letter: '?', color: '#94a3b8' }
  return (
    <span className="dshWorkspaceAgentIcon" style={{ color: badge.color, borderColor: badge.color }} aria-hidden="true" data-agent={commandId}>
      {badge.letter}
    </span>
  )
}

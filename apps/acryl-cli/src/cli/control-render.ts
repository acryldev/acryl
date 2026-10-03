/** Words and JSON for `acryl control`. */

import type { ControlCommandResult } from '../host/control-command.ts'

export interface RenderedControl {
  readonly lines: readonly string[]
  readonly exitCode: number
}

export function renderControl(result: ControlCommandResult, json: boolean): RenderedControl {
  const failed = result.kind === 'refused' || ((result.kind === 'worker' || result.kind === 'tool') && !result.response.ok) || (result.kind === 'tool' && 'isError' in result.response && result.response.isError)
  if (json) return { lines: [JSON.stringify(result, null, 2)], exitCode: failed ? 1 : 0 }
  if (result.kind === 'worker') return renderWorker(result.app, result.response)
  if (result.kind === 'tool') return renderTool(result.app, result.response)
  if (result.kind === 'list') {
    if (result.instances.length === 0) return { lines: ['no ACRYL app is running'], exitCode: 0 }
    return {
      lines: result.instances.map(instance => `${instance.id}  ${instance.surface ?? '?'}  pid ${String(instance.pid)}${instance.port === undefined ? '' : `  port ${String(instance.port)}`}  ${instance.home}`),
      exitCode: 0,
    }
  }
  if (result.kind === 'refused') return { lines: [`${result.app} refused: ${result.code} - ${result.message}`], exitCode: 1 }
  const { result: value } = result
  if ('nodes' in value) {
    const lines = [`${result.app}: ${String(value.total)} control(s)${value.nextCursor === undefined ? '' : ` (more: --cursor ${String(value.nextCursor)})`}`]
    for (const node of value.nodes) lines.push(`  ${node.ref}  ${node.role}  ${JSON.stringify(node.name)}${node.states.length === 0 ? '' : `  [${node.states.join(', ')}]`}`)
    return { lines, exitCode: 0 }
  }
  return { lines: [`${result.app}: done${value.target === undefined ? '' : ` (${value.target.role} ${JSON.stringify(value.target.name)})`}${value.detail === undefined ? '' : ` - ${value.detail}`}`], exitCode: 0 }
}

function renderWorker(app: string, response: Extract<ControlCommandResult, { kind: 'worker' }>['response']): RenderedControl {
  if (!response.ok) return { lines: [`${app} refused: ${response.code} - ${response.message}`], exitCode: 1 }
  const value = response.result
  if (Array.isArray(value)) {
    return { lines: value.length === 0 ? [`${app}: no workers`] : value.map((worker: { workerId: string; providerId: string; runtimeId: string | null; workspace: { cwd: string } | null; status: string }) => `${worker.workerId}  ${worker.providerId}  ${worker.status}  ${worker.runtimeId ?? '-'}  ${worker.workspace?.cwd ?? ''}`), exitCode: 0 }
  }
  if (typeof value === 'object' && value !== null && 'text' in value) {
    const turn = value as { text: string; isError: boolean; sessionId: string | null }
    return { lines: [turn.text, ...(turn.isError ? ['(the agent reported an error)'] : []), ...(turn.sessionId === null ? [] : [`session ${turn.sessionId}`])], exitCode: turn.isError ? 1 : 0 }
  }
  if (typeof value === 'object' && value !== null && 'workerId' in value) return { lines: [`${app}: attached ${(value as { workerId: string }).workerId}`], exitCode: 0 }
  return { lines: [`${app}: done`], exitCode: 0 }
}

function renderTool(app: string, response: Extract<ControlCommandResult, { kind: 'tool' }>['response']): RenderedControl {
  if (!response.ok) return { lines: [`${app} refused: ${response.code} - ${response.message}`], exitCode: 1 }
  if ('tools' in response) return { lines: response.tools.length === 0 ? [`${app}: no tools offered`] : response.tools.map(tool => `${tool.name}  ${tool.description.split('\n')[0]?.slice(0, 100) ?? ''}`), exitCode: 0 }
  return { lines: [response.text], exitCode: response.isError ? 1 : 0 }
}

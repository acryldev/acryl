/** Words and JSON for `acryl control`. */

import type { ControlCommandResult } from '../host/control-command.ts'

export interface RenderedControl {
  readonly lines: readonly string[]
  readonly exitCode: number
}

export function renderControl(result: ControlCommandResult, json: boolean): RenderedControl {
  if (json) return { lines: [JSON.stringify(result, null, 2)], exitCode: result.kind === 'refused' ? 1 : 0 }
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

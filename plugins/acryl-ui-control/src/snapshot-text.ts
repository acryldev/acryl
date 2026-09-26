/** How a snapshot reads to the model. Pure text, shared by the Host tool and the tests (no DOM). */

import type { UiSnapshot } from './contract.ts'

/** The snapshot as compact text for the model: one line per element, indented by depth. */
export function renderSnapshot(snapshot: UiSnapshot): string {
  const lines = snapshot.nodes.map((node) => {
    const level = node.level === undefined ? '' : ` level=${String(node.level)}`
    const states = node.states.length === 0 ? '' : ` [${node.states.join(', ')}]`
    const value = node.value === undefined ? '' : ` value=${JSON.stringify(node.value)}`
    return `${'  '.repeat(Math.min(node.depth, 8))}- ${node.role}${node.name === '' ? '' : ` ${JSON.stringify(node.name)}`}${level}${states}${value} [ref=${node.ref}]`
  })
  const more = snapshot.nextCursor === undefined ? '' : `\n(${String(snapshot.total - snapshot.nextCursor)} more elements; call ui_snapshot with cursor ${String(snapshot.nextCursor)})`
  return `Page: ${snapshot.title || '(untitled)'}\nSnapshot ${String(snapshot.generation)}, ${String(snapshot.nodes.length)} of ${String(snapshot.total)} elements:\n${lines.join('\n')}${more}`
}

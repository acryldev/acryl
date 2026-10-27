/** How a snapshot reads to an agent. Pure text, shared by the Host and the tests (no DOM). */

import type { UiSnapshot } from './protocol.ts'

/**
 * The snapshot as compact text for an agent: one line per element, indented by depth.
 * @param more - how to ask for the rest when the page was cut, given the cursor to continue from.
 */
export function renderSnapshot(snapshot: UiSnapshot, more: (cursor: number) => string = cursor => `call ui_snapshot with cursor ${String(cursor)}`): string {
  const lines = snapshot.nodes.map((node) => {
    const level = node.level === undefined ? '' : ` level=${String(node.level)}`
    const states = node.states.length === 0 ? '' : ` [${node.states.join(', ')}]`
    const value = node.value === undefined ? '' : ` value=${JSON.stringify(node.value)}`
    return `${'  '.repeat(Math.min(node.depth, 8))}- ${node.role}${node.name === '' ? '' : ` ${JSON.stringify(node.name)}`}${level}${states}${value} [ref=${node.ref}]`
  })
  const rest = snapshot.nextCursor === undefined ? '' : `\n(${String(snapshot.total - snapshot.nextCursor)} more elements; ${more(snapshot.nextCursor)})`
  return `Page: ${snapshot.title || '(untitled)'}\nSnapshot ${String(snapshot.generation)}, ${String(snapshot.nodes.length)} of ${String(snapshot.total)} elements:\n${lines.join('\n')}${rest}`
}

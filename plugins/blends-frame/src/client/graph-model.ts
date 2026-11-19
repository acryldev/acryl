/** What the graph view works out from a snapshot and the fiber events, apart from drawing: how a change pulses, how it reads in the strip, and who a plugin needs and who needs it. */

import type { GraphEvent, GraphNode, GraphSnapshot, NodePhase } from '../graph-contract.ts'
import type { PulseKind } from './graph-canvas.ts'

/** How a fiber change shows on its node: up when it became active (or was created), error when it failed, down when it went away, else a plain change. */
export function pulseOf(event: Pick<GraphEvent, 'kind' | 'to'>): PulseKind {
  if (event.kind === 'created') return 'up'
  if (event.kind === 'removed') return 'down'
  if (event.to === 'active') return 'up'
  if (event.to === 'failed') return 'error'
  if (event.to === 'disposed' || event.to === 'unloading') return 'down'
  return 'change'
}

/** One line of the strip: `cart: loading to active`, `cart: created`, `cart: removed`. */
export function eventLine(event: Pick<GraphEvent, 'name' | 'kind' | 'from' | 'to'>): string {
  if (event.kind === 'created') return `${event.name}: created`
  if (event.kind === 'removed') return `${event.name}: removed`
  return `${event.name}: ${event.from ?? '?'} → ${event.to ?? '?'}`
}

export interface Relation {
  readonly service: string
  readonly node: GraphNode
}

export interface Relations {
  /** The plugins this one needs, by the service that joins them. */
  readonly requires: readonly Relation[]
  /** The services this one needs that no active plugin provides now. */
  readonly missing: readonly string[]
  /** The plugins that need something this one provides. */
  readonly usedBy: readonly Relation[]
}

/** Who a plugin needs and who needs it, read from the relations of one snapshot. */
export function relationsOf(snapshot: GraphSnapshot, uid: number): Relations {
  const byUid = new Map(snapshot.nodes.map(node => [node.uid, node]))
  const requires: Relation[] = []
  const missing: string[] = []
  const usedBy: Relation[] = []
  for (const edge of snapshot.edges) {
    if (edge.kind === 'inject' && edge.from === uid) {
      const provider = edge.resolved === true && edge.to !== uid ? byUid.get(edge.to) : undefined
      if (provider !== undefined) requires.push({ service: edge.service ?? '', node: provider })
      else if (edge.resolved !== true && edge.service !== undefined) missing.push(edge.service)
    }
    if (edge.kind === 'provider' && edge.from === uid) {
      const consumer = byUid.get(edge.to)
      if (consumer !== undefined) usedBy.push({ service: edge.service ?? '', node: consumer })
    }
  }
  return { requires, missing, usedBy }
}

/** How many nodes are in each phase. */
export function phaseCounts(snapshots: readonly (GraphSnapshot | undefined)[]): Map<NodePhase, number> {
  const counts = new Map<NodePhase, number>()
  for (const snapshot of snapshots) {
    for (const node of snapshot?.nodes ?? []) counts.set(node.phase, (counts.get(node.phase) ?? 0) + 1)
  }
  return counts
}

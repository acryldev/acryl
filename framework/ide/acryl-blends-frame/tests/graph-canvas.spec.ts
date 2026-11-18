import { describe, expect, it } from 'vitest'
import type { GraphNode, GraphSnapshot } from '../src/graph-contract.ts'
import { GraphCanvas, DARK_PALETTE, nodeId, toElements } from '../src/client/graph-canvas.ts'
import { eventLine, phaseCounts, pulseOf, relationsOf } from '../src/client/graph-model.ts'

const node = (uid: number, name: string, extra: Partial<GraphNode> = {}): GraphNode => ({ uid, name, phase: 'active', enabled: true, moduleName: name, loaderEntryId: name, provides: [], effects: [], ...extra })

const snapshot: GraphSnapshot = {
  capturedAt: '2026-01-01T00:00:00.000Z',
  plane: 'host',
  nodes: [node(0, 'root', { moduleName: null, loaderEntryId: null }), node(1, 'a', { provides: ['svcA'] }), node(2, 'b', { phase: 'pending' }), node(-1, 'off', { phase: 'disabled', enabled: false })],
  edges: [
    { kind: 'nesting', from: 1, to: 0 },
    { kind: 'nesting', from: 2, to: 0 },
    { kind: 'inject', from: 2, to: 1, service: 'svcA', resolved: true },
    { kind: 'provider', from: 1, to: 2, service: 'svcA' },
    { kind: 'inject', from: 2, to: 2, service: 'missingSvc', resolved: false },
  ],
}

const all = { inject: true, provider: true, nesting: true }

describe('the graph as elements', () => {
  it('has one node per fiber or row, disabled ones too, and namespaces the ids by plane', () => {
    const nodes = toElements(snapshot, all, 'h-').filter(element => !('source' in element.data))
    expect(nodes.map(element => element.data.id)).toEqual(['h-f0', 'h-f1', 'h-f2', 'h-f-1'])
    expect(nodes.find(element => element.data.id === nodeId('h-', -1))?.data).toMatchObject({ phase: 'disabled', label: 'off' })
  })

  it('keeps one element per relation, with an id that stays the same between snapshots, and drops an unresolved requirement', () => {
    const edges = toElements(snapshot, all, 'h-').filter(element => 'source' in element.data)
    expect(edges.map(element => element.data.id)).toEqual(['h-nesting:1>0:', 'h-nesting:2>0:', 'h-inject:2>1:svcA', 'h-provider:1>2:svcA'])
    expect(toElements(snapshot, all, 'h-')).toEqual(toElements({ ...snapshot, capturedAt: 'later' }, all, 'h-'))
  })

  it('includes only the relation kinds that are on', () => {
    const edges = (filter: typeof all) => toElements(snapshot, filter).filter(element => 'source' in element.data)
    expect(edges({ inject: false, provider: false, nesting: true })).toHaveLength(2)
    expect(edges({ inject: false, provider: true, nesting: false })).toHaveLength(1)
    expect(edges({ inject: false, provider: false, nesting: false })).toHaveLength(0)
  })
})

describe('the picture taking a new snapshot', () => {
  it('changes a node\'s colour in place when its phase changes, and does not lay everything out again', () => {
    const canvas = new GraphCanvas(null, DARK_PALETTE)
    expect(canvas.update(toElements(snapshot, all, 'h-'))).toBe(true)
    const next = { ...snapshot, nodes: snapshot.nodes.map(item => (item.uid === 2 ? { ...item, phase: 'active' as const } : item)) }
    expect(canvas.update(toElements(next, all, 'h-'))).toBe(false)
    expect(canvas.ids()).toHaveLength(toElements(next, all, 'h-').length)
    canvas.destroy()
  })

  it('adds a node and its relations, and removes a node with the relations it had, laying out again for each', () => {
    const canvas = new GraphCanvas(null, DARK_PALETTE)
    canvas.update(toElements(snapshot, all, 'h-'))
    const before = canvas.ids().length
    const grown: GraphSnapshot = { ...snapshot, nodes: [...snapshot.nodes, node(3, 'c')], edges: [...snapshot.edges, { kind: 'nesting', from: 3, to: 0 }] }
    expect(canvas.update(toElements(grown, all, 'h-'))).toBe(true)
    expect(canvas.ids()).toContain('h-f3')
    expect(canvas.ids().length).toBe(before + 2)
    const shrunk: GraphSnapshot = { ...snapshot, nodes: snapshot.nodes.filter(item => item.uid !== 1), edges: snapshot.edges.filter(edge => edge.from !== 1 && edge.to !== 1) }
    expect(canvas.update(toElements(shrunk, all, 'h-'))).toBe(true)
    expect(canvas.ids()).not.toContain('h-f1')
    expect(canvas.ids().filter(id => id.includes('svcA'))).toEqual([])
    canvas.destroy()
  })

  it('pulses a node that is in the picture, and leaves one that is not alone', () => {
    const canvas = new GraphCanvas(null, DARK_PALETTE)
    canvas.update(toElements(snapshot, all, 'h-'))
    canvas.pulse('h-f1', 'up')
    canvas.pulse('h-f99', 'error')
    expect(canvas.pulsing('h-f1')).toBe(true)
    expect(canvas.pulsing('h-f2')).toBe(false)
    expect(canvas.pulsing('h-f99')).toBe(false)
    canvas.destroy()
  })
})

describe('what a change looks like', () => {
  it('pulses up for a plugin that came up or was created, error for a failure, down for one that went away', () => {
    expect(pulseOf({ kind: 'created' })).toBe('up')
    expect(pulseOf({ kind: 'status', to: 'active' })).toBe('up')
    expect(pulseOf({ kind: 'status', to: 'failed' })).toBe('error')
    expect(pulseOf({ kind: 'status', to: 'unloading' })).toBe('down')
    expect(pulseOf({ kind: 'removed' })).toBe('down')
    expect(pulseOf({ kind: 'status', to: 'loading' })).toBe('change')
  })

  it('reads as one short line', () => {
    expect(eventLine({ name: 'cart', kind: 'status', from: 'loading', to: 'active' })).toBe('cart: loading → active')
    expect(eventLine({ name: 'cart', kind: 'created' })).toBe('cart: created')
    expect(eventLine({ name: 'cart', kind: 'removed' })).toBe('cart: removed')
  })

  it('says who a plugin needs, what it waits for and who needs it', () => {
    expect(relationsOf(snapshot, 2)).toMatchObject({ requires: [{ service: 'svcA', node: { name: 'a' } }], missing: ['missingSvc'], usedBy: [] })
    expect(relationsOf(snapshot, 1)).toMatchObject({ requires: [], missing: [], usedBy: [{ service: 'svcA', node: { name: 'b' } }] })
  })

  it('counts the phases', () => {
    expect([...phaseCounts([snapshot, undefined])]).toEqual([['active', 2], ['pending', 1], ['disabled', 1]])
  })
})

describe('the zoom buttons', () => {
  it('step in and out around the middle and stop at the limits', () => {
    const canvas = new GraphCanvas(null, DARK_PALETTE)
    const start = canvas.zoomLevel()
    canvas.zoomBy(1.4)
    expect(canvas.zoomLevel()).toBeCloseTo(start * 1.4, 5)
    canvas.zoomBy(1 / 1.4)
    expect(canvas.zoomLevel()).toBeCloseTo(start, 5)
    canvas.zoomBy(1e9)
    const top = canvas.zoomLevel()
    canvas.zoomBy(1e9)
    expect(canvas.zoomLevel()).toBe(top)
    canvas.zoomBy(1e-9)
    const bottom = canvas.zoomLevel()
    canvas.zoomBy(1e-9)
    expect(canvas.zoomLevel()).toBe(bottom)
    expect(bottom).toBeLessThan(start)
    canvas.destroy()
  })
})

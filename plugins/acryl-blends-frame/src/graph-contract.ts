/**
 * The plugin graph's wire types: what the frame's Host answers and what the browser draws (Settings > Plugins > Graph). Ported from cordis-plugin-graph
 * (MIT, github.com/cordisplugins/cordis-plugin-graph, commit e9bf6b5, `src/inspect.ts`), with two additions the original did not have: a node says where its
 * code is (`source`), and the Host keeps a numbered list of fiber lifecycle events (`GraphEvent`) so the browser hears a change instead of asking again.
 * No Node or browser import: both sides read this file.
 */

import { FRAME_API_PREFIX } from './contract.ts'

/** The whole graph of the Host's Cordis context, now. */
export const FRAME_GRAPH_PATH = `${FRAME_API_PREFIX}/graph`
/** The fiber events after `?after=<seq>`: answered at once when there are some, else when the next one happens (or after about 20 s with none). */
export const FRAME_GRAPH_EVENTS_PATH = `${FRAME_API_PREFIX}/graph/events`

/** Fiber lifecycle phase, or `disabled` for a Loader row turned off. */
export type NodePhase = 'pending' | 'loading' | 'active' | 'failed' | 'unloading' | 'disposed' | 'disabled'

/** Edge kinds, all directed consumer -> dependency / child -> parent. */
export type EdgeKind = 'inject' | 'provider' | 'nesting'

/** Where a plugin's code is: the file to open, whether it is inside the app's folder (the Files tab opens only those), and the folder the plugin lives in. */
export interface GraphSource {
  /** Absolute path of the plugin's main file. */
  readonly file: string
  /** Absolute path of its folder (the package folder for an installed package). */
  readonly folder: string
  /** The file relative to the app's folder, when it is inside it: the path the Files tab opens. */
  readonly inApp?: string
}

/** One plugin fiber (or a disabled Loader row) in the graph. */
export interface GraphNode {
  /** Registry-unique fiber id (0 = root); a synthetic negative id for a disabled row with no fiber. */
  readonly uid: number
  /** Display name (nearest named ancestor, else `root`). */
  readonly name: string
  readonly phase: NodePhase
  /** Whether the owning Loader row is enabled. */
  readonly enabled: boolean
  /** Exact module specifier the Loader entry imports, when this fiber/row owns one. */
  readonly moduleName: string | null
  /** Stable Loader entry id owning this fiber, when it maps to one. */
  readonly loaderEntryId: string | null
  /** Service names this fiber currently provides into the shared store. */
  readonly provides: readonly string[]
  /** Labels of this fiber's top-level live effects (registrations, listeners, timers...). */
  readonly effects: readonly string[]
  /** Where its code is, when the Host could find it. */
  readonly source?: GraphSource
}

/** One relation between two fibers. */
export interface GraphEdge {
  readonly kind: EdgeKind
  readonly from: number
  readonly to: number
  /** For `inject` / `provider`: the service name. */
  readonly service?: string
  /** For `inject`: whether the required service resolved to an active provider. */
  readonly resolved?: boolean
}

/** Point-in-time relation graph of one Cordis context. */
export interface GraphSnapshot {
  readonly capturedAt: string
  /** `host` for the frame's Host (the app's plugins run there), `client` for the browser's. */
  readonly plane: string
  readonly nodes: readonly GraphNode[]
  readonly edges: readonly GraphEdge[]
}

/** The change a fiber went through, as the Host saw it: created, removed, or moved from one phase to another. */
export interface GraphEvent {
  /** 1, 2, 3...: the order the Host saw them in; a browser asks for those after the last number it has. */
  readonly seq: number
  /** Epoch ms. */
  readonly at: number
  readonly uid: number
  readonly name: string
  readonly kind: 'created' | 'removed' | 'status'
  readonly from?: NodePhase
  readonly to?: NodePhase
}

export interface GraphView {
  readonly snapshot: GraphSnapshot
  /** The newest event number when the snapshot was taken: the browser asks for events after it. */
  readonly seq: number
}

export interface GraphEventsAnswer {
  /** The newest event number now. */
  readonly seq: number
  readonly events: readonly GraphEvent[]
}

const PHASES: readonly NodePhase[] = ['pending', 'loading', 'active', 'failed', 'unloading', 'disposed', 'disabled']

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isStrings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string')

function parseSource(value: unknown): GraphSource | undefined {
  if (!isRecord(value) || typeof value['file'] !== 'string' || typeof value['folder'] !== 'string') return undefined
  return { file: value['file'], folder: value['folder'], ...(typeof value['inApp'] === 'string' ? { inApp: value['inApp'] } : {}) }
}

function parseNode(value: unknown): GraphNode {
  if (!isRecord(value) || typeof value['uid'] !== 'number' || typeof value['name'] !== 'string' || !PHASES.includes(value['phase'] as NodePhase)) throw new Error('the graph has a malformed node')
  const source = parseSource(value['source'])
  return {
    uid: value['uid'],
    name: value['name'],
    phase: value['phase'] as NodePhase,
    enabled: value['enabled'] !== false,
    moduleName: typeof value['moduleName'] === 'string' ? value['moduleName'] : null,
    loaderEntryId: typeof value['loaderEntryId'] === 'string' ? value['loaderEntryId'] : null,
    provides: isStrings(value['provides']) ? value['provides'] : [],
    effects: isStrings(value['effects']) ? value['effects'] : [],
    ...(source === undefined ? {} : { source }),
  }
}

function parseEdge(value: unknown): GraphEdge {
  if (!isRecord(value) || typeof value['from'] !== 'number' || typeof value['to'] !== 'number' || (value['kind'] !== 'inject' && value['kind'] !== 'provider' && value['kind'] !== 'nesting')) throw new Error('the graph has a malformed relation')
  return {
    kind: value['kind'],
    from: value['from'],
    to: value['to'],
    ...(typeof value['service'] === 'string' ? { service: value['service'] } : {}),
    ...(typeof value['resolved'] === 'boolean' ? { resolved: value['resolved'] } : {}),
  }
}

export function parseGraphView(value: unknown): GraphView {
  if (!isRecord(value) || !isRecord(value['snapshot']) || typeof value['seq'] !== 'number') throw new Error('the graph answer is malformed')
  const snapshot = value['snapshot']
  if (!Array.isArray(snapshot['nodes']) || !Array.isArray(snapshot['edges'])) throw new Error('the graph answer is malformed')
  return {
    seq: value['seq'],
    snapshot: {
      capturedAt: typeof snapshot['capturedAt'] === 'string' ? snapshot['capturedAt'] : '',
      plane: typeof snapshot['plane'] === 'string' ? snapshot['plane'] : 'host',
      nodes: snapshot['nodes'].map(parseNode),
      edges: snapshot['edges'].map(parseEdge),
    },
  }
}

export function parseGraphEvents(value: unknown): GraphEventsAnswer {
  if (!isRecord(value) || typeof value['seq'] !== 'number' || !Array.isArray(value['events'])) throw new Error('the graph events answer is malformed')
  const events: GraphEvent[] = []
  for (const item of value['events']) {
    if (!isRecord(item) || typeof item['seq'] !== 'number' || typeof item['at'] !== 'number' || typeof item['uid'] !== 'number' || typeof item['name'] !== 'string') continue
    const kind = item['kind']
    if (kind !== 'created' && kind !== 'removed' && kind !== 'status') continue
    const from = PHASES.includes(item['from'] as NodePhase) ? item['from'] as NodePhase : undefined
    const to = PHASES.includes(item['to'] as NodePhase) ? item['to'] as NodePhase : undefined
    events.push({ seq: item['seq'], at: item['at'], uid: item['uid'], name: item['name'], kind, ...(from === undefined ? {} : { from }), ...(to === undefined ? {} : { to }) })
  }
  return { seq: value['seq'], events }
}

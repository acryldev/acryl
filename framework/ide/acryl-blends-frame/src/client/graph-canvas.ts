/**
 * The plugin graph's drawing: a snapshot as Cytoscape elements, and a canvas that takes a new set of them without starting over (so a fiber changing
 * phase changes one colour, and the picture a person was looking at stays put). Ported from cordis-plugin-graph (MIT, commit e9bf6b5,
 * `src/client/cytoscape-graph.ts`): the elements, the colours by phase and the cose layout are its; the incremental update, the pulses and the theme
 * palette are new.
 */
import cytoscape, { type Core, type ElementDefinition, type LayoutOptions } from 'cytoscape'
import type { EdgeKind, GraphSnapshot, NodePhase } from '../graph-contract.ts'

export const PHASE_COLOR: Record<NodePhase, string> = {
  active: '#3fb950',
  pending: '#d29922',
  loading: '#58a6ff',
  failed: '#f85149',
  unloading: '#a371f7',
  disposed: '#8b949e',
  disabled: '#6e7681',
}

export const EDGE_COLOR: Record<EdgeKind, string> = {
  inject: '#8b949e',
  provider: '#3fb950',
  nesting: '#6e7681',
}

/** Which edge kinds to include. */
export type EdgeFilter = Record<EdgeKind, boolean>

/** What a fiber change looks like on the node: it came up, it went away, it failed, or it moved to some other phase. */
export type PulseKind = 'up' | 'down' | 'error' | 'change'

const PULSE_COLOR: Record<PulseKind, string> = { up: '#3fb950', down: '#8b949e', error: '#f85149', change: '#58a6ff' }
const PULSE_MS = 1400

/** The colours the frame's theme gives the picture (the labels and the outline of a node). */
export interface Palette {
  readonly label: string
  readonly outline: string
}

export const DARK_PALETTE: Palette = { label: '#c9d1d9', outline: '#0d1117' }
export const LIGHT_PALETTE: Palette = { label: '#24292f', outline: '#ffffff' }

/** The node id for a fiber of a plane: the two planes never collide. */
export const nodeId = (prefix: string, uid: number): string => `${prefix}f${String(uid)}`

/** One snapshot as elements. `prefix` namespaces the ids so the two planes can share one picture. An unresolved `inject` (a self loop) is left out. */
export function toElements(snapshot: GraphSnapshot, filter: EdgeFilter, prefix = ''): ElementDefinition[] {
  const elements: ElementDefinition[] = []
  for (const node of snapshot.nodes) {
    elements.push({
      data: {
        id: nodeId(prefix, node.uid),
        uid: node.uid,
        label: node.name,
        phase: node.phase,
        plane: snapshot.plane,
        module: node.moduleName ?? '',
        entryId: node.loaderEntryId ?? '',
        provides: node.provides.length,
      },
    })
  }
  const seen = new Set<string>()
  for (const edge of snapshot.edges) {
    if (!filter[edge.kind]) continue
    if (edge.kind === 'inject' && !edge.resolved) continue
    // A stable id: the same relation keeps its element from one snapshot to the next.
    const id = `${prefix}${edge.kind}:${String(edge.from)}>${String(edge.to)}:${edge.service ?? ''}`
    if (seen.has(id)) continue
    seen.add(id)
    elements.push({ data: { id, source: nodeId(prefix, edge.from), target: nodeId(prefix, edge.to), kind: edge.kind, label: edge.service ?? '' } })
  }
  return elements
}

const isEdge = (element: ElementDefinition): boolean => 'source' in element.data

const LAYOUT = {
  name: 'cose',
  animate: false,
  nodeRepulsion: () => 12000,
  idealEdgeLength: () => 90,
  edgeElasticity: () => 60,
  gravity: 0.3,
  numIter: 1200,
  padding: 40,
} as unknown as LayoutOptions

function styleOf(palette: Palette): cytoscape.StylesheetJson {
  const pulse = (kind: PulseKind): cytoscape.StylesheetJsonBlock => ({
    selector: `.pulse-${kind}`,
    style: {
      'border-width': 4,
      'border-color': PULSE_COLOR[kind],
      'overlay-color': PULSE_COLOR[kind],
      'overlay-opacity': 0.35,
      'overlay-padding': 12,
    } as cytoscape.Css.Node,
  })
  return [
    {
      selector: 'node',
      style: {
        'background-color': (ele: cytoscape.NodeSingular) => PHASE_COLOR[ele.data('phase') as NodePhase] ?? '#8b949e',
        label: 'data(label)',
        color: palette.label,
        'font-size': 9,
        'text-valign': 'bottom',
        'text-margin-y': 3,
        width: (ele: cytoscape.NodeSingular) => 14 + Math.min(20, Number(ele.data('provides')) * 3),
        height: (ele: cytoscape.NodeSingular) => 14 + Math.min(20, Number(ele.data('provides')) * 3),
        'border-width': 1,
        'border-color': palette.outline,
        opacity: (ele: cytoscape.NodeSingular) => (ele.data('phase') === 'disabled' ? 0.45 : 1),
      },
    },
    {
      selector: 'edge',
      style: {
        width: (ele: cytoscape.EdgeSingular) => (ele.data('kind') === 'nesting' ? 1 : 1.5),
        'line-color': (ele: cytoscape.EdgeSingular) => EDGE_COLOR[ele.data('kind') as EdgeKind] ?? '#8b949e',
        'line-style': (ele: cytoscape.EdgeSingular) => (ele.data('kind') === 'nesting' ? 'dashed' : 'solid'),
        'target-arrow-color': (ele: cytoscape.EdgeSingular) => EDGE_COLOR[ele.data('kind') as EdgeKind] ?? '#8b949e',
        'target-arrow-shape': 'triangle',
        'arrow-scale': 0.7,
        'curve-style': 'bezier',
        opacity: 0.7,
      },
    },
    { selector: 'node:selected', style: { 'border-width': 3, 'border-color': '#58a6ff' } },
    { selector: '.faded', style: { opacity: 0.12 } },
    pulse('up'),
    pulse('down'),
    pulse('error'),
    pulse('change'),
  ]
}

/** A picture of the plugins that takes new elements without drawing everything again. `container` is null only in tests (Cytoscape then draws nothing). */
export class GraphCanvas {
  private readonly cy: Core
  private laidOut = false
  private readonly timers = new Set<ReturnType<typeof setTimeout>>()
  private onWheel: ((event: WheelEvent) => void) | undefined
  private plainZoom = false
  private wheelTarget: HTMLElement | undefined

  constructor(container: HTMLElement | null, palette: Palette, private readonly onSelect: (id: string | undefined) => void = () => {}) {
    this.cy = cytoscape({
      ...(container === null ? { headless: true } : { container }),
      elements: [],
      wheelSensitivity: 0.2,
      minZoom: 0.1,
      maxZoom: 3,
      // A plain scroll over the picture scrolls the pane it is in; Ctrl or Cmd with the wheel (and a trackpad pinch, which sends Ctrl) zooms it.
      userZoomingEnabled: false,
      style: styleOf(palette),
    })
    if (container !== null) {
      this.onWheel = (event: WheelEvent): void => {
        if (!this.plainZoom && !event.ctrlKey && !event.metaKey) return
        event.preventDefault()
        const box = container.getBoundingClientRect()
        this.cy.zoom({ level: this.cy.zoom() * Math.exp(-event.deltaY * 0.01), renderedPosition: { x: event.clientX - box.left, y: event.clientY - box.top } })
      }
      this.wheelTarget = container
      container.addEventListener('wheel', this.onWheel, { passive: false })
    }
    this.cy.on('tap', 'node', (event) => { this.onSelect(String(event.target.id())) })
    this.cy.on('tap', (event) => { if (event.target === this.cy) this.onSelect(undefined) })
  }

  /** The ids now in the picture (nodes and edges). */
  ids(): string[] {
    return this.cy.elements().map(element => element.id())
  }

  /** Make the picture these elements. Existing ones keep their place and take the new data; the layout runs again only when a node came or went. Returns whether it did. */
  update(elements: readonly ElementDefinition[]): boolean {
    const next = new Map(elements.map(element => [String(element.data.id), element]))
    const present = new Set(this.ids())
    const gone = this.cy.elements().filter(element => !next.has(element.id()))
    const added = elements.filter(element => !present.has(String(element.data.id)))
    // Nodes before edges: an edge needs its ends.
    const addedNodes = added.filter(element => !isEdge(element))
    const addedEdges = added.filter(isEdge)
    const nodesGone = gone.nodes().length
    this.cy.batch(() => {
      gone.remove()
      for (const [id, element] of next) {
        if (present.has(id)) this.cy.getElementById(id).data(element.data)
      }
      this.cy.add(addedNodes)
      this.cy.add(addedEdges)
    })
    const structural = !this.laidOut || nodesGone > 0 || addedNodes.length > 0
    if (structural && this.cy.nodes().length > 0) {
      this.cy.layout({ ...LAYOUT, fit: !this.laidOut, randomize: !this.laidOut } as LayoutOptions).run()
      this.laidOut = true
    }
    return structural
  }

  /** The theme changed: the labels and outlines take its colours. */
  setPalette(palette: Palette): void {
    this.cy.style(styleOf(palette))
  }

  fit(): void {
    this.cy.fit(undefined, 40)
  }

  /** The zoom buttons: one step in or out around the middle of the picture (not past the limits), 1.4 times each way. */
  zoomBy(factor: number): void {
    const level = Math.min(this.cy.maxZoom(), Math.max(this.cy.minZoom(), this.cy.zoom() * factor))
    this.cy.zoom({ level, renderedPosition: { x: this.cy.width() / 2, y: this.cy.height() / 2 } })
  }

  zoomLevel(): number {
    return this.cy.zoom()
  }

  /** The box changed size (the view went full screen, or came back): Cytoscape measures it again. Zoom, position and selection stay as they are. */
  resize(): void {
    this.cy.resize()
  }

  /** Whether a plain scroll zooms. Off where the picture sits in a pane that scrolls (there Ctrl or Cmd is needed); on when it fills the window. */
  setPlainZoom(on: boolean): void {
    this.plainZoom = on
  }

  /** Flash one node (a fiber just changed). A node that is not in the picture is left alone. */
  pulse(id: string, kind: PulseKind): void {
    const node = this.cy.getElementById(id)
    if (node.empty()) return
    const classes = (['up', 'down', 'error', 'change'] as const).map(one => `pulse-${one}`).join(' ')
    node.removeClass(classes).addClass(`pulse-${kind}`)
    const timer = setTimeout(() => {
      this.timers.delete(timer)
      node.removeClass(`pulse-${kind}`)
    }, PULSE_MS)
    this.timers.add(timer)
  }

  /** Whether a node has a pulse showing (for tests and for the first frame after an update). */
  pulsing(id: string): boolean {
    const node = this.cy.getElementById(id)
    return !node.empty() && (['up', 'down', 'error', 'change'] as const).some(kind => node.hasClass(`pulse-${kind}`))
  }

  /** Show only a node and what it touches (or everything again with undefined); the node is selected. */
  focus(id: string | undefined): void {
    this.cy.elements().removeClass('faded')
    this.cy.nodes().unselect()
    if (id === undefined) return
    const node = this.cy.getElementById(id)
    if (node.empty()) return
    node.select()
    this.cy.elements().not(node.closedNeighborhood()).addClass('faded')
  }

  /** Fade what does not match a name or module (nothing for an empty query); `focus` is cleared. */
  search(query: string): void {
    this.cy.elements().removeClass('faded')
    const needle = query.trim().toLowerCase()
    if (needle === '') return
    const hits = this.cy.nodes().filter(node => String(node.data('label')).toLowerCase().includes(needle) || String(node.data('module')).toLowerCase().includes(needle))
    this.cy.elements().not(hits.closedNeighborhood()).addClass('faded')
  }

  /** Where a node sits in the container, so a list can scroll the picture to it. */
  centre(id: string): void {
    const node = this.cy.getElementById(id)
    if (node.empty()) return
    this.cy.animate({ center: { eles: node }, duration: 200 })
  }

  destroy(): void {
    for (const timer of this.timers) clearTimeout(timer)
    this.timers.clear()
    if (this.wheelTarget !== undefined && this.onWheel !== undefined) this.wheelTarget.removeEventListener('wheel', this.onWheel)
    this.cy.destroy()
  }
}

/** The colours of the frame's theme, read from the element the picture is in. */
export function readPalette(element: Element): Palette {
  const style = getComputedStyle(element)
  const text = style.getPropertyValue('--bf-text').trim()
  const surface = style.getPropertyValue('--bf-surface').trim()
  const dark = document.body.hasAttribute('data-ds-dark-theme')
  const base = dark ? DARK_PALETTE : LIGHT_PALETTE
  return { label: text === '' ? base.label : text, outline: surface === '' ? base.outline : surface }
}

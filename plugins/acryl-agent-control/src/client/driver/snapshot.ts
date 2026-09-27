/** Builds a bounded, redacted accessibility snapshot of the page, with refs. */

import { DEFAULT_SNAPSHOT_NODES, MAX_SNAPSHOT_NODES, UiControlError, type UiNode, type UiSnapshot } from '../../contract.ts'
import { isHidden, levelOf, nameOf, roleOf, statesOf, valueOf } from './accessibility.ts'
import type { RefTable } from './ref-table.ts'
import { isProtected, isSensitive } from './sensitivity.ts'

/** Marks the driver's own UI (the indicator), which a snapshot never lists. */
export const DRIVER_UI_ATTRIBUTE = 'data-acryl-agent-control'

/** The most elements one snapshot considers, however large the page. */
const MAX_CANDIDATES = 5000

interface Candidate {
  readonly element: Element
  readonly role: string
  readonly name: string
  readonly depth: number
}

/** True when the element (with layout) is at least partly inside the window; unknown layout counts as inside. */
function inViewport(element: Element, view: Window | null): boolean {
  if (view === null) return true
  const rect = element.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return true
  return rect.bottom > 0 && rect.right > 0 && rect.top < view.innerHeight && rect.left < view.innerWidth
}

function collect(root: Element): Candidate[] {
  const found: Candidate[] = []
  const walk = (element: Element, depth: number): void => {
    if (found.length >= MAX_CANDIDATES) return
    if (element.hasAttribute(DRIVER_UI_ATTRIBUTE)) return
    const tag = element.tagName.toLowerCase()
    if (tag === 'script' || tag === 'style' || tag === 'template' || tag === 'noscript') return
    if (isHidden(element)) return
    // A secret or payment field is not listed, and neither is anything inside a marked area.
    if (isSensitive(element)) return
    const role = roleOf(element)
    let childDepth = depth
    if (role !== null) {
      found.push({ element, role, name: nameOf(element, role), depth })
      childDepth = depth + 1
    }
    for (const child of Array.from(element.children)) walk(child, childDepth)
  }
  walk(root, 0)
  return found
}

export interface SnapshotOptions {
  readonly cursor?: number
  readonly maxNodes?: number
}

/** Snapshots the page and remembers the full candidate list of the current generation, for paging. */
export class SnapshotBuilder {
  private candidates: Candidate[] = []

  constructor(private readonly refs: RefTable, private readonly root: () => Element) {}

  snapshot(options: SnapshotOptions = {}): UiSnapshot {
    const max = Math.min(options.maxNodes ?? DEFAULT_SNAPSHOT_NODES, MAX_SNAPSHOT_NODES)
    const root = this.root()
    const view = root.ownerDocument.defaultView
    let offset = options.cursor ?? 0
    if (options.cursor === undefined) {
      this.refs.begin()
      const all = collect(root)
      // What the user can see comes first, so a long page is cut from the bottom, not the middle of the window.
      this.candidates = [...all.filter(c => inViewport(c.element, view)), ...all.filter(c => !inViewport(c.element, view))]
      offset = 0
    } else if (this.candidates.length === 0 || offset > this.candidates.length) {
      throw new UiControlError('stale-ref', 'that page of the snapshot is gone; take a new snapshot')
    }
    const page = this.candidates.slice(offset, offset + max)
    const nodes: UiNode[] = page.map((candidate) => {
      const states = statesOf(candidate.element, candidate.role)
      if (isProtected(candidate.element)) states.push('protected')
      const value = valueOf(candidate.element, candidate.role)
      const level = candidate.role === 'heading' ? levelOf(candidate.element) : undefined
      return {
        ref: this.refs.issue(candidate.element, candidate.role, candidate.name),
        role: candidate.role,
        name: candidate.name,
        depth: candidate.depth,
        states,
        ...(value === undefined ? {} : { value }),
        ...(level === undefined ? {} : { level }),
      }
    })
    const end = offset + page.length
    return {
      generation: this.refs.generation,
      title: root.ownerDocument.title,
      nodes,
      total: this.candidates.length,
      ...(end < this.candidates.length ? { nextCursor: end } : {}),
    }
  }

  /** Drop the remembered page list (with the refs). */
  clear(): void {
    this.candidates = []
  }
}

/**
 * Refs: short-lived handles an agent uses to name an element.
 *
 * A ref is `<generation>.<n>`. Each snapshot starts a new generation and every older ref becomes stale, so a
 * ref can never quietly point at a different element after the page changed. Even within a generation, a
 * ref is honoured only while its element is still in the document and still has the role and name it had when
 * the ref was issued; a re-rendered or replaced control is a typed `stale-ref`, never a click somewhere else.
 */

import { UiControlError } from '../../contract.ts'
import { nameOf, roleOf } from './accessibility.ts'

interface Entry {
  readonly element: WeakRef<Element>
  readonly role: string
  readonly name: string
}

export interface ResolvedRef {
  readonly element: Element
  readonly role: string
  readonly name: string
}

export class RefTable {
  private generationNumber = 0
  private entries = new Map<number, Entry>()
  private nextIndex = 1

  get generation(): number {
    return this.generationNumber
  }

  /** Start a new generation: every earlier ref is now stale. */
  begin(): number {
    this.generationNumber += 1
    this.entries = new Map()
    this.nextIndex = 1
    return this.generationNumber
  }

  /** Forget everything (the driver is going away or was stopped). */
  clear(): void {
    this.begin()
  }

  issue(element: Element, role: string, name: string): string {
    const index = this.nextIndex
    this.nextIndex += 1
    this.entries.set(index, { element: new WeakRef(element), role, name })
    return `${String(this.generationNumber)}.${String(index)}`
  }

  /** @throws UiControlError `unknown-ref` or `stale-ref`. */
  resolve(ref: string): ResolvedRef {
    const [generationText, indexText] = ref.split('.')
    const generation = Number(generationText)
    const index = Number(indexText)
    if (!Number.isInteger(generation) || !Number.isInteger(index)) throw new UiControlError('unknown-ref', `${ref} is not a ref`)
    if (generation !== this.generationNumber) {
      throw new UiControlError('stale-ref', `${ref} is from an earlier snapshot (the latest is ${String(this.generationNumber)}); take a new snapshot`)
    }
    const entry = this.entries.get(index)
    if (entry === undefined) throw new UiControlError('unknown-ref', `${ref} was not in the snapshot`)
    const element = entry.element.deref()
    if (element === undefined || !element.isConnected) throw new UiControlError('stale-ref', `${ref} is no longer on the page; take a new snapshot`)
    // The same node can be reused for something else after a re-render: check it is still what was listed.
    const role = roleOf(element)
    if (role !== entry.role || nameOf(element, role) !== entry.name) {
      throw new UiControlError('stale-ref', `${ref} changed since the snapshot ("${entry.name}" is now something else); take a new snapshot`)
    }
    return { element, role: entry.role, name: entry.name }
  }
}

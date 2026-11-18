/** What the Registry tab lists and how it words one row: pure, so the rules are tested without a page. */

import type { PulledPluginView, RegistryEntryView } from '../contract.ts'

/** A plugin for a different kind of app (a stock DeepSeek Harness plugin) cannot run in a Blends app; it is hidden until the person asks to see all. */
export const forOtherApps = (entry: RegistryEntryView): boolean => entry.compatibility === 'DSH stock'

/** The entries a search shows: by name, description or owner, every word of it; the ones for other apps only when asked. Order is kept. */
export function filterRegistry(entries: readonly RegistryEntryView[], query: string, showAll: boolean): RegistryEntryView[] {
  const words = query.toLowerCase().split(/\s+/u).filter(word => word !== '')
  return entries.filter((entry) => {
    if (!showAll && forOtherApps(entry)) return false
    const text = `${entry.name} ${entry.description} ${entry.owner}`.toLowerCase()
    return words.every(word => text.includes(word))
  })
}

/** The address a person can type or paste: `github:<owner>/<repo>@<version>`; leading and trailing space is ignored. */
export function cleanAddress(text: string): string | undefined {
  const address = text.trim()
  return /^github:[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9._-]*@[0-9][0-9A-Za-z.+-]*$/u.test(address) ? address : undefined
}

/** A download size the way a person reads it: whole megabytes (1 MB = 1,000,000 bytes, as npm and the Blends pages count). */
export const megabytes = (bytes: number): string => `${Math.max(1, Math.round(bytes / 1e6))} MB`

/** The question before anything is added: whose code it is, and what it downloads for this computer when it brings a native package. */
export const addQuestion = (name: string, owner: string, download?: number): string =>
  `Add ${name} to your app? It runs code written by ${owner}, inside your app.${download === undefined ? '' : ` It also downloads ${megabytes(download)} for this computer.`}`

/** The answer after an add. */
export function addedText(pulled: PulledPluginView): string {
  if (pulled.action === 'unchanged') return `${pulled.name} v${pulled.version} was already in your app, so nothing changed.`
  const did = pulled.action === 'updated' ? 'updated to' : 'added to your app as'
  return pulled.state === 'active' ? `Done. ${pulled.name} is ${did} v${pulled.version} and running now.` : `${pulled.name} is ${did} v${pulled.version}, but it is not running yet (${pulled.state}).`
}

/** One line under a row: who released it, which version and when. */
export const entryByline = (entry: RegistryEntryView): string =>
  `by ${entry.owner} · v${entry.version}${entry.published === undefined ? '' : ` · ${entry.published}`}${entry.download === undefined ? '' : ` · ${megabytes(entry.download)} download`}`

/**
 * Deterministic retrieval over the pack manifest (ported from ACRYL's `plugins/acryl-plugin-context/lib/lookup.js`; pi.dev research, section 73:
 * "fast semantic routing" beside filesystem inspection): which docs and verified examples answer a topic, with paths the agent can read. Pure: no
 * filesystem access. The docs stay the authority; this only routes.
 */
// The paths go to the agent as text: forward slashes on every system (Windows reads them too), as the root the caller passes is written.
import { posix } from 'node:path'

const { join } = posix

/** The tool that runs it in the frame's chat: ACRYL's name, so an agent that knows one knows the other. */
export const LOOKUP_TOOL_NAME = 'acryl_plugin_lookup'

/** The parts of `docs/docs.json` the lookup reads. */
export interface LookupManifest {
  readonly navigation: readonly {
    readonly items: readonly { readonly id: string; readonly title: string; readonly path: string; readonly when?: string; readonly topic?: string }[]
  }[]
  readonly routes?: readonly { readonly when: string; readonly docs: readonly string[] }[]
  readonly examples: readonly { readonly id: string; readonly type: string; readonly path: string; readonly teaches: string; readonly docs: readonly string[] }[]
}

export type LookupResult =
  | { readonly ok: false; readonly error: string }
  | {
      readonly ok: true
      readonly topic: string
      readonly docs: readonly { readonly id: string; readonly title: string; readonly path: string }[]
      readonly examples: readonly { readonly id: string; readonly type: string; readonly path: string; readonly teaches: string }[]
      readonly next: string
      readonly note?: string
    }

const STOP = new Set(['the', 'and', 'for', 'with', 'how', 'what', 'that', 'this', 'from', 'into', 'add', 'make', 'want', 'need', 'can', 'use', 'using', 'build', 'create', 'write', 'change', 'new', 'not', 'are', 'you', 'have', 'has', 'simple', 'please'])

const words = (text: string | undefined): string[] =>
  String(text ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter(word => word.length >= 3 && !STOP.has(word))

function score(queryWords: readonly string[], weightedFields: ReadonlyArray<readonly [string | undefined, number]>): number {
  let total = 0
  for (const [text, weight] of weightedFields) {
    const hay = ` ${words(text).join(' ')} `
    for (const word of queryWords) if (hay.includes(` ${word}`) || hay.includes(word)) total += weight
  }
  return total
}

/**
 * @param topic - free text, for example "a widget on the first screen" or "keep the notes after a restart"
 * @param root - where the pack is, as the agent reads it
 */
export function lookupAppDocs(topic: string, manifest: LookupManifest, root: string, options: { readonly limit?: number } = {}): LookupResult {
  const limit = options.limit ?? 5
  const q = words(topic)
  if (q.length === 0) return { ok: false, error: 'give a topic of at least one meaningful word, for example "home widget" or "state"' }
  const byId = new Map<string, LookupManifest['navigation'][number]['items'][number]>()
  for (const group of manifest.navigation) for (const item of group.items) byId.set(item.id, item)
  const routeBoost = new Map<string, number>()
  for (const route of manifest.routes ?? []) {
    const s = score(q, [[route.when, 3]])
    if (s > 0) route.docs.forEach((id, i) => routeBoost.set(id, Math.max(routeBoost.get(id) ?? 0, s * (i === 0 ? 2 : 1))))
  }
  const docs: { id: string; title: string; path: string; score: number }[] = []
  for (const item of byId.values()) {
    const s = score(q, [[item.title, 2], [item.topic, 2], [item.when, 1], [item.id.replace(/[.-]/gu, ' '), 2]]) + (routeBoost.get(item.id) ?? 0)
    if (s > 0) docs.push({ id: item.id, title: item.title, path: join(root, 'docs', item.path), score: s })
  }
  docs.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1))
  const examples: { id: string; type: string; path: string; teaches: string; score: number }[] = []
  for (const example of manifest.examples) {
    const s =
      score(q, [[example.teaches, 1], [example.type.replace(/-/gu, ' '), 3], [example.id.replace(/[.-]/gu, ' '), 2]]) +
      (docs.some(doc => example.docs.includes(doc.id)) ? 1 : 0)
    if (s > 0) examples.push({ id: example.id, type: example.type, path: join(root, 'example-plugins', 'packages', example.path), teaches: example.teaches, score: s })
  }
  examples.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1))
  const top = docs.slice(0, limit)
  const next = 'Read the first doc and the nearest example COMPLETELY, follow their links, then write the plugin. This lookup only routes: the docs are the authority.'
  const found = {
    ok: true as const,
    topic,
    examples: examples.slice(0, limit).map(({ id, type, path, teaches }) => ({ id, type, path, teaches })),
    next,
  }
  if (top.length === 0) {
    const first = byId.get('start.this-app')
    return {
      ...found,
      docs: first === undefined ? [] : [{ id: first.id, title: first.title, path: join(root, 'docs', first.path) }],
      note: 'No doc matched; start with this-app.md and the docs index, or try other words (a widget, a page, a route, state, share).',
    }
  }
  return { ...found, docs: top.map(({ id, title, path }) => ({ id, title, path })) }
}

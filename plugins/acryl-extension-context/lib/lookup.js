import { join } from 'node:path'

const STOP = new Set(['the', 'and', 'for', 'with', 'how', 'what', 'that', 'this', 'from', 'into', 'add', 'make', 'want', 'need', 'can', 'use', 'using', 'build', 'create', 'write', 'change', 'new', 'not', 'are', 'you', 'have', 'has'])

const words = text => String(text ?? '').toLowerCase().split(/[^a-z0-9]+/u).filter(word => word.length >= 3 && !STOP.has(word))

function score(queryWords, weightedFields) {
  let total = 0
  for (const [text, weight] of weightedFields) {
    const hay = ` ${words(text).join(' ')} `
    for (const word of queryWords) if (hay.includes(` ${word}`) || hay.includes(word)) total += weight
  }
  return total
}

/**
 * Deterministic retrieval over the pack manifest (pi.dev research, section 73: "fast semantic routing" beside filesystem inspection): which docs and
 * verified examples answer a topic, with absolute paths the agent can read. Pure: no filesystem access.
 * @param {string} topic free text, for example "sidebar tab" or "change the accent color"
 * @param {object} manifest parsed docs.json
 * @param {string} root pack root on disk
 * @param {{ limit?: number }} [options]
 */
export function lookupExtensionDocs(topic, manifest, root, options = {}) {
  const limit = options.limit ?? 5
  const q = words(topic)
  if (q.length === 0) return { ok: false, error: 'give a topic of at least one meaningful word, for example "sidebar tab" or "tool"' }
  const docs = []
  const byId = new Map()
  for (const group of manifest.navigation) for (const item of group.items) byId.set(item.id, item)
  const routeBoost = new Map()
  for (const route of manifest.routes ?? []) {
    const s = score(q, [[route.when, 3]])
    if (s > 0) route.docs.forEach((id, i) => routeBoost.set(id, Math.max(routeBoost.get(id) ?? 0, s * (i === 0 ? 2 : 1))))
  }
  for (const item of byId.values()) {
    if (item.id.startsWith('reference.')) continue
    const s = score(q, [[item.title, 2], [item.topic, 2], [item.when, 1], [item.id.replace(/[.-]/gu, ' '), 2]]) + (routeBoost.get(item.id) ?? 0)
    if (s > 0) docs.push({ id: item.id, title: item.title, path: join(root, 'docs', item.path), score: s })
  }
  docs.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1))
  const examples = []
  for (const example of manifest.examples) {
    const s = score(q, [[example.teaches, 1], [example.type, 3], [example.id.replace(/[.-]/gu, ' '), 2]]) + (docs.some(d => example.docs.includes(d.id)) ? 1 : 0)
    if (s > 0) examples.push({ id: example.id, type: example.type, path: join(root, 'examples', 'packages', example.path), teaches: example.teaches, score: s })
  }
  examples.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1))
  const top = docs.slice(0, limit)
  const result = {
    ok: true,
    topic,
    docs: top.map(({ id, title, path }) => ({ id, title, path })),
    examples: examples.slice(0, limit).map(({ id, type, path, teaches }) => ({ id, type, path, teaches })),
    also: {
      mountPoints: join(root, 'docs', 'maps', 'mount-points.md'),
      slotContracts: join(root, 'docs', 'maps', 'slot-contracts.md'),
      events: join(root, 'docs', 'maps', 'events.md'),
      taxonomy: join(root, 'docs', 'maps', 'taxonomy.md'),
    },
    next: 'Read the first doc and the nearest example COMPLETELY, follow their cross-references, then write the package. This lookup only routes: the docs are the authority.',
  }
  if (top.length === 0) {
    result.docs = [{ id: 'start.this-runtime', title: 'This runtime', path: join(root, 'docs', 'start-here', 'this-runtime.md') }]
    result.note = 'No doc matched; start with this-runtime.md and the docs index, or try other words (a plugin type, a surface, a slot name).'
  }
  return result
}

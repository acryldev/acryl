import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CHANGES_KIND } from '../../src/client/changes/changes-tab.ts'
import { CHECKS_KIND } from '../../src/client/checks/checks-tab.ts'
import { FILES_KIND } from '../../src/client/files/files-tab.ts'
import { REVIEW_KIND } from '../../src/client/review/review-tab.ts'

const UPSTREAM = new URL('../../../../deepseek-harness/packages/client/', import.meta.url).pathname

/** Every `kind` string in an upstream client plugin that touches the right-sidebar tab registry (over-inclusive on purpose). */
function upstreamKinds(): Set<string> {
  const kinds = new Set<string>()
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === 'lib' || name === 'tests') continue
      const path = join(dir, name)
      if (statSync(path).isDirectory()) walk(path)
      else if (/\.(ts|tsx)$/.test(name)) {
        const text = readFileSync(path, 'utf8')
        // A plugin that touches the tab registry names its kind in a definition object next to the register call.
        if (!text.includes('sidebarRightTabs') && !/sidebar-?right/i.test(text)) continue
        for (const match of text.matchAll(/(?:\bkind:|_KIND\s*=)\s*'([\w-]+)'/g)) {
          if (match[1] !== undefined) kinds.add(match[1])
        }
      }
    }
  }
  for (const pkg of readdirSync(UPSTREAM)) {
    const src = join(UPSTREAM, pkg, 'src')
    if (existsSync(src)) walk(src)
  }
  return kinds
}

describe('right-panel tab kinds', () => {
  it('never reuse a kind an upstream DSH plugin registers (the registry throws and the whole client fails to load)', () => {
    const upstream = upstreamKinds()
    // Sanity: the scan really sees upstream registrations, including the one that once collided.
    expect(upstream.has('files')).toBe(true)
    const ours = [CHANGES_KIND, REVIEW_KIND, CHECKS_KIND, FILES_KIND]
    expect(new Set(ours).size).toBe(ours.length)
    for (const kind of ours) expect(upstream.has(kind), kind).toBe(false)
  })
})

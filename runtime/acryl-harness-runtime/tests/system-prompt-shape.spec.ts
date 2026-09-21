/**
 * The `acryl-system-prompt` plugin on the real engines: the model receives the ACRYL identity first, every other section tagged pi.dev-style
 * with the extension router present exactly once, and upstream's contribution matches the committed drift baseline. A harness update that changes
 * the harness's prompt sections fails the baseline check and shows which sections changed; refresh it deliberately with
 * `ACRYL_UPDATE_DRIFT=1 corepack pnpm --filter acryl-harness-runtime exec vitest run tests/system-prompt-shape.spec.ts`.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'
import { afterEach, describe, expect, it } from 'vitest'
import { createDshEngineDefinition, createWebEngineDefinition } from '../src/engine-dsh.ts'
import { createAcrylEngineHost } from '../src/engine-host.ts'
import { captureSystemPrompt } from '../src/system-prompt-capture.ts'

const driftDir = new URL('../../../plugins/acryl-system-prompt/drift/', import.meta.url).pathname
const temporaryHomes: string[] = []
const initialDshHome = process.env.DSH_HOME
afterEach(async () => {
  // Assigning undefined would store the string "undefined" and the next boot would create a ./undefined profile directory.
  if (initialDshHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = initialDshHome
  await Promise.all(temporaryHomes.splice(0).map(home => rm(home, { force: true, recursive: true })))
})

async function capture(kind: 'web' | 'cli') {
  process.env.DEEPSEEK_API_KEY = 'dummy-key-for-prompt-capture'
  const home = await mkdtemp(join(tmpdir(), 'acryl-shape-'))
  temporaryHomes.push(home)
  process.env.DSH_HOME = home
  const host = await createAcrylEngineHost(kind === 'cli'
    ? { engines: [createDshEngineDefinition('acryl-shape')], initialEngine: 'dsh' }
    : {
        engines: [createWebEngineDefinition(new URL('../package.json', import.meta.url).href)],
        initialEngine: 'dsh',
        prepare: ctx => { provideCmdline(ctx, { args: ['--no-open', '--port', '0'], exit: () => {} }) },
      })
  try {
    const captured = await captureSystemPrompt(host.ctx, { profile: kind === 'cli' ? 'acryl-shape' : 'web', selectStandardPreset: kind === 'web' })
    const service = host.ctx.get('acrylSystemPrompt' as never) as unknown as { lastUpstream(): Array<{ name: string; hash: string }> }
    return { captured, upstream: service.lastUpstream() }
  } finally { await host.dispose() }
}

describe.each(['web', 'cli'] as const)('acryl-system-prompt on the %s engine', kind => {
  it('puts the ACRYL identity first, tags sections pi.dev-style, and keeps the router once', async () => {
    const { captured, upstream } = await capture(kind)
    expect(captured.system.startsWith('You are an expert coding assistant operating inside ACRYL')).toBe(true)
    expect(captured.system).not.toContain('powered by DeepSeek Harness')
    expect(captured.system).toContain('<tool_read>')
    expect(captured.system).toContain('</tool_read>')
    expect(captured.system.match(/<acryl_extension_docs>/gu)).toHaveLength(1)
    expect(captured.system).not.toMatch(/<plan_policy>\s*<\/plan_policy>/u)
    expect(upstream.length).toBeGreaterThan(5)
  }, 90_000)

  it('matches the committed baseline of what upstream contributes', async () => {
    const { upstream } = await capture(kind)
    const baselinePath = join(driftDir, `${kind}.json`)
    if (process.env.ACRYL_UPDATE_DRIFT === '1' || !existsSync(baselinePath)) {
      writeFileSync(baselinePath, `${JSON.stringify(upstream, null, 2)}\n`)
      return
    }
    const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')) as Array<{ name: string; hash: string }>
    const byName = (list: Array<{ name: string; hash: string }>) => new Map(list.map(section => [section.name, section.hash]))
    const before = byName(baseline)
    const now = byName(upstream)
    const added = [...now.keys()].filter(name => !before.has(name))
    const removed = [...before.keys()].filter(name => !now.has(name))
    const changed = [...now.keys()].filter(name => before.has(name) && before.get(name) !== now.get(name))
    expect({ added, removed, changed }, 'the harness changed its prompt sections; review, then refresh with ACRYL_UPDATE_DRIFT=1').toEqual({ added: [], removed: [], changed: [] })
  }, 90_000)
})

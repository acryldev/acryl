import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { AcrPluginLifecycle } from 'acryl-harness-runtime'
import { PluginLifecycleView } from '../../src/lifecycle/view.ts'

const SHARED_SNAPSHOT = {
  entries: [
    { entryId: 'include:acryl-workspace', moduleName: 'acryl-workspace', enabled: true, hostPhase: 'active' as const, mutable: true, protectedReason: null, dependents: [] },
    { entryId: 'include:host-only', moduleName: 'host-only-plugin', enabled: true, hostPhase: 'active' as const, mutable: true, protectedReason: null, dependents: [] },
  ],
}

function lifecycle(): AcrPluginLifecycle & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    snapshot: () => SHARED_SNAPSHOT,
    async setEnabled(entryId, enabled) {
      calls.push(`${enabled ? 'enable' : 'disable'} ${entryId}`)
      return { accepted: true, action: enabled ? 'enable' : 'disable', entryIds: [entryId], snapshot: SHARED_SNAPSHOT }
    },
    async reload(entryId) {
      calls.push(`reload ${entryId ?? 'all'}`)
      return { accepted: true, action: 'reload', entryIds: [entryId ?? 'include:acryl-workspace'], snapshot: SHARED_SNAPSHOT }
    },
  }
}

function context(graphIds: readonly string[]): Context {
  return { baseUrl: undefined, get: (name: string) => name === 'clientModules' ? { graph: () => ({ entries: graphIds.map(id => ({ id })) }) } : undefined } as unknown as Context
}

describe('PluginLifecycleView', () => {
  it('adds each entry\'s browser face and whether it is in the page boot graph, on top of the shared snapshot', () => {
    const view = new PluginLifecycleView(context(['acryl-workspace']), lifecycle())
    const { entries, blend } = view.snapshot()
    expect(entries.map(e => [e.entryId, e.clientPackage, e.clientInBootGraph])).toEqual([
      ['include:acryl-workspace', 'acryl-workspace', true],
      ['include:host-only', null, false],
    ])
    expect(blend).toBeNull()
    expect(entries[0]).toMatchObject({ enabled: true, mutable: true, hostPhase: 'active' })
  })

  it('shows the composed Blend when the surface has one, and none otherwise', () => {
    const blend = { origin: { id: 'acryl-demo', kind: 'Blend' as const, version: '1.0.0', digest: 'sha256:abc' }, lockPath: '/x/lock.yml', rows: [{}, {}] }
    expect(new PluginLifecycleView(context([]), lifecycle(), () => blend).snapshot().blend).toEqual({
      id: 'acryl-demo', kind: 'Blend', version: '1.0.0', digest: 'sha256:abc', lockPath: '/x/lock.yml', rows: 2,
    })
  })

  it('delegates enable, disable and reload to the shared authority and marks the page for reload', async () => {
    const shared = lifecycle()
    const view = new PluginLifecycleView(context([]), shared)
    const enabled = await view.setEnabled('include:acryl-workspace', true)
    const disabled = await view.setEnabled('include:acryl-workspace', false)
    const reloaded = await view.reload()
    expect(shared.calls).toEqual(['enable include:acryl-workspace', 'disable include:acryl-workspace', 'reload all'])
    for (const receipt of [enabled, disabled, reloaded]) {
      expect(receipt).toMatchObject({ accepted: true, rendererReloadRequired: true })
      expect(receipt.snapshot.entries).toHaveLength(2)
    }
  })

  it('tolerates a surface with no client module graph', () => {
    const view = new PluginLifecycleView({ baseUrl: undefined, get: () => undefined } as unknown as Context, lifecycle())
    expect(view.snapshot().entries.every(e => e.clientInBootGraph === false)).toBe(true)
  })
})

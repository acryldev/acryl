import type { Context } from '@deepseek-ai/cordis'
import type { PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools'
import { describe, expect, it, vi } from 'vitest'
import type { PluginLifecycleEntryView, PluginLifecycleReceipt, PluginLifecycleSnapshot } from '../src/lifecycle/contract.ts'
import { describePluginChange, PLUGIN_LIST_TOOL, PLUGIN_SET_ENABLED_TOOL, registerPluginTools } from '../src/tools/plugin-tools.ts'

const entry = (over: Partial<PluginLifecycleEntryView>): PluginLifecycleEntryView => ({
  entryId: 'include:x', moduleName: 'x', enabled: true, hostPhase: 'active', clientPackage: null, clientInBootGraph: false, mutable: true, protectedReason: null, dependents: [], ...over,
})
const SNAPSHOT: PluginLifecycleSnapshot = {
  blend: null,
  entries: [
    entry({ entryId: 'include:acryl-workspace', moduleName: 'acryl-workspace', dependents: ['include:acryl-dev-canvas'] }),
    entry({ entryId: 'include:core', moduleName: 'core', mutable: false, protectedReason: 'core capability' }),
    entry({ entryId: 'include:acryl-ui-control', moduleName: 'acryl-ui-control' }),
    entry({ entryId: 'include:off', moduleName: 'off', enabled: false, hostPhase: null }),
  ],
}

function setup() {
  const tools = new Map<string, { execute: (args: never, exec: unknown) => Promise<unknown>; output: { render: (a: unknown, v: never) => Array<{ text: string }> } }>()
  let policy: ((exec: ToolExecution, next: () => Promise<PreToolDecision>) => Promise<PreToolDecision>) | undefined
  const ctx = {
    tools: { register: (tool: { name: string }) => { tools.set(tool.name, tool as never); return () => { tools.delete(tool.name) } } },
    on: (_event: string, handler: typeof policy) => { policy = handler; return () => { policy = undefined } },
  } as unknown as Context
  const setEnabled = vi.fn(async (entryId: string, enabled: boolean): Promise<PluginLifecycleReceipt> => ({ accepted: true, action: enabled ? 'enable' : 'disable', entryIds: [entryId], rendererReloadRequired: true, snapshot: SNAPSHOT }))
  const dispose = registerPluginTools(ctx, { snapshot: () => SNAPSHOT, setEnabled })
  return { tools, setEnabled, dispose, policy: () => policy!, hasPolicy: () => policy !== undefined }
}

describe('plugin lifecycle agent tools', () => {
  it('lists every plugin and says which the agent may change', async () => {
    const t = setup()
    const rows = (await t.tools.get(PLUGIN_LIST_TOOL)!.execute({} as never, {})) as Array<{ entryId: string; changeable: boolean; reason?: string }>
    expect(rows.map(r => [r.entryId, r.changeable])).toEqual([['include:acryl-workspace', true], ['include:core', false], ['include:acryl-ui-control', false], ['include:off', true]])
    expect(rows[1]!.reason).toBe('core capability')
    expect(rows[2]!.reason).toContain('Agent Control')
    expect(t.tools.get(PLUGIN_LIST_TOOL)!.output.render({}, rows as never)[0]!.text).toContain('locked: core capability')
  })

  it('switches a plugin through the lifecycle service and reports the reload', async () => {
    const t = setup()
    const value = await t.tools.get(PLUGIN_SET_ENABLED_TOOL)!.execute({ entryId: 'include:off', enabled: true } as never, {})
    expect(t.setEnabled).toHaveBeenCalledWith('include:off', true)
    expect(value).toEqual({ entryIds: ['include:off'], enabled: true, reloadRequired: true })
  })

  it('refuses an unknown entry, a core plugin, and Agent Control itself, without touching anything', async () => {
    const t = setup()
    const run = (entryId: string) => t.tools.get(PLUGIN_SET_ENABLED_TOOL)!.execute({ entryId, enabled: false } as never, {})
    await expect(run('include:nope')).rejects.toThrow('unknown plugin entry')
    await expect(run('include:core')).rejects.toThrow('protected: core capability')
    await expect(run('include:acryl-ui-control')).rejects.toThrow('Agent Control cannot be switched off')
    expect(t.setEnabled).not.toHaveBeenCalled()
  })

  it('asks about every change in words that name the plugin and what else goes with it, and never about looking', async () => {
    const t = setup()
    const allow = async (): Promise<PreToolDecision> => ({ kind: 'allow' })
    const exec = (name: string, args: unknown) => ({ name, arguments: args }) as unknown as ToolExecution
    expect(await t.policy()(exec(PLUGIN_SET_ENABLED_TOOL, { entryId: 'include:acryl-workspace', enabled: false }), allow)).toEqual({ kind: 'ask', reason: 'Switch off the plugin acryl-workspace (include:acryl-workspace), which also switches off include:acryl-dev-canvas' })
    expect(await t.policy()(exec(PLUGIN_SET_ENABLED_TOOL, { entryId: 'include:off', enabled: true }), allow)).toEqual({ kind: 'ask', reason: 'Switch on the plugin off (include:off)' })
    expect(await t.policy()(exec(PLUGIN_LIST_TOOL, {}), allow)).toEqual({ kind: 'allow' })
    expect(await t.policy()(exec(PLUGIN_SET_ENABLED_TOOL, { entryId: 'include:off', enabled: true }), async () => ({ kind: 'deny', reason: 'plan mode' }))).toEqual({ kind: 'deny', reason: 'plan mode' })
    expect(describePluginChange({ entryId: 'ghost', enabled: true }, SNAPSHOT)).toBe('Switch on the plugin ghost')
  })

  it('removes both tools and the policy when disposed', () => {
    const t = setup()
    t.dispose()
    expect(t.tools.size).toBe(0)
    expect(t.hasPolicy()).toBe(false)
  })
})

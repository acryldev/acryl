/**
 * Layer 1 of Agent Control (spec 041): typed tools for plugin lifecycle, provided by the package that owns
 * the capability. The agent lists plugins and switches one on or off through the same lifecycle service the
 * Settings tab uses, so there is one implementation and the service's own rules (protected entries,
 * dependents) apply. Changing a plugin is asked about every time, and the agent can never switch off Agent
 * Control itself.
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool, type PreToolDecision, type ToolExecution } from '@deepseek-ai/dsh-tools'
import type { PluginLifecycleReceipt, PluginLifecycleSnapshot } from '../lifecycle/contract.ts'

export const PLUGIN_LIST_TOOL = 'acryl_plugin_list'
export const PLUGIN_SET_ENABLED_TOOL = 'acryl_plugin_set_enabled'

/** The plugin the agent may never switch off: it is the agent's own leash. */
const AGENT_CONTROL_MODULE = 'acryl-agent-control'

/** What the tools need from the lifecycle view. */
export interface PluginLifecycleTools {
  snapshot(): PluginLifecycleSnapshot
  setEnabled(entryId: string, enabled: boolean): Promise<PluginLifecycleReceipt>
}

const isAgentControl = (entry: { entryId: string; moduleName: string }): boolean =>
  entry.moduleName === AGENT_CONTROL_MODULE || entry.entryId.includes(AGENT_CONTROL_MODULE)

/** Words for the approval prompt. */
export function describePluginChange(args: unknown, snapshot: PluginLifecycleSnapshot): string {
  const a = (typeof args === 'object' && args !== null ? args : {}) as Record<string, unknown>
  const entry = snapshot.entries.find(candidate => candidate.entryId === a.entryId)
  const name = entry === undefined ? String(a.entryId) : `${entry.moduleName} (${entry.entryId})`
  const dependents = entry === undefined || entry.dependents.length === 0 ? '' : `, which also switches off ${entry.dependents.join(', ')}`
  return `${a.enabled === true ? 'Switch on' : 'Switch off'} the plugin ${name}${a.enabled === true ? '' : dependents}`
}

/** Register both tools and the per-call approval for the one that changes something. @returns disposer. */
export function registerPluginTools(ctx: Context, lifecycle: PluginLifecycleTools): () => void {
  const list = defineTool({
    name: PLUGIN_LIST_TOOL,
    description: 'List the ACRYL plugins with their entry id, whether each is on, its state, and whether you may change it.',
    parameters: {},
    output: {
      schema: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false,
          properties: {
            entryId: { type: 'string', required: true }, moduleName: { type: 'string', required: true },
            enabled: { type: 'boolean', required: true }, phase: { type: 'string' }, changeable: { type: 'boolean', required: true },
            reason: { type: 'string' }, dependents: { type: 'array', required: true, items: { type: 'string' } },
          },
        },
      },
      render: (_args: unknown, entries) => [{
        type: 'text',
        text: entries.length === 0 ? '(no plugins)' : entries.map(e => `${e.enabled ? 'on ' : 'off'} ${e.entryId} (${e.moduleName})${e.phase === undefined ? '' : ` ${e.phase}`}${e.changeable ? '' : ` [locked${e.reason === undefined ? '' : `: ${e.reason}`}]`}`).join('\n'),
      }],
    },
    execute: async () => lifecycle.snapshot().entries.map(entry => ({
      entryId: entry.entryId, moduleName: entry.moduleName, enabled: entry.enabled,
      ...(entry.hostPhase === null ? {} : { phase: entry.hostPhase }),
      changeable: entry.mutable && !isAgentControl(entry),
      ...(!entry.mutable ? { reason: entry.protectedReason ?? 'core capability' } : isAgentControl(entry) ? { reason: 'Agent Control cannot be changed by the agent' } : {}),
      dependents: [...entry.dependents],
    })),
  })

  const setEnabled = defineTool({
    name: PLUGIN_SET_ENABLED_TOOL,
    description: 'Switch a plugin on or off by entry id (from acryl_plugin_list). The user approves each change. Core plugins and Agent Control cannot be changed.',
    parameters: { entryId: { type: 'string', required: true }, enabled: { type: 'boolean', required: true } },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: { entryIds: { type: 'array', required: true, items: { type: 'string' } }, enabled: { type: 'boolean', required: true }, reloadRequired: { type: 'boolean', required: true } },
      },
      render: (_args: unknown, value) => [{ type: 'text', text: `${value.enabled ? 'Switched on' : 'Switched off'}: ${value.entryIds.join(', ')}.${value.reloadRequired ? ' Reload the window to see it.' : ''}` }],
    },
    execute: async (args) => {
      const entry = lifecycle.snapshot().entries.find(candidate => candidate.entryId === args.entryId)
      if (entry === undefined) throw new Error(`unknown plugin entry ${args.entryId}; call acryl_plugin_list`)
      if (isAgentControl(entry)) throw new Error('protected: Agent Control cannot be switched off by the agent')
      if (!entry.mutable) throw new Error(`protected: ${entry.protectedReason ?? 'this is a core capability'}`)
      const receipt = await lifecycle.setEnabled(args.entryId, args.enabled)
      return { entryIds: [...receipt.entryIds], enabled: args.enabled, reloadRequired: receipt.rendererReloadRequired }
    },
  })

  const disposers = [ctx.tools.register(list), ctx.tools.register(setEnabled)]
  const removePolicy = ctx.on('tools/pre-execute', async (exec: ToolExecution, next: () => Promise<PreToolDecision>): Promise<PreToolDecision> => {
    const decision = await next()
    if (exec.name !== PLUGIN_SET_ENABLED_TOOL || decision.kind === 'deny') return decision
    return { kind: 'ask', reason: describePluginChange(exec.arguments, lifecycle.snapshot()) }
  })
  return () => { removePolicy(); for (const dispose of disposers.reverse()) dispose() }
}

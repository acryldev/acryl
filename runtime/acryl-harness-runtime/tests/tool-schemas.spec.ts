/**
 * ACRYL's typed agent tools compile with DSH's own tool compiler. A plugin's own tests register its tools on a fake port that accepts any
 * schema; DSH 0.2 rejects some (an object without an explicit `additionalProperties`), and that surfaced only at boot, as a tool the agent
 * never saw (spec 043 T007, 2026-10-12).
 */
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { registerPluginTools } from 'acryl-plugin-admin'
import { registerContextTool, registerWorkspaceTools } from 'acryl-workspace'
import { describe, expect, it } from 'vitest'

function portThroughDshCompiler(): { ctx: Context, names: string[] } {
  const names: string[] = []
  const ctx = {
    acrylTools: {
      register: (definition: { name: string }) => { defineTool(definition as never); names.push(definition.name); return () => {} },
      policy: () => () => {},
    },
  } as unknown as Context
  return { ctx, names }
}

describe('ACRYL agent tools compile with DSH', () => {
  it('the workspace tools', () => {
    const { ctx, names } = portThroughDshCompiler()
    registerWorkspaceTools(ctx, {} as never)
    expect(names).toEqual(['acryl_workspace_list', 'acryl_workspace_switch', 'acryl_workspace_create', 'acryl_workspace_add_project'])
  })

  it('the workspace context tool', () => {
    const { ctx, names } = portThroughDshCompiler()
    registerContextTool(ctx, {} as never)
    expect(names).toEqual(['acryl_workspace_context'])
  })

  it('the plugin tools', () => {
    const { ctx, names } = portThroughDshCompiler()
    registerPluginTools(ctx, {} as never)
    expect(names).toEqual(['acryl_plugin_list', 'acryl_plugin_set_enabled'])
  })
})

/**
 * The `acrylTools` port in a Blends frame (spec 052 T055b): ACRYL's tools port (`@acryldev/control`) answered by the chat's tool registry (`tools`), so the
 * plugins that register tools through it (the launcher, plugin-admin, workspace) have them in the frame's chat and, through the agent-control gateway, in every
 * agent. The same thin delegate `@acryldev/harness-runtime` provides in the ACRYL runtime (`engine-tools.ts`): a tool is an ordinary registry tool, a call runs
 * the registry's whole pipeline (so the frame's own policies and `tools/pre-execute` hooks apply), and a policy is a `tools/pre-execute` hook. The runtime is
 * above this plugin in the dependency graph, so the delegate is written here too rather than imported.
 */
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { AcrylTools } from '@acryldev/control'

/** The port over `ctx.tools`; `ctx` must be able to see `tools`. */
export function acrylToolsOver(ctx: Context): AcrylTools {
  return {
    register: definition => ctx.tools.register(defineTool(definition as never)),
    get: name => ctx.tools.get(name) as ReturnType<AcrylTools['get']>,
    execute: input => ctx.tools.execute(input as never) as Promise<Awaited<ReturnType<AcrylTools['execute']>>>,
    policy: handler => ctx.on('tools/pre-execute', handler as never),
  }
}

/** Provide `acrylTools` once the chat's `tools` exist; it leaves with them. */
export function provideAcrylTools(ctx: Context): void {
  ctx.inject(['tools'], (child) => {
    const port = acrylToolsOver(child)
    child.effect(() => {
      const dispose = child.reflect.provide('acrylTools', port)
      return () => { void dispose() }
    }, '@acryldev/blends-frame: acrylTools')
  })
}

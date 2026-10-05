/**
 * The `acrylTools` provider: ACRYL's tools port (`acryl-control`) answered by DeepSeek Harness's tool registry today. A thin delegate: a tool defined
 * through the port is an ordinary Harness tool (same `defineTool`, same registry), a call through `execute` runs the registry's whole pipeline, and a
 * policy registered through `policy` is a `tools/pre-execute` hook like any other. When the registry is replaced the adapter and its consumers unload
 * together and register again.
 *
 * @module acryl-harness-runtime/engine-tools
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { AcrylTools } from 'acryl-control'

/** Provide `acrylTools` on `ctx`, which must be able to see `tools` (call it inside `ctx.inject(['tools'], ...)`). */
export function provideAcrylTools(ctx: Context): void {
  const port: AcrylTools = {
    register: definition => ctx.tools.register(defineTool(definition as never)),
    get: name => ctx.tools.get(name) as ReturnType<AcrylTools['get']>,
    execute: input => ctx.tools.execute(input as never) as Promise<Awaited<ReturnType<AcrylTools['execute']>>>,
    policy: handler => ctx.on('tools/pre-execute', handler as never),
  }
  ctx.effect(() => {
    const dispose = ctx.reflect.provide('acrylTools', port)
    return () => { void dispose() }
  }, 'acryl-harness-runtime: acrylTools')
}

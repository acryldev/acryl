/**
 * The app-context plugin answers ACRYL's tools port over the chat's tool registry (spec 052 T055b): a plugin that registers a tool through `acrylTools` has it in
 * the registry, and the port leaves with the registry.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { defineAcrylTool } from '@acryldev/control'
import { provideAcrylTools } from '../src/acryl-tools.ts'

const tool = defineAcrylTool({
  name: 'acryl_frame_probe',
  description: 'a probe',
  parameters: {},
  output: { schema: { type: 'string' }, render: (value: string) => [{ type: 'text', text: value }] },
  execute: async () => 'ok',
} as never)

function registry() {
  const registered = new Map<string, unknown>()
  return {
    registered,
    tools: {
      register: (definition: { name: string }) => { registered.set(definition.name, definition); return () => { registered.delete(definition.name) } },
      get: (name: string) => registered.get(name),
      execute: async () => ({}),
    },
  }
}

describe('the app-context plugin provides the acrylTools port', () => {
  it('waits for the chat\'s tools, registers a plugin\'s tool in them, and takes the port away with them', async () => {
    const ctx: any = new Context()
    provideAcrylTools(ctx)
    let seen: unknown
    ctx.inject(['acrylTools'], (child: any) => { seen = child.acrylTools })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(seen).toBeUndefined()

    const { registered, tools } = registry()
    const withdraw = ctx.effect(() => ctx.reflect.provide('tools', tools), 'tools')
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(seen).toBeDefined()
    const dispose = (seen as { register(t: unknown): () => void }).register(tool)
    expect([...registered.keys()]).toEqual(['acryl_frame_probe'])
    dispose()
    expect(registered.size).toBe(0)
    void withdraw
    await ctx.fiber.dispose()
  })
})

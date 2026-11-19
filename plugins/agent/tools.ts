import type { Context } from '@deepseek-ai/cordis'

/** What a run passes with each call: its signal, and the door's id of the page it was asked from (the page tools drive only that page). */
export interface CallOptions {
  readonly signal?: AbortSignal
  readonly page?: string
}

/** One tool: what it does (for the model) and how to run it. */
export interface Tool {
  readonly description: string
  /** The JSON Schema of the input (an object schema), sent to a real model so it knows which fields the tool takes. A tool without one takes any object. */
  readonly parameters?: Readonly<Record<string, unknown>>
  /** `options.signal` aborts when the run is cancelled; a tool that can stop its work listens to it. `options.page` is the page the run was asked from, when it was. */
  run(input: unknown, options?: CallOptions): unknown | Promise<unknown>
}

/** The tool registry. A plugin registers its tools inside `ctx.effect`, so they leave with it. */
export interface Tools {
  /** Register a tool. Returns the function that removes it. */
  register(name: string, tool: Tool): () => void
  list(): Array<{
    name: string
    description: string
    parameters?: Readonly<Record<string, unknown>>
  }>
  call(name: string, input: unknown, options?: CallOptions): Promise<unknown>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    tools: Tools
  }
}

/** Provides the registry, with one example tool (`add`). */
export function tools(ctx: Context) {
  const table = new Map<string, Tool>()
  const registry: Tools = {
    register(name, tool) {
      if (table.has(name)) throw new Error(`tool "${name}" is already registered`)
      table.set(name, tool)
      return () => void table.delete(name)
    },
    list: () =>
      [...table.entries()].map(([name, tool]) => ({
        name,
        description: tool.description,
        ...(tool.parameters === undefined ? {} : { parameters: tool.parameters }),
      })),
    async call(name, input, options) {
      const tool = table.get(name)
      if (!tool) throw new Error(`unknown tool "${name}"`)
      return await tool.run(input, options)
    },
  }
  ctx.provide('tools', registry)
  ctx.effect(() =>
    registry.register('add', {
      description: 'Add two numbers: input [a, b].',
      run: (input) => {
        const [a = 0, b = 0] = Array.isArray(input) ? (input as number[]) : []
        return a + b
      },
    }),
  )
}

import { Context } from '@deepseek-ai/cordis'
import { Group, Loader } from '@deepseek-ai/cordis-plugin-loader'

const ENGINE_ENTRY_ID = 'acryl-engine'

type CordisPlugin = Parameters<Context['plugin']>[0]

export interface AcrylEngineDefinition {
  readonly id: string
  readonly plugin: CordisPlugin
  readonly config?: Record<string, unknown>
}

export interface AcrylEngineHost {
  readonly ctx: Context
  currentEngine(): string
  select(id: string): Promise<void>
  dispose(): Promise<void>
}

/**
 * Own the one Cordis root that selects an engine provider. Individual engines
 * are Loader entries beneath this host, so replacing a provider keeps the host
 * and its consumers alive while Cordis performs ordinary dependency rebinding.
 */
export async function createAcrylEngineHost(input: {
  readonly engines: readonly AcrylEngineDefinition[]
  readonly initialEngine: string
}): Promise<AcrylEngineHost> {
  const engines = new Map<string, AcrylEngineDefinition>()
  for (const engine of input.engines) {
    if (engine.id.trim() === '') throw new Error('ACRYL engine id must not be empty')
    if (engines.has(engine.id)) throw new Error(`duplicate ACRYL engine: ${engine.id}`)
    engines.set(engine.id, engine)
  }
  const initial = engines.get(input.initialEngine)
  if (initial === undefined) throw new Error(`unknown ACRYL engine: ${input.initialEngine}`)

  const ctx = new Context()
  await ctx.plugin(Loader)
  ctx.loader.builtins.group = Group
  for (const engine of engines.values()) ctx.loader.builtins[`acryl-engine-${engine.id}`] = engine.plugin

  let active = initial.id
  let disposed = false
  const entryFor = (engine: AcrylEngineDefinition) => ({
    id: ENGINE_ENTRY_ID,
    name: `cordis:acryl-engine-${engine.id}`,
    ...(engine.config === undefined ? {} : { config: engine.config }),
  })
  try {
    await ctx.loader.create(entryFor(initial))
    await ctx.loader.await()
  } catch (error) {
    await ctx.fiber.dispose()
    throw error
  }

  return Object.freeze({
    ctx,
    currentEngine: () => active,
    async select(id: string): Promise<void> {
      if (disposed) throw new Error('ACRYL engine host is disposed')
      const next = engines.get(id)
      if (next === undefined) throw new Error(`unknown ACRYL engine: ${id}`)
      if (next.id === active) return
      await ctx.loader.resolve(ENGINE_ENTRY_ID).update(entryFor(next))
      await ctx.loader.await()
      active = next.id
    },
    async dispose(): Promise<void> {
      if (disposed) return
      disposed = true
      await ctx.fiber.dispose()
    },
  })
}

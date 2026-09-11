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
  /**
   * Register surface-owned services on the bare root before any engine
   * mounts - mirrors `boot()`'s own `prepare` timing exactly (Loader is
   * plugged, no config-tree entry has mounted yet), so a surface with its
   * own non-engine capabilities (e.g. Desktop's profile/market/plugin-
   * lifecycle services) can provide them ahead of an engine's Loader entries
   * that `ctx.inject`/`ctx.get` them.
   */
  readonly prepare?: (ctx: Context) => Promise<void> | void
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
  const entryFor = (engine: AcrylEngineDefinition) => ({
    id: ENGINE_ENTRY_ID,
    name: `cordis:acryl-engine-${engine.id}`,
    ...(engine.config === undefined ? {} : { config: engine.config }),
  })
  try {
    await input.prepare?.(ctx)
    ctx.loader.builtins.group = Group
    for (const engine of engines.values()) ctx.loader.builtins[`acryl-engine-${engine.id}`] = engine.plugin
    await ctx.loader.create(entryFor(initial))
    await ctx.loader.await()
  } catch (error) {
    await ctx.fiber.dispose()
    throw error
  }

  let active = initial.id
  let disposed = false

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

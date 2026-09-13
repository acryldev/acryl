import { dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { Group, Loader } from '@deepseek-ai/cordis-plugin-loader'

const ENGINE_ENTRY_ID = 'acryl-engine'

/**
 * Fallback resolution base for the host root's own Loader entries (the
 * "acryl-engine-<id>" row and mountRootInclude's sibling "cordis:include"
 * row - see the `ctx.baseUrl` assignment below for why). Never read for a
 * real client bundle - `dsh-client-modules` finds no client export at this
 * location and skips, exactly as it does for any other non-client entry -
 * so its value need not track a specific engine's own profile location.
 */
const HOST_ROOT_BASE_URL = pathToFileURL(dirname(fileURLToPath(import.meta.url))).href + '/'

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
  // `EntryTree`'s constructor snapshots `ctx.baseUrl` once, as an own
  // property (`ctx.extend({ baseUrl: ctx.baseUrl })`) - not a live read - at
  // the moment the Loader plugin constructs its root tree, i.e. exactly this
  // `ctx.plugin(Loader)` call below. Every entry created directly on this
  // root (the "acryl-engine-<id>" row this function creates, and
  // mountRootInclude's sibling "cordis:include" row - see engine-dsh.ts)
  // permanently inherits whatever `ctx.baseUrl` was at this line; setting it
  // later (inside an engine's own plugin, or even inside `prepare` below,
  // which also runs after this line) cannot reach that already-taken
  // snapshot. Reproduced directly: Desktop's real composition failed with
  // "loader entry cordis:acryl-engine-dsh has no resolution base URL" from
  // `dsh-client-modules` (Desktop composes client bundles; CLI/TUI does not,
  // which is why no automated test caught this) before this assignment
  // existed - confirmed via `entry.parent.tree.ctx.baseUrl` reading
  // `undefined` for exactly these two entries, and every entry nested one
  // level deeper (inside the profile's own composed tree, constructed later
  // from a ctx that does have baseUrl set) reading correctly.
  ctx.baseUrl = HOST_ROOT_BASE_URL
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

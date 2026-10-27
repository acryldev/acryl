/**
 * Cordis Host plugin: the private routes behind Settings > Plugins > Lifecycle and Architecture, for every
 * surface. Nothing here is Desktop or Web specific. Every route is on the framework's router, served under one
 * `routerHttp.mount('/api/acryl-plugin-admin')`.
 *
 * - The architecture route needs only the router: it projects the live Cordis graph.
 * - The lifecycle routes are a dependency-gated child that routes them when a surface has published
 *   `ctx.acrPluginLifecycle` (both Desktop and Web do) and takes them away, without failing this plugin, when
 *   that service goes away (the paths then answer 404, as before).
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from 'acryl-control'
import type {} from 'acrylblends/cordis/router'
import type {} from 'acrylblends/cordis/router-http'
import { inspectCordisContext } from './architecture/inspector.ts'
import { architectureRoutes } from './architecture/route.ts'
import { PLUGIN_ADMIN_API_PREFIX } from './lifecycle/contract.ts'
import { lifecycleRoutes } from './lifecycle/route.ts'
import { registerPluginTools } from './tools/plugin-tools.ts'
import { PluginLifecycleView, type PluginLifecycleBlendSource } from './lifecycle/view.ts'

export const name = 'acryl-plugin-admin'
export const inject = ['router', 'routerHttp']

/** Optional Desktop-provided launcher state; a surface without it falls back to {@link unlockedBlueprintSource}. */
interface BlendBootstrap {
  readonly blend?: PluginLifecycleBlendSource
}

/**
 * Every surface (Web, CLI and Desktop alike) sets `ACRYL_BLUEPRINT_ID` at boot from the same shared composition
 * (`engine-dsh.ts`, spec 040 "Surface sharing") - reading it back here, rather than Desktop's own locked-Blend
 * bootstrap, is how a surface with no locked Blend (every Web session today) still reports an honest, real
 * identity instead of `null` (spec 040 T083). The engine publishes the Blueprint's display name beside its id
 * (`ACRYL_BLUEPRINT_NAME`), so this plugin never imports the runtime that mounts it; a surface that sets only the id
 * reports the id as the name.
 */
export function unlockedBlueprintSource(rows: readonly unknown[]): PluginLifecycleBlendSource | undefined {
  const id = process.env.ACRYL_BLUEPRINT_ID
  if (id === undefined || id === '') return undefined
  const name = process.env.ACRYL_BLUEPRINT_NAME ?? id
  return { locked: false, id, name, rows }
}

function reporter(ctx: Context): (operation: string, cause: unknown) => void {
  return (operation, cause) => {
    ctx.logger.error(`acryl-plugin-admin: failed to ${operation}: ${cause instanceof Error ? cause.message : String(cause)}`)
  }
}

export function apply(ctx: Context): void {
  const reportHostError = reporter(ctx)

  ctx.router.route('/', architectureRoutes({ snapshot: () => inspectCordisContext(ctx, 'host') }, reportHostError))
  ctx.routerHttp.mount(PLUGIN_ADMIN_API_PREFIX)

  ctx.plugin({
    name: 'acryl-plugin-admin-lifecycle',
    inject: ['router', 'acrPluginLifecycle'],
    apply(child: Context): void {
      const view = new PluginLifecycleView(
        child,
        child.acrPluginLifecycle,
        () => (child.get('desktopPluginLifecycleBootstrap') as BlendBootstrap | undefined)?.blend
          ?? unlockedBlueprintSource(child.acrPluginLifecycle.snapshot().entries),
      )
      child.router.route('/', lifecycleRoutes(view, reportHostError))
    },
  })

  // Layer 1 of Agent Control: the agent lists and switches plugins through the same lifecycle service. It is a
  // separate child so a surface without the tool registry still gets the routes above.
  ctx.plugin({
    name: 'acryl-plugin-admin-agent-tools',
    inject: ['acrylTools', 'acrPluginLifecycle'],
    apply(child: Context): void {
      const view = new PluginLifecycleView(child, child.acrPluginLifecycle, () => undefined)
      child.effect(() => registerPluginTools(child, view), 'acryl-plugin-admin: plugin lifecycle agent tools')
    },
  })
}

export { PluginLifecycleView } from './lifecycle/view.ts'
export type { PluginLifecycleBlendSource } from './lifecycle/view.ts'
export type {
  PluginLifecycleBlendView,
  PluginLifecycleEntryView,
  PluginLifecycleFiberPhase,
  PluginLifecycleReceipt,
  PluginLifecycleSnapshot,
} from './lifecycle/contract.ts'

/** The agent's plugin tools, exported so the runtime can check their schemas against DSH's own compiler. */
export { registerPluginTools } from './tools/plugin-tools.ts'

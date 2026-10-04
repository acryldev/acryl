/**
 * Cordis Host plugin: the private routes behind Settings > Plugins > Lifecycle and Architecture, for every
 * surface. Nothing here is Desktop or Web specific.
 *
 * - The architecture route needs only the web server: it projects the live Cordis graph.
 * - The lifecycle routes are a dependency-gated child that mounts when a surface has published
 *   `ctx.acrPluginLifecycle` (both Desktop and Web do) and unmounts, without failing this plugin, when
 *   that service goes away.
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from 'acryl-control'
import { builtInCatalog } from 'acryl-harness-runtime'
import { inspectCordisContext } from './architecture/inspector.ts'
import { PLUGIN_ARCHITECTURE_PATH } from './architecture/contract.ts'
import { handlePluginArchitectureSnapshotRequest } from './architecture/route.ts'
import {
  PLUGIN_LIFECYCLE_DISABLE_PATH,
  PLUGIN_LIFECYCLE_ENABLE_PATH,
  PLUGIN_LIFECYCLE_PATH,
  PLUGIN_LIFECYCLE_RELOAD_PATH,
} from './lifecycle/contract.ts'
import {
  handlePluginLifecycleDisableRequest,
  handlePluginLifecycleEnableRequest,
  handlePluginLifecycleReloadRequest,
  handlePluginLifecycleSnapshotRequest,
} from './lifecycle/route.ts'
import { registerPluginTools } from './tools/plugin-tools.ts'
import { PluginLifecycleView, type PluginLifecycleBlendSource } from './lifecycle/view.ts'

export const name = 'acryl-plugin-admin'
export const inject = ['acrylWeb']

/** Optional Desktop-provided launcher state; a surface without it falls back to {@link unlockedBlueprintSource}. */
interface BlendBootstrap {
  readonly blend?: PluginLifecycleBlendSource
}

/**
 * Every surface (Web, CLI and Desktop alike) sets `ACRYL_BLUEPRINT_ID` at boot from the same shared composition
 * (`engine-dsh.ts`, spec 040 "Surface sharing") - reading it back here, rather than Desktop's own locked-Blend
 * bootstrap, is how a surface with no locked Blend (every Web session today) still reports an honest, real
 * identity instead of `null` (spec 040 T083). A custom, file-defined Blueprint outside the built-in catalog
 * still reports its real id; only its display `name` falls back to the id, since resolving a custom one's name
 * needs the full `blueprintFromEnvironment` (an `AppInstance`, not available at this shared layer).
 */
export function unlockedBlueprintSource(rows: readonly unknown[]): PluginLifecycleBlendSource | undefined {
  const id = process.env.ACRYL_BLUEPRINT_ID
  if (id === undefined || id === '') return undefined
  const name = builtInCatalog().get(id)?.name ?? id
  return { locked: false, id, name, rows }
}

/** The origin the routes accept requests from: the page is served by this same web server. */
function rendererOrigin(ctx: Context): string {
  return `http://127.0.0.1:${String(ctx.acrylWeb.port)}`
}

function reporter(ctx: Context): (operation: string, cause: unknown) => void {
  return (operation, cause) => {
    ctx.logger.error(`acryl-plugin-admin: failed to ${operation}: ${cause instanceof Error ? cause.message : String(cause)}`)
  }
}

export function apply(ctx: Context): void {
  const origin = rendererOrigin(ctx)
  const reportHostError = reporter(ctx)

  ctx.effect(
    () => ctx.acrylWeb.register({
      kind: 'exact',
      path: PLUGIN_ARCHITECTURE_PATH,
      handler: (req, res) => handlePluginArchitectureSnapshotRequest(
        req,
        res,
        origin,
        { snapshot: () => inspectCordisContext(ctx, 'host') },
        reportHostError,
      ),
    }),
    'acryl-plugin-admin: Cordis architecture route',
  )

  ctx.plugin({
    name: 'acryl-plugin-admin-lifecycle',
    inject: ['acrylWeb', 'acrPluginLifecycle'],
    apply(child: Context): void {
      const view = new PluginLifecycleView(
        child,
        child.acrPluginLifecycle,
        () => (child.get('desktopPluginLifecycleBootstrap') as BlendBootstrap | undefined)?.blend
          ?? unlockedBlueprintSource(child.acrPluginLifecycle.snapshot().entries),
      )
      const routes = [
        [PLUGIN_LIFECYCLE_PATH, handlePluginLifecycleSnapshotRequest],
        [PLUGIN_LIFECYCLE_ENABLE_PATH, handlePluginLifecycleEnableRequest],
        [PLUGIN_LIFECYCLE_DISABLE_PATH, handlePluginLifecycleDisableRequest],
        [PLUGIN_LIFECYCLE_RELOAD_PATH, handlePluginLifecycleReloadRequest],
      ] as const
      for (const [path, handler] of routes) {
        child.effect(
          () => child.acrylWeb.register({
            kind: 'exact',
            path,
            handler: (req, res) => handler(req, res, origin, view, reportHostError),
          }),
          `acryl-plugin-admin: plugin lifecycle route ${path}`,
        )
      }
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

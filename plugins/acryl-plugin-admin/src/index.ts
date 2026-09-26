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
import type {} from '@deepseek-ai/dsh-host-webserver'
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
import { PluginLifecycleView, type PluginLifecycleBlendSource } from './lifecycle/view.ts'

export const name = 'acryl-plugin-admin'
export const inject = ['webServer']

/** Optional Desktop-provided launcher state; other surfaces do not have it and the Blend view is then absent. */
interface BlendBootstrap {
  readonly blend?: PluginLifecycleBlendSource
}

/** The origin the routes accept requests from: the page is served by this same web server. */
function rendererOrigin(ctx: Context): string {
  return `http://127.0.0.1:${String(ctx.webServer.port)}`
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
    () => ctx.webServer.register({
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
    inject: ['webServer', 'acrPluginLifecycle'],
    apply(child: Context): void {
      const view = new PluginLifecycleView(
        child,
        child.acrPluginLifecycle,
        () => (child.get('desktopPluginLifecycleBootstrap') as BlendBootstrap | undefined)?.blend,
      )
      const routes = [
        [PLUGIN_LIFECYCLE_PATH, handlePluginLifecycleSnapshotRequest],
        [PLUGIN_LIFECYCLE_ENABLE_PATH, handlePluginLifecycleEnableRequest],
        [PLUGIN_LIFECYCLE_DISABLE_PATH, handlePluginLifecycleDisableRequest],
        [PLUGIN_LIFECYCLE_RELOAD_PATH, handlePluginLifecycleReloadRequest],
      ] as const
      for (const [path, handler] of routes) {
        child.effect(
          () => child.webServer.register({
            kind: 'exact',
            path,
            handler: (req, res) => handler(req, res, origin, view, reportHostError),
          }),
          `acryl-plugin-admin: plugin lifecycle route ${path}`,
        )
      }
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

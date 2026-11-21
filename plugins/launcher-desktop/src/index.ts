/**
 * Cordis Host plugin: the routes behind the ACRYL screen, the first screen of the desktop app (spec 050 T012). It lists the apps in the ACRYL home's
 * `apps.json`, adds, removes, makes, starts and stops them, and stops everything it started when it unloads.
 * Capability boundary: the list and what runs on this machine (one service, `LauncherService`); the drawing is the Client half.
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@acryldev/blends/cordis/router'
import type {} from '@acryldev/blends/cordis/router-http'
import { LAUNCHER_API_PREFIX } from './contract.ts'
import { createNodeLauncher } from './node.ts'
import { registerLauncherTools } from './tools.ts'
import { launcherRoutes } from './route.ts'

export const name = 'acryl-launcher-desktop'

/** The part of the runtime's `appInstance` service ACRYL plugins read (every plugin declares exactly this shape, so the augmentations agree). */
interface AppInstanceService {
  readonly home: string
  readonly dshHome: string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    appInstance: AppInstanceService
  }
}

export const inject = ['router', 'routerHttp', 'appInstance']

export function apply(ctx: Context): void {
  const service = createNodeLauncher(ctx.appInstance.home)
  void service.prepareTools()
  const report = (operation: string, cause: unknown): void => {
    ctx.logger.error(`@acryldev/launcher-desktop: failed to ${operation}: ${cause instanceof Error ? cause.message : String(cause)}`)
  }
  // Every process this plugin started goes with it, whether it unloads or the app quits.
  ctx.effect(() => () => {
    const kept = service.stopAll()
    if (kept.length > 0) ctx.logger.info(`left open (a Desktop app with its window up; closing the window stops it): ${kept.join(', ')}`)
  }, '@acryldev/launcher-desktop: apps it started')
  // The launcher as tools, for the DSH chat and, through @acryldev/agent-control's gateway, for Claude Code and Codex. Optional: with no tool registry nothing is lost.
  ctx.inject(['acrylTools'], (child) => {
    child.effect(() => registerLauncherTools(child, service), '@acryldev/launcher-desktop: launcher tools')
  })
  ctx.router.route('/', launcherRoutes(service, report))
  ctx.routerHttp.mount(LAUNCHER_API_PREFIX)
}

export { LauncherRefusal, LauncherService } from './service.ts'
export * from './contract.ts'

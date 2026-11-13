/**
 * The launcher's Host half as a plugin of a Blends app (spec 050 T016), copied into the app by `scripts/launcher-blend.mjs` next to the shared sources of
 * `plugins/acryl-launcher-desktop/src`. Cordis Host plugin: the routes behind the ACRYL screen, the first screen of the desktop app (spec 050 T012). It lists the apps in the ACRYL home's
 * `apps.json`, adds, removes, makes, starts and stops them, and stops everything it started when it unloads.
 * Capability boundary: the list and what runs on this machine (one service, `LauncherService`); the drawing is the Client half.
 */
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from 'acrylblends/cordis/router'
import type {} from 'acrylblends/cordis/router-http'
import { LAUNCHER_API_PREFIX } from './contract.ts'
import { fileDoor } from './door.ts'
import { readBlends } from './registry.ts'
import { launcherRoutes } from './route.ts'
import { spawnRunner } from './runner.ts'
import { LauncherService } from './service.ts'

export const name = 'acryl-launcher-host'

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

export const inject = ['router', 'routerHttp']

export function apply(ctx: Context): void {
  // The ACRYL home this launcher lists and makes apps in, given by `pnpm launcher blend` (the home's own selector is in the ACRYL app, not in a Blend).
  const home = process.env['ACRYL_LAUNCHER_HOME'] ?? join(process.cwd(), '.acryl-launcher-home')
  const service = new LauncherService({
    home,
    // The visible folder next to ACRYL's hidden home (`~/.acryl` and `~/ACRYL`): the home's parent, never a looked-up user folder.
    appsFolder: join(dirname(home), 'ACRYL'),
    runner: spawnRunner,
    environment: () => process.env,
    exists: path => existsSync(path),
    makeFolder: (path) => { mkdirSync(path, { recursive: true }) },
    blends: () => readBlends(),
    door: fileDoor(),
  })
  const report = (operation: string, cause: unknown): void => {
    ctx.logger.error(`acryl-launcher-desktop: failed to ${operation}: ${cause instanceof Error ? cause.message : String(cause)}`)
  }
  // Every process this plugin started goes with it, whether it unloads or the app quits.
  ctx.effect(() => () => { service.stopAll() }, 'acryl-launcher-desktop: apps it started')
  ctx.router.route('/', launcherRoutes(service, report))
  ctx.routerHttp.mount('/app' + LAUNCHER_API_PREFIX)
}

export { LauncherRefusal, LauncherService } from './service.ts'
export * from './contract.ts'

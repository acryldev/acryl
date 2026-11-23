/**
 * The launcher's Host half as a plugin of a Blends app (spec 050 T016), copied into the app by `scripts/launcher-blend.mjs` next to the shared sources of
 * `plugins/launcher-desktop/src`. Cordis Host plugin: the routes behind the ACRYL screen, the first screen of the desktop app (spec 050 T012). It lists the apps in the ACRYL home's
 * `apps.json`, adds, removes, makes, starts and stops them, and stops everything it started when it unloads.
 * Capability boundary: the list and what runs on this machine (one service, `LauncherService`); the drawing is the Client half.
 */
import { existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@acryldev/blends/cordis/router'
import type {} from '@acryldev/blends/cordis/router-http'
import { LAUNCHER_API_PREFIX } from './contract.ts'
import { fileDoor } from './door.ts'
import { readBlends } from './registry.ts'
import { nodeSelfFiles } from './self-update.ts'
import { launcherRoutes } from './route.ts'
import { spawnRunner } from './runner.ts'
import { LauncherService } from './service.ts'

export const name = 'acryl-launcher-host'

export const inject = ['router', 'routerHttp']

export function apply(ctx: Context): void {
  // The ACRYL home this launcher lists and makes apps in: `~/.acryl`, the one home of every ACRYL app; `ACRYL_LAUNCHER_HOME` moves it (tests, `pnpm launcher blend`).
  const home = process.env['ACRYL_LAUNCHER_HOME'] ?? join(homedir(), '.acryl')
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
    // The copy this app runs from (`acryl --gui` keeps it in ~/.acryl/control-center): the Host runs in its folder. It offers its own updates.
    self: { folder: process.cwd(), name: 'ACRYL Control Center', files: nodeSelfFiles, startedAt: Date.now() - process.uptime() * 1000 },
  })
  const report = (operation: string, cause: unknown): void => {
    ctx.logger.error(`@acryldev/launcher-desktop: failed to ${operation}: ${cause instanceof Error ? cause.message : String(cause)}`)
  }
  // Every process this plugin started goes with it, whether it unloads or the app quits.
  ctx.effect(() => () => {
    const kept = service.stopAll()
    if (kept.length > 0) ctx.logger.info(`left open (a Desktop app with its window up; closing the window stops it): ${kept.join(', ')}`)
  }, '@acryldev/launcher-desktop: apps it started')
  ctx.router.route('/', launcherRoutes(service, report))
  ctx.routerHttp.mount('/app' + LAUNCHER_API_PREFIX)
}

export { LauncherRefusal, LauncherService } from './service.ts'
export * from './contract.ts'

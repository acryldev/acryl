/**
 * The JSON-file provider of the `kv` port (spec 049 slice 3): one file, rewritten atomically on every write, opened with the plain
 * `openKv` and provided as `kv` by this Cordis plugin. App plugins declare `inject: ['kv']` and import types from `acryl-kv` only, so
 * replacing this row with `acryl-kv-db` does not touch them.
 *
 * Unloading withdraws `kv` first, so consumers stop calling, and then closes the store: the close waits for the writes in flight.
 */

import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { KV_SERVICE } from 'acryl-kv'
import { openKv } from './open.ts'

export { openKv, type OpenKvOptions } from './open.ts'

/** Stable Cordis plugin name, equal to the package name and the Loader row id. */
export const name = 'acryl-kv-json'

/**
 * What this plugin reads of the runtime's optional `appInstance` service: its home folder. The service belongs to the runtime (and to an
 * app's own instance plugin), so this plugin declares no type for it on Cordis' Context; it checks the one field it uses at runtime.
 */
interface AppHome {
  readonly home: string
}

function isAppHome(value: unknown): value is AppHome {
  return typeof value === 'object' && value !== null && 'home' in value && typeof value.home === 'string'
}

export interface Config {
  path?: string
}

export const Config: z<Config> = z.object({
  path: z.string().description('The JSON file, absolute or relative to the app. Defaults to kv.json in the ACRYL app home; required where there is none.'),
})

/** The file name used in the app home when `path` is not configured. */
export const DEFAULT_FILE = 'kv.json'

/** The project folder of an acrylblends app (`appInstance.root`), when the instance has one: where a relative path in a row's config is read from, since such an app has no Loader base URL. */
function appRoot(value: unknown): string | undefined {
  return typeof value === 'object' && value !== null && 'root' in value && typeof value.root === 'string' ? value.root : undefined
}

/** A configured path as a file path: absolute as given, relative to the Loader's base URL (the app) otherwise, or to the app's project folder (`appInstance.root`) where there is no base URL. */
function resolveFromApp(ctx: Context, path: string): string {
  if (path.startsWith('file:')) return fileURLToPath(path)
  if (isAbsolute(path)) return path
  const base = ctx.baseUrl
  if (base === undefined || !base.startsWith('file:')) {
    const root = appRoot(ctx.get('appInstance'))
    if (root !== undefined) return resolve(root, path)
    throw new Error(`acryl-kv-json: path ${JSON.stringify(path)} is relative, but this app has no file base URL to resolve it from; give an absolute path`)
  }
  const appDir = base.endsWith('/') ? fileURLToPath(base) : dirname(fileURLToPath(base))
  return resolve(appDir, path)
}

export async function apply(ctx: Context, rawConfig: Config = {}): Promise<void> {
  const config = Config(rawConfig)
  // The app home comes from the runtime's `appInstance` service when this runs inside an ACRYL app; a plain framework app names its file.
  const appInstance: unknown = ctx.get('appInstance')
  let file: string
  if (config.path !== undefined) file = resolveFromApp(ctx, config.path)
  else if (isAppHome(appInstance)) file = join(appInstance.home, DEFAULT_FILE)
  else throw new Error('acryl-kv-json: no file path; set `path` in this row\'s config (there is no ACRYL app home to default to)')

  // Disposers run in reverse: the service is withdrawn before the store closes.
  await ctx.effect(async function* () {
    const opened = await openKv({ path: file })
    yield () => opened.close()
    yield ctx.reflect.provide(KV_SERVICE, opened.kv)
  }, `acryl-kv-json: ${file}`)
}

/**
 * The embedded Postgres provider of the `db` port (spec 049 slice 2b): PGlite, with its cluster in one folder of the app home, migrated,
 * and provided as `db`. The step between SQLite and a Postgres server: the same Postgres dialect as `acryl-db-postgres` (which this
 * shares its `?` translation with), and no server to run. App plugins declare `inject: ['db']` and import types from `acrylblends/db` only, so
 * replacing `acrylblends/cordis/db-sqlite` with this row does not touch them. The plugin is a thin wrapper over `openDb` (`acryl-db-pglite/open`), the
 * same opening for code without Cordis.
 *
 * Unloading withdraws `db` first, so consumers stop calling, and then closes PGlite once the running calls finish, which writes the
 * folder out and releases its lock.
 */

import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { DB_SERVICE } from 'acrylblends/db'
import type {} from 'acrylblends/cordis/db'
import { openDb } from './open.ts'

export { LOCK_FILE } from './folder-lock.ts'
export { IN_MEMORY, openDb, type OpenDb, type OpenDbOptions } from './open.ts'

/** Stable Cordis plugin name, equal to the package name and the Loader row id. */
export const name = 'acryl-db-pglite'

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
  dataDir?: string
  migrations?: string
}

export const Config: z<Config> = z.object({
  dataDir: z.string().description('The folder that holds the database, absolute or relative to the app. Defaults to pglite in the ACRYL app home; required where there is none.'),
  migrations: z.string().description('A folder of NNN-name.sql files numbered from 1, absolute or relative to the app, applied in order on start.'),
})

/** The folder name used in the app home when `dataDir` is not configured. */
export const DEFAULT_FOLDER = 'pglite'

/** A configured path as a file path: absolute as given, relative to the Loader's base URL (the app) otherwise. */
function resolveFromApp(ctx: Context, path: string, option: string): string {
  if (path.startsWith('file:')) return fileURLToPath(path)
  if (isAbsolute(path)) return path
  const base = ctx.baseUrl
  if (base === undefined || !base.startsWith('file:')) {
    throw new Error(`acryl-db-pglite: ${option} ${JSON.stringify(path)} is relative, but this app has no file base URL to resolve it from; give an absolute path`)
  }
  const appDir = base.endsWith('/') ? fileURLToPath(base) : dirname(fileURLToPath(base))
  return resolve(appDir, path)
}

export async function apply(ctx: Context, rawConfig: Config = {}): Promise<void> {
  const config = Config(rawConfig)
  // The app home comes from the runtime's `appInstance` service when this runs inside an ACRYL app; a plain framework app names its folder.
  const appInstance: unknown = ctx.get('appInstance')
  let dataDir: string
  if (config.dataDir !== undefined) dataDir = resolveFromApp(ctx, config.dataDir, 'dataDir')
  else if (isAppHome(appInstance)) dataDir = join(appInstance.home, DEFAULT_FOLDER)
  else throw new Error('acryl-db-pglite: no data folder; set `dataDir` in this row\'s config (there is no ACRYL app home to default to)')
  const migrations = config.migrations === undefined ? undefined : resolveFromApp(ctx, config.migrations, 'migrations')
  const options = { dataDir, ...(migrations === undefined ? {} : { migrations }) }

  // Disposers run in reverse: the service is withdrawn before PGlite closes.
  await ctx.effect(async function* () {
    const opened = await openDb(options)
    yield () => opened.close()
    yield ctx.reflect.provide(DB_SERVICE, opened.db)
  }, `acryl-db-pglite: ${dataDir}`)
}

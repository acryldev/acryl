/**
 * The SQLite provider of the `db` port (spec 049 slice 1): one `node:sqlite` file, opened with the ported facade's settings (WAL,
 * `synchronous = NORMAL`, a busy timeout), migrated, and provided as `db`. App plugins declare `inject: ['db']` and import types from
 * `acryl-db` only, so replacing this row with another provider does not touch them. The plugin is a thin wrapper over `openDb`
 * (`acryl-db-sqlite/open`), the same opening for code without Cordis.
 *
 * Unloading withdraws `db` first, so consumers stop calling, and then closes the file: the close waits for running operations and
 * transactions, checkpoints the WAL and releases the file.
 */

import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { DB_SERVICE } from 'acryl-db'
import type {} from 'acryl-db/cordis'
import { openDb } from './open.ts'

export { NodeSqliteDatabase, openNodeSqliteDatabase, type NodeSqliteDatabaseOptions } from './facade/node.ts'
export { openDb, type OpenDb, type OpenDbOptions } from './open.ts'

/** Stable Cordis plugin name, equal to the package name and the Loader row id. */
export const name = 'acryl-db-sqlite'

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
  migrations?: string
  busyTimeoutMs?: number
  walAutoCheckpointPages?: number
}

export const Config: z<Config> = z.object({
  path: z.string().description('The database file, absolute or relative to the app. Defaults to data.sqlite in the ACRYL app home; required where there is none.'),
  migrations: z.string().description('A folder of NNN-name.sql files numbered from 1, absolute or relative to the app, applied in order on start.'),
  busyTimeoutMs: z.natural().description('How long SQLite waits for a competing file lock, in milliseconds. Defaults to 5000.'),
  walAutoCheckpointPages: z.natural().description('The WAL auto-checkpoint threshold in pages; 0 disables it. Defaults to 1000.'),
})

/** The file name used in the app home when `path` is not configured. */
export const DEFAULT_FILE = 'data.sqlite'

/** A configured path as a file path: absolute as given, relative to the Loader's base URL (the app) otherwise. */
function resolveFromApp(ctx: Context, path: string, option: string): string {
  if (path.startsWith('file:')) return fileURLToPath(path)
  if (isAbsolute(path)) return path
  const base = ctx.baseUrl
  if (base === undefined || !base.startsWith('file:')) {
    throw new Error(`acryl-db-sqlite: ${option} ${JSON.stringify(path)} is relative, but this app has no file base URL to resolve it from; give an absolute path`)
  }
  const appDir = base.endsWith('/') ? fileURLToPath(base) : dirname(fileURLToPath(base))
  return resolve(appDir, path)
}

export async function apply(ctx: Context, rawConfig: Config = {}): Promise<void> {
  const config = Config(rawConfig)
  // The app home comes from the runtime's `appInstance` service when this runs inside an ACRYL app; a plain framework app names its file.
  const appInstance: unknown = ctx.get('appInstance')
  let file: string
  if (config.path !== undefined) file = resolveFromApp(ctx, config.path, 'path')
  else if (isAppHome(appInstance)) file = join(appInstance.home, DEFAULT_FILE)
  else throw new Error('acryl-db-sqlite: no database path; set `path` in this row\'s config (there is no ACRYL app home to default to)')
  const migrations = config.migrations === undefined ? undefined : resolveFromApp(ctx, config.migrations, 'migrations')
  const options = {
    path: file,
    ...(migrations === undefined ? {} : { migrations }),
    ...(config.busyTimeoutMs === undefined ? {} : { busyTimeoutMs: config.busyTimeoutMs }),
    ...(config.walAutoCheckpointPages === undefined ? {} : { walAutoCheckpointPages: config.walAutoCheckpointPages }),
  }

  // Disposers run in reverse: the service is withdrawn before the file closes.
  await ctx.effect(async function* () {
    const opened = await openDb(options)
    yield () => opened.close()
    yield ctx.reflect.provide(DB_SERVICE, opened.db)
  }, `acryl-db-sqlite: ${file}`)
}

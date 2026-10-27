/**
 * The Postgres provider of the `db` port (spec 049 slice 2): one connection to a Postgres or Supabase server, migrated, and provided as
 * `db`. App plugins declare `inject: ['db']` and import types from `acryl-db` only, so replacing `acryl-db-sqlite` with this row does not
 * touch them. The plugin is a thin wrapper over `openDb` (`acryl-db-postgres/open`), the same opening for code without Cordis.
 *
 * Unloading withdraws `db` first, so consumers stop calling, and then closes the connection once the running calls finish.
 */

import { dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { DB_SERVICE } from 'acrylblends/db'
import type {} from 'acrylblends/cordis/db'
import { openDb } from './open.ts'

export { PostgresDatabase, type PostgresDatabaseOptions } from './database.ts'
export { openDb, type OpenDb, type OpenDbOptions } from './open.ts'
export { translatePlaceholders, type TranslatedSql } from './placeholders.ts'

/** Stable Cordis plugin name, equal to the package name and the Loader row id. */
export const name = 'acryl-db-postgres'

export interface Config {
  url?: string
  migrations?: string
}

export const Config: z<Config> = z.object({
  url: z.string().description('The connection string, postgres://user:password@host:5432/database. Defaults to the DATABASE_URL environment variable.'),
  migrations: z.string().description('A folder of NNN-name.sql files numbered from 1, absolute or relative to the app, applied in order on start.'),
})

/** The environment variable read when `url` is not configured, as Postgres hosts (Supabase, Heroku, Fly, Render) name it. */
export const URL_VARIABLE = 'DATABASE_URL'

/** A configured folder as a file path: absolute as given, relative to the Loader's base URL (the app) otherwise. */
function resolveFromApp(ctx: Context, path: string): string {
  if (path.startsWith('file:')) return fileURLToPath(path)
  if (isAbsolute(path)) return path
  const base = ctx.baseUrl
  if (base === undefined || !base.startsWith('file:')) {
    throw new Error(`acryl-db-postgres: migrations ${JSON.stringify(path)} is relative, but this app has no file base URL to resolve it from; give an absolute path`)
  }
  const appDir = base.endsWith('/') ? fileURLToPath(base) : dirname(fileURLToPath(base))
  return resolve(appDir, path)
}

export async function apply(ctx: Context, rawConfig: Config = {}): Promise<void> {
  const config = Config(rawConfig)
  const url = config.url ?? process.env[URL_VARIABLE]
  if (url === undefined || url === '') throw new Error(`acryl-db-postgres: no database; set \`url\` in this row's config or the ${URL_VARIABLE} environment variable`)
  const migrations = config.migrations === undefined ? undefined : resolveFromApp(ctx, config.migrations)
  const options = { url, ...(migrations === undefined ? {} : { migrations }) }

  // Disposers run in reverse: the service is withdrawn before the connection closes. The label names the server, never the credentials.
  await ctx.effect(async function* () {
    const opened = await openDb(options)
    yield () => opened.close()
    yield ctx.reflect.provide(DB_SERVICE, opened.db)
  }, `acryl-db-postgres: ${describeServer(url)}`)
}

/** `host:port/database` of a connection string, for diagnostics: no user, no password, no parameters. */
function describeServer(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.hostname}${parsed.port === '' ? '' : `:${parsed.port}`}${parsed.pathname}`
  } catch {
    return 'a server (unparsable connection string)'
  }
}

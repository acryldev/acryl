/**
 * The kv provider over the `db` port (spec 049 slice 3): a `kv` table in the app's SQL database, provided as `kv` by this Cordis plugin.
 * It injects `db` and nothing else, so it stays PENDING until a `db` provider (`acryl-db-sqlite`, later Postgres) is active, and its
 * consumers (`inject: ['kv']`) wait behind it. Replacing the row with `acryl-kv-json` does not touch them.
 *
 * It owns no connection, so unloading only withdraws `kv`.
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { KV_SERVICE } from 'acryl-kv'
import { kvOnDb } from './open.ts'

export { kvOnDb, type KvOnDbOptions } from './open.ts'

/** Stable Cordis plugin name, equal to the package name and the Loader row id. */
export const name = 'acryl-kv-db'

/** The service this plugin needs: Cordis starts it only while a `db` provider is active. */
export const inject = ['db']

export interface Config {
  table?: string
}

export const Config: z<Config> = z.object({
  table: z.string().description('The table that holds the documents. Defaults to kv.'),
})

export async function apply(ctx: Context, rawConfig: Config = {}): Promise<void> {
  const config = Config(rawConfig)
  const db = ctx.get('db') as Parameters<typeof kvOnDb>[0]
  const kv = kvOnDb(db, config.table === undefined ? {} : { table: config.table })
  await ctx.effect(async function* () {
    yield ctx.reflect.provide(KV_SERVICE, kv)
  }, 'acryl-kv-db')
}

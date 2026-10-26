/**
 * `pg`, loaded when a database is opened rather than when this module is. acrylblends ships the provider as `acrylblends/db/postgres` with
 * `pg` as an optional peer dependency, so an app that imports the framework but never opens Postgres needs no `pg` installed.
 */

import type pg from 'pg'

export type PgDriver = typeof pg

export const MISSING_PG = 'acrylblends/db/postgres needs the pg package: npm install pg'

/**
 * The `pg` module. `load` is the import itself, replaced only by tests.
 * @throws an Error with {@link MISSING_PG} (the import's error as its cause) when `pg` is not installed; any other import error as it is.
 */
export async function loadPg(load: () => Promise<{ default: PgDriver }> = () => import('pg')): Promise<PgDriver> {
  try {
    return (await load()).default
  } catch (error) {
    if (isMissingPg(error)) throw new Error(MISSING_PG, { cause: error })
    throw error
  }
}

/** Node and Bun report a missing package as `ERR_MODULE_NOT_FOUND` naming it; a package `pg` itself needs that is missing is not this. */
function isMissingPg(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const code = (error as Error & { code?: unknown }).code
  return (code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND') && /['"]pg['"]/u.test(error.message)
}

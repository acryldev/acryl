/**
 * The `db` port: what an app plugin sees of its relational database, whichever provider (`acryl-db-sqlite`, `acryl-db-postgres`) serves
 * it. An app plugin imports these types, declares `inject: ['db']`, and never imports a driver.
 *
 * Bindings are positional `?` placeholders on every provider; a provider whose database spells them differently translates them.
 */

import type {} from '@deepseek-ai/cordis'
import type { Db } from './facade/database.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    db: Db
  }
}

/** The service name every `db` provider registers. */
export const DB_SERVICE = 'db'

/** The table that records an app's migration version. */
export const MIGRATIONS_TABLE = '_migrations'

export type { Db, DbExecutor, SqlValue } from './facade/database.ts'
export { applyMigrations, type Migration } from './facade/migrations.ts'
export { validateSchemaPrefix } from './facade/schema.ts'
export { readMigrationFiles } from './migration-files.ts'

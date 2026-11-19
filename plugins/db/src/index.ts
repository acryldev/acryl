/**
 * The `db` port: what an app's code sees of its relational database, whichever provider (`acryl-db-sqlite`, `acryl-db-postgres`) serves
 * it. Plain code (an acrylblends app) opens a database with a provider's `openDb`; a Cordis plugin declares `inject: ['db']`, imports
 * `acryl-db/cordis` for the `ctx.db` type, and never imports a driver.
 *
 * Bindings are positional `?` placeholders on every provider; a provider whose database spells them differently translates them.
 * This entry imports nothing from Cordis, at runtime or in its types.
 */

/** The service name every `db` provider registers. */
export const DB_SERVICE = 'db'

/** The table that records an app's migration version. */
export const MIGRATIONS_TABLE = '_migrations'

export type { Db, DbExecutor, SqlValue } from './facade/database.ts'
export { applyMigrations, type Migration } from './facade/migrations.ts'
export { validateSchemaPrefix } from './facade/schema.ts'
export { readMigrationFiles } from './migration-files.ts'

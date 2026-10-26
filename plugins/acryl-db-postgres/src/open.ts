/**
 * The plain way to open the Postgres provider, for code without Cordis (an acrylblends app): `openDb({ url, migrations })` connects to a
 * Postgres or Supabase server, applies the numbered migrations, and resolves the `db` port with the function that closes it. The Cordis
 * plugin is a thin wrapper over this, so both run one code path. This entry imports nothing from Cordis.
 */

import { applyMigrations, MIGRATIONS_TABLE, readMigrationFiles, type Db, type SqlValue } from 'acryl-db'
import { PostgresDatabase } from './database.ts'

export type { Db, DbExecutor, SqlValue } from 'acryl-db'

export interface OpenDbOptions {
  /** A connection string, such as `process.env.DATABASE_URL`: `postgres://user:password@host:5432/database?sslmode=require`. */
  readonly url: string
  /** A folder of `NNN-name.sql` files numbered from 1, as a path or a file URL, applied in order before `openDb` resolves. */
  readonly migrations?: string | URL
}

/** An open database: the port, and the one function that closes it. */
export interface OpenDb {
  readonly db: Db
  /** Waits for running operations and transactions, then closes the connection. Calling it again waits for the same close. */
  close(): Promise<void>
}

/**
 * Connect to and migrate a Postgres database. Foreign keys are always enforced by Postgres.
 * @throws when `pg` is not installed (acrylblends lists it as an optional peer dependency), the migration files are misnamed or
 *   misnumbered, the server cannot be reached, a migration fails (the connection is closed, and the schema unchanged: Postgres rolls DDL
 *   back with the transaction), or the database's schema is newer than the migrations.
 */
export async function openDb(options: OpenDbOptions): Promise<OpenDb> {
  const migrations = options.migrations === undefined ? [] : await readMigrationFiles(options.migrations)
  const database = await PostgresDatabase.create({ url: options.url })
  try {
    await applyMigrations(database, migrations, { table: MIGRATIONS_TABLE })
  } catch (error) {
    await database.close()
    throw error
  }
  // The port, not the adapter: the code that receives `db` gets no `close`, which belongs to whoever opened it.
  const db: Db = {
    exec: sql => database.exec(sql),
    run: (sql, ...params) => database.run(sql, ...params),
    get: <T extends object>(sql: string, ...params: SqlValue[]) => database.get<T>(sql, ...params),
    all: <T extends object>(sql: string, ...params: SqlValue[]) => database.all<T>(sql, ...params),
    transaction: work => database.transaction(work),
  }
  return { db, close: () => database.close() }
}

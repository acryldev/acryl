/**
 * The plain way to open the PGlite provider, for code without Cordis (an acrylblends app): `openDb({ dataDir, migrations })` opens an
 * embedded Postgres whose cluster lives in one folder (created on the first open), applies the numbered migrations, and resolves the `db`
 * port with the function that closes it. The Cordis plugin is a thin wrapper over this, so both run one code path. This entry imports
 * nothing from Cordis.
 */

import { mkdirSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { applyMigrations, MIGRATIONS_TABLE, readMigrationFiles, type Db, type SqlValue } from 'acryl-db'
import { PgliteDatabase } from './database.ts'
import { lockFolder } from './folder-lock.ts'

export type { Db, DbExecutor, SqlValue } from 'acryl-db'

/** The `dataDir` of a database that lives in memory until `close`. */
export const IN_MEMORY = 'memory://'

export interface OpenDbOptions {
  /** The folder that holds the database, created if missing; {@link IN_MEMORY} for one that lives until `close`. */
  readonly dataDir: string
  /** A folder of `NNN-name.sql` files numbered from 1, as a path or a file URL, applied in order before `openDb` resolves. */
  readonly migrations?: string | URL
}

/** An open database: the port, and the one function that closes it. */
export interface OpenDb {
  readonly db: Db
  /** Waits for running operations and transactions, then closes PGlite and releases the folder. Calling it again waits for the same close. */
  close(): Promise<void>
}

/**
 * Open and migrate an embedded Postgres. Foreign keys are always enforced by Postgres.
 * @throws when the folder is already open (in this process or another), the migration files are misnamed or misnumbered, a migration
 *   fails (the database is closed, and the schema unchanged: Postgres rolls DDL back with the transaction), or the database's schema is
 *   newer than the migrations.
 */
export async function openDb(options: OpenDbOptions): Promise<OpenDb> {
  const migrations = options.migrations === undefined ? [] : await readMigrationFiles(options.migrations)
  const inMemory = options.dataDir === IN_MEMORY
  if (!inMemory) mkdirSync(options.dataDir, { recursive: true, mode: 0o700 })
  const lock = inMemory ? undefined : lockFolder(options.dataDir)
  let database: PgliteDatabase
  try {
    database = new PgliteDatabase(await PGlite.create(inMemory ? undefined : options.dataDir))
  } catch (error) {
    lock?.release()
    throw error
  }
  const close = async (): Promise<void> => {
    try {
      await database.close()
    } finally {
      lock?.release()
    }
  }
  try {
    await applyMigrations(database, migrations, { table: MIGRATIONS_TABLE })
  } catch (error) {
    await close()
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
  let closing: Promise<void> | undefined
  return { db, close: () => (closing ??= close()) }
}

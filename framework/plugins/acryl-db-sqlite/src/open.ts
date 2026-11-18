/**
 * The plain way to open the SQLite provider, for code without Cordis (an acrylblends app): `openDb({ path, migrations })` opens one
 * `node:sqlite` file with the ported facade's settings (WAL, `synchronous = NORMAL`, a busy timeout) and foreign keys enforced, applies the
 * numbered migrations, and resolves the `db` port with the function that closes it. The Cordis plugin is a thin wrapper over this, so both
 * run one code path.
 * This entry imports nothing from Cordis.
 */

import { applyMigrations, MIGRATIONS_TABLE, readMigrationFiles, type Db, type SqlValue } from 'acryl-db'
import { openNodeSqliteDatabase } from './facade/node.ts'

export type { Db, DbExecutor, SqlValue } from 'acryl-db'

export interface OpenDbOptions {
  /** The database file, its folder created if missing; `:memory:` for a database that lives until `close`. */
  readonly path: string
  /** A folder of `NNN-name.sql` files numbered from 1, as a path or a file URL, applied in order before `openDb` resolves. */
  readonly migrations?: string | URL
  /** How long SQLite waits for a competing file lock, in milliseconds. Defaults to 5000. */
  readonly busyTimeoutMs?: number
  /** The WAL auto-checkpoint threshold in pages; 0 disables it. Defaults to 1000. */
  readonly walAutoCheckpointPages?: number
}

/** An open database: the port, and the one function that closes it. */
export interface OpenDb {
  readonly db: Db
  /** Waits for running operations and transactions, checkpoints the WAL and releases the file. Calling it again does nothing. */
  close(): Promise<void>
}

/**
 * Open, configure and migrate a SQLite database.
 * @throws when the migration files are misnamed or misnumbered, or a migration fails (the file is closed, and unchanged), or the
 *   database's schema is newer than the migrations.
 */
export async function openDb(options: OpenDbOptions): Promise<OpenDb> {
  const migrations = options.migrations === undefined ? [] : await readMigrationFiles(options.migrations)
  const database = await openNodeSqliteDatabase(options.path, {
    ...(options.busyTimeoutMs === undefined ? {} : { busyTimeoutMs: options.busyTimeoutMs }),
    ...(options.walAutoCheckpointPages === undefined ? {} : { walAutoCheckpointPages: options.walAutoCheckpointPages }),
  })
  try {
    // Off by default in SQLite, per connection, and ignored inside a transaction: set here, before the migrations' transaction. The port
    // promises it (`ON DELETE CASCADE` works on every provider).
    await database.exec('PRAGMA foreign_keys = ON')
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

/**
 * The `db` port over PGlite, Postgres compiled to WebAssembly and run in this process. PGlite is one backend session, so the port's
 * contract is one call-order chain over it: every call runs after the calls made before it, and a transaction holds the chain from
 * `BEGIN` until it commits or rolls back. PGlite's own value parsing already matches the port (an `int8` beyond the safe range as a
 * `bigint`, `bytea` as a `Uint8Array`, `numeric` as text), so values pass through as they are.
 */

import type { PGlite } from '@electric-sql/pglite'
import type { Db, DbExecutor, SqlValue } from 'acryl-db'
import { bindStatement } from 'acryl-db-postgres/dialect'

const PROVIDER = 'acryl-db-pglite'

type Query = (sql: string, params: readonly SqlValue[]) => Promise<{ rows: Record<string, unknown>[]; affectedRows?: number }>

/** One statement, or several in `exec`, behind `guard`: nothing for direct calls, the transaction's liveness for its handle. */
function executor(pglite: PGlite, guard: <R>(work: () => Promise<R>) => Promise<R>): DbExecutor {
  const query: Query = (sql, params) => guard(() => pglite.query<Record<string, unknown>>(bindStatement(PROVIDER, sql, params.length), [...params]))
  return {
    exec: sql => guard(async () => { await pglite.exec(sql) }),
    run: async (sql, ...params) => ({ changes: (await query(sql, params)).affectedRows ?? 0 }),
    get: async <T extends object>(sql: string, ...params: SqlValue[]) => (await query(sql, params)).rows[0] as T | undefined,
    all: async <T extends object>(sql: string, ...params: SqlValue[]) => (await query(sql, params)).rows as T[],
  }
}

export class PgliteDatabase implements Db {
  private readonly pglite: PGlite
  private tail: Promise<unknown> = Promise.resolve()
  private closing: Promise<void> | undefined
  private readonly direct: DbExecutor

  constructor(pglite: PGlite) {
    this.pglite = pglite
    this.direct = executor(pglite, work => work())
  }

  /** Run `operation` after everything called before it. */
  private serial<T>(operation: () => Promise<T>): Promise<T> {
    if (this.closing !== undefined) return Promise.reject(new Error(`${PROVIDER}: the database is closed`))
    const result = this.tail.then(operation)
    this.tail = result.catch(() => undefined)
    return result
  }

  exec(sql: string): Promise<void> {
    return this.serial(() => this.direct.exec(sql))
  }

  run(sql: string, ...params: SqlValue[]): Promise<{ readonly changes: number }> {
    return this.serial(() => this.direct.run(sql, ...params))
  }

  get<T extends object>(sql: string, ...params: SqlValue[]): Promise<T | undefined> {
    return this.serial(() => this.direct.get<T>(sql, ...params))
  }

  all<T extends object>(sql: string, ...params: SqlValue[]): Promise<T[]> {
    return this.serial(() => this.direct.all<T>(sql, ...params))
  }

  transaction<T>(callback: (transaction: DbExecutor) => Promise<T>): Promise<T> {
    return this.serial(async () => {
      await this.pglite.exec('BEGIN')
      const scope = { active: true }
      const handle = executor(this.pglite, async (work) => {
        if (!scope.active) throw new Error(`${PROVIDER}: transaction handle is no longer active`)
        return work()
      })
      try {
        const result = await callback(handle)
        scope.active = false
        await this.pglite.exec('COMMIT')
        return result
      } catch (error) {
        scope.active = false
        try {
          await this.pglite.exec('ROLLBACK')
        } catch (rollbackError) {
          throw new AggregateError([error, rollbackError], 'PGlite transaction failed and rollback failed')
        }
        throw error
      }
    })
  }

  /** Wait for every call made before it, then close PGlite, which writes its data folder out. A second call waits for the same close. */
  close(): Promise<void> {
    this.closing ??= this.tail.then(() => this.pglite.close())
    return this.closing
  }
}

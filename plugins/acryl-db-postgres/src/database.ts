/**
 * The `db` port over a Postgres server, through `pg`. One pooled connection (the pool reconnects after a dropped one) and one call-order
 * chain: every call runs after the calls made before it, and a transaction holds the chain from `BEGIN` until it commits or rolls back,
 * which is the port's contract (and what SQLite's single connection does).
 */

import pg from 'pg'
import type { Db, DbExecutor, SqlValue } from 'acryl-db'
import { bindStatement } from './dialect.ts'

const OID = { int2: 21, int4: 23, int8: 20, float4: 700, float8: 701, bytea: 17 } as const

/** Values out, the same on every provider: integers and reals as numbers (an `int8` beyond the safe range as a `bigint`), `bytea` as a plain `Uint8Array`. */
const types: pg.CustomTypesConfig = {
  getTypeParser: ((oid: number, format?: 'text' | 'binary') => {
    if (format === 'binary') return pg.types.getTypeParser(oid, 'binary')
    switch (oid) {
      case OID.int8:
        return (text: string) => {
          const value = BigInt(text)
          return value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value
        }
      case OID.bytea: {
        const parse = pg.types.getTypeParser(OID.bytea, 'text') as (text: string) => Buffer
        return (text: string) => {
          const buffer = parse(text)
          return new Uint8Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength))
        }
      }
      default:
        return pg.types.getTypeParser(oid, 'text')
    }
  }) as pg.CustomTypesConfig['getTypeParser'],
}

/** Values in: a `bigint` as its decimal text, bytes as a Buffer over the same memory; `pg` sends the rest as they are. */
function toDriver(value: SqlValue): unknown {
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Uint8Array) return Buffer.from(value.buffer, value.byteOffset, value.byteLength)
  return value
}

type Query = (sql: string, params: readonly SqlValue[]) => Promise<pg.QueryResult<Record<string, unknown>>>

function statement(sql: string, params: readonly SqlValue[]): pg.QueryConfig {
  const text = bindStatement('acryl-db-postgres', sql, params.length)
  // The extended protocol always, so one call is one statement (several statements belong in `exec`).
  return { text, values: params.map(toDriver), queryMode: 'extended' } as pg.QueryConfig
}

/** One statement, or several in `exec`, through whatever runs the query: the pool, or a transaction's connection. */
function executor(query: Query, exec: (sql: string) => Promise<void>): DbExecutor {
  return {
    exec,
    run: async (sql, ...params) => ({ changes: (await query(sql, params)).rowCount ?? 0 }),
    get: async <T extends object>(sql: string, ...params: SqlValue[]) => (await query(sql, params)).rows[0] as T | undefined,
    all: async <T extends object>(sql: string, ...params: SqlValue[]) => (await query(sql, params)).rows as T[],
  }
}

export interface PostgresDatabaseOptions {
  /** A connection string: `postgres://user:password@host:5432/database`, with `?sslmode=require` and the other `pg` parameters. */
  readonly url: string
}

export class PostgresDatabase implements Db {
  private readonly pool: pg.Pool
  private tail: Promise<unknown> = Promise.resolve()
  private closing: Promise<void> | undefined
  private readonly direct: DbExecutor

  constructor(options: PostgresDatabaseOptions) {
    this.pool = new pg.Pool({ connectionString: options.url, max: 1, types })
    // An idle connection that the server drops would otherwise surface as an unhandled error; the next call reconnects.
    this.pool.on('error', () => {})
    const query: Query = (sql, params) => this.pool.query(statement(sql, params))
    this.direct = executor(query, async sql => { await this.pool.query(sql) })
  }

  /** Run `operation` after everything called before it. */
  private serial<T>(operation: () => Promise<T>): Promise<T> {
    if (this.closing !== undefined) return Promise.reject(new Error('acryl-db-postgres: the database is closed'))
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
      const client = await this.pool.connect()
      let broken = false
      try {
        await client.query('BEGIN')
        const scope = { active: true }
        const guard = async <R>(work: () => Promise<R>): Promise<R> => {
          if (!scope.active) throw new Error('acryl-db-postgres: transaction handle is no longer active')
          return work()
        }
        const query: Query = (sql, params) => guard(() => client.query(statement(sql, params)))
        const handle = executor(query, sql => guard(async () => { await client.query(sql) }))
        try {
          const result = await callback(handle)
          scope.active = false
          await client.query('COMMIT')
          return result
        } catch (error) {
          scope.active = false
          try {
            await client.query('ROLLBACK')
          } catch (rollbackError) {
            broken = true
            throw new AggregateError([error, rollbackError], 'Postgres transaction failed and rollback failed')
          }
          throw error
        }
      } finally {
        // A connection whose rollback failed is in an unknown state: the pool drops it instead of reusing it.
        client.release(broken)
      }
    })
  }

  /** Wait for every call made before it, then end the pool. A second call waits for the same close. */
  close(): Promise<void> {
    this.closing ??= this.tail.then(() => this.pool.end())
    return this.closing
  }
}

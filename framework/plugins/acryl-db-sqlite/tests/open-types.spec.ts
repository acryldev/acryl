import { describe, expect, expectTypeOf, it } from 'vitest'
import type { Db, DbExecutor, SqlValue } from '../src/open.ts'
import { openDb } from '../src/open.ts'

describe('the plain entry\'s types', () => {
  it('exports Db, DbExecutor and SqlValue, and openDb resolves { db: Db, close }', async () => {
    expectTypeOf(openDb).returns.resolves.toEqualTypeOf<{ readonly db: Db, close(): Promise<void> }>()
    expectTypeOf<Db>().toExtend<DbExecutor>()
    expectTypeOf<SqlValue>().toEqualTypeOf<null | number | bigint | string | Uint8Array>()
    const { db, close } = await openDb({ path: ':memory:' })
    expect(Object.keys(db).sort()).toEqual(['all', 'exec', 'get', 'run', 'transaction'])
    await close()
  })
})

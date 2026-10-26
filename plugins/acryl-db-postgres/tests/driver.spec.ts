import { describe, expect, it } from 'vitest'
import { loadPg, MISSING_PG } from '../src/driver.ts'

const failing = (error: Error & { code?: string }) => () => Promise.reject(error)
const notFound = (message: string, code = 'ERR_MODULE_NOT_FOUND') => Object.assign(new Error(message), { code })

describe('loadPg', () => {
  it('loads the installed pg', async () => {
    expect(typeof (await loadPg()).Pool).toBe('function')
  })

  it('names the package to install when pg is missing, with the import error as the cause', async () => {
    const missing = notFound("Cannot find package 'pg' imported from /app/node_modules/acrylblends/lib/db/postgres.js")
    const error = await loadPg(failing(missing)).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe(MISSING_PG)
    expect((error as Error).cause).toBe(missing)
    await expect(loadPg(failing(notFound("Cannot find module 'pg'", 'MODULE_NOT_FOUND')))).rejects.toThrow(MISSING_PG)
  })

  it('passes any other import error through as it is', async () => {
    const inner = notFound("Cannot find package 'pg-pool' imported from /app/node_modules/pg/esm/index.mjs")
    await expect(loadPg(failing(inner))).rejects.toBe(inner)
    const broken = new SyntaxError('Unexpected token')
    await expect(loadPg(failing(broken))).rejects.toBe(broken)
  })
})

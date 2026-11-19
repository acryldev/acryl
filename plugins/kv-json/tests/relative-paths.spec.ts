/** A relative `path` in a row of an app without a Loader base URL is read from the project folder (`appInstance.root`), as the db provider does. */

import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import * as kvJson from '../src/index.ts'

const roots: string[] = []
const contexts: Context[] = []
afterEach(async () => {
  while (contexts.length > 0) await contexts.pop()?.fiber.dispose()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('a relative path in a row of an app without a Loader base URL', () => {
  it('is read from the project folder (appInstance.root)', async () => {
    const root = mkdtempSync(join(tmpdir(), 'acryl-kv-json-relative-'))
    roots.push(root)
    const ctx = new Context()
    contexts.push(ctx)
    ctx.provide('appInstance', { home: join(root, 'home'), root })
    await ctx.plugin(kvJson, { path: 'data/kv.json' })
    await ctx.kv.set('theme', 'dark')
    expect(await ctx.kv.get('theme')).toBe('dark')
    expect(existsSync(join(root, 'data', 'kv.json'))).toBe(true)
  })

  it('still fails with the old message where there is neither a base URL nor a project folder', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await expect(ctx.plugin(kvJson, { path: 'data/kv.json' }).await()).rejects.toThrow(/is relative, but this app has no file base URL/)
  })
})

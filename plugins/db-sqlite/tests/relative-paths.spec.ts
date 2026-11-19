/**
 * An acrylblends app has no Loader base URL: its manifest rows are mounted by `compose`, with the project folder in the `appInstance` service. A relative `path` or `migrations` in a row's
 * config (`migrations: migrations`) is read from that folder, which is what an app's author expects of a `blend.yaml` next to it.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import * as sqlite from '../src/index.ts'

const roots: string[] = []
const contexts: Context[] = []
afterEach(async () => {
  while (contexts.length > 0) await contexts.pop()?.fiber.dispose()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('a relative path in a row of an app without a Loader base URL', () => {
  it('is read from the project folder (appInstance.root)', async () => {
    const root = mkdtempSync(join(tmpdir(), 'acryl-db-sqlite-relative-'))
    roots.push(root)
    mkdirSync(join(root, 'migrations'))
    writeFileSync(join(root, 'migrations', '001-notes.sql'), 'CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL);\n')
    const ctx = new Context()
    contexts.push(ctx)
    ctx.provide('appInstance', { home: join(root, 'home'), root })
    await ctx.plugin(sqlite, { path: 'data/app.sqlite', migrations: 'migrations' })
    await ctx.db.run('INSERT INTO notes (body) VALUES (?)', 'first')
    expect(await ctx.db.all('SELECT body FROM notes')).toEqual([{ body: 'first' }])
  })

  it('still fails with the old message where there is neither a base URL nor a project folder', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    const fiber = ctx.plugin(sqlite, { path: 'data/app.sqlite' })
    await expect(fiber.await()).rejects.toThrow(/is relative, but this app has no file base URL/)
  })
})

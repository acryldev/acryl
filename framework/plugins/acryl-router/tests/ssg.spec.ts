/**
 * Static site generation as a user runs it: `toSSG` with Node's own `fs/promises` writes every GET route of an app to a real folder, with
 * parameters expanded through `ssgParams` and routes marked `disableSSG` left out. The ported suites use an in-memory file system.
 */

import * as fs from 'node:fs/promises'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { disableSSG, ssgParams, toSSG } from '../src/helpers/index.ts'
import { Acryl } from '../src/index.ts'

const folders: string[] = []
afterEach(() => {
  while (folders.length > 0) rmSync(folders.pop()!, { recursive: true, force: true })
})

describe('toSSG on the real file system', () => {
  it('writes each page, expands parameters and skips disabled routes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'acryl-ssg-'))
    folders.push(dir)
    const app = new Acryl()
      .get('/', c => c.html('<h1>Acryl!</h1>'))
      .get('/posts/:id', ssgParams(() => [{ id: 'first' }, { id: 'second' }]), c => c.html(`<p>${c.req.param('id')}</p>`))
      .get('/api/time', disableSSG(), c => c.json({ now: Date.now() }))

    const result = await toSSG(app, fs, { dir })

    expect(result.success).toBe(true)
    expect(readFileSync(join(dir, 'index.html'), 'utf8')).toBe('<h1>Acryl!</h1>')
    expect(readFileSync(join(dir, 'posts', 'first.html'), 'utf8')).toBe('<p>first</p>')
    expect(readFileSync(join(dir, 'posts', 'second.html'), 'utf8')).toBe('<p>second</p>')
    expect(readdirSync(dir).sort()).toEqual(['index.html', 'posts'])
  })
})

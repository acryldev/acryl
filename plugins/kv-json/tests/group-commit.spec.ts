/**
 * Group commit: the calls made in one turn, and those that queue while a file write is in flight, are persisted together by one write. The file writes are counted
 * by wrapping `rename` from `node:fs/promises` (every write ends with one rename over the file), and a write can be made to fail once.
 */

import { readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openKv } from '../src/open.ts'

const io = vi.hoisted(() => ({ renames: 0, failNext: false }))

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    rename: async (from: string, to: string) => {
      io.renames += 1
      if (io.failNext) {
        io.failNext = false
        throw Object.assign(new Error('the disk is full'), { code: 'ENOSPC' })
      }
      await actual.rename(from, to)
    },
  }
})

const dirs: string[] = []
beforeEach(() => {
  io.renames = 0
  io.failNext = false
})
afterEach(async () => {
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})
async function file(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'acryl-kv-json-group-'))
  dirs.push(dir)
  return join(dir, 'kv.json')
}

describe('group commit', () => {
  it('persists a burst with one write, and each update resolves with its own value', async () => {
    const path = await file()
    const { kv, close } = await openKv({ path })
    const results = await Promise.all(Array.from({ length: 50 }, () => kv.update<number>('counter', current => (current ?? 0) + 1)))
    expect(io.renames).toBe(1)
    expect(results).toEqual(Array.from({ length: 50 }, (_, at) => at + 1))
    expect(await kv.get('counter')).toBe(50)
    await close()
    expect(readFileSync(path, 'utf8')).toBe('{"version":1,"entries":{"counter":50}}\n')
  })

  it('rejects only the call whose callback throws in the middle of a batch; the calls around it apply, in order', async () => {
    const path = await file()
    const { kv, close } = await openKv({ path })
    const first = kv.set('log', [])
    const append = (item: string) => kv.update<string[]>('log', current => [...(current ?? []), item])
    const calls = [
      append('a'),
      append('b'),
      kv.update<string[]>('log', () => { throw new Error('refused') }),
      append('c'),
      kv.set('other', 1),
    ]
    const settled = await Promise.allSettled([first, ...calls])
    expect(settled.map(outcome => outcome.status)).toEqual(['fulfilled', 'fulfilled', 'fulfilled', 'rejected', 'fulfilled', 'fulfilled'])
    expect((settled[3] as PromiseRejectedResult).reason).toEqual(new Error('refused'))
    expect(io.renames).toBe(1)
    expect(await kv.get('log')).toEqual(['a', 'b', 'c'])
    await close()
    expect(readFileSync(path, 'utf8')).toBe('{"version":1,"entries":{"log":["a","b","c"],"other":1}}\n')
  })

  it('rejects every call of a batch whose file write fails, keeps the state it had, and writes the next batch', async () => {
    const path = await file()
    const { kv, close } = await openKv({ path })
    await kv.set('kept', 1)
    io.failNext = true
    const failed = await Promise.allSettled([kv.set('kept', 2), kv.set('lost', 3)])
    expect(failed.map(outcome => outcome.status)).toEqual(['rejected', 'rejected'])
    expect(await kv.get('kept')).toBe(1)
    expect(await kv.get('lost')).toBeUndefined()
    await kv.set('after', 4)
    await close()
    expect(readFileSync(path, 'utf8')).toBe('{"version":1,"entries":{"after":4,"kept":1}}\n')
  })

  it('queues the calls made while a write is in flight into the next write', async () => {
    const path = await file()
    const { kv, close } = await openKv({ path })
    const first = kv.set('a', 1)
    // Wait until the first write is past its turn (its rename has started), then make a second burst.
    await vi.waitFor(() => { expect(io.renames).toBe(1) })
    await Promise.all([kv.set('b', 2), kv.set('c', 3), first])
    expect(io.renames).toBe(2)
    await close()
    expect(readFileSync(path, 'utf8')).toBe('{"version":1,"entries":{"a":1,"b":2,"c":3}}\n')
  })

  it('a batch whose every callback throws writes nothing, and a call after it is still written', async () => {
    const path = await file()
    const { kv, close } = await openKv({ path })
    await kv.set('n', 1)
    const before = io.renames
    const outcomes = await Promise.allSettled([1, 2, 3].map(() => kv.update<number>('n', () => { throw new Error('no') })))
    expect(outcomes.every(outcome => outcome.status === 'rejected')).toBe(true)
    expect(io.renames).toBe(before)
    expect(await kv.get('n')).toBe(1)
    await kv.set('n', 2)
    expect(io.renames).toBe(before + 1)
    await close()
    expect(readFileSync(path, 'utf8')).toBe('{"version":1,"entries":{"n":2}}\n')
  })
})

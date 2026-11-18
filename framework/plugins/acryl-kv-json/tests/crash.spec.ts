/**
 * The crash test: a child process rewrites a file of a few hundred kilobytes in a loop and is killed with SIGKILL at random moments, forty
 * times. After every kill the file parses, both keys exist, and the two keys are one write apart at most. It reads the built `lib/open.js`.
 * @throws if the package has not been built: run `pnpm run build` first.
 */

import { fork } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, expect, it } from 'vitest'
import { openKv } from '../src/open.ts'

const WRITER = fileURLToPath(new URL('./crash-writer.mjs', import.meta.url))
const ROUNDS = 40

const dirs: string[] = []
afterAll(async () => {
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

/** Start the writer on the file and kill it after `delay` milliseconds of writing. */
function crashAfter(file: string, delay: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = fork(WRITER, [file], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] })
    child.once('error', reject)
    child.once('exit', () => resolve())
    child.once('message', () => {
      setTimeout(() => child.kill('SIGKILL'), delay)
    })
  })
}

it('never leaves an unreadable file when the writer is killed mid-write, forty times', { timeout: 120_000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'acryl-kv-json-crash-'))
  dirs.push(dir)
  const file = join(dir, 'kv.json')
  let lastStep = 0
  let written = 0
  for (let round = 0; round < ROUNDS; round += 1) {
    await crashAfter(file, 5 + Math.floor(Math.random() * 120))
    const text = (() => {
      try {
        return readFileSync(file, 'utf8')
      } catch {
        return undefined
      }
    })()
    if (text === undefined) continue // killed before the first write finished: no file yet, which is fine
    const parsed = JSON.parse(text) as { version: number, entries: Record<string, { step: number, pad: string }> }
    expect(parsed.version).toBe(1)
    const a = parsed.entries.a?.step
    const b = parsed.entries.b?.step
    // `a` is written before `b`: the file shows both, or `a` one ahead of `b`, or only `a` on the very first write.
    if (a !== undefined) {
      expect(b === undefined ? a === 1 : a - b === 0 || a - b === 1, `a=${a} b=${String(b)}`).toBe(true)
      expect(parsed.entries.a?.pad).toHaveLength(200_000)
      lastStep = Math.max(lastStep, a)
      written += 1
    }
    // The next open (the next child) reads this file, and removes a temporary file the kill left.
    const store = await openKv({ path: file })
    await store.close()
    expect(readdirSync(dir)).toEqual(['kv.json'])
  }
  expect(written).toBeGreaterThan(ROUNDS / 2)
  expect(lastStep).toBeGreaterThan(0)
})

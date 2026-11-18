import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import { sandbox } from '../index.ts'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** A tool folder with the given source, and a secret file next to it, outside the tool's folder. */
function tool(source: string) {
  const root = mkdtempSync(join(tmpdir(), 'sandbox-test-'))
  dirs.push(root)
  mkdirSync(join(root, 'tool'))
  writeFileSync(join(root, 'secret.txt'), 'top secret')
  writeFileSync(join(root, 'tool', 'index.ts'), source)
  writeFileSync(join(root, 'tool', 'data.json'), '{"factor": 3}')
  return { entry: join(root, 'tool', 'index.ts'), secret: join(root, 'secret.txt') }
}

test('runs a pure tool, passes JSON in and out, and reads files of its own folder', async () => {
  const { entry } = tool(`import { readFileSync } from 'node:fs'
export function run(input: { n: number }) {
  const { factor } = JSON.parse(readFileSync(new URL('./data.json', import.meta.url), 'utf8'))
  console.log('noise the tool prints')
  return { result: input.n * factor }
}`)
  assert.deepEqual(await sandbox.run(entry, { n: 4 }), { ok: true, output: { result: 12 } })
})

test('cannot read a file outside its folder, even when told its path', async () => {
  const { entry, secret } = tool(`import { readFileSync } from 'node:fs'
export function run(input: { path: string }) { return readFileSync(input.path, 'utf8') }`)
  const result = await sandbox.run(entry, { path: secret })
  assert.equal(!result.ok && result.kind, 'denied')
})

test('cannot start a process, write a file, or see the environment', async () => {
  const { entry, secret } = tool(`import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
export function run(input: { what: string; path: string }) {
  if (input.what === 'exec') return execSync('echo hi').toString()
  if (input.what === 'write') return writeFileSync(input.path, 'overwritten')
  return { home: process.env.HOME ?? null, path: process.env.PATH ?? null, keys: Object.keys(process.env) }
}`)
  assert.equal((await sandbox.run(entry, { what: 'exec' })).ok, false)
  const write = await sandbox.run(entry, { what: 'write', path: secret })
  assert.equal(!write.ok && write.kind, 'denied')
  // Nothing of the parent's environment arrives (Node may add one variable of its own).
  process.env.ACRYLBLENDS_TEST_SECRET = 'leaks?'
  const env = await sandbox.run(entry, { what: 'env' })
  delete process.env.ACRYLBLENDS_TEST_SECRET
  const seen = env.ok ? (env.output as { home: unknown; path: unknown; keys: string[] }) : undefined
  console.log('env keys inside the sandbox:', JSON.stringify(seen?.keys))
  assert.deepEqual([seen?.home, seen?.path], [null, null])
  assert.ok((seen?.keys.length ?? 9) <= 1 && !seen?.keys.includes('ACRYLBLENDS_TEST_SECRET'))
})

test('a tool that loops forever is killed at the time limit; one that floods output is cut off; one that throws is an error result', async () => {
  const { entry } = tool(`export function run(input: { what: string }) {
  if (input.what === 'loop') while (true) {}
  if (input.what === 'flood') return 'x'.repeat(5_000_000)
  if (input.what === 'throw') throw new Error('bad input')
  return 1
}`)
  const started = Date.now()
  assert.equal(
    ((await sandbox.run(entry, { what: 'loop' }, { timeoutMs: 400 })) as { kind?: string }).kind,
    'timeout',
  )
  assert.ok(Date.now() - started < 3000)
  assert.equal(
    (
      (await sandbox.run(entry, { what: 'flood' }, { maxOutputBytes: 100_000 })) as {
        kind?: string
      }
    ).kind,
    'output',
  )
  assert.deepEqual(await sandbox.run(entry, { what: 'throw' }), {
    ok: false,
    kind: 'error',
    error: 'bad input',
  })
})

test('a tool that is not a module with run, or does not parse, fails cleanly', async () => {
  assert.equal((await sandbox.run(tool('export const x = 1').entry, {})).ok, false)
  assert.equal((await sandbox.run(tool('export function run( {').entry, {})).ok, false)
})

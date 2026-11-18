import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import { LOCK_FILE, writeLock } from '../lock.ts'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const BLEND = `apiVersion: blends.acryl.dev/v1alpha1
kind: Blueprint
metadata: { id: acme.shop, name: shop, version: 1.0.0 }
spec:
  runtime: cordis
  parameters:
    title: { type: string, default: Shop }
  rows:
    - id: greeter
      name: greeter
      config: { text: "{{parameters.title}}" }
    - id: off
      name: greeter
      disabled: true
`

function app() {
  const dir = mkdtempSync(join(tmpdir(), 'lock-test-'))
  dirs.push(dir)
  writeFileSync(join(dir, 'blend.yaml'), BLEND)
  mkdirSync(join(dir, 'src', 'plugins', 'greeter'), { recursive: true })
  writeFileSync(
    join(dir, 'src', 'plugins', 'greeter', 'index.ts'),
    'export const name = "greeter"\n',
  )
  mkdirSync(join(dir, 'extensions', 'clock'), { recursive: true })
  writeFileSync(join(dir, 'extensions', 'clock', 'index.ts'), 'export const name = "clock"\n')
  return dir
}

test('the lock is blend.lock.json formatVersion 3: origin digest, resolved parameters and rows, and a local module per plugin and extension', () => {
  const dir = app()
  const locked = writeLock(dir)
  assert.equal(LOCK_FILE, 'blend.lock.json')
  assert.equal(locked.formatVersion, 3)
  assert.deepEqual(
    { id: locked.origin.id, kind: locked.origin.kind, version: locked.origin.version },
    { id: 'acme.shop', kind: 'Blueprint', version: '1.0.0' },
  )
  assert.match(locked.origin.digest, /^[0-9a-f]{64}$/)
  assert.deepEqual(locked.parameters, { title: 'Shop' })
  assert.deepEqual(
    locked.rows.map((row) => row.id),
    ['greeter', 'off'],
  )
  assert.deepEqual(
    locked.modules.map((module) => [module.name, module.origin, module.source]),
    [
      ['clock', 'local', 'extensions/clock'],
      ['greeter', 'local', 'src/plugins/greeter'],
    ],
  )
  for (const module of locked.modules) assert.match(module.digest ?? '', /^sha256:[0-9a-f]{64}$/)
})

test('the same app gives the same bytes, and a changed plugin changes its digest only', () => {
  const dir = app()
  writeLock(dir)
  const first = readFileSync(join(dir, LOCK_FILE), 'utf8')
  writeLock(dir)
  assert.equal(readFileSync(join(dir, LOCK_FILE), 'utf8'), first)
  writeFileSync(join(dir, 'extensions', 'clock', 'index.ts'), 'export const name = "clock2"\n')
  const changed = writeLock(dir)
  const before = JSON.parse(first).modules
  const same = (name: string) =>
    before.find((m: { name: string }) => m.name === name).digest ===
    changed.modules.find((m) => m.name === name)?.digest
  assert.equal(same('greeter'), true)
  assert.equal(same('clock'), false)
})

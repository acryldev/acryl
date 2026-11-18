import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import { whyNotChat } from '../headless.ts'

const undo: Array<() => void> = []
afterEach(() => {
  for (const step of undo.splice(0).reverse()) step()
})
/** A machine: a folder of programs on the PATH, a home with or without pi's stored key, and the DeepSeek key variable. */
function machine(options: { programs?: string[]; key?: string }) {
  const root = mkdtempSync(join(tmpdir(), 'why-'))
  const bin = join(root, 'bin')
  mkdirSync(bin)
  for (const name of options.programs ?? []) {
    writeFileSync(join(bin, name), '#!/bin/sh\nexit 0\n')
    chmodSync(join(bin, name), 0o755)
  }
  const saved = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
    PI_CODING_AGENT_DIR: process.env.PI_CODING_AGENT_DIR,
  }
  process.env.PATH = `${bin}:/usr/bin:/bin`
  process.env.HOME = root
  process.env.PI_CODING_AGENT_DIR = join(root, 'pi')
  if (options.key === undefined) delete process.env.DEEPSEEK_API_KEY
  else process.env.DEEPSEEK_API_KEY = options.key
  undo.push(() => {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
    rmSync(root, { recursive: true, force: true })
  })
}
const posix = { skip: process.platform === 'win32' ? 'the fake programs are shell scripts' : false }

test('a terminal driver is not asked over /ask, and a name that is not an agent has no reason to give', () => {
  assert.match(whyNotChat('pi', 'terminal') ?? '', /terminal driver: pick it in the panel/)
  assert.equal(whyNotChat('nope', undefined), undefined)
})

test('an agent that is not installed is named as not on the PATH', posix, () => {
  machine({ programs: [] })
  assert.match(whyNotChat('codex', undefined) ?? '', /^codex was not found on the PATH/)
})

test(
  'pi installed without a key says what it needs, and with one has nothing to explain',
  posix,
  () => {
    machine({ programs: ['pi'] })
    assert.match(whyNotChat('pi', undefined) ?? '', /DEEPSEEK_API_KEY.*auth\.json/)
    machine({ programs: ['pi'], key: 'sk-test' })
    assert.equal(whyNotChat('pi', undefined), undefined)
  },
)

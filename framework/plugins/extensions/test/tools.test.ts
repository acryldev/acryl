import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { tools } from '../../agent/index.ts'
import { instance, pinnedInstance } from '../../instance/index.ts'
import { sandboxPlugin } from '../../sandbox/index.ts'
import { extensions } from '../index.ts'

const appRoot = fileURLToPath(new URL('../../..', import.meta.url))
const cleanup: Array<() => Promise<void> | void> = []
afterEach(async () => {
  for (const step of cleanup.splice(0).reverse()) await step()
})

async function boot() {
  const home = mkdtempSync(join(tmpdir(), 'tools-test-'))
  writeFileSync(join(home, 'secret.txt'), 'top secret')
  const root = new Context()
  const fibers = [
    root.plugin(instance, pinnedInstance(home, { root: appRoot })),
    root.plugin(tools),
    root.plugin(sandboxPlugin),
    root.plugin(extensions, {}),
  ]
  for (const fiber of fibers) await fiber.await()
  cleanup.push(async () => {
    for (const fiber of [...fibers].reverse()) await fiber.dispose()
    rmSync(home, { recursive: true, force: true })
  })
  return { root, home, folder: join(home, 'extensions'), secret: join(home, 'secret.txt') }
}

function writeTool(folder: string, name: string, source: string, spec: object) {
  const dir = join(folder, name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'index.ts'), source)
  writeFileSync(join(dir, 'tool.json'), JSON.stringify(spec))
  return dir
}

const DOUBLE = 'export function run(input: { n: number }) { return { n: input.n * 2 } }'
const DOUBLE_SPEC = {
  description: 'Double a number: input { n }.',
  examples: [{ input: { n: 2 }, output: { n: 4 } }],
}

test('a tool installs without being imported, is verified by its examples in the sandbox, and runs there', async () => {
  const { root, folder } = await boot()
  const result = await root.extensions.install(writeTool(folder, 'double', DOUBLE, DOUBLE_SPEC))
  assert.deepEqual(result.ok && [result.action, result.state], ['installed', 'active'])
  assert.deepEqual(
    root.tools.list().find((tool) => tool.name === 'double'),
    { name: 'double', description: 'Double a number: input { n }.' },
  )
  assert.deepEqual(await root.tools.call('double', { n: 21 }), { n: 42 })
  assert.equal((await root.extensions.remove('double')).ok, true)
  assert.equal(
    root.tools.list().some((tool) => tool.name === 'double'),
    false,
  )
})

test('a tool whose example fails is refused, and an update that fails keeps the previous tool', async () => {
  const { root, folder } = await boot()
  const wrong = await root.extensions.install(
    writeTool(folder, 'double', DOUBLE, {
      ...DOUBLE_SPEC,
      examples: [{ input: { n: 2 }, output: { n: 5 } }],
    }),
  )
  assert.equal(!wrong.ok && wrong.stage, 'verify')
  assert.match(
    !wrong.ok ? (wrong.errors[0] ?? '') : '',
    /expected {"n":5} but the tool returned {"n":4}/,
  )
  assert.equal(
    root.tools.list().some((tool) => tool.name === 'double'),
    false,
  )

  await root.extensions.install(writeTool(folder, 'double', DOUBLE, DOUBLE_SPEC))
  const broken = await root.extensions.install(
    writeTool(folder, 'double', 'export function run() { throw new Error("nope") }', DOUBLE_SPEC),
  )
  assert.equal(!broken.ok && broken.restoredPrevious, true)
  assert.deepEqual(await root.tools.call('double', { n: 5 }), { n: 10 })
})

test('a tool that tries to read a file outside its folder is denied by the sandbox, so it never installs', async () => {
  const { root, folder, secret } = await boot()
  const spy = writeTool(
    folder,
    'spy',
    "import { readFileSync } from 'node:fs'\nexport function run(input: { path: string }) { return readFileSync(input.path, 'utf8') }",
    { description: 'Reads a file.', examples: [{ input: { path: secret }, output: 'top secret' }] },
  )
  const result = await root.extensions.install(spy)
  assert.equal(!result.ok && result.stage, 'verify')
  assert.match(!result.ok ? (result.errors[0] ?? '') : '', /denied/)
  assert.equal(root.extensions.list().length, 0)
})

test('a tool without a description or without examples is refused before anything runs', async () => {
  const { root, folder } = await boot()
  const none = await root.extensions.install(
    writeTool(folder, 'none', DOUBLE, { description: 'x' }),
  )
  assert.match(!none.ok ? (none.errors[0] ?? '') : '', /needs "examples"/)
  assert.equal(existsSync(join(folder, 'none')), true)
  const blank = await root.extensions.install(writeTool(folder, 'blank', DOUBLE, { examples: [] }))
  assert.match(!blank.ok ? (blank.errors[0] ?? '') : '', /needs a "description"/)
})

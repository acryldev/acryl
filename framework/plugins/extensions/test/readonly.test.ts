// The production start of the extensions service: what is in the app's plugins/ folder runs, once, as deployed; nothing can change while the app runs.
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { instance, pinnedInstance } from '../../instance/index.ts'
import { extensions } from '../index.ts'

const appRoot = fileURLToPath(new URL('../../..', import.meta.url))
const cleanup: Array<() => Promise<void> | void> = []
afterEach(async () => {
  for (const step of cleanup.splice(0).reverse()) await step()
})

/** An app folder with a home, a plugins/ folder holding the given extensions, and the lines the service said. */
async function production(
  extensionsToWrite: Record<string, string>,
  record?: Record<string, unknown>,
) {
  const home = mkdtempSync(join(tmpdir(), 'extensions-readonly-'))
  cleanup.push(() => rmSync(home, { recursive: true, force: true }))
  const plugins = join(home, 'plugins')
  for (const [name, body] of Object.entries(extensionsToWrite)) {
    mkdirSync(join(plugins, name), { recursive: true })
    writeFileSync(join(plugins, name, 'index.ts'), body)
  }
  if (record) writeFileSync(join(home, 'extensions.json'), JSON.stringify(record))
  const lines: string[] = []
  const root = new Context()
  const fibers = [
    root.plugin(instance, pinnedInstance(home, { root: appRoot })),
    root.plugin(extensions, {
      sources: [{ dir: plugins, trust: 'install' }],
      readOnly: true,
      log: (line) => lines.push(line),
    }),
  ]
  for (const fiber of fibers) await fiber.await()
  cleanup.unshift(async () => {
    for (const fiber of [...fibers].reverse()) await fiber.dispose()
  })
  return { root, home, plugins, lines }
}

const greeter = (greeting: string) => `export const name = 'greeter'
export function apply(ctx: { provide(name: string, value: unknown): void }) { ctx.provide('greeting', ${JSON.stringify(greeting)}) }
`

test('starts the extensions of plugins/ from where they are, says which, and writes nothing', async () => {
  const { root, home, lines } = await production({
    greeter: greeter('hello'),
    other: greeter('x').replace('greeter', 'other').replace('greeting', 'other-service'),
  })
  assert.equal(root.get('greeting'), 'hello')
  assert.deepEqual(
    root.extensions.list().map((entry) => [entry.name, entry.state]),
    [
      ['greeter', 'active'],
      ['other', 'active'],
    ],
  )
  assert.deepEqual(lines, ['extensions (read-only): greeter, other'])
  // Nothing was staged, recorded or logged: the code that runs is the folder's.
  assert.equal(existsSync(join(home, 'extensions-staged')), false)
  assert.equal(existsSync(join(home, 'extensions.json')), false)
  assert.equal(existsSync(join(home, 'extensions-ledger.jsonl')), false)
  assert.deepEqual(
    readdirSync(home).filter((entry) => entry.startsWith('extensions')),
    [],
  )
})

test('install, update, remove, reload, approve and deny are refused, and what runs does not change', async () => {
  const { root, plugins } = await production({ greeter: greeter('hello') })
  writeFileSync(join(plugins, 'greeter', 'index.ts'), greeter('changed'))
  mkdirSync(join(plugins, 'late'))
  writeFileSync(
    join(plugins, 'late', 'index.ts'),
    greeter('late').replace('greeter', 'late').replace('greeting', 'late-service'),
  )
  for (const attempt of [
    () => root.extensions.install(join(plugins, 'late')),
    () => root.extensions.install(join(plugins, 'greeter')),
    () => root.extensions.remove('greeter'),
    () => root.extensions.reload(),
    () => root.extensions.approve('late'),
    () => root.extensions.deny('late'),
  ])
    await assert.rejects(attempt, /read-only here \(production\)/)
  assert.equal(root.get('greeting'), 'hello')
  assert.deepEqual(
    root.extensions.list().map((entry) => entry.name),
    ['greeter'],
  )
})

test('says when plugins/ has no extension, and warns about a recorded extension whose folder is not there', async () => {
  const none = await production({})
  assert.deepEqual(none.lines, ['extensions: none found in plugins/'])
  const missing = await production(
    { greeter: greeter('hello') },
    { greeter: { source: 'x' }, board: { source: '/dev/board' } },
  )
  assert.equal(missing.lines[0], 'extensions (read-only): greeter')
  assert.match(
    missing.lines[1] ?? '',
    /^WARNING: extensions\.json records the extension "board", but plugins\/ has no folder for it: it is not started in production/,
  )
  assert.equal(missing.lines.length, 2)
})

test('an extension that fails to start is named and the others still run; a source that asks first is not started', async () => {
  const { root, lines } = await production({
    greeter: greeter('hello'),
    broken: `export const name = 'broken'\nexport function apply() { throw new Error('boom') }\n`,
  })
  assert.equal(root.get('greeting'), 'hello')
  assert.equal(lines[0], 'extensions (read-only): greeter')
  assert.match(lines[1] ?? '', /WARNING: extension "broken" did not start: .*boom/)
})

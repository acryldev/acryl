import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import { instance, pinnedInstance } from '../../instance/index.ts'
import { settings, z } from '../index.ts'

const homes: string[] = []
afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true })
})

async function boot(home = mkdtempSync(join(tmpdir(), 'settings-test-'))) {
  homes.push(home)
  const root = new Context()
  await root.plugin(instance, pinnedInstance(home)).await()
  const fiber = root.plugin(settings, {})
  await fiber.await()
  return { root, fiber, home, file: join(home, 'settings.yaml') }
}

const Theme = z.object({
  mode: z.union(['light', 'dark']).default('light'),
  size: z.natural().default(14),
})

test('layers schema defaults, then base, then the stored section', async () => {
  const home = mkdtempSync(join(tmpdir(), 'settings-test-'))
  writeFileSync(join(home, 'settings.yaml'), 'theme:\n  size: 18\n')
  const { root } = await boot(home)
  const scope = root.settings.register('theme', Theme, { base: { mode: 'dark' } })
  assert.deepEqual(scope.get(), { mode: 'dark', size: 18 })
})

test('an update is validated, persisted to YAML and read back by a fresh service', async () => {
  const { root, fiber, home, file } = await boot()
  const scope = root.settings.register('theme', Theme)
  await scope.update({ mode: 'dark' })
  assert.match(readFileSync(file, 'utf8'), /mode: dark/)
  await assert.rejects(scope.update({ mode: 'purple' }))
  assert.equal(scope.get().mode, 'dark')
  await fiber.dispose()
  const again = await boot(home)
  assert.equal(again.root.settings.register('theme', Theme).get().mode, 'dark')
})

test('watchers and the event see committed changes in order, and never an unchanged value', async () => {
  const { root } = await boot()
  const scope = root.settings.register('theme', Theme)
  const seen: string[] = []
  scope.watch((next) => void seen.push(`watch:${next.size}`))
  root.on(
    'settings/updated',
    (namespace, next) => void seen.push(`event:${namespace}:${(next as { size: number }).size}`),
  )
  await Promise.all([
    scope.update({ size: 15 }),
    scope.update({ size: 16 }),
    scope.update({ size: 16 }),
  ])
  assert.deepEqual(seen, ['event:theme:15', 'watch:15', 'event:theme:16', 'watch:16'])
})

test('replace({}) resets to base and defaults and removes the section from the file', async () => {
  const { root, file } = await boot()
  const scope = root.settings.register('theme', Theme)
  await scope.update({ size: 20 })
  await scope.replace({})
  assert.deepEqual(scope.get(), { mode: 'light', size: 14 })
  assert.doesNotMatch(readFileSync(file, 'utf8'), /theme/)
})

test('refuses bad namespaces, double registration and values YAML would distort', async () => {
  const { root } = await boot()
  assert.throws(() => root.settings.register('Bad Name', Theme), /namespace/)
  root.settings.register('theme', Theme)
  assert.throws(() => root.settings.register('theme', Theme), /already registered/)
  await assert.rejects(root.settings.update('theme', { size: Number.NaN }), /non-finite/)
  await assert.rejects(root.settings.update('nobody', {}), /not registered/)
})

test('describe lists namespaces for a settings screen, and a namespace leaves with its owner', async () => {
  const { root } = await boot()
  const owner = root.plugin({
    name: 'owner',
    inject: ['settings'],
    apply: (ctx: Context) => void ctx.settings.register('theme', Theme),
  })
  await owner.await()
  assert.deepEqual(
    root.settings.describe().map((entry) => entry.namespace),
    ['theme'],
  )
  await owner.dispose()
  assert.deepEqual(root.settings.describe(), [])
  assert.equal(existsSync(join(root.appInstance.home, 'settings.yaml')), false)
})

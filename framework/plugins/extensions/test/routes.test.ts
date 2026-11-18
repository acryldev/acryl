import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import * as router from '../../acryl-router/src/index.ts'
import * as homePage from '../../home/index.ts'
import { instance, pinnedInstance } from '../../instance/index.ts'
import { extensions } from '../index.ts'
import { addedRoutes, pathsOverlap, routeClash, type ServedRoute } from '../routes.ts'

const appRoot = fileURLToPath(new URL('../../..', import.meta.url))
const cleanup: Array<() => Promise<void> | void> = []
afterEach(async () => {
  for (const step of cleanup.splice(0).reverse()) await step()
})

const get = (path: string, owner = 'a'): ServedRoute => ({ method: 'GET', path, owner })

test('two paths overlap when one request could match both', () => {
  assert.equal(pathsOverlap('/notes', '/notes'), true)
  assert.equal(pathsOverlap('/notes', '/notes/list'), false)
  assert.equal(pathsOverlap('/notes/*', '/notes/list'), true)
  assert.equal(pathsOverlap('/notes/:id', '/notes/list'), true)
  assert.equal(pathsOverlap('/notes/:id', '/notes'), false)
  assert.equal(pathsOverlap('/notes', '/dice'), false)
  assert.equal(pathsOverlap('/', '/'), true)
})

test('the routes a mount added are counted, so mounting a route that is already there counts as added', () => {
  assert.deepEqual(addedRoutes([get('/a')], [get('/a'), get('/a', 'b'), get('/c', 'b')]), [
    get('/a', 'b'),
    get('/c', 'b'),
  ])
})

test('a clash needs the same method and an overlapping path', () => {
  assert.equal(
    routeClash([{ method: 'POST', path: '/notes', owner: 'b' }], [get('/notes')]),
    undefined,
  )
  assert.deepEqual(routeClash([get('/notes/list', 'b')], [get('/notes/*')]), {
    route: get('/notes/list', 'b'),
    taken: get('/notes/*'),
  })
})

async function app() {
  const home = mkdtempSync(join(tmpdir(), 'routes-test-'))
  const root = new Context()
  const fibers = [
    root.plugin(instance, pinnedInstance(home, { root: appRoot })),
    root.plugin(router),
    root.plugin(homePage),
    root.plugin(extensions, {}),
  ]
  for (const fiber of fibers) await fiber.await()
  cleanup.push(async () => {
    for (const fiber of [...fibers].reverse()) await fiber.dispose()
    rmSync(home, { recursive: true, force: true })
  })
  /** A plugin serving GET `path`, with a check that asks for it, as the builder writes one. */
  const plugin = (name: string, path: string) => {
    const dir = join(home, 'extensions', name)
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, 'index.ts'),
      `import { Acryl } from 'acrylblends'
export const name = '${name}'
export const inject = ['router']
export function apply(ctx) { ctx.router.route('/', new Acryl().get('${path}', (c) => c.json({ from: '${name}' }))) }
export async function check(ctx) { const r = await ctx.router.request('${path.replace('*', 'x').replace(':id', 'x')}'); if (!r.ok) throw new Error('answered ' + r.status) }
`,
    )
    return dir
  }
  /** A plugin putting a widget with id `id` on the home page, with a check that finds it. */
  const widget = (name: string, id: string) => {
    const dir = join(home, 'extensions', name)
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, 'index.ts'),
      `export const name = '${name}'
export const inject = ['home']
export function apply(ctx) { ctx.effect(() => ctx.home.widget({ id: '${id}', title: '${name}', render: () => '<p>${name}</p>' })) }
export async function check(ctx) { if (!ctx.home.widgets().some((w) => w.title === '${name}')) throw new Error('no widget') }
`,
    )
    return dir
  }
  const answer = async (path: string) =>
    (await (await root.router.request(path)).json()) as { from: string }
  return { root, plugin, widget, answer }
}

test('a plugin whose route another plugin serves is refused, naming it, and the other keeps the route', async () => {
  const { root, plugin, answer } = await app()
  const first = await root.extensions.install(plugin('ana-notes', '/notes'))
  assert.equal(first.ok, true, JSON.stringify(first))
  const refused = await root.extensions.install(plugin('fay-notes', '/notes'))
  assert.equal(refused.ok, false)
  assert.equal(refused.ok === false && refused.stage, 'conflict')
  assert.match(
    refused.ok === false ? refused.errors.join() : '',
    /^GET \/notes is already served by ana-notes; rename this plugin's route, or remove ana-notes first$/u,
  )
  assert.deepEqual(
    root.extensions.list().map((extension) => extension.name),
    ['ana-notes'],
  )
  assert.equal((await answer('/notes')).from, 'ana-notes')
})

test("a route under another plugin's path is its own route; a wildcard over it is refused", async () => {
  const { root, plugin, answer } = await app()
  assert.equal((await root.extensions.install(plugin('ana-notes', '/notes'))).ok, true)
  assert.equal((await root.extensions.install(plugin('list-notes', '/notes/list'))).ok, true)
  assert.equal((await answer('/notes/list')).from, 'list-notes')
  const wild = await root.extensions.install(plugin('wild-notes', '/notes/*'))
  assert.equal(wild.ok, false)
  assert.match(
    wild.ok === false ? wild.errors.join() : '',
    /^GET \/notes\/\* is already served by ana-notes \(it serves GET \/notes\); rename/u,
  )
})

test('an update keeps its own route, and a removed plugin frees it', async () => {
  const { root, plugin, answer } = await app()
  const dir = plugin('ana-notes', '/notes')
  assert.equal((await root.extensions.install(dir)).ok, true)
  writeFileSync(join(dir, 'note.md'), 'a change\n')
  const updated = await root.extensions.install(dir)
  assert.equal(updated.ok && updated.action, 'updated')
  await root.extensions.remove('ana-notes')
  assert.equal((await root.router.request('/notes')).status, 404)
  assert.equal((await root.extensions.install(plugin('fay-notes', '/notes'))).ok, true)
  assert.equal((await answer('/notes')).from, 'fay-notes')
})

test("a plugin putting a widget under another plugin's name is refused, and that plugin's widget stays on the page", async () => {
  const { root, widget } = await app()
  assert.equal((await root.extensions.install(widget('ana-notes', 'ana-notes'))).ok, true)
  const refused = await root.extensions.install(widget('fay-notes', 'ana-notes'))
  assert.equal(refused.ok, false)
  assert.match(
    refused.ok === false ? refused.errors.join() : '',
    /already has a widget "ana-notes", the plugin ana-notes's; a widget's id is the name of the plugin that puts it there/u,
  )
  assert.deepEqual(
    root.extensions.list().map((extension) => extension.name),
    ['ana-notes'],
  )
  assert.deepEqual(
    root.home.widgets().map((shown) => shown.title),
    ['ana-notes'],
  )
})

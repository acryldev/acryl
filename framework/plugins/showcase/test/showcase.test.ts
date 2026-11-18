import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import { packFolder, type ReleasePort } from '@webboxes/plugin-hub'
import * as router from '../../acryl-router/src/index.ts'
import { routeSource } from '../../builder/script.ts'
import { extensions } from '../../extensions/index.ts'
import * as home from '../../home/index.ts'
import { instance, pinnedInstance } from '../../instance/index.ts'
import { type PullResult, pluginShare, type SharedPluginInfo } from '../../plugin-share/index.ts'
import * as showcase from '../index.ts'

const cleanup: Array<() => Promise<void> | void> = []
afterEach(async () => {
  for (const step of cleanup.splice(0)) await step()
})

const scratch = (prefix: string): string => {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

/** A released plugin's tarball, packed the way `package_plugin` packs it. */
function release(name: string, files: Record<string, string>): Uint8Array {
  const dir = scratch('showcase-source-')
  const all = {
    'package.json': `${JSON.stringify({ name, version: '1.0.0', type: 'module', keywords: ['cordis-plugin', 'acrylblends'] }, null, 2)}\n`,
    ...files,
  }
  for (const [path, content] of Object.entries(all)) {
    mkdirSync(join(dir, path, '..'), { recursive: true })
    writeFileSync(join(dir, path), content)
  }
  return packFolder(dir).tarball
}

/** A plugin that puts a widget on the home page and serves nothing of its own. */
const WIDGET = `export const name = 'board'
export const inject = ['home']
export function apply(ctx) {
  ctx.effect(() => ctx.home.widget({ id: 'board', title: 'Board', render: () => '<p>board</p>' }))
}
`

async function boot(releases: ReleasePort, before?: (ctx: Context) => void) {
  const root = scratch('showcase-root-')
  // The app's definition, where a pull records where each plugin came from.
  writeFileSync(
    join(root, 'blend.yaml'),
    'apiVersion: blends.acryl.dev/v1alpha1\nkind: Blueprint\nmetadata: { id: group.collective, name: collective, version: 0.1.0 }\nspec:\n  runtime: cordis\n  rows:\n    - id: router\n      name: acryl-router\n    - id: extensions\n      name: extensions\n    - id: plugin-share\n      name: plugin-share\n    - id: showcase\n      name: showcase\n',
  )
  const app = new Context()
  const fibers = [
    app.plugin(instance, pinnedInstance(join(root, '.acrylblends'), { root })),
    app.plugin(router),
    ...(before === undefined ? [app.plugin(home)] : []),
    app.plugin(extensions, { sources: [{ dir: join(root, 'plugins'), trust: 'install' }] }),
    app.plugin(pluginShare, { releases }),
  ]
  for (const fiber of fibers) await fiber.await()
  before?.(app)
  const shown = app.plugin(showcase)
  await shown.await()
  fibers.push(shown)
  cleanup.push(async () => {
    for (const fiber of [...fibers].reverse()) await fiber.dispose()
  })
  const share = (
    app as unknown as {
      pluginShare: {
        pull(source: string): Promise<PullResult>
        remove(name: string): Promise<unknown>
        list(): SharedPluginInfo[]
      }
    }
  ).pluginShare
  const request = (path: string) =>
    (app as unknown as { router: { request(path: string): Promise<Response> } }).router.request(
      path,
    )
  return { root, share, request, shown, app }
}

/** Reads a server-sent event stream one `cards` event at a time. */
function events(response: Response) {
  const reader = (response.body as ReadableStream<Uint8Array>).getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  return {
    async next(): Promise<string | undefined> {
      for (;;) {
        const end = buffer.indexOf('\n\n')
        if (end !== -1) {
          const block = buffer.slice(0, end)
          buffer = buffer.slice(end + 2)
          if (!block.startsWith('event: cards')) continue
          return block
            .split('\n')
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).replace(/^ /u, ''))
            .join('\n')
        }
        const { value, done } = await reader.read()
        if (done) return undefined
        buffer += decoder.decode(value, { stream: true })
      }
    },
    cancel: () => reader.cancel(),
  }
}

test('a card names the plugin, its author, version, source and state, and links only to what a person can open', () => {
  const info = (over: Partial<SharedPluginInfo>): SharedPluginInfo => ({
    name: 'hello',
    source: '/app/plugins/hello',
    version: '1.0.0',
    state: 'active',
    missing: [],
    stale: false,
    routes: [],
    ...over,
  })
  const cards = showcase.showcaseCards(
    [
      info({
        pulledFrom: 'github:inboxxobni/hello@1.0.0',
        author: 'inboxxobni',
        release: '1.0.0',
        version: 'fcea2718d21e',
        routes: [
          { method: 'GET', path: '/hello' },
          { method: 'POST', path: '/hello' },
          { method: 'GET', path: '/hello/:id' },
          { method: 'GET', path: '/hello' },
        ],
      }),
      info({ name: 'adder', routes: [] }),
      info({ name: 'x<y', author: 'not a login/..', pulledFrom: 'https://example.test/<x>.tgz' }),
    ],
    { tools: ['adder'], widgets: ['hello'] },
  )
  assert.deepEqual(cards, [
    {
      name: 'hello',
      version: '1.0.0',
      state: 'active',
      author: 'inboxxobni',
      source: 'github:inboxxobni/hello@1.0.0',
      pages: ['/hello'],
      widget: true,
    },
    {
      name: 'adder',
      version: '1.0.0',
      state: 'active',
      source: 'this app',
      pages: [],
      widget: false,
      tool: 'adder',
    },
    {
      name: 'x<y',
      version: '1.0.0',
      state: 'active',
      source: 'https://example.test/<x>.tgz',
      pages: [],
      widget: false,
    },
  ])
  const html = showcase.renderCards(cards)
  assert.match(html, /<a href="\/hello">\/hello<\/a> <a href="\/">home widget<\/a>/u)
  // In the frame the app is served at /app: its root is /app itself (the app does not serve /app/), its pages are under it.
  assert.match(
    showcase.renderCards(cards, '/app'),
    /<a href="\/app\/hello">\/hello<\/a> <a href="\/app">home widget<\/a>/u,
  )
  assert.equal(showcase.appBase('/showcase'), '')
  assert.equal(showcase.appBase('/showcase/events'), '')
  assert.equal(showcase.appBase('/app/showcase'), '/app')
  assert.equal(showcase.appBase('/app/showcase/events'), '/app')
  assert.match(
    html,
    /<a href="https:\/\/github\.com\/inboxxobni" target="_blank" rel="noopener">@inboxxobni<\/a>/u,
  )
  assert.match(html, /tool <code>adder<\/code>/u)
  assert.match(html, /<h2>x&lt;y<\/h2>/u)
  assert.match(html, /https:\/\/example\.test\/&lt;x&gt;\.tgz/u)
  assert.doesNotMatch(html, /<x>|x<y/u)
  assert.match(showcase.renderCards([]), /No plugins yet/u)
})

test('the page and its stream follow every pull and removal, and the streams end with the plugin', async () => {
  const tarballs: Record<string, Uint8Array> = {
    hello: release('hello', { 'index.ts': routeSource('hello', '/hello', 'Hello') }),
    board: release('board', { 'index.ts': WIDGET }),
  }
  const { share, request, shown } = await boot({
    release: async (_owner, repo) => ({
      tag: 'v1.0.0',
      assets: [{ name: `${repo}-1.0.0.tgz`, url: repo }],
    }),
    download: async (url) => tarballs[url] as Uint8Array,
  })

  const page = await request('/showcase')
  assert.equal(page.status, 200)
  const text = await page.text()
  assert.match(text, /<title>Showcase<\/title>/u)
  assert.match(text, /No plugins yet/u)
  assert.match(text, /new EventSource\("\/showcase\/events"\)/u)

  const stream = events(await request('/showcase/events'))
  assert.match((await stream.next()) ?? '', /No plugins yet/u)

  const pulled = await share.pull('github:inboxxobni/hello@1.0.0')
  assert.ok(pulled.ok, JSON.stringify(pulled))
  const afterHello = (await stream.next()) ?? ''
  assert.match(afterHello, /data-plugin="hello" data-state="active"/u)
  assert.match(afterHello, /<span class="version">1\.0\.0<\/span>/u)
  assert.match(afterHello, /@inboxxobni/u)
  assert.match(afterHello, /<a href="\/hello">\/hello<\/a>/u)

  const board = await share.pull('github:someone-else/board@1.0.0')
  assert.ok(board.ok, JSON.stringify(board))
  const afterBoard = (await stream.next()) ?? ''
  assert.match(afterBoard, /data-plugin="board"[\s\S]*@someone-else[\s\S]*home widget/u)

  assert.deepEqual(
    ((await (await request('/showcase/plugins')).json()) as showcase.ShowcaseCard[]).map((card) => [
      card.name,
      card.author,
      card.pages,
      card.widget,
    ]),
    [
      ['board', 'someone-else', [], true],
      ['hello', 'inboxxobni', ['/hello'], false],
    ],
  )

  await share.remove('hello')
  const afterRemove = (await stream.next()) ?? ''
  assert.doesNotMatch(afterRemove, /data-plugin="hello"/u)
  assert.match(afterRemove, /data-plugin="board"/u)

  // Switched off, the plugin ends the open streams and its routes go.
  await shown.dispose()
  assert.equal(await stream.next(), undefined)
  assert.equal((await request('/showcase')).status, 404)
})

test("a service of the same name with another shape (the frame host's tools) leaves the cards answering", async () => {
  const { request } = await boot(
    { release: async () => undefined, download: async () => new Uint8Array() },
    (ctx) => {
      // As the DSH harness's tool registry is in the frame: `tools` with no list(); and a `home` whose widgets() throws.
      ctx.provide('tools', { register: () => () => undefined })
      ctx.provide('home', {
        widgets: () => {
          throw new Error('not this home')
        },
      })
    },
  )
  const answered = await request('/showcase/plugins')
  assert.equal(answered.status, 200)
  assert.deepEqual(await answered.json(), [])
})

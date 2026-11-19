import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import type { Context } from '@deepseek-ai/cordis'
import { attachBrowserHalf, browserHalf } from '../browser.ts'

/** Temporary folders this file makes; removed after its tests, also when one fails. */
const tempDirs: string[] = []
const tempDir = (prefix: string): string => {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}
after(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** A plugin folder with a DSH browser half, as alone-tree's dsh-skill-mcp-manager ships one. */
function dualPlugin(): string {
  const dir = tempDir('browser-half-')
  mkdirSync(join(dir, 'client'))
  writeFileSync(join(dir, 'client', 'client.js'), '/* browser half */\n')
  writeFileSync(join(dir, 'index.js'), 'export const name = "dual"\nexport function apply() {}\n')
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({
      name: 'dual',
      version: '1.0.0',
      dsh: { client: { platform: 'web', inject: ['slots'] } },
      exports: { '.': './index.js', './client': './client/client.js' },
    }),
  )
  return dir
}

/** The fiber context the extensions service mounts: its Loader and its effects, which the fiber's dispose runs. */
function fiber(loader: unknown) {
  const disposers: Array<() => void> = []
  const ctx = {
    get: (name: string) => (name === 'loader' ? loader : undefined),
    effect: (start: () => () => void) => disposers.push(start()),
    logger: () => ({ warn: () => undefined }),
  } as unknown as Context
  return {
    ctx,
    dispose: () => {
      for (const stop of disposers.splice(0)) stop()
    },
  }
}

test('a plugin with a browser half gets a host row for as long as it runs, and the row names its own client bundle', async () => {
  const dir = dualPlugin()
  const home = tempDir('browser-home-')
  const rows: string[] = []
  const removed: string[] = []
  const loader = {
    root: {
      create: async (options: { name: string }) => {
        rows.push(options.name)
        return 'row-1'
      },
      remove: (id: string) => removed.push(id),
    },
  }
  const mounted = fiber(loader)
  attachBrowserHalf(mounted.ctx, home, 'dual', 'abc123', dir)
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(rows.length, 1)
  const folder = join(home, 'extensions-browser', 'dual-abc123')
  assert.ok(rows[0]?.endsWith('/extensions-browser/dual-abc123/row.mjs'))
  const manifest = JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8'))
  assert.equal(manifest.name, 'dual')
  assert.deepEqual(manifest.dsh, { client: { platform: 'web', inject: ['slots'] } })
  // The registry joins ./client to the row's folder: it must land on the plugin's own bundle.
  assert.equal(
    readFileSync(join(folder, manifest.exports['./client']), 'utf8'),
    '/* browser half */\n',
  )

  mounted.dispose()
  assert.deepEqual(removed, ['row-1'])
  assert.equal(existsSync(folder), false)
})

test('a plugin without a browser half, or a host without a Loader, gets no row', () => {
  const plain = tempDir('browser-plain-')
  writeFileSync(join(plain, 'package.json'), JSON.stringify({ name: 'plain', version: '1.0.0' }))
  assert.equal(browserHalf(plain), undefined)

  const home = tempDir('browser-home-')
  const noLoader = fiber(undefined)
  attachBrowserHalf(noLoader.ctx, home, 'dual', 'abc123', dualPlugin())
  assert.equal(existsSync(join(home, 'extensions-browser')), false)
})

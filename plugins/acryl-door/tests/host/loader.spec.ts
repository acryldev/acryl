/**
 * The door mounted the way an app mounts it: a real `@deepseek-ai/cordis-plugin-loader` row pointing at the built `lib/index.js`, next to
 * the real router and node server. It waits PENDING for the server, survives ten disable and enable cycles without leaving its file,
 * replaces a stale connection file and refuses a folder another live process serves.
 * @throws if the package has not been built: run `pnpm run build` first.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context, type FiberState } from '@deepseek-ai/cordis'
import { Loader } from '@deepseek-ai/cordis-plugin-loader'
import * as router from 'acryl-router'
import * as nodeServer from 'acryl-node-server'
import { afterEach, describe, expect, it } from 'vitest'
import { doorFilePath, readDoorFile } from '../../src/host/door-file.ts'
import { appFolder, removeFolders } from '../harness.ts'

const PENDING = 0 as FiberState.PENDING
const ACTIVE = 2 as FiberState.ACTIVE
const FAILED = 3 as FiberState.FAILED
const DISPOSED = 4 as FiberState.DISPOSED
const BUILT_ENTRY = new URL('../../lib/index.js', import.meta.url).href

const contexts: Context[] = []
afterEach(async () => {
  while (contexts.length > 0) await contexts.pop()?.fiber.dispose()
  removeFolders()
})

/** An app folder with a row module re-exporting the built door, a Loader on it, the router and the app instance. */
async function loader(): Promise<{ ctx: Context; root: string }> {
  const root = appFolder()
  writeFileSync(join(root, 'row.mjs'), `export * from ${JSON.stringify(BUILT_ENTRY)}\n`)
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(Loader, { baseUrl: pathToFileURL(root + sep).href })
  ctx.plugin(router)
  ctx.reflect.provide('appInstance', { root, name: 'demo' })
  return { ctx, root }
}

function entryOf(ctx: Context, entryId: string) {
  const found = [...ctx.loader.entries()].find(candidate => candidate.id === entryId)
  if (found === undefined) throw new Error('entry not found')
  return found
}

/** A pid no process has any more. */
function deadPid(): number {
  const child = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' })
  return Number(child.stdout)
}

describe('acryl-door through a real Loader', () => {
  it('stays PENDING without a node server, writes .acryl/door.json once one listens, and removes it when the row is disabled', async () => {
    const { ctx, root } = await loader()
    const entryId = await ctx.loader.create({ name: './row.mjs' })
    await ctx.loader.await()
    expect(entryOf(ctx, entryId).fiber?.state).toBe(PENDING)
    expect(existsSync(doorFilePath(root))).toBe(false)

    ctx.plugin(nodeServer, { port: 0 })
    await ctx.loader.await()
    await expect.poll(() => entryOf(ctx, entryId).fiber?.state).toBe(ACTIVE)
    await expect.poll(() => existsSync(doorFilePath(root))).toBe(true)
    const server = ctx.get('nodeServer') as unknown as { port: number }
    expect(readDoorFile(root)?.url).toBe(`http://127.0.0.1:${String(server.port)}`)

    await entryOf(ctx, entryId).update({ disabled: true })
    await ctx.loader.await()
    expect(existsSync(doorFilePath(root))).toBe(false)
    expect(ctx.get('door')).toBeUndefined()
  })

  it('leaves no connection file and no temporary file after ten disable and enable cycles, with a new secret each run', async () => {
    const { ctx, root } = await loader()
    ctx.plugin(nodeServer, { port: 0 })
    const entryId = await ctx.loader.create({ name: './row.mjs' })
    await ctx.loader.await()
    const secrets = new Set<string>()
    for (let cycle = 0; cycle < 10; cycle += 1) {
      await expect.poll(() => readDoorFile(root)?.secret).toBeDefined()
      secrets.add(readDoorFile(root)?.secret as string)
      await entryOf(ctx, entryId).update({ disabled: true })
      await ctx.loader.await()
      const fiber = entryOf(ctx, entryId).fiber
      expect(fiber === undefined || fiber.state === DISPOSED).toBe(true)
      expect(readdirSync(join(root, '.acryl')).filter(file => file.startsWith('door.json'))).toEqual([])
      await entryOf(ctx, entryId).update({ disabled: false })
      await ctx.loader.await()
    }
    expect(secrets.size).toBe(10)
    // One mounted route set: the page module answers once, not ten times over.
    const server = ctx.get('nodeServer') as unknown as { port: number }
    const response = await fetch(`http://127.0.0.1:${String(server.port)}/api/acryl-door/page.js`)
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('import \'/api/acryl-door/page/main.ts\'\n')
  })

  it('replaces a connection file whose process is gone', async () => {
    const { ctx, root } = await loader()
    mkdirSync(join(root, '.acryl'))
    writeFileSync(doorFilePath(root), JSON.stringify({ version: 1, url: 'http://127.0.0.1:1', secret: 'stale', pid: deadPid() }))
    ctx.plugin(nodeServer, { port: 0 })
    const entryId = await ctx.loader.create({ name: './row.mjs' })
    await ctx.loader.await()
    await expect.poll(() => entryOf(ctx, entryId).fiber?.state).toBe(ACTIVE)
    await expect.poll(() => readDoorFile(root)?.pid).toBe(process.pid)
    expect(readDoorFile(root)?.secret).not.toBe('stale')
  })

  it('fails the row, and leaves the file alone, when another live process serves this folder\'s door', async () => {
    const { ctx, root } = await loader()
    mkdirSync(join(root, '.acryl'))
    const theirs = JSON.stringify({ version: 1, url: 'http://127.0.0.1:1', secret: 'theirs', pid: process.ppid })
    writeFileSync(doorFilePath(root), theirs)
    ctx.plugin(nodeServer, { port: 0 })
    const entryId = await ctx.loader.create({ name: './row.mjs' })
    await ctx.loader.await()
    await expect.poll(() => entryOf(ctx, entryId).fiber?.state).toBe(FAILED)
    expect(readDoorFile(root)?.secret).toBe('theirs')
    expect(ctx.get('door')).toBeUndefined()
  })
})

/**
 * The app folder's own command, `.acryl/bin/acryl` (spec 049 slice 10). The gate: two apps running at once, each folder's command
 * reaches its own app, never the other one and never an `acryl` on PATH.
 */

import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { posixShim, windowsShim } from '../../src/host/shim.ts'
import { UiDriver } from '../../src/page/driver/driver.ts'
import { appFolder, connectPage, domPage, removeFolders, runCommand, startApp, type Running } from '../harness.ts'

const apps: Running[] = []
const pages: Array<{ dispose(): void }> = []
afterEach(async () => {
  for (const page of pages.splice(0)) page.dispose()
  while (apps.length > 0) await apps.pop()?.close()
  removeFolders()
})

async function app(): Promise<Running> {
  const running = await startApp()
  apps.push(running)
  return running
}

describe('the shim text', () => {
  const target = { node: '/opt/node 24/bin/node', nodeOptions: [], client: '/apps/it\'s/cli.js', electron: false }

  it('quotes every word for sh, a quote and a space included, and pins the app folder', () => {
    const text = posixShim('/home/me/my app', target)
    expect(text.startsWith('#!/bin/sh\n')).toBe(true)
    expect(text).toContain(`exec '/opt/node 24/bin/node' '/apps/it'\\''s/cli.js' '--dir' '/home/me/my app' "$@"\n`)
    expect(text).not.toContain('ELECTRON_RUN_AS_NODE')
  })

  it('quotes for cmd.exe, doubles a percent sign, and runs Electron as Node when the app runs in Electron', () => {
    const text = windowsShim('C:\\Users\\me\\100% app', { ...target, node: 'C:\\Program Files\\App\\app.exe', client: 'C:\\app\\cli.js', electron: true })
    expect(text).toContain('set ELECTRON_RUN_AS_NODE=1\r\n')
    expect(text).toContain('"C:\\Program Files\\App\\app.exe" "C:\\app\\cli.js" "--dir" "C:\\Users\\me\\100%% app" %*\r\n')
    expect(text.split('\r\n')[0]).toBe('@echo off')
  })
})

describe('the folder\'s command with two apps running', () => {
  it('reaches only its own app: brief names its folder, look sees its own page, and an acryl on PATH is never used', async () => {
    const first = await app()
    const second = await app()
    // Only the first app has a page open.
    const dom = domPage('<main><h1>First</h1><button type="button">Only here</button></main>')
    pages.push({ dispose: () => { dom.close() } })
    const driver = new UiDriver({ document: () => dom.document })
    const { channel, sources } = connectPage(first, driver)
    pages.push(channel, driver)
    await sources[0]?.opened

    // A decoy `acryl` first on PATH, and a working folder outside both apps.
    const decoy = appFolder()
    mkdirSync(join(decoy, 'bin'))
    writeFileSync(join(decoy, 'bin', 'acryl'), '#!/bin/sh\necho decoy\nexit 9\n')
    chmodSync(join(decoy, 'bin', 'acryl'), 0o755)
    writeFileSync(join(decoy, 'bin', 'acryl.cmd'), '@echo decoy\r\n@exit /b 9\r\n')
    const path = `${join(decoy, 'bin')}${delimiter}${process.env.PATH ?? ''}`

    const [firstBrief, secondBrief] = await Promise.all([
      runCommand(first.root, ['brief'], { cwd: decoy, path }),
      runCommand(second.root, ['brief'], { cwd: decoy, path }),
    ])
    expect(firstBrief, firstBrief.err).toMatchObject({ code: 0 })
    expect(firstBrief.out).toContain(`App demo in ${first.root}.`)
    expect(firstBrief.out).not.toContain(second.root)
    expect(secondBrief, secondBrief.err).toMatchObject({ code: 0 })
    expect(secondBrief.out).toContain(`App demo in ${second.root}.`)
    expect(`${firstBrief.out}${secondBrief.out}`).not.toContain('decoy')

    const firstLook = await runCommand(first.root, ['control', 'snapshot'], { cwd: decoy, path })
    expect(firstLook, firstLook.err).toMatchObject({ code: 0 })
    expect(firstLook.out).toContain('button "Only here"')
    const secondLook = await runCommand(second.root, ['look'], { cwd: decoy, path })
    expect(secondLook.code).toBe(1)
    expect(secondLook.err).toMatch(/^no-window:/u)
  })

  it('is private to the user, and says no app is running once its app stops', async () => {
    const running = await app()
    const shim = join(running.root, '.acryl', 'bin', 'acryl')
    expect(readFileSync(shim, 'utf8')).toContain(running.root)
    if (process.platform !== 'win32') {
      expect(statSync(shim).mode & 0o777).toBe(0o700)
      expect(statSync(join(running.root, '.acryl', 'bin')).mode & 0o777).toBe(0o700)
    }
    await running.close()
    apps.pop()
    const after = await runCommand(running.root, ['brief'], { cwd: running.root })
    expect(after.code).toBe(3)
    expect(after.err).toMatch(/no running app/u)
  })
})

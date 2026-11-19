/**
 * The app folder's own command, `.acryl/bin/acryl` (spec 049 slice 10). The gate: two apps running at once, each folder's command
 * reaches its own app, never the other one and never an `acryl` on PATH.
 */

import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { undoMsysPath, parseInvocation } from '../../src/cli/acryl.ts'
import { posixShim, type ShimFs, windowsShim, writeAtomically } from '../../src/host/shim.ts'
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
  // Real work with real processes: two app boots (each its own router, node server and door), a page channel, and two child processes whose own
  // bound is 30 s in the harness. The default 5 s timeout is a property of the test runner here, not of the work, and a loaded machine trips it.
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
  }, 30_000)
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

describe('a real Node under Electron', () => {
  it('is used when the PATH has one new enough, and Electron runs the client otherwise', async () => {
    const { realNode } = await import('../../src/host/shim.ts')
    expect(realNode(() => ({ path: '/usr/local/bin/node', version: 'v24.19.0' }))).toBe('/usr/local/bin/node')
    expect(realNode(() => ({ path: '/usr/bin/node', version: 'v22.19.0' }))).toBe('/usr/bin/node')
    expect(realNode(() => ({ path: '/usr/bin/node', version: 'v26.8.1' }))).toBe('/usr/bin/node')
    expect(realNode(() => ({ path: '/usr/bin/node', version: 'v22.18.0' }))).toBeUndefined()
    expect(realNode(() => ({ path: '/usr/bin/node', version: 'v18.19.1' }))).toBeUndefined()
    expect(realNode(() => undefined)).toBeUndefined()
  })
})

describe('writing a shim while the app restarts', () => {
  const locked = (code: string): Error => Object.assign(new Error(`${code}: operation not permitted`), { code })
  const folder = (): string => join(appFolder(), 'bin')
  const fsOf = (failures: Error[]): ShimFs & { renames: number; pauses: number } => {
    const fake = {
      renames: 0,
      pauses: 0,
      rename(from: string, to: string): void {
        fake.renames += 1
        const failure = failures.shift()
        if (failure !== undefined) throw failure
        writeFileSync(to, readFileSync(from))
        rmSync(from)
      },
      pause(): void { fake.pauses += 1 },
    }
    return fake
  }

  it('leaves a shim that already holds the text alone: a restart rewrites the same text, and Windows refuses to replace a batch file a running acryl has open', () => {
    const dir = folder()
    mkdirSync(dir, { recursive: true })
    const file = join(dir, 'acryl.cmd')
    writeFileSync(file, 'same text')
    const fs = fsOf([locked('EPERM')])
    writeAtomically(file, 'same text', 0o600, fs)
    expect(fs.renames).toBe(0)
    expect(readdirSync(dir)).toEqual(['acryl.cmd'])
  })

  it('retries a file that is held for a moment, then writes it', () => {
    const dir = folder()
    mkdirSync(dir, { recursive: true })
    const file = join(dir, 'acryl.cmd')
    writeFileSync(file, 'old text')
    const fs = fsOf([locked('EPERM'), locked('EBUSY'), locked('EACCES')])
    writeAtomically(file, 'new text', 0o600, fs)
    expect(readFileSync(file, 'utf8')).toBe('new text')
    expect(fs.renames).toBe(4)
    expect(fs.pauses).toBe(3)
    expect(readdirSync(dir)).toEqual(['acryl.cmd'])
  })

  it('gives up on a file that stays held, reports it, and leaves the old shim and no temporary file', () => {
    const dir = folder()
    mkdirSync(dir, { recursive: true })
    const file = join(dir, 'acryl.cmd')
    writeFileSync(file, 'old text')
    const fs = fsOf(Array.from({ length: 20 }, () => locked('EPERM')))
    expect(() => writeAtomically(file, 'new text', 0o600, fs)).toThrow(/EPERM/u)
    expect(readFileSync(file, 'utf8')).toBe('old text')
    expect(readdirSync(dir)).toEqual(['acryl.cmd'])
  })

  it('does not retry an error that is not a lock (a missing folder, no space)', () => {
    const dir = folder()
    mkdirSync(dir, { recursive: true })
    const file = join(dir, 'acryl')
    const fs = fsOf([Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' })])
    expect(() => writeAtomically(file, 'text', 0o700, fs)).toThrow(/ENOSPC/u)
    expect(fs.renames).toBe(1)
    expect(existsSync(file)).toBe(false)
  })
})

describe('a slash path typed in Git Bash on Windows', () => {
  const git = { EXEPATH: 'C:\\Program Files\\Git' }
  const undo = (value: string, env: NodeJS.ProcessEnv = git, platform: NodeJS.Platform = 'win32') => {
    const warnings: string[] = []
    return { path: undoMsysPath(value, env, platform, warnings), warnings }
  }

  it('is turned back from the Git install folder, with a warning, and anything else is left as it is', () => {
    const converted = undo('C:/Program Files/Git/nope')
    expect(converted.path).toBe('/nope')
    expect(converted.warnings[0]).toMatch(/Git Bash changed the path you typed into "C:\/Program Files\/Git\/nope"; using "\/nope"/u)
    expect(undo('C:\\Program Files\\Git\\board\\two').path).toBe('/board/two')
    expect(undo('c:/program files/git/settings?tab=a').path).toBe('/settings?tab=a')
    // The Git folder found on the PATH when EXEPATH is not set, and another drive's path is not Git's.
    expect(undo('D:/tools/Git/nope', { PATH: 'C:\\Windows;D:\\tools\\Git\\usr\\bin' }).path).toBe('/nope')
    expect(undo('C:/Users/a/project/nope').path).toBe('C:/Users/a/project/nope')
    expect(undo('/nope').warnings).toEqual([])
    // Off Windows nothing is rewritten, whatever the value looks like.
    expect(undo('C:/Program Files/Git/nope', git, 'linux').path).toBe('C:/Program Files/Git/nope')
  })

  it('is read back for --path of navigate and window open, and for nothing typed into a page', () => {
    const env = { ...git }
    const navigate = parseInvocation(['act', 'navigate', '--path', 'C:/Program Files/Git/nope'], env, 'win32')
    expect(navigate.args).toMatchObject({ op: 'navigate', path: '/nope' })
    expect(navigate.warnings).toHaveLength(1)
    expect(parseInvocation(['window', 'open', '--path', 'C:/Program Files/Git/settings'], env, 'win32').args).toEqual({ path: '/settings' })
    expect(parseInvocation(['act', 'type', '--ref', '1.1', '--text', 'C:/Program Files/Git/x'], env, 'win32').args).toMatchObject({ text: 'C:/Program Files/Git/x' })
  })

  it('stays as typed through the shim: the shim exports what stops the conversion, and a real sh keeps /nope all the way to a native node', () => {
    const target = { node: process.execPath, nodeOptions: [], client: join(appFolder(), 'argv.mjs'), electron: false }
    expect(posixShim('/apps/a', target)).toMatch(/export MSYS_NO_PATHCONV=1\nexport MSYS2_ARG_CONV_EXCL='\*'\n/u)
    writeFileSync(target.client, 'console.log(JSON.stringify(process.argv.slice(2)))\n')
    const shim = join(appFolder(), 'acryl')
    writeFileSync(shim, posixShim('/apps/a', target), { mode: 0o700 })
    const sh = spawnSync('sh', ['-c', 'echo ok'], { encoding: 'utf8' })
    if (sh.status !== 0) return // no sh here (a Windows machine without Git): the CI job that runs on one covers it
    const through = spawnSync('sh', [shim, 'act', 'navigate', '--path', '/nope'], { encoding: 'utf8' })
    expect(JSON.parse(through.stdout.trim().split('\n').at(-1) ?? '[]')).toEqual(['--dir', '/apps/a', 'act', 'navigate', '--path', '/nope'])
    if (process.platform === 'win32') {
      // The control: without the exports, MSYS rewrites the same argument. If it does not, this machine's sh is not MSYS and the check above proves nothing, so say so.
      const without = spawnSync('sh', ['-c', `"${process.execPath.replaceAll('\\', '/')}" "${target.client.replaceAll('\\', '/')}" --path /nope`], { encoding: 'utf8' })
      expect(JSON.parse(without.stdout.trim().split('\n').at(-1) ?? '[]')[1], 'MSYS did not rewrite the control argument').not.toBe('/nope')
    }
  })
})

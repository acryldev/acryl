/**
 * The app-instance module (spec 036, "Self-containment"): Bulkheads built from one Abstract Factory per kind of app, chosen once by the selector, handed
 * across processes by one environment contract, and guarded by a Pessimistic Offline Lock and a Registry.
 */
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  AppInstanceError,
  LockHeldError,
  acquireLock,
  announce,
  appFolder,
  defaultInstance,
  instanceEnvironment,
  listRunning,
  managedApp,
  releaseLock,
  selectInstance,
  withdraw,
  type AppInstance,
} from '../src/instance/index.ts'

const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { force: true, recursive: true }) })
const temp = (): string => { const dir = realpathSync(mkdtempSync(join(tmpdir(), 'acryl-instance-'))); dirs.push(dir); return dir }
const app = (root: string, name: string): string => { const dir = join(root, name); mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, 'blend.yaml'), 'x'); return dir }

/** Every resource of a family that another app must never share. */
const footprint = (instance: AppInstance): string[] => [instance.home, instance.dshHome, instance.userDataName, instance.runLockFile, String(instance.webPort.start), instance.projectScope ?? '(shared)']

describe('the families', () => {
  it('two apps share nothing, even when their folders have the same name', () => {
    const root = temp()
    const a = appFolder(app(join(root, 'a'), 'orbit'), root)
    const b = appFolder(app(join(root, 'b'), 'orbit'), root)
    const music = appFolder(app(root, 'music-editor'), root)
    const all = [a, b, music, defaultInstance(root)]
    for (let i = 0; i < all.length; i += 1) for (let j = i + 1; j < all.length; j += 1) {
      const shared = footprint(all[i]!).filter(value => footprint(all[j]!).includes(value))
      expect(shared, `${all[i]!.id} and ${all[j]!.id}`).toEqual([])
    }
  })

  it('only the default instance uses ~/.acryl and port 3080', () => {
    const osHome = temp()
    expect(selectInstance({ env: {}, osHome })).toMatchObject({ kind: 'default', home: join(osHome, '.acryl'), webPort: { start: 3080, scan: false } })
    expect(selectInstance({ env: {}, osHome, development: true }).home).toBe(join(osHome, '.acryl-dev'))
  })

  it('a managed app is unique by name; an app folder elsewhere gets a digest of its path', () => {
    const osHome = temp()
    expect(managedApp('orbit', osHome).id).toBe('orbit')
    for (const escape of ['../x', 'a/b', '..']) expect(() => managedApp(escape, osHome), escape).toThrow(AppInstanceError)
    expect(appFolder(app(join(osHome, '.acryl-instances'), 'orbit'), osHome).kind).toBe('managed')
    expect(appFolder(app(osHome, 'orbit'), osHome).id).toMatch(/^orbit-[0-9a-f]{4}$/u)
  })
})

describe('selectInstance precedence', () => {
  it('ACRYL_HOME with a definition is an app, without one a pinned home, and it outranks an ambient DSH_HOME', () => {
    const root = temp()
    const folder = app(root, 'ledger')
    expect(selectInstance({ env: { ACRYL_HOME: folder, DSH_HOME: '/ambient' }, osHome: root })).toMatchObject({ kind: 'app', dshHome: join(folder, '.dsh') })
    expect(selectInstance({ env: { ACRYL_HOME: '/tmp/pinned', DSH_HOME: '/ambient' }, osHome: root })).toMatchObject({ kind: 'pinned', home: '/tmp/pinned', dshHome: '/tmp/pinned/.dsh' })
  })

  it('a legacy DSH_HOME moves the ACRYL home with it instead of leaving state in the shared ~/.acryl', () => {
    expect(selectInstance({ env: { DSH_HOME: '/x/.dsh' }, osHome: '/h' })).toMatchObject({ home: '/x', dshHome: '/x/.dsh' })
    expect(selectInstance({ env: { DSH_HOME: '/tmp/d' }, osHome: '/h' })).toMatchObject({ home: '/tmp/d', dshHome: '/tmp/d' })
  })

  it('a git worktree checkout gets its own home, port and Electron app; the main checkout does not', () => {
    const root = temp()
    const main = join(root, 'acryl'); mkdirSync(join(main, '.git'), { recursive: true })
    const worktree = join(root, '036-Feature'); mkdirSync(worktree); writeFileSync(join(worktree, '.git'), 'gitdir: x\n')
    expect(selectInstance({ env: {}, osHome: root, checkout: main }).kind).toBe('default')
    expect(selectInstance({ env: {}, osHome: root, checkout: worktree })).toMatchObject({ kind: 'worktree', home: join(root, '.acryl-worktrees', '036-Feature'), webPort: { start: 3081, scan: true }, userDataName: 'ACRYL Development 036-Feature', projectScope: 'worktree-036-feature' })
  })

  it('ACRYL_WEB_PORT sets a start port and fails loudly when invalid', () => {
    expect(selectInstance({ env: { ACRYL_WEB_PORT: '4000' }, osHome: '/h' }).webPort).toEqual({ start: 4000, scan: true })
    for (const bad of ['80', 'abc', '70000']) expect(() => selectInstance({ env: { ACRYL_WEB_PORT: bad }, osHome: '/h' }), bad).toThrow(AppInstanceError)
  })
})

describe('the environment contract', () => {
  it('hands every kind across a process boundary unchanged, and adds nothing for the default', () => {
    const root = temp()
    const worktree = join(root, 'wt'); mkdirSync(worktree); writeFileSync(join(worktree, '.git'), 'gitdir: x\n')
    const cases: AppInstance[] = [
      appFolder(app(root, 'stage-sound'), root),
      selectInstance({ env: {}, osHome: root, checkout: worktree }),
      selectInstance({ env: { DSH_HOME: '/tmp/engine' }, osHome: root }),
      selectInstance({ env: { ACRYL_HOME: '/tmp/pinned' }, osHome: root }),
    ]
    for (const parent of cases) {
      const child = selectInstance({ env: { DSH_HOME: '/ambient/should/lose', ...instanceEnvironment(parent) }, osHome: root })
      expect(footprint(child), parent.kind).toEqual(footprint(parent))
    }
    expect(instanceEnvironment(defaultInstance(root))).toEqual({})
  })
})

describe('Pessimistic Offline Lock', () => {
  it('shows its holder, refuses a live one, admits a compatible one, and takes over a stale one', () => {
    const file = join(temp(), 'lock.json')
    acquireLock(file, { pid: 10, installRoot: '/a' }, { alive: () => true })
    expect(() => acquireLock(file, { pid: 20 }, { alive: () => true })).toThrow(LockHeldError)
    expect(() => acquireLock(file, { pid: 20 }, { alive: () => true, compatible: holder => holder.installRoot === '/a' })).not.toThrow()
    acquireLock(file, { pid: 30 }, { alive: () => false })
    expect(JSON.parse(readFileSync(file, 'utf8')).pid).toBe(30)
    releaseLock(file, 99)
    expect(JSON.parse(readFileSync(file, 'utf8')).pid).toBe(30)
    releaseLock(file, 30)
    expect(() => readFileSync(file)).toThrow()
  })
})

describe('Registry of running apps', () => {
  it('lists live announcements and drops dead ones', () => {
    const osHome = temp()
    const a = appFolder(app(osHome, 'a-app'), osHome)
    const b = appFolder(app(osHome, 'b-app'), osHome)
    announce(osHome, a, { pid: 1, surface: 'web', port: 3101 })
    announce(osHome, b, { pid: 2, surface: 'desktop' })
    expect(listRunning(osHome, pid => pid === 1).map(entry => entry.id)).toEqual([a.id])
    expect(listRunning(osHome, () => true).map(entry => entry.id)).toEqual([a.id])   // b's dead entry was removed on the previous read
    withdraw(osHome, a, 1)
    expect(listRunning(osHome, () => true)).toEqual([])
  })
})

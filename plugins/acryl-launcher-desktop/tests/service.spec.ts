/** The ACRYL screen's rules, against a fake process runner and a scratch home: nothing starts, nothing touches the real home. */
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { addApp, saveModelKey } from 'acryl-launcher'
import { LauncherRefusal, LauncherService } from '../src/service.ts'
import { appEnvironment, type Command, type Run } from '../src/runner.ts'

interface FakeRun extends Run {
  readonly command: Command
  say(text: string): void
  end(code: number | null, notFound?: boolean): void
  stopped: boolean
}

const roots: string[] = []
afterEach(() => { while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true }) })

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'acryl-launcher-desktop-'))
  roots.push(root)
  const home = join(root, '.acryl')
  const appsFolder = join(root, 'ACRYL')
  const runs: FakeRun[] = []
  const service = new LauncherService({
    home, appsFolder,
    runner: (command) => {
      const outputs: Array<(text: string) => void> = []
      const ends: Array<(end: { code: number | null, notFound: boolean }) => void> = []
      const run: FakeRun = {
        command, stopped: false,
        onOutput: (listener) => { outputs.push(listener) },
        onEnd: (listener) => { ends.push(listener) },
        stop: () => { run.stopped = true; run.end(null) },
        say: (text) => { for (const listener of outputs) listener(text) },
        end: (code, notFound = false) => { for (const listener of ends) listener({ code, notFound }) },
      }
      runs.push(run)
      return run
    },
    environment: () => ({ PATH: '/usr/bin', ACRYL_HOME: '/the/desktop/home', DSH_HOME: '/x', ELECTRON_RUN_AS_NODE: '1', HOME: '/h' }),
    exists: path => existsSync(path),
    makeFolder: (path) => { mkdirSync(path, { recursive: true }) },
  })
  const makeApp = (name: string, surface: 'web' | 'desktop' | 'tui' = 'web'): string => {
    const folder = join(root, 'ACRYL', name)
    mkdirSync(folder, { recursive: true })
    writeFileSync(join(folder, 'blend.yaml'), 'id: acrylblends.notes\n')
    addApp(home, { path: folder, surface })
    return folder
  }
  return { root, home, appsFolder, runs, service, makeApp }
}

describe('the list', () => {
  it('shows the registry with state, surface and the folder name, and a folder that is gone as missing', () => {
    const { service, makeApp, root } = setup()
    const shop = makeApp('shop')
    makeApp('crm', 'desktop')
    rmSync(join(root, 'ACRYL', 'crm'), { recursive: true })
    const { apps, appsFolder, starters, job } = service.state()
    expect(appsFolder).toBe(join(root, 'ACRYL'))
    expect(starters.map(starter => starter.value)).toContain('blank')
    expect(job).toBeNull()
    expect(apps.map(app => ({ id: app.id, name: app.name, state: app.state, surface: app.surface, blend: app.blend }))).toEqual([
      { id: 'shop', name: 'shop', state: 'stopped', surface: 'web', blend: 'acrylblends.notes' },
      { id: 'crm', name: 'crm', state: 'missing', surface: 'desktop', blend: 'acrylblends.notes' },
    ])
    expect(apps[0]?.path).toBe(shop)
  })

  it('adds a folder with a blend.yaml, refuses one without in a sentence, and removes without touching the folder', () => {
    const { service, makeApp, root } = setup()
    const shop = makeApp('shop')
    expect(() => service.add(join(root, 'nowhere'))).toThrow(LauncherRefusal)
    expect(() => service.add(join(root, 'nowhere'))).toThrow(/is not an ACRYL app: it has no blend.yaml/u)
    service.remove('shop')
    expect(service.state().apps).toEqual([])
    expect(() => service.remove('shop')).toThrow(/no app "shop"/u)
    expect(service.add(shop).id).toBe('shop')
  })
})

describe('start and stop', () => {
  it('starts npm run dev in the app folder, with the saved model key and without the desktop app\'s own keys', () => {
    const { service, makeApp, runs, home } = setup()
    const shop = makeApp('shop')
    saveModelKey(home, 'sk-abcdefghijklmnopqrstuvwxyz0123456789')
    service.start('shop')
    expect(runs).toHaveLength(1)
    expect(runs[0]?.command.program).toBe('npm')
    expect(runs[0]?.command.args).toEqual(['run', 'dev'])
    expect(runs[0]?.command.cwd).toBe(shop)
    const env = runs[0]!.command.env
    expect(env.DEEPSEEK_API_KEY).toBe('sk-abcdefghijklmnopqrstuvwxyz0123456789')
    expect(Object.keys(env).filter(key => /^(ACRYL_|DSH_|ELECTRON_)/u.test(key))).toEqual([])
    expect(env.HOME).toBe('/h')
    expect(service.state().apps[0]?.state).toBe('starting')
  })

  it('shows the address once the app prints it, and stopping ends it without calling it a failure', () => {
    const { service, makeApp, runs } = setup()
    makeApp('shop')
    service.start('shop')
    runs[0]!.say('> shop@0.1.0 dev\nlistening on http://127.0.0.1:3999/?token=abc\n')
    const running = service.state().apps[0]
    expect(running?.state).toBe('running')
    expect(running?.address).toBe('http://127.0.0.1:3999/?token=abc')
    service.start('shop')
    expect(runs).toHaveLength(1)
    service.stop('shop')
    expect(runs[0]?.stopped).toBe(true)
    const stopped = service.state().apps[0]
    expect(stopped?.state).toBe('stopped')
    expect(stopped?.failure).toBeUndefined()
  })

  it('reports why an app ended on its own with a non-zero code, until it is started again', () => {
    const { service, makeApp, runs } = setup()
    makeApp('shop')
    service.start('shop')
    runs[0]!.say('\u001b[31mError: port 3999 is taken\u001b[0m\n')
    runs[0]!.end(1)
    expect(service.state().apps[0]).toMatchObject({ state: 'stopped', failure: 'Error: port 3999 is taken' })
    service.start('shop')
    expect(service.state().apps[0]?.failure).toBeUndefined()
  })

  it('says so when Node and npm are not on the machine', () => {
    const { service, makeApp, runs } = setup()
    makeApp('shop')
    service.start('shop')
    runs[0]!.end(127, true)
    expect(service.state().apps[0]?.failure).toMatch(/Node.js and npm were not found/u)
  })

  it('refuses an unknown app and a missing folder, and stops everything it started', () => {
    const { service, makeApp, runs, root } = setup()
    expect(() => service.start('nope')).toThrow(/no app "nope"/u)
    makeApp('gone')
    rmSync(join(root, 'ACRYL', 'gone'), { recursive: true })
    expect(() => service.start('gone')).toThrow(/is gone/u)
    makeApp('a'); makeApp('b')
    service.start('a'); service.start('b')
    service.stopAll()
    expect(runs.map(run => run.stopped)).toEqual([true, true])
  })
})

describe('+ New app', () => {
  it('runs acryl new in the chosen folder, lists the app with its surface when its blend.yaml appears, and adopts the process as the app\'s', () => {
    const { service, runs, root } = setup()
    const where = join(root, 'ACRYL')
    service.create({ where, name: 'shop', starter: 'notes', surface: 'desktop' })
    expect(runs[0]?.command).toMatchObject({ program: 'npm', args: ['exec', '--yes', 'create-acrylblends@latest', '--', 'shop', 'notes'], cwd: where })
    expect(service.state().job).toMatchObject({ name: 'shop', status: 'running', line: `cd ${where} && acryl new shop notes` })
    expect(service.state().apps).toEqual([])
    mkdirSync(join(where, 'shop'), { recursive: true })
    writeFileSync(join(where, 'shop', 'blend.yaml'), 'id: acrylblends.notes\n')
    runs[0]!.say('installing...\n')
    expect(service.state().apps[0]).toMatchObject({ id: 'shop', surface: 'desktop', state: 'starting', madeBy: 'person' })
    runs[0]!.say('http://127.0.0.1:3101/?token=t\n')
    expect(service.state().apps[0]).toMatchObject({ state: 'running', address: 'http://127.0.0.1:3101/?token=t' })
    expect(service.state().job?.status).toBe('done')
    service.stop('shop')
    expect(runs[0]?.stopped).toBe(true)
  })

  it('starts a Desktop app with npm run desktop, so it opens in its own window', () => {
    const { service, makeApp, runs } = setup()
    const crm = makeApp('crm', 'desktop')
    service.start('crm')
    expect(runs[0]?.command).toMatchObject({ program: 'npm', args: ['run', 'desktop'], cwd: crm })
  })
  it('counts a clean end with the app listed as made, and starts the app', () => {
    const { service, runs, root } = setup()
    const where = join(root, 'ACRYL')
    service.create({ where, name: 'shop', starter: 'blank', surface: 'web' })
    mkdirSync(join(where, 'shop'), { recursive: true })
    writeFileSync(join(where, 'shop', 'blend.yaml'), 'metadata:\n  id: acrylblends.shop\n')
    runs[0]!.say('Next:\ncd shop\nnpm run dev\n')
    runs[0]!.end(0)
    expect(service.state().job?.status).toBe('done')
    expect(runs).toHaveLength(2)
    expect(runs[1]?.command).toMatchObject({ program: 'npm', args: ['run', 'dev'], cwd: join(where, 'shop') })
    expect(service.state().apps[0]).toMatchObject({ id: 'shop', blend: 'acrylblends.shop', state: 'starting' })
  })

  it('refuses a bad name, an existing folder, a second job, an unknown starter and the surface that is coming', () => {
    const { service, runs, root, makeApp } = setup()
    const where = join(root, 'ACRYL')
    const ask = (over: Partial<{ where: string, name: string, starter: string, surface: 'web' | 'desktop' | 'tui' }>) => () => { service.create({ where, name: 'shop', starter: 'blank', surface: 'web', ...over }) }
    expect(ask({ name: 'My App' })).toThrow(/lower case letters, digits and dashes/u)
    expect(ask({ where: '~/ACRYL' })).toThrow(/whole folder path/u)
    expect(ask({ starter: 'nope' })).toThrow(/no starter/u)
    expect(ask({ surface: 'tui' })).toThrow(/CLI \(TUI\) apps are coming/u)
    makeApp('taken')
    expect(ask({ name: 'taken' })).toThrow(/already a folder named taken/u)
    expect(runs).toHaveLength(0)
    ask({})()
    expect(ask({ name: 'other' })).toThrow(/still being made/u)
  })

  it('says why an app could not be made, in the words the command printed', () => {
    const { service, runs, root } = setup()
    service.create({ where: join(root, 'ACRYL'), name: 'shop', starter: 'blank', surface: 'web' })
    runs[0]!.say('npm error code ENOTFOUND\n')
    runs[0]!.end(1)
    expect(service.state().job).toMatchObject({ status: 'failed', message: 'npm error code ENOTFOUND' })
    service.create({ where: join(root, 'ACRYL'), name: 'second', starter: 'blank', surface: 'web' })
    expect(runs).toHaveLength(2)
  })
})

describe('what a started app inherits', () => {
  it('drops the desktop app\'s own keys, and adds where Node usually lives to a short PATH on Unix', () => {
    const env = appEnvironment({ PATH: '/usr/bin:/bin', ACRYL_HOME: 'x', DSH_HOME: 'y', ELECTRON_RUN_AS_NODE: '1', npm_config_x: 'z', PORT: '1', KEEP: 'me' }, 'darwin')
    expect(env).toEqual({ PATH: '/usr/bin:/bin:/opt/homebrew/bin:/usr/local/bin', KEEP: 'me' })
    expect(appEnvironment({ PATH: 'C:\\x' }, 'win32')).toEqual({ PATH: 'C:\\x' })
  })
})

/** The ACRYL screen's rules, against a fake process runner and a scratch home: nothing starts, nothing touches the real home. */
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { addApp, saveModelKey } from 'acryl-launcher'
import { LauncherRefusal, LauncherService } from '../src/service.ts'
import { appEnvironment, type Command, type Run } from '../src/runner.ts'
import { DoorUnavailable, type Door, type DoorAnswer } from '../src/door.ts'

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
  const registry = { calls: 0 }
  const doorCalls: Array<{ folder: string, verb: string, args: unknown }> = []
  const doorAnswers = new Map<string, DoorAnswer | Error>()
  const door: Door = {
    call: async (folder, verb, args) => { doorCalls.push({ folder, verb, args }); const answer = doorAnswers.get(verb) ?? { ok: true }; if (answer instanceof Error) throw answer; return answer },
    confirmPublish: async (folder, body) => { doorCalls.push({ folder, verb: 'publish-confirmed', args: body }); const answer = doorAnswers.get('publish-confirmed') ?? { ok: true }; if (answer instanceof Error) throw answer; return answer },
  }
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
    door,
    blends: async () => { registry.calls += 1; return [{ id: 'acrylblends.notes', name: 'Notes', version: '0.1.0', category: 'productivity', description: 'a notes app' }] },
  })
  const makeApp = (name: string, surface: 'web' | 'desktop' | 'tui' = 'web', installed = true): string => {
    const folder = join(root, 'ACRYL', name)
    mkdirSync(installed ? join(folder, 'node_modules') : folder, { recursive: true })
    writeFileSync(join(folder, 'blend.yaml'), 'id: acrylblends.notes\n')
    addApp(home, { path: folder, surface })
    return folder
  }
  return { root, home, appsFolder, runs, service, makeApp, registry, doorCalls, doorAnswers }
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

  it('installs the dependencies of an app that has none before starting it, shows it as starting, and keeps npm\'s words when that fails', () => {
    const { service, makeApp, runs } = setup()
    const folder = makeApp('crm', 'desktop', false)
    service.start('crm')
    expect(runs[0]?.command).toMatchObject({ program: 'npm', args: ['install'], cwd: folder })
    expect(service.state().apps[0]).toMatchObject({ state: 'starting' })
    mkdirSync(join(folder, 'node_modules'))
    runs[0]!.end(0)
    expect(runs[1]?.command).toMatchObject({ program: 'npm', args: ['run', 'desktop'], cwd: folder })
    const { service: other, makeApp: another, runs: otherRuns } = setup()
    another('shop', 'web', false)
    other.start('shop')
    otherRuns[0]!.say('npm error code ENOTFOUND\n')
    otherRuns[0]!.end(1)
    expect(other.state().apps[0]).toMatchObject({ state: 'stopped', failure: 'npm error code ENOTFOUND' })
    expect(otherRuns).toHaveLength(1)
  })

  it('starts a Desktop app with npm run desktop, so it opens in its own window', () => {
    const { service, makeApp, runs } = setup()
    const crm = makeApp('crm', 'desktop')
    service.start('crm')
    expect(runs[0]?.command).toMatchObject({ program: 'npm', args: ['run', 'desktop'], cwd: crm })
  })
  it('makes an app from a registry Blend with acryl new --from, and refuses both a starter and a Blend, or an id that could read as an option', () => {
    const { service, runs, root } = setup()
    const where = join(root, 'ACRYL')
    expect(() => { service.create({ where, name: 'notes', starter: 'blank', blend: 'acrylblends.notes', surface: 'web' }) }).toThrow(/starter or a Blend, not both/u)
    expect(() => { service.create({ where, name: 'notes', surface: 'web' }) }).toThrow(/starter or a Blend, not both/u)
    expect(() => { service.create({ where, name: 'notes', blend: '--yes', surface: 'web' }) }).toThrow(/not a Blend id/u)
    expect(runs).toHaveLength(0)
    service.create({ where, name: 'notes', blend: 'acrylblends.notes', surface: 'desktop' })
    expect(runs[0]?.command).toMatchObject({ program: 'npm', args: ['exec', '--yes', 'create-acrylblends@latest', '--', 'notes', '--from', 'acrylblends.notes'], cwd: where })
    expect(service.state().job?.line).toBe(`cd ${where} && acryl new notes --from acrylblends.notes`)
  })

  it('reads the registry once a minute, not on every look at the store', async () => {
    const { service, registry } = setup()
    expect((await service.blends()).map(blend => blend.id)).toEqual(['acrylblends.notes'])
    await service.blends()
    expect(registry.calls).toBe(1)
  })

  it('installs the dependencies of an app that arrives without them (a Blend from the registry), then starts it', () => {
    const { service, runs, root } = setup()
    const where = join(root, 'ACRYL')
    service.create({ where, name: 'notes', blend: 'acrylblends.notes', surface: 'desktop' })
    mkdirSync(join(where, 'notes'), { recursive: true })
    writeFileSync(join(where, 'notes', 'blend.yaml'), 'id: acrylblends.notes\n')
    runs[0]!.say('Next:\n  npm install\n')
    runs[0]!.end(0)
    expect(runs[1]?.command).toMatchObject({ program: 'npm', args: ['install'], cwd: join(where, 'notes') })
    expect(service.state().job).toMatchObject({ status: 'running', message: expect.stringContaining('Installing') })
    mkdirSync(join(where, 'notes', 'node_modules'))
    runs[1]!.end(0)
    expect(service.state().job?.status).toBe('done')
    expect(service.state().job?.message).toBeUndefined()
    expect(runs[2]?.command).toMatchObject({ program: 'npm', args: ['run', 'desktop'], cwd: join(where, 'notes') })
  })

  it('says why an install failed, in the words npm printed, and does not start the app', () => {
    const { service, runs, root } = setup()
    const where = join(root, 'ACRYL')
    service.create({ where, name: 'notes', blend: 'acrylblends.notes', surface: 'web' })
    mkdirSync(join(where, 'notes'), { recursive: true })
    writeFileSync(join(where, 'notes', 'blend.yaml'), 'id: acrylblends.notes\n')
    runs[0]!.say('created notes\n')
    runs[0]!.end(0)
    runs[1]!.say('npm error code ENOTFOUND\n')
    runs[1]!.end(1)
    expect(service.state().job).toMatchObject({ status: 'failed', message: 'npm error code ENOTFOUND' })
    expect(runs).toHaveLength(2)
  })

  it('counts a clean end with the app listed as made, and starts the app', () => {
    const { service, runs, root } = setup()
    const where = join(root, 'ACRYL')
    service.create({ where, name: 'shop', starter: 'blank', surface: 'web' })
    mkdirSync(join(where, 'shop', 'node_modules'), { recursive: true })
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
    const ask = (over: Partial<{ where: string, name: string, starter: string, blend: string, surface: 'web' | 'desktop' | 'tui' }>) => () => { service.create({ where, name: 'shop', starter: 'blank', surface: 'web', ...over }) }
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

describe('plugins of a running app', () => {
  const plan = { owner: 'inboxxobni', repo: 'demo', version: '0.1.0', visibility: 'public', license: 'MIT', createsRepository: true, files: ['index.ts'], integrity: 'sha512-x', digest: 'abc', pullLine: 'npm run acryl -- plugin pull github:inboxxobni/demo@0.1.0@sha256:abc' }

  it('lists what the app\'s door lists, naming the pulled ones, and says so when the app is not running', async () => {
    const { service, makeApp, doorCalls, doorAnswers } = setup()
    const folder = makeApp('shop')
    doorAnswers.set('plugin-list', { ok: true, value: [{ name: 'hello', version: 'e4bc', state: 'active' }, { name: 'pomodoro', version: '6388', state: 'active', pulledFrom: 'github:a/b@0.1.0', author: 'a' }, { nope: 1 }] })
    expect(await service.plugins('shop')).toEqual([
      { name: 'hello', version: 'e4bc', state: 'active' },
      { name: 'pomodoro', version: '6388', state: 'active', pulledFrom: 'github:a/b@0.1.0', author: 'a' },
    ])
    expect(doorCalls[0]).toEqual({ folder, verb: 'plugin-list', args: {} })
    doorAnswers.set('plugin-list', new DoorUnavailable('the app is not running: start it from this screen, then try again'))
    await expect(service.plugins('shop')).rejects.toThrow(LauncherRefusal)
    await expect(service.plugins('nope')).rejects.toThrow(/no app "nope"/u)
  })

  it('pulls from a source through the door, refuses a source that could read as an option, and relays the door\'s refusal', async () => {
    const { service, makeApp, doorCalls, doorAnswers } = setup()
    makeApp('shop')
    doorAnswers.set('plugin-pull', { ok: true, text: 'installed pomodoro' })
    doorAnswers.set('plugin-list', { ok: true, value: [{ name: 'pomodoro', version: '1', state: 'active', pulledFrom: 'github:a/b@0.1.0' }] })
    const result = await service.pullPlugin('shop', ' github:a/b@0.1.0 ')
    expect(result.text).toBe('installed pomodoro')
    expect(result.plugins).toHaveLength(1)
    expect(doorCalls.find(call => call.verb === 'plugin-pull')?.args).toEqual({ source: 'github:a/b@0.1.0' })
    await expect(service.pullPlugin('shop', '--force')).rejects.toThrow(/say where the plugin is/u)
    doorAnswers.set('plugin-pull', { ok: false, code: 'refused', message: 'a/b has no release v9. nothing was installed.' })
    await expect(service.pullPlugin('shop', 'github:a/b@9')).rejects.toThrow('has no release v9')
  })

  it('reads the publish plan without sending anything, then sends only the plan the person confirmed', async () => {
    const { service, makeApp, doorCalls, doorAnswers } = setup()
    makeApp('shop')
    doorAnswers.set('plugin-publish', { ok: true, value: plan })
    expect(await service.publishPlan({ id: 'shop', plugin: 'demo', owner: 'inboxxobni' })).toEqual(plan)
    expect(doorCalls.at(-1)).toMatchObject({ verb: 'plugin-publish', args: { name: 'demo', owner: 'inboxxobni' } })
    expect(doorCalls.some(call => call.verb === 'publish-confirmed')).toBe(false)

    doorAnswers.set('publish-confirmed', { ok: true, value: { ok: true, releaseUrl: 'https://github.com/inboxxobni/demo/releases/tag/v0.1.0', pullLine: plan.pullLine } })
    expect(await service.publish({ id: 'shop', plugin: 'demo', owner: 'inboxxobni', plan })).toEqual({ releaseUrl: 'https://github.com/inboxxobni/demo/releases/tag/v0.1.0', pullLine: plan.pullLine })
    expect(doorCalls.at(-1)).toMatchObject({ verb: 'publish-confirmed', args: { name: 'demo', owner: 'inboxxobni', confirm: plan } })

    doorAnswers.set('publish-confirmed', { ok: true, value: { ok: false, reason: 'this plugin\'s publish changed since you confirmed it', next: 'review it again' } })
    await expect(service.publish({ id: 'shop', plugin: 'demo', plan })).rejects.toThrow('Not published: this plugin\'s publish changed since you confirmed it. review it again')
  })

  it('shares a whole app through the app\'s own command: the plan sends nothing, the yes hands that plan back, a refusal is said in words', async () => {
    const { service, makeApp, runs } = setup()
    const folder = makeApp('shop')
    await expect(service.sharePlan({ id: 'shop' })).rejects.toThrow(/made before apps could share themselves.*npx acrylblends@latest upgrade/u)
    expect(runs).toHaveLength(0)
    mkdirSync(join(folder, 'plugins', 'save'), { recursive: true })
    writeFileSync(join(folder, 'plugins', 'save', 'share-cli.ts'), '')
    await expect(service.sharePlan({ id: 'shop', owner: '--force' })).rejects.toThrow('is not a GitHub account name')

    const sharePlan = { repository: 'inboxxobni/shop', create: true, visibility: 'private' as const, changes: 2 }
    const asked = service.sharePlan({ id: 'shop', owner: 'inboxxobni' })
    await Promise.resolve()
    expect(runs.at(-1)?.command).toMatchObject({ program: 'node', args: [join('plugins', 'save', 'share-cli.ts'), '--json', '--owner', 'inboxxobni'], cwd: folder })
    runs.at(-1)?.say(`${JSON.stringify(sharePlan)}\n`)
    runs.at(-1)?.end(0)
    expect(await asked).toEqual(sharePlan)

    const sent = service.share({ id: 'shop', owner: 'inboxxobni', plan: sharePlan })
    await Promise.resolve()
    const confirm = runs.at(-1)?.command.args.at(-1) ?? ''
    expect(runs.at(-1)?.command.args.slice(0, -1)).toEqual([join('plugins', 'save', 'share-cli.ts'), '--json', '--owner', 'inboxxobni', '--confirm'])
    expect(JSON.parse(Buffer.from(confirm, 'base64url').toString('utf8'))).toEqual(sharePlan)
    runs.at(-1)?.say('{"ok":true,"remote":"https://github.com/inboxxobni/shop.git","created":true,"commit":"abc"}\n')
    runs.at(-1)?.end(0)
    expect(await sent).toEqual({ remote: 'https://github.com/inboxxobni/shop.git', created: true })

    const refused = service.share({ id: 'shop', plan: sharePlan })
    await Promise.resolve()
    runs.at(-1)?.say('{"ok":false,"reason":"the app changed since this plan was shown, so nothing was sent. Read the new plan and confirm it"}\n')
    runs.at(-1)?.end(1)
    await expect(refused).rejects.toThrow('Not shared: the app changed since this plan was shown')
  })

  it('refuses a plugin name, account or license that is not one, before the door is asked', async () => {
    const { service, makeApp, doorCalls } = setup()
    makeApp('shop')
    await expect(service.publishPlan({ id: 'shop', plugin: '../x' })).rejects.toThrow(/not a plugin name/u)
    await expect(service.publishPlan({ id: 'shop', plugin: 'demo', owner: '-rf' })).rejects.toThrow(/not a GitHub account/u)
    await expect(service.publishPlan({ id: 'shop', plugin: 'demo', license: 'x y' })).rejects.toThrow(/not a license/u)
    expect(doorCalls).toHaveLength(0)
  })
})

describe('the assistant\'s folder', () => {
  it('is the apps folder, made when it was not there', () => {
    const { service, appsFolder } = setup()
    expect(existsSync(appsFolder)).toBe(false)
    expect(service.assistantFolder()).toBe(appsFolder)
    expect(existsSync(appsFolder)).toBe(true)
    expect(service.assistantFolder()).toBe(appsFolder)
  })
})

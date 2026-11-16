import { execFileSync, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  closure,
  copyPlugin,
  HELP,
  type Io,
  isOmitted,
  mergeDependencies,
  mergeTooling,
  nameFrom,
  parseInitOptions,
  readLibrary,
  readTemplatePlugins,
  runCli,
  TEMPLATE_SUMMARY,
  TEMPLATES,
  templatesRoot,
  UsageError,
  VERSION,
} from '../src/index'

const scratch = mkdtempSync(join(tmpdir(), 'acrylblends-cli-test-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

/** A test Io: captures output, answers prompts from a list, and records install calls. */
function fakeIo(options: { answers?: string[]; installCode?: number } = {}) {
  const out: string[] = []
  const err: string[] = []
  const installed: string[] = []
  const answers = options.answers ? [...options.answers] : undefined
  const io: Io = {
    stdout: { write: (text: string) => out.push(text) },
    stderr: { write: (text: string) => err.push(text) },
    cwd: scratch,
    ask: answers ? async () => answers.shift() ?? '' : undefined,
    install: async (directory) => {
      installed.push(directory)
      return options.installCode ?? 0
    },
  }
  return { io, out: () => out.join(''), err: () => err.join(''), installed }
}

const manifest = (dir: string) => JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))

describe('templates', () => {
  it('are exactly the folders of templates/, each with a one-line summary, and the help lists them all', () => {
    expect(readdirSync(templatesRoot()).sort()).toEqual([...TEMPLATES].sort())
    expect(Object.keys(TEMPLATE_SUMMARY).sort()).toEqual([...TEMPLATES].sort())
    for (const name of TEMPLATES)
      expect(HELP).toContain(`${name.padEnd(7)} ${TEMPLATE_SUMMARY[name]}`)
  })

  it('init accepts every template by name, and the old create name acryl-app means agent', () => {
    for (const name of TEMPLATES)
      expect(parseInitOptions(['app', '--template', name]).template).toBe(name)
    expect(parseInitOptions(['app', '--template', 'acryl-app']).template).toBe('agent')
    expect(() => parseInitOptions(['app', '--template', 'nope'])).toThrow(/unknown template/)
  })

  it.each(TEMPLATES)(
    '%s lists library plugins that exist, and declares only typescript of its own (the .tsx hook compiles with it at start, so a production install needs it)',
    (template) => {
      const library = readLibrary()
      for (const name of readTemplatePlugins(join(templatesRoot(), template)))
        expect(library.has(name)).toBe(true)
      // The Cordis templates made for the web also depend on the framework package, for its command (check-deps, build-client) and its browser files.
      const web = ['nodejs', 'notes', 'chat'].includes(template)
      expect(manifest(join(templatesRoot(), template)).dependencies).toEqual({
        ...(web ? { acrylblends: '__ACRYLBLENDS_RANGE__' } : {}),
        typescript: '6.0.3',
      })
    },
  )
})

describe('what an app needs at run time is not also a development dependency', () => {
  const manifestIn = (dir: string) =>
    JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
  const appWith = (name: string, manifest: object): string => {
    const dir = join(scratch, name)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, ...manifest }))
    return dir
  }

  it('a run-time dependency added after a development one of the same name takes its place (npm lets the development entry win, and --omit=dev would leave it out)', () => {
    const dir = appWith('dev-first', { devDependencies: { ws: '8.21.3', vitest: '4' } })
    mergeDependencies(dir, { ws: '8.21.3' })
    expect(manifestIn(dir).dependencies).toEqual({ ws: '8.21.3' })
    expect(manifestIn(dir).devDependencies).toEqual({ vitest: '4' })
  })

  it('a plugin that asks for a newer version moves the app forward, because its code was written against that version', () => {
    const dir = appWith('older-pin', { dependencies: { core: '0.4.0', caret: '^1.2.0' } })
    expect(mergeDependencies(dir, { core: '0.5.0', caret: '1.3.0' })).toEqual(['core', 'caret'])
    expect(manifestIn(dir).dependencies).toEqual({ caret: '1.3.0', core: '0.5.0' })
  })

  it('a plugin never moves the app back, and leaves a tag or a path alone', () => {
    const dir = appWith('newer-pin', {
      dependencies: { core: '0.6.0', same: '1.0.0', tagged: 'latest', local: 'file:../x' },
    })
    expect(
      mergeDependencies(dir, { core: '0.5.0', same: '1.0.0', tagged: '9.0.0', local: '9.0.0' }),
    ).toEqual([])
    expect(manifestIn(dir).dependencies).toEqual({
      core: '0.6.0',
      local: 'file:../x',
      same: '1.0.0',
      tagged: 'latest',
    })
  })

  it('a development dependency of a package the app already needs at run time is not added', () => {
    const dir = appWith('runtime-first', { dependencies: { ws: '8.21.3' } })
    expect(
      mergeTooling(dir, { devDependencies: { ws: '8.21.3', tsx: '4' } }).devDependencies,
    ).toEqual(['tsx'])
    expect(manifestIn(dir).devDependencies).toEqual({ tsx: '4' })
  })

  it('an agent app made by init lists ws once, as a run-time dependency (the state plugin follows keys over a WebSocket in production)', async () => {
    const session = fakeIo()
    expect(await runCli(['init', 'ws-once', '--template', 'agent', '-y'], session.io)).toBe(0)
    const manifest = manifestIn(join(scratch, 'ws-once'))
    expect(manifest.dependencies?.ws).toBeDefined()
    expect(manifest.devDependencies?.ws).toBeUndefined()
  })
})

describe('a coding agent in a generated app', () => {
  it.each(TEMPLATES)(
    '%s: docs/framework is inside the app, and AGENTS.md and CLAUDE.md point to it',
    async (template) => {
      const session = fakeIo()
      expect(
        await runCli(['init', `app-${template}`, '--template', template, '-y'], session.io),
      ).toBe(0)
      const dir = join(scratch, `app-${template}`)
      const agents = readFileSync(join(dir, 'AGENTS.md'), 'utf8')
      expect(agents).toContain(`# app-${template}`)
      expect(agents).toContain('docs/framework/README.md')
      expect(agents).not.toContain('__APP_NAME__')
      expect(agents).toContain(`## This app (${template})`)
      expect(readFileSync(join(dir, 'CLAUDE.md'), 'utf8')).toBe(agents)
      expect(agents).toContain('## Defaults you can swap')
      const appSkill = readFileSync(join(dir, '.claude/skills/acryl-app/SKILL.md'), 'utf8')
      expect(readFileSync(join(dir, '.agents/skills/acryl-app/SKILL.md'), 'utf8')).toBe(appSkill)
      expect(appSkill).toContain(`Working in app-${template}`)
      const pluginSkill = readFileSync(join(dir, '.claude/skills/cordis-plugin/SKILL.md'), 'utf8')
      expect(readFileSync(join(dir, '.agents/skills/cordis-plugin/SKILL.md'), 'utf8')).toBe(
        pluginSkill,
      )
      expect(pluginSkill).toContain('Adding a Cordis plugin')
      // One plugin folder: the generated text and both skills name no second one except to forbid it.
      for (const text of [agents, appSkill, pluginSkill])
        expect(
          text.replace(
            /Do not create `src\/plugins\/` or `extensions\/`\.|There is no `src\/plugins\/` and no `extensions\/`\./gu,
            '',
          ),
        ).not.toMatch(/src\/plugins|extensions\//u)
      const ignored = readFileSync(join(dir, '.gitignore'), 'utf8').split('\n')
      expect(ignored).toContain('.acryl/')
      // The engine reads a key from a .env in the app's folder: never committed, so never pushed or shared.
      expect(ignored).toEqual(expect.arrayContaining(['.env', '.env.*']))
      for (const page of [
        'README.md',
        'api/routing.md',
        'api/request.md',
        'api/context.md',
        'api/summary.md',
        'guides/validation.md',
        'guides/helpers.md',
        'cordis/migration-from-0-4.md',
      ])
        expect(existsSync(join(dir, 'docs/framework', page))).toBe(true)
      expect(existsSync(join(dir, 'docs/framework/upstream.json'))).toBe(false)
      expect(existsSync(join(dir, 'docs/framework/UPSTREAM.md'))).toBe(false)
      expect(existsSync(join(dir, 'AGENTS.md.bak'))).toBe(false)
      // every page the README links exists in the copy
      for (const [, target] of readFileSync(join(dir, 'docs/framework/README.md'), 'utf8').matchAll(
        /\]\((?!http|#)([^)#]+)/g,
      ))
        expect(existsSync(join(dir, 'docs/framework', target as string)), String(target)).toBe(true)
    },
  )
})

describe('library', () => {
  it('orders each plugin after what it requires, without duplicates', () => {
    const names = closure(['acryl-node-server', 'instance', 'acryl-router'], readLibrary()).map(
      (plugin) => plugin.name,
    )
    expect(names).toEqual(['acryl-router', 'acryl-node-server', 'instance'])
  })

  it('refuses an unknown plugin and names who required it', () => {
    expect(() => closure(['nope'], readLibrary())).toThrow(/no plugin "nope"/)
  })

  it('every plugin states the services it provides and injects, and every injected service has a provider', () => {
    const library = [...readLibrary().values()] as unknown as Array<{
      name: string
      inject: string[]
      provides: string[]
    }>
    const provided = new Set(library.flatMap((plugin) => plugin.provides))
    for (const plugin of library) {
      expect(Array.isArray(plugin.provides) && Array.isArray(plugin.inject), plugin.name).toBe(true)
      for (const service of plugin.inject)
        expect(provided.has(service), `${plugin.name} injects ${service}`).toBe(true)
    }
  })

  it('every plugin depends only on the named run-time packages', () => {
    const allowed = new Set([
      '@deepseek-ai/cordis',
      '@deepseek-ai/schemastery',
      '@webboxes/app-persistence',
      '@webboxes/blends-core',
      '@webboxes/plugin-hub',
      'node-pty',
      'ws',
      'yaml',
    ])
    for (const plugin of readLibrary().values()) {
      for (const name of Object.keys(plugin.dependencies)) expect(allowed.has(name)).toBe(true)
    }
  })
})

describe('vendored framework plugins', () => {
  it('copy their source with the plugins they require, and leave out tests and what an app cannot type-check', () => {
    const library = readLibrary()
    const names = closure(['acryl-state'], library).map((plugin) => plugin.name)
    expect(names).toEqual(['acryl-router', 'acryl-state'])
    const app = mkdtempSync(join(tmpdir(), 'vendored-copy-'))
    try {
      for (const plugin of closure(['acryl-state'], library)) copyPlugin(plugin, app)
      const copied = (path: string) => existsSync(join(app, 'plugins', path))
      expect(copied('acryl-router/src/index.ts')).toBe(true)
      expect(copied('acryl-state/src/index.ts')).toBe(true)
      // A package is copied as its source: no build files, tests or manifest of the repository.
      expect(copied('acryl-state/package.json')).toBe(false)
      expect(copied('acryl-state/tsdown.config.ts')).toBe(false)
      expect(copied('acryl-state/tests')).toBe(false)
      expect(copied('acryl-state/LICENSE')).toBe(true)
      expect(copied('acryl-state/src/react.ts')).toBe(false)
      expect(copied('acryl-state/tests')).toBe(false)
      expect(copied('acryl-state/plugin.json')).toBe(false)
    } finally {
      rmSync(app, { recursive: true, force: true })
    }
  })
})

describe('omit patterns', () => {
  it('match exact paths and globs: * within a folder name, ** across folders', () => {
    const omit = ['src/react.ts', '**/*.test.*', '**/*.case.ts', 'fixtures/**']
    for (const path of [
      'src/react.ts',
      'a.test.ts',
      'src/core/app.test.ts',
      'src/core/helper/streaming/sse.test.tsx',
      'src/core/router/common.case.ts',
      'fixtures/data.json',
      'fixtures/deep/er/data.json',
    ])
      expect(isOmitted(path, omit), path).toBe(true)
    for (const path of [
      'src/index.ts',
      'src/core/app.ts',
      'src/core/latest.tsx',
      'src/core/testing.ts',
      'src/core/test/helper.ts',
      'src/react.tsx',
      'fixtures.ts',
    ])
      expect(isOmitted(path, omit), path).toBe(false)
    expect(isOmitted('anything', undefined)).toBe(false)
    expect(isOmitted('a.b', ['a.b'])).toBe(true)
    expect(isOmitted('axb', ['a.b'])).toBe(false)
  })

  it('keep colocated test files out of an app while the sources arrive', () => {
    const library = mkdtempSync(join(tmpdir(), 'omit-lib-'))
    const app = mkdtempSync(join(tmpdir(), 'omit-app-'))
    try {
      const folder = join(library, 'demo')
      mkdirSync(join(folder, 'src', 'core'), { recursive: true })
      writeFileSync(join(folder, 'plugin.json'), '{}')
      writeFileSync(join(folder, 'src', 'index.ts'), 'export {}')
      writeFileSync(join(folder, 'src', 'core', 'app.ts'), 'export {}')
      writeFileSync(join(folder, 'src', 'core', 'app.test.ts'), 'export {}')
      writeFileSync(join(folder, 'src', 'core', 'view.test.tsx'), 'export {}')
      writeFileSync(join(folder, 'src', 'core', 'router.case.ts'), 'export {}')
      copyPlugin(
        {
          name: 'demo',
          description: '',
          requires: [],
          dependencies: {},
          omit: ['**/*.test.*', '**/*.case.ts'],
        },
        app,
        library,
      )
      const copied = (path: string) => existsSync(join(app, 'plugins', 'demo', path))
      expect(copied('src/index.ts')).toBe(true)
      expect(copied('src/core/app.ts')).toBe(true)
      expect(copied('src/core/app.test.ts')).toBe(false)
      expect(copied('src/core/view.test.tsx')).toBe(false)
      expect(copied('src/core/router.case.ts')).toBe(false)
    } finally {
      rmSync(library, { recursive: true, force: true })
      rmSync(app, { recursive: true, force: true })
    }
  })
})

describe('command line', () => {
  it('prints help and version', async () => {
    const help = fakeIo()
    expect(await runCli(['--help'], help.io)).toBe(0)
    expect(help.out()).toContain('acrylblends init [dir]')
    const version = fakeIo()
    expect(await runCli(['--version'], version.io)).toBe(0)
    expect(version.out()).toBe(`${VERSION}\n`)
  })

  it('exits 2 with help on no command or an unknown one', async () => {
    expect(await runCli([], fakeIo().io)).toBe(2)
    const unknown = fakeIo()
    expect(await runCli(['graph'], unknown.io)).toBe(2)
    expect(unknown.err()).toContain('unknown command "graph"')
  })

  it('parses init flags and rejects bad ones', () => {
    expect(parseInitOptions(['shop', '--agent', '--name', 'my-shop', '-y'])).toEqual({
      directory: 'shop',
      name: 'my-shop',
      template: 'agent',
      install: undefined,
      // In the frame unless --bare: the README's own command (`init my-app --agent -y`) once made a plain app nobody asked for.
      desktop: true,
      quietNext: false,
      yes: true,
    })
    expect(parseInitOptions(['--desktop']).desktop).toBe(true)
    expect(parseInitOptions(['--bare']).desktop).toBe(false)
    expect(() => parseInitOptions(['--bare', '--desktop'])).toThrow(UsageError)
    expect(parseInitOptions(['--no-agent']).template).toBe('blank')
    expect(parseInitOptions(['x', '--template', 'blank']).template).toBe('blank')
    expect(parseInitOptions(['x', '--template', 'agent', '--agent']).template).toBe('agent')
    expect(parseInitOptions(['x']).template).toBeUndefined()
    expect(() => parseInitOptions(['--agent', '--no-agent'])).toThrow(/not both/)
    expect(() => parseInitOptions(['--template', 'wiki'])).toThrow(/unknown template "wiki"/)
    expect(() => parseInitOptions(['--template', 'blank', '--agent'])).toThrow(/contradicts/)
    expect(() => parseInitOptions(['a', 'b'])).toThrow(UsageError)
    expect(() => parseInitOptions(['--host', 'x'])).toThrow(UsageError)
  })

  it('derives a valid name from a directory', () => {
    expect(nameFrom('/tmp/My Cool_App')).toBe('my-cool-app')
    expect(nameFrom('/tmp/123')).toBe('my-app')
  })
})

describe('init', () => {
  it('copies the blank template with the name filled in', async () => {
    const session = fakeIo()
    expect(await runCli(['init', 'plain', '--bare', '-y'], session.io)).toBe(0)
    const dir = join(scratch, 'plain')
    expect(manifest(dir).name).toBe('plain')
    expect(readFileSync(join(dir, 'src/routes.ts'), 'utf8')).toContain("APP_NAME = 'plain'")
    expect(existsSync(join(dir, 'plugins/instance/index.ts'))).toBe(true)
    for (const plugin of ['acryl-router', 'acryl-node-server'])
      expect(existsSync(join(dir, 'plugins', plugin, 'src/index.ts'))).toBe(true)
    expect(existsSync(join(dir, 'plugins/agent'))).toBe(false)
    expect(existsSync(join(dir, 'plugins/acryl-router/plugin.json'))).toBe(false)
    expect(existsSync(join(dir, 'plugins/acryl-router/tests'))).toBe(false)
    expect(existsSync(join(dir, 'plugins/acryl-router/package.json'))).toBe(false)
    expect(existsSync(join(dir, 'plugins/acryl-router/src/index.ts'))).toBe(true)
    expect(existsSync(join(dir, '.gitignore'))).toBe(true)
    expect(readFileSync(join(dir, '.gitattributes'), 'utf8')).toMatch(/^\* text=auto eol=lf$/mu)
    expect(existsSync(join(dir, 'template.json'))).toBe(false)
    expect(manifest(dir).dependencies).toEqual({
      '@deepseek-ai/cordis': '4.0.4',
      '@deepseek-ai/schemastery': '3.18.4',
      '@webboxes/app-persistence': '0.1.2',
      '@webboxes/blends-core': '0.5.0',
      '@webboxes/plugin-hub': '0.2.2',
      typescript: '6.0.3',
      yaml: '2.9.0',
    })
    expect(existsSync(join(dir, 'blend.yaml'))).toBe(true)
    expect(session.out()).toContain('created plain (blank)')
    expect(session.out()).toContain('cd plain\n  npm install\n  npm run dev')
    expect(session.installed).toEqual([])
  })

  it('copies the template named on the terminal, and refuses an unknown one', async () => {
    const unknown = fakeIo({ answers: ['', 'wiki', 'n'] })
    expect(await runCli(['init', 'nope'], unknown.io)).toBe(2)
    expect(unknown.err()).toContain('unknown template "wiki"')
    expect(existsSync(join(scratch, 'nope'))).toBe(false)
  })

  it('copies the agent template when asked on the terminal', async () => {
    const session = fakeIo({ answers: ['', 'agent', 'n'] })
    expect(await runCli(['init', 'asked'], session.io)).toBe(0)
    expect(existsSync(join(scratch, 'asked/plugins/agent/agent.ts'))).toBe(true)
    expect(session.out()).toContain('created asked (agent)')
  })

  it('refuses a non-empty directory and changes nothing', async () => {
    const dir = join(scratch, 'full')
    mkdirSync(dir)
    writeFileSync(join(dir, 'notes.md'), 'mine')
    const session = fakeIo()
    expect(await runCli(['init', 'full', '-y'], session.io)).toBe(1)
    expect(session.err()).toContain('refusing to write')
    expect(readdirSync(dir)).toEqual(['notes.md'])
  })

  it('rejects an invalid name before writing', async () => {
    const session = fakeIo()
    expect(await runCli(['init', 'bad', '--name', 'Bad Name', '-y'], session.io)).toBe(2)
    expect(existsSync(join(scratch, 'bad'))).toBe(false)
  })

  it('installs when asked and reports a failed install', async () => {
    const ok = fakeIo()
    expect(await runCli(['init', 'installed', '-y', '--install'], ok.io)).toBe(0)
    expect(ok.installed).toEqual([join(scratch, 'installed')])
    expect(ok.out()).not.toContain('npm install')
    const failing = fakeIo({ installCode: 1 })
    expect(await runCli(['init', 'install-fails', '-y', '--install'], failing.io)).toBe(1)
    expect(failing.err()).toContain('npm install failed')
  })
})

describe('the desktop shell', () => {
  it('init --desktop adds the plugin, electron as a development dependency, the script and the todo window address', async () => {
    const session = fakeIo()
    expect(
      await runCli(['init', 'desk', '--template', 'todo', '--desktop', '-y'], session.io),
    ).toBe(0)
    const dir = join(scratch, 'desk')
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    expect(pkg.devDependencies.electron).toBe('44.9.3')
    expect(pkg.dependencies.electron).toBeUndefined()
    expect(pkg.scripts.desktop).toBe('node plugins/desktop/launch.ts')
    expect(pkg.acrylblends).toEqual({ desktopPath: '/todo' })
    for (const file of ['main.ts', 'window.ts', 'user-data.ts', 'shutdown.ts'])
      expect(existsSync(join(dir, 'plugins/desktop', file))).toBe(true)
    expect(existsSync(join(dir, 'plugins/desktop/plugin.json'))).toBe(false)
  })

  it('a plain init has no electron, and add desktop brings it later without replacing a script the app has', async () => {
    const session = fakeIo()
    expect(
      await runCli(['init', 'plain-desk', '--template', 'blank', '--bare', '-y'], session.io),
    ).toBe(0)
    const dir = join(scratch, 'plain-desk')
    const file = join(dir, 'package.json')
    expect(JSON.parse(readFileSync(file, 'utf8')).devDependencies.electron).toBeUndefined()
    const pkg = JSON.parse(readFileSync(file, 'utf8'))
    pkg.scripts.desktop = 'echo mine'
    writeFileSync(file, JSON.stringify(pkg))
    expect(await runCli(['add', 'desktop', '--dir', dir], fakeIo().io)).toBe(0)
    const after = JSON.parse(readFileSync(file, 'utf8'))
    expect(after.devDependencies.electron).toBe('44.9.3')
    expect(after.scripts.desktop).toBe('echo mine')
  })
})

describe('the desktop shell in a plain Acryl app', () => {
  it('add desktop picks desktop-web for an app without the Blend plugins, adds the script, electron, the gitignore line and the instance plugin that decides where its data lives', async () => {
    const dir = join(scratch, 'plain-acryl')
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({
        name: 'plain-acryl',
        scripts: { dev: 'x' },
        dependencies: { acrylblends: '^0.6.0' },
      }),
    )
    writeFileSync(join(dir, 'src/app.ts'), 'export default {}\n')
    writeFileSync(join(dir, '.gitignore'), 'node_modules/\n')
    expect(await runCli(['add', 'desktop', '--dir', dir], fakeIo().io)).toBe(0)
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    expect(pkg.scripts).toEqual({ desktop: 'node plugins/desktop-web/launch.ts', dev: 'x' })
    expect(pkg.devDependencies.electron).toBe('44.9.3')
    expect(existsSync(join(dir, 'plugins/desktop-web/main.ts'))).toBe(true)
    // The instance plugin comes with it: it alone decides where the app's data lives (~/.acryl/apps/<id>/data).
    expect(existsSync(join(dir, 'plugins/instance/index.ts'))).toBe(true)
    expect(existsSync(join(dir, 'plugins/desktop'))).toBe(false)
    expect(readFileSync(join(dir, '.gitignore'), 'utf8')).toBe('node_modules/\n.acrylblends/\n')
    // Adding it again changes nothing and is refused.
    expect(await runCli(['add', 'desktop', '--dir', dir], fakeIo().io)).toBe(1)
  })
})

describe('add and plugins', () => {
  it('adds a plugin to an app, refuses it twice, and refuses a folder that is not an app', async () => {
    expect(await runCli(['init', 'grows', '-y'], fakeIo().io)).toBe(0)
    const dir = join(scratch, 'grows')
    const first = fakeIo()
    expect(await runCli(['add', 'agent', '--dir', dir], first.io)).toBe(0)
    expect(existsSync(join(dir, 'plugins/agent/index.ts'))).toBe(true)
    expect(first.out()).toContain('added agent')
    const again = fakeIo()
    expect(await runCli(['add', 'agent', '--dir', dir], again.io)).toBe(1)
    expect(again.err()).toContain('already has plugins/agent')
    const nowhere = fakeIo()
    expect(await runCli(['add', 'agent', '--dir', join(scratch, 'missing')], nowhere.io)).toBe(1)
    expect(nowhere.err()).toContain('is not an app')
  })

  it('records library copies in plugins/library.json, and keeps copying into src/plugins for an app that still has the old layout', async () => {
    expect(await runCli(['init', 'grows2', '-y'], fakeIo().io)).toBe(0)
    const dir = join(scratch, 'grows2')
    expect(await runCli(['add', 'agent', '--dir', dir], fakeIo().io)).toBe(0)
    const listed = JSON.parse(readFileSync(join(dir, 'plugins/library.json'), 'utf8')) as {
      plugins: string[]
    }
    expect(listed.plugins).toContain('agent')
    expect(listed.plugins).toContain('instance')
    const old = join(scratch, 'old')
    mkdirSync(join(old, 'src/plugins'), { recursive: true })
    writeFileSync(join(old, 'package.json'), '{"name":"old"}\n')
    const legacy = fakeIo()
    expect(await runCli(['add', 'agent', '--dir', old], legacy.io)).toBe(0)
    expect(existsSync(join(old, 'src/plugins/agent/index.ts'))).toBe(true)
    expect(existsSync(join(old, 'plugins'))).toBe(false)
    expect(legacy.err()).toContain('plugins now live in one folder, plugins/')
  })

  it('add kv --suite brings the conformance suite of the port and the vitest it runs on; without it the suite stays out', async () => {
    expect(await runCli(['init', 'suited', '-y'], fakeIo().io)).toBe(0)
    const dir = join(scratch, 'suited')
    expect(await runCli(['add', 'kv', '--dir', dir], fakeIo().io)).toBe(0)
    expect(existsSync(join(dir, 'plugins/acryl-kv/src/conformance.ts'))).toBe(false)
    // The port is imported by name in tests, the type-check and plugins installed live: package.json "imports".
    const imports = (
      JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
        imports: Record<string, string>
      }
    ).imports
    expect(imports['#acryl-kv']).toBe('./plugins/acryl-kv/src/index.ts')
    expect(imports['#acryl-kv-json']).toBe('./plugins/acryl-kv-json/src/index.ts')
    expect(imports['#acryl-kv/conformance']).toBe('./plugins/acryl-kv/src/conformance.ts')
    const session = fakeIo()
    expect(await runCli(['add', 'kv', '--suite', '--dir', dir], session.io)).toBe(0)
    expect(existsSync(join(dir, 'plugins/acryl-kv/src/conformance.ts'))).toBe(true)
    expect(session.out()).toContain('plugins/acryl-kv/src/conformance.ts')
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
      devDependencies: Record<string, string>
    }
    expect(pkg.devDependencies.vitest).toBeDefined()
    const none = fakeIo()
    expect(await runCli(['add', 'agent', '--suite', '--dir', dir], none.io)).toBe(1)
    expect(none.err()).toContain('has no conformance suite')
  })

  it('brings an external plugin folder into the app extensions, and refuses one without an entry', async () => {
    expect(await runCli(['init', 'outside', '-y'], fakeIo().io)).toBe(0)
    const app = join(scratch, 'outside')
    const external = join(scratch, 'my-plugin')
    mkdirSync(external)
    writeFileSync(
      join(external, 'index.ts'),
      "export const name = 'my-plugin'\nexport function apply() {}\n",
    )
    writeFileSync(
      join(external, 'package.json'),
      JSON.stringify({ name: '@me/my-plugin', dependencies: { left: '1.0.0' } }),
    )
    const session = fakeIo()
    expect(await runCli(['add', external, '--dir', app], session.io)).toBe(0)
    expect(existsSync(join(app, 'plugins/my-plugin/index.ts'))).toBe(true)
    expect(session.out()).toContain('it uses left')
    const again = fakeIo()
    expect(await runCli(['add', external, '--dir', app], again.io)).toBe(1)
    const empty = join(scratch, 'empty-plugin')
    mkdirSync(empty)
    const refused = fakeIo()
    expect(await runCli(['add', empty, '--dir', app], refused.io)).toBe(1)
    expect(refused.err()).toContain('has no index.ts')
  })

  it('lists the library', async () => {
    const session = fakeIo()
    expect(await runCli(['plugins'], session.io)).toBe(0)
    expect(session.out()).toMatch(/^acryl-node-server .*requires acryl-router\b/m)
  })
})

describe('build-client', () => {
  it('refuses a missing client folder, too many arguments and options; the help names it', async () => {
    const missing = fakeIo()
    expect(await runCli(['build-client'], missing.io)).toBe(1)
    expect(missing.err()).toContain('src/client')
    expect(await runCli(['build-client', 'a', 'b', 'c'], fakeIo().io)).toBe(2)
    expect(await runCli(['build-client', '--watch'], fakeIo().io)).toBe(2)
    const help = fakeIo()
    await runCli(['--help'], help.io)
    expect(help.out()).toContain('build-client')
  })
})

describe('add agent-panel and driver-pty', () => {
  it('refuses a blank app before copying anything, and says which rows it lacks and where they come from', async () => {
    expect(await runCli(['init', 'blank-panel', '--template', 'blank', '-y'], fakeIo().io)).toBe(0)
    const dir = join(scratch, 'blank-panel')
    const refused = fakeIo()
    expect(await runCli(['add', 'agent-panel', '--dir', dir], refused.io)).toBe(1)
    // A blank app has the extensions row (its own plugins start by their rows next to it); the agent row is the agent template's.
    expect(refused.err()).toContain('needs the `agent` row in blend.yaml')
    expect(refused.err()).toContain('npm create acrylblends@latest my-app agent')
    expect(refused.err()).toContain('Nothing was changed')
    expect(existsSync(join(dir, 'plugins/agent-panel'))).toBe(false)
    const pty = fakeIo()
    expect(await runCli(['add', 'driver-pty', '--dir', dir], pty.io)).toBe(1)
    expect(pty.err()).toContain('needs the `agent-panel` row')
  })

  it('the agent template ships the panel; add driver-pty and driver-acp mount after it, once, and add agent-panel says it is there', async () => {
    expect(
      await runCli(['init', 'agent-panel-app', '--template', 'agent', '-y'], fakeIo().io),
    ).toBe(0)
    const dir = join(scratch, 'agent-panel-app')
    const shipped = readFileSync(join(dir, 'blend.yaml'), 'utf8')
    expect(shipped).toMatch(
      /- id: agent-panel\n {6}name: agent-panel\n(?: {4}#[^\n]*\n)* {4}- id: routes\n/u,
    )
    expect(readFileSync(join(dir, 'src/app.ts'), 'utf8')).toContain("'agent-panel': panel,")
    expect(existsSync(join(dir, 'plugins/agent-panel/index.ts'))).toBe(true)
    const again = fakeIo()
    expect(await runCli(['add', 'agent-panel', '--dir', dir], again.io)).toBe(1)
    expect(again.err()).toContain('already has plugins/agent-panel')
    const session = fakeIo()
    expect(
      await runCli(['add', 'driver-pty', 'driver-acp', '--dir', dir], session.io),
      session.err(),
    ).toBe(0)
    const rows = readFileSync(join(dir, 'blend.yaml'), 'utf8')
    expect(rows).toMatch(
      /- id: agent-panel\n {6}name: agent-panel\n(?: {4}- id: driver-(?:pty|acp)\n {6}name: driver-(?:pty|acp)\n){2}(?: {4}#[^\n]*\n)* {4}- id: routes\n/u,
    )
    const app = readFileSync(join(dir, 'src/app.ts'), 'utf8')
    expect(app).toContain("import * as driverPty from '../plugins/driver-pty/index.ts'")
    expect(app).toContain("'driver-pty': driverPty,")
    expect(app).toContain("'driver-acp': driverAcp,")
    expect(session.out()).toContain('node-pty')
  })
})

describe('the Node preflight', () => {
  it('writes scripts/check-node.cjs and runs it before dev, start, test and check; it passes on this Node and says what to do on an old one', async () => {
    expect(await runCli(['init', 'preflight', '--template', 'nodejs', '-y'], fakeIo().io)).toBe(0)
    const dir = join(scratch, 'preflight')
    const { scripts, engines } = manifest(dir)
    for (const name of ['dev', 'start', 'test', 'check'])
      expect(scripts[`pre${name}`], name).toBe('node scripts/check-node.cjs')
    expect(engines.node).toBe('>=22.19.0')
    const file = join(dir, 'scripts', 'check-node.cjs')
    expect(execFileSync(process.execPath, [file], { encoding: 'utf8' })).toBe('')
    expect(readFileSync(file, 'utf8')).toContain('Node 22.19+ needed, you have')
    // Pretend to be Node 18: the same file, run with the version replaced.
    const old = readFileSync(file, 'utf8').replaceAll('process.versions.node', "'18.19.1'")
    const result = spawnSync(process.execPath, ['-e', old], { encoding: 'utf8' })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain(
      'Node 22.19+ needed, you have 18.19.1: install it from https://nodejs.org or with nvm',
    )
  })
})

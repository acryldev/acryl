import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
// @ts-expect-error plain module shared with the scripts
import * as shared from '../../../scripts/lib/names.mjs'
import {
  CLASS,
  CREATE,
  type Io,
  nameFrom,
  PACKAGE,
  parseCreateOptions,
  runCreate,
  TEMPLATE_ALIASES,
  TEMPLATE_MANIFEST,
  TEMPLATE_SUMMARY,
  TEMPLATES,
  UsageError,
} from '../src/index'

const repo = resolve(import.meta.dirname, '..', '..', '..')
const _cliVersion = (
  JSON.parse(readFileSync(join(repo, 'packages', 'cli', 'package.json'), 'utf8')) as {
    version: string
  }
).version
const scratch = mkdtempSync(join(tmpdir(), 'create-acrylblends-test-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

function fakeIo(answers: string[] = [], interactive = false) {
  let out = ''
  let err = ''
  const runs: { command: string; args: string[]; cwd: string }[] = []
  const io: Io = {
    stdout: { write: (t) => (out += t) },
    stderr: { write: (t) => (err += t) },
    cwd: scratch,
    env: {},
    ask: interactive ? async () => answers.shift() ?? '' : undefined,
    run: async (command, args, cwd) => {
      runs.push({ command, args, cwd })
      return 0
    },
  }
  return { io, out: () => out, err: () => err, runs }
}

describe('names', () => {
  it('are the ones scripts/lib/names.mjs holds, so a rename is one change in each', () => {
    expect([PACKAGE, CLASS, CREATE, TEMPLATE_MANIFEST]).toEqual([
      shared.PACKAGE,
      shared.CLASS,
      shared.CREATE,
      shared.TEMPLATE_MANIFEST,
    ])
  })
})

describe('README', () => {
  it('shows the one command with the current names', () => {
    const readme = readFileSync(join(repo, 'packages', 'create', 'README.md'), 'utf8')
    expect(readme).toContain(`npm create ${PACKAGE}@latest my-app`)
    expect(readme).toContain(`import { ${CLASS} } from '${PACKAGE}'`)
    expect(readme).toContain(`# ${CREATE}`)
  })
})

describe('options', () => {
  it('parses the flags and rejects bad ones', () => {
    expect(
      parseCreateOptions(['my-app', '--template', 'notes', '--install', '--pm', 'pnpm', '-y']),
    ).toEqual({
      directory: 'my-app',
      template: 'notes',
      install: true,
      desktop: true,
      start: true,
      pm: 'pnpm',
      yes: true,
      source: undefined,
    })
    expect(() => parseCreateOptions(['--template', 'vercel'])).toThrow(UsageError)
    expect(() => parseCreateOptions(['--template', 'bun'])).toThrow(UsageError)
    expect(() => parseCreateOptions(['--pm', 'pip'])).toThrow(UsageError)
    expect(parseCreateOptions(['a', 'github:o/r']).source).toBe('github:o/r')
    // A bare name that is a built-in template means --template; only github:, @scope/ and .tgz are sources.
    for (const name of TEMPLATES) {
      const bare = parseCreateOptions(['a', name])
      expect(bare.template).toBe(name)
      expect(bare.source).toBeUndefined()
    }
    expect(parseCreateOptions(['a', '@scope/tpl']).source).toBe('@scope/tpl')
    expect(parseCreateOptions(['a', './t.tgz']).source).toBe('./t.tgz')
    expect(() => parseCreateOptions(['a', 'notes', '--template', 'chat'])).toThrow(UsageError)
    expect(() => parseCreateOptions(['a', 'b', 'c'])).toThrow(UsageError)
    expect(() => parseCreateOptions(['--nope'])).toThrow(UsageError)
  })
  it('the defaults are the short command: a template is made in the frame, installed and started, and flags only turn steps off', () => {
    expect(parseCreateOptions(['shop'])).toMatchObject({
      directory: 'shop',
      template: undefined,
      install: true,
      desktop: true,
      start: true,
    })
    expect(parseCreateOptions(['shop', 'notes'])).toMatchObject({
      template: 'notes',
      install: true,
      desktop: true,
    })
    expect(parseCreateOptions(['shop', '--bare']).desktop).toBe(false)
    expect(parseCreateOptions(['shop', '--no-install']).install).toBe(false)
    expect(parseCreateOptions(['shop', '--no-start']).start).toBe(false)
    expect(() => parseCreateOptions(['shop', '--bare', '--desktop'])).toThrow(UsageError)
    expect(() => parseCreateOptions(['shop', '--no-install', '--install'])).toThrow(UsageError)
  })
  it("someone else's template is not installed or put in the frame by default: its scripts run only on --install", () => {
    const sourced = parseCreateOptions(['shop', 'github:o/r'])
    expect(sourced).toMatchObject({ install: false, desktop: false })
    expect(parseCreateOptions(['shop', 'github:o/r', '--install']).install).toBe(true)
    expect(parseCreateOptions(['shop', '--from', 'acrylblends.notes']).install).toBe(false)
  })
  it('derives a valid name from a directory', () => {
    expect(nameFrom('/x/My App!')).toBe('my-app')
    expect(nameFrom('/x/123')).toBe('acryl-app')
  })
})

describe('the template list', () => {
  it('is the list acrylblends init has: same names, same order, same summaries, so the two commands cannot drift', async () => {
    const cli = (await import(resolve(repo, 'packages/cli/src/templates.ts'))) as {
      TEMPLATES: readonly string[]
      TEMPLATE_SUMMARY: Record<string, string>
      TEMPLATE_ALIASES: Record<string, string>
    }
    expect([...TEMPLATES]).toEqual([...cli.TEMPLATES])
    expect(TEMPLATE_SUMMARY).toEqual(cli.TEMPLATE_SUMMARY)
    expect(TEMPLATE_ALIASES).toEqual(cli.TEMPLATE_ALIASES)
  })

  it('every template is available through create, and the old name acryl-app still means agent', () => {
    for (const template of TEMPLATES)
      expect(parseCreateOptions(['app', template]).template).toBe(template)
    expect(parseCreateOptions(['app', '--template', 'acryl-app']).template).toBe('agent')
    expect(parseCreateOptions(['app', 'acryl-app']).template).toBe('agent')
  })
})

describe('create', () => {
  it.each(TEMPLATES)(
    "%s: is made by the framework package's own init, as a Cordis app (blend.yaml, plugins/)",
    async (template) => {
      const s = fakeIo()
      expect(await runCreate([`app-${template}`, '--template', template, '-y'], s.io)).toBe(0)
      expect(s.runs).toHaveLength(2)
      expect(s.runs[0]?.args.slice(1)).toEqual([
        'init',
        join(scratch, `app-${template}`),
        '--template',
        template,
        '--name',
        `app-${template}`,
        '--yes',
        '--no-next',
        '--desktop',
      ])
      // Installed by default; no terminal here, so nothing is started and the next step is told.
      expect(s.runs[1]).toMatchObject({ args: ['install'], cwd: join(scratch, `app-${template}`) })
      expect(s.out()).toContain(`cd app-${template}`)
    },
  )

  it('a bare template name after the directory is the same as --template', async () => {
    const s = fakeIo()
    expect(await runCreate(['my-app', 'notes'], s.io)).toBe(0)
    expect(s.err()).toBe('')
    expect(s.runs[0]?.args.slice(1)).toEqual([
      'init',
      join(scratch, 'my-app'),
      '--template',
      'notes',
      '--name',
      'my-app',
      '--yes',
      '--no-next',
      '--desktop',
    ])
  })

  it('the frame is the default (--desktop is still accepted), and --bare makes the app without it', async () => {
    const framed = fakeIo()
    expect(await runCreate(['framed', 'agent', '--desktop', '--no-install'], framed.io)).toBe(0)
    expect(framed.err()).toBe('')
    expect(framed.runs).toHaveLength(1)
    expect(framed.runs[0]?.args.slice(1)).toEqual([
      'init',
      join(scratch, 'framed'),
      '--template',
      'agent',
      '--name',
      'framed',
      '--yes',
      '--no-next',
      '--desktop',
    ])
    const bare = fakeIo()
    expect(await runCreate(['plain', 'agent', '--bare', '--no-install'], bare.io)).toBe(0)
    expect(bare.runs[0]?.args).not.toContain('--desktop')
    expect(bare.runs[0]?.args).toContain('--bare')
  })

  it('a name on the command line asks nothing, even with a terminal; the app is installed and started', async () => {
    const asked: string[] = []
    const s = fakeIo([], true)
    const ask = s.io.ask!
    s.io.ask = async (question) => {
      asked.push(question)
      return ask(question)
    }
    expect(await runCreate(['shop'], s.io)).toBe(0)
    expect(asked).toEqual([])
    expect(s.runs.map((r) => r.args)).toEqual([
      expect.arrayContaining(['init']),
      ['install'],
      ['run', 'dev'],
    ])
    expect(s.runs[2]).toMatchObject({ cwd: join(scratch, 'shop') })
    expect(s.out()).toContain('Starting it')
  })

  it('--no-start installs and says what to type; --no-install makes it only; a script without a terminal never starts a server', async () => {
    const noStart = fakeIo([], true)
    expect(await runCreate(['shop-a', '--no-start'], noStart.io)).toBe(0)
    expect(noStart.runs.map((r) => r.args[0])).not.toContain('run')
    expect(noStart.out()).toContain('cd shop-a')
    const noInstall = fakeIo([], true)
    expect(await runCreate(['shop-b', '--no-install'], noInstall.io)).toBe(0)
    expect(noInstall.runs).toHaveLength(1)
    expect(noInstall.out()).toContain('npm install')
    const script = fakeIo()
    expect(await runCreate(['shop-c'], script.io)).toBe(0)
    expect(script.runs.map((r) => r.args[0])).not.toContain('run')
  })

  it('a registry starter is in the frame unless --bare; another source only with --desktop', () => {
    expect(parseCreateOptions(['crm', '--from', 'acrylblends.small-crm']).desktop).toBe(true)
    expect(parseCreateOptions(['crm', '--from', 'acrylblends.small-crm', '--bare']).desktop).toBe(
      false,
    )
    expect(parseCreateOptions(['crm', 'github:someone/app']).desktop).toBe(false)
    expect(parseCreateOptions(['crm', 'github:someone/app', '--desktop']).desktop).toBe(true)
    // A source still installs only when asked: its code runs then.
    expect(parseCreateOptions(['crm', '--from', 'acrylblends.small-crm']).install).toBe(false)
  })

  it('refuses a folder that is not empty and changes nothing', async () => {
    mkdirSync(join(scratch, 'full'), { recursive: true })
    writeFileSync(join(scratch, 'full', 'x.txt'), 'x')
    const s = fakeIo()
    expect(await runCreate(['full', '-y'], s.io)).toBe(1)
    expect(readdirSync(join(scratch, 'full'))).toEqual(['x.txt'])
    expect(s.runs).toEqual([])
  })

  it('with no name it asks one question, the app name, and uses the Blank template; installs and starts with the chosen package manager', async () => {
    const s = fakeIo(['asked-app'], true)
    expect(await runCreate(['--pm', 'pnpm'], s.io)).toBe(0)
    expect(s.runs[0]?.args).toContain('blank')
    expect(s.runs[1]).toMatchObject({
      command: 'pnpm',
      args: ['install'],
      cwd: join(scratch, 'asked-app'),
    })
    expect(s.runs[2]).toMatchObject({ command: 'pnpm', args: ['run', 'dev'] })
    const empty = fakeIo([''], true)
    expect(await runCreate(['--no-start'], empty.io)).toBe(0)
    expect(empty.runs[0]?.args).toContain(join(scratch, 'my-app'))
  })

  it('exits 2 with help on a usage error, and prints help and version', async () => {
    const s = fakeIo()
    expect(await runCreate(['--template', 'vercel'], s.io)).toBe(2)
    expect(s.err()).toContain('unknown template')
    const h = fakeIo()
    expect(await runCreate(['--help'], h.io)).toBe(0)
    expect(h.out()).toContain(`npm create ${PACKAGE}@latest`)
    expect(TEMPLATES).toEqual(['blank', 'nodejs', 'notes', 'chat', 'todo', 'agent'])
  })
})

import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parseAcrylArgs } from '../src/cli/grammar.ts'
import { runAcryl } from '../src/cli/run.ts'
import { findLauncher, runNewApp } from '../src/host/new-command.ts'

const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { force: true, recursive: true }) })

describe('acryl new', () => {
  it('parses a folder and its options, and nothing else', () => {
    expect(parseAcrylArgs(['new', 'stage-sound', '--name', 'Stage Sound', '--accent', '#e8590c'])).toMatchObject({ kind: 'new', dir: 'stage-sound', title: 'Stage Sound', accent: '#e8590c' })
    expect(() => parseAcrylArgs(['new'])).toThrow(/usage: acryl new/)
    expect(() => parseAcrylArgs(['new', 'a', 'b'])).toThrow(/usage/)
    expect(() => parseAcrylArgs(['new', 'a', '--profile', 'x'])).toThrow(/unknown option for new/)
    expect(() => parseAcrylArgs(['new', 'a', '--name'])).toThrow(/requires a value/)
  })

  it('finds the framework launcher from a checkout, and refuses without one', () => {
    expect(findLauncher()).toMatch(/scripts[\\/]blank\.mjs$/)
    expect(() => runNewApp({ dir: '/tmp/x' }, null)).toThrow(/framework checkout/)
  })

  it('creates an app through the real CLI entry', async () => {
    const root = mkdtempSync(join(tmpdir(), 'acryl-new-cli-')); dirs.push(root)
    const lines: string[] = []
    await runAcryl(['new', join(root, 'ledger'), '--name', 'Ledger'], { write: line => lines.push(line), exit: () => {} })
    expect(lines.join('\n')).toContain('Created Ledger')
    for (const file of ['blend.yaml', 'bin/acryl', 'AGENTS.md', 'extensions/README.md']) expect(existsSync(join(root, 'ledger', file)), file).toBe(true)
  })
})

describe('an app that carries its own runtime', () => {
  // The generated launcher (bin/acryl) is a POSIX shell script; a Windows launcher is not written yet, so this runs where the script can run.
  it.skipIf(process.platform === 'win32')('starts through its own launcher copy, with the app folder as its home and blend.yaml as its definition', async () => {
    const { spawnSync } = await import('node:child_process')
    const { mkdirSync, readFileSync, realpathSync, writeFileSync } = await import('node:fs')
    const root = mkdtempSync(join(tmpdir(), 'acryl-new-carried-')); dirs.push(root)
    // A stand-in for the extracted acryl-web release archive: bin.js records how it was started.
    const runtime = join(root, 'archive'); mkdirSync(join(runtime, 'lib'), { recursive: true })
    writeFileSync(join(runtime, 'lib', 'bin.js'), "require('node:fs').writeFileSync(process.env.PROOF, JSON.stringify({ args: process.argv.slice(2), home: process.env.ACRYL_HOME, blueprint: process.env.ACRYL_BLUEPRINT, port: process.env.ACRYL_WEB_PORT }))\n")
    const app = join(root, 'stage-sound')
    const created = runNewApp({ dir: app, title: 'Stage Sound', runtime, skipGit: true })
    expect(created.git).toBe('skipped')
    const bin = readFileSync(join(app, 'bin', 'acryl'), 'utf8')
    expect(bin).not.toContain(findLauncher() ?? 'no launcher')   // nothing points back at the framework checkout
    const proof = join(root, 'proof.json')
    const home = join(root, 'home'); mkdirSync(home)
    const run = spawnSync(join(app, 'bin', 'acryl'), ['web'], { env: { ...process.env, HOME: home, PROOF: proof }, encoding: 'utf8' })
    expect(run.status, run.stderr).toBe(0)
    const seen = JSON.parse(readFileSync(proof, 'utf8')) as Record<string, unknown>
    expect(seen.home).toBe(realpathSync(app))
    expect(seen.blueprint).toBe(join(realpathSync(app), 'blend.yaml'))
    expect(seen.args).toEqual(['--no-open'])
    expect(existsSync(join(app, 'instance.json'))).toBe(false)   // the name is released when the app exits
    const cli = spawnSync(join(app, 'bin', 'acryl'), ['cli'], { env: { ...process.env, HOME: home, PROOF: proof }, encoding: 'utf8' })
    expect(cli.status).not.toBe(0)
    expect(cli.stderr).toMatch(/carries only the Web runtime/)
  })
})

describe('acryl new --from', () => {
  it('creates an app from an existing one: its own id and name, the source\'s rows, brand and plugins, and a lock re-pinned to the new definition', async () => {
    const { mkdirSync, readFileSync, writeFileSync } = await import('node:fs')
    const { createHash } = await import('node:crypto')
    const { readBlueprintFile } = await import('acryl-harness-runtime')
    // The format's lock digest (@webboxes/blends-core manifestDigest): lowercase hex SHA-256 of the manifest bytes.
    const manifestDigest = (text: string): string => createHash('sha256').update(text).digest('hex')
    const root = mkdtempSync(join(tmpdir(), 'acryl-new-from-')); dirs.push(root)
    const source = join(root, 'ledger')
    runNewApp({ dir: source, title: 'Ledger', accent: '#0a7d4b', skipGit: true })
    mkdirSync(join(source, 'extensions', 'invoices'), { recursive: true })
    writeFileSync(join(source, 'extensions', 'invoices', 'package.json'), '{"name":"invoices","version":"0.1.0"}')
    const sourceText = readFileSync(join(source, 'blend.yaml'), 'utf8')
    writeFileSync(join(source, 'blend.lock.json'), JSON.stringify({ formatVersion: 2, origin: { id: 'app.ledger', kind: 'Blend', version: '0.1.0', digest: manifestDigest(sourceText) }, rows: [], modules: [] }))

    const created = runNewApp({ dir: join(root, 'ledger-eu'), title: 'Ledger EU', from: source, skipGit: true })
    const text = readFileSync(join(created.root, 'blend.yaml'), 'utf8')
    expect(text).toMatch(/id: app\.ledger-eu/u)
    expect(text).toMatch(/description: Ledger EU, created from app\.ledger\./u)
    const blueprint = readBlueprintFile(join(created.root, 'blend.yaml'))
    expect(blueprint.id).toBe('app.ledger-eu')
    expect(blueprint.brand).toEqual({ kind: 'custom', identity: expect.objectContaining({ name: 'Ledger EU', accent: '#0a7d4b' }) })
    expect(text).toContain('# Ledger')   // the source's comments travel with it
    expect(readFileSync(join(created.root, 'extensions', 'invoices', 'package.json'), 'utf8')).toContain('invoices')
    const lock = JSON.parse(readFileSync(join(created.root, 'blend.lock.json'), 'utf8')) as { origin: { id: string, digest: string } }
    expect(lock.origin).toMatchObject({ id: 'app.ledger-eu', digest: manifestDigest(text) })
  })

  it('refuses a folder without a definition, and --from together with --blueprint', () => {
    const root = mkdtempSync(join(tmpdir(), 'acryl-new-from-bad-')); dirs.push(root)
    expect(() => runNewApp({ dir: join(root, 'x'), from: root })).toThrow(/has no blend.yaml/)
    expect(() => parseAcrylArgs(['new', 'x', '--from', 'a', '--blueprint', 'acryl.blank'])).toThrow(/alternatives/)
  })
})

describe('acryl new --from a git repository', () => {
  it('starts an app from a (private) starter repository, through the user\'s own git', async () => {
    const { spawnSync } = await import('node:child_process')
    const { readFileSync } = await import('node:fs')
    const root = mkdtempSync(join(tmpdir(), 'acryl-new-git-')); dirs.push(root)
    const starter = join(root, 'accounting-starter')
    runNewApp({ dir: starter, title: 'Accounting', skipGit: true })
    for (const args of [['init', '--quiet'], ['add', '.'], ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--quiet', '-m', 'starter']]) {
      expect(spawnSync('git', args, { cwd: starter }).status).toBe(0)
    }
    const created = runNewApp({ dir: join(root, 'firm-books'), title: 'Firm Books', from: `file://${starter}`, skipGit: true })
    expect(readFileSync(join(created.root, 'blend.yaml'), 'utf8')).toMatch(/created from app\.accounting-starter/u)
  })
})

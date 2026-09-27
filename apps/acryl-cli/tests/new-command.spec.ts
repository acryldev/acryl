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
    expect(findLauncher()).toMatch(/scripts\/blank\.mjs$/)
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
  it('starts through its own launcher copy, with the app folder as its home and blend.yaml as its definition', async () => {
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

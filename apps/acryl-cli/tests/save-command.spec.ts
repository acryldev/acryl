/** `acryl save` / `acryl remote connect` through the real CLI entry, against a real git repository and a local bare remote. */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parseAcrylArgs } from '../src/cli/grammar.ts'
import { runAcryl } from '../src/cli/run.ts'
import { runNewApp } from '../src/host/new-command.ts'

const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { force: true, recursive: true }) })

async function cli(args: string[]): Promise<{ lines: string[], code: number }> {
  const lines: string[] = []
  let code = 0
  await runAcryl(args, { write: line => lines.push(line), exit: value => { code = value } })
  return { lines, code }
}

describe('acryl save', () => {
  it('parses its options and nothing else', () => {
    expect(parseAcrylArgs(['save', '-m', 'first', '--dir', 'x'])).toMatchObject({ kind: 'save', dir: 'x', message: 'first' })
    expect(parseAcrylArgs(['remote', 'connect', '--public'])).toMatchObject({ kind: 'remote', visibility: 'public', dir: '.' })
    expect(() => parseAcrylArgs(['remote', 'connect', '--public', '--private'])).toThrow(/alternatives/)
    expect(() => parseAcrylArgs(['remote', 'add'])).toThrow(/usage: acryl remote connect/)
    expect(() => parseAcrylArgs(['save', '--force'])).toThrow(/unknown argument/)
  })

  it('a new app is private and proprietary; it saves locally, connects to an existing remote, and pushes; a secret is refused', async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'acryl-save-'))); dirs.push(root)
    const app = runNewApp({ dir: join(root, 'books'), title: 'Books' }).root
    for (const [key, value] of [['user.name', 't'], ['user.email', 't@t']]) spawnSync('git', ['config', key!, value!], { cwd: app })
    const manifest = readFileSync(join(app, 'blend.yaml'), 'utf8')
    expect(manifest).toContain('visibility: private')
    expect(manifest).toContain('license: Proprietary')

    let run = await cli(['save', '--dir', app, '-m', 'first version'])
    expect(run.code, run.lines.join('\n')).toBe(0)
    expect(run.lines.join('\n')).toMatch(/Saved [0-9a-f]{8} \(no remote yet/u)

    const remote = join(root, 'books.git'); spawnSync('git', ['init', '--bare', '--quiet', remote])
    run = await cli(['remote', 'connect', '--dir', app, '--url', remote])
    expect(run.lines.join('\n')).toContain(`Connected private repository ${remote}`)
    writeFileSync(join(app, 'extensions', 'notes.md'), 'more\n')
    run = await cli(['save', '--dir', app, '-m', 'notes'])
    expect(run.lines.join('\n')).toContain(`pushed to ${remote}`)
    expect(spawnSync('git', ['log', '--oneline'], { cwd: remote, encoding: 'utf8' }).stdout).toContain('notes')

    writeFileSync(join(app, 'extensions', 'leak.js'), 'const key = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz"\n')
    run = await cli(['save', '--dir', app])
    expect(run.code).toBe(1)
    expect(run.lines.join('\n')).toMatch(/Not saved.*\n\s+extensions\/leak\.js:1\s+Anthropic API key/su)
    await expect(cli(['save', '--dir', root])).rejects.toThrow(/is not an app/)
  })
})

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { gitFiles, writeTemplate } from '../src/source'

const scratch = mkdtempSync(join(tmpdir(), 'create-folder-copy-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

/** A made app as it sits on disk while it runs: source, plus its local state (the door, data, a .env) that its own ignore rules leave out. */
function runningApp(at: string): string {
  const write = (path: string, text: string) => {
    mkdirSync(join(at, path, '..'), { recursive: true })
    writeFileSync(join(at, path), text)
  }
  write('package.json', '{"name":"notes","scripts":{"dev":"node x"}}\n')
  write('src/app.ts', 'export {}\n')
  write('plugins/notes/index.ts', 'export {}\n')
  write('plugins/notes/.gitignore', 'cache/\n')
  write('plugins/notes/cache/big.bin', 'x')
  write('.gitignore', 'node_modules/\n.acrylblends/\n.acryl/\n.env\n.env.*\n')
  write('.acryl/door.json', '{"secret":"0123456789abcdef0123456789abcdef"}\n')
  write('.acrylblends/test/x.txt', 'x')
  write('.env', 'DEEPSEEK_API_KEY=sk-test\n')
  write('node_modules/a/index.js', 'x')
  write('notes-draft.md', 'not committed yet\n')
  write('local-only.txt', 'kept out by .git/info/exclude\n')
  return at
}
const copied = (from: string, name: string) =>
  writeTemplate(from, join(scratch, name), (t) => t, '^1.0.0', name).files.sort()

describe('a folder copied as a template', () => {
  it('a repository is copied as git sees it: tracked and untracked files, every ignore rule (nested, info/exclude) honoured', () => {
    const app = runningApp(join(scratch, 'repo'))
    execFileSync('git', ['init', '-q'], { cwd: app })
    writeFileSync(join(app, '.git', 'info', 'exclude'), 'local-only.txt\n')
    execFileSync('git', ['add', 'package.json', 'src', 'plugins', '.gitignore'], { cwd: app })
    expect(gitFiles(app)).toBeDefined()
    expect(copied(app, 'from-repo')).toEqual([
      '.gitattributes',
      '.gitignore',
      'notes-draft.md',
      'package.json',
      'plugins/notes/.gitignore',
      'plugins/notes/index.ts',
      'src/app.ts',
    ])
    expect(existsSync(join(scratch, 'from-repo', '.acryl'))).toBe(false)
    expect(readFileSync(join(scratch, 'from-repo', 'package.json'), 'utf8')).toContain(
      '"name": "from-repo"',
    )
  })

  it("a folder in no repository leaves out an app's local state by a fixed list", () => {
    const app = runningApp(join(scratch, 'plain'))
    expect(gitFiles(app)).toBeUndefined()
    expect(copied(app, 'from-plain')).toEqual([
      '.gitattributes',
      '.gitignore',
      'local-only.txt',
      'notes-draft.md',
      'package.json',
      'plugins/notes/.gitignore',
      'plugins/notes/cache/big.bin',
      'plugins/notes/index.ts',
      'src/app.ts',
    ])
  })

  it('a folder inside some other repository is not that repository: the fixed list applies', () => {
    const outer = join(scratch, 'outer')
    mkdirSync(outer, { recursive: true })
    execFileSync('git', ['init', '-q'], { cwd: outer })
    writeFileSync(join(outer, '.gitignore'), 'unpacked/\n')
    const app = runningApp(join(outer, 'unpacked', 'notes'))
    expect(gitFiles(app)).toBeUndefined()
    expect(copied(app, 'from-inner')).toContain('src/app.ts')
  })
})

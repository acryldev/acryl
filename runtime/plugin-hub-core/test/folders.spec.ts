import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { currentSourcePath, homePluginsDir, projectPluginsDir, storeRootOf, type FolderMove } from '../src/index.js'

const made: string[] = []
afterEach(() => { for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true }) })
function temp(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'plugin-hub-folders-')))
  made.push(dir)
  return dir
}

function plugin(dir: string, name: string): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name }))
}

describe('plugin folders after the rename to "plugin" (spec 044 step 1b)', () => {
  it('moves a project\'s .acryl-extensions/ to .acryl-plugins/ the first time it is asked for', () => {
    const project = temp()
    plugin(join(project, '.acryl-extensions', 'notes'), 'notes')
    expect(projectPluginsDir(project)).toBe(join(project, '.acryl-plugins'))
    expect(readFileSync(join(project, '.acryl-plugins', 'notes', 'package.json'), 'utf8')).toContain('notes')
    expect(existsSync(join(project, '.acryl-extensions'))).toBe(false)
    expect(projectPluginsDir(project)).toBe(join(project, '.acryl-plugins'))
  })

  it('merges into a new folder that already exists, keeps a name taken on both sides in the old one, and reports it', () => {
    const project = temp()
    plugin(join(project, '.acryl-extensions', 'notes'), 'old-notes')
    plugin(join(project, '.acryl-extensions', 'clock'), 'clock')
    plugin(join(project, '.acryl-plugins', 'notes'), 'new-notes')
    const reports: FolderMove[] = []
    projectPluginsDir(project, move => reports.push(move))
    expect(readdirSync(join(project, '.acryl-plugins')).sort()).toEqual(['clock', 'notes'])
    expect(readFileSync(join(project, '.acryl-plugins', 'notes', 'package.json'), 'utf8')).toContain('new-notes')
    expect(readdirSync(join(project, '.acryl-extensions'))).toEqual(['notes'])
    expect(reports).toEqual([{ from: join(project, '.acryl-extensions'), to: join(project, '.acryl-plugins'), kept: ['notes'] }])
  })

  it('moves an app home\'s extensions/ into plugins/ beside the store, and the store from plugins/store/ to plugins/.store/', () => {
    const home = temp()
    plugin(join(home, 'extensions', 'clock'), 'clock')
    writeFileSync(join(home, 'extensions', 'README.md'), '# extensions\n')
    mkdirSync(join(home, 'plugins', 'store'), { recursive: true })
    writeFileSync(join(home, 'plugins', 'store', 'index.json'), '{"formatVersion":1,"plugins":{}}\n')
    expect(homePluginsDir(home)).toBe(join(home, 'plugins'))
    expect(readdirSync(join(home, 'plugins')).sort()).toEqual(['.store', 'README.md', 'clock'])
    expect(existsSync(join(home, 'extensions'))).toBe(false)
    expect(storeRootOf(home)).toBe(join(home, 'plugins', '.store'))
    expect(existsSync(join(home, 'plugins', '.store', 'index.json'))).toBe(true)
  })

  it('never takes a source plugin named store for the old store', () => {
    const home = temp()
    plugin(join(home, 'plugins', 'store'), 'store')
    writeFileSync(join(home, 'plugins', 'store', 'index.json'), '{}')
    expect(storeRootOf(home)).toBe(join(home, 'plugins', '.store'))
    expect(existsSync(join(home, 'plugins', 'store', 'package.json'))).toBe(true)
    expect(existsSync(join(home, 'plugins', '.store'))).toBe(false)
  })

  it('finds a source folder an install recorded before the move', () => {
    const project = temp()
    const home = temp()
    plugin(join(project, '.acryl-plugins', 'notes'), 'notes')
    plugin(join(home, 'plugins', 'clock'), 'clock')
    expect(currentSourcePath(join(project, '.acryl-extensions', 'notes'))).toBe(join(project, '.acryl-plugins', 'notes'))
    expect(currentSourcePath(join(home, 'extensions', 'clock'))).toBe(join(home, 'plugins', 'clock'))
    // Gone everywhere, or not a renamed folder: the recorded path, unchanged, so the caller reports it missing.
    expect(currentSourcePath(join(project, '.acryl-extensions', 'gone'))).toBe(join(project, '.acryl-extensions', 'gone'))
    expect(currentSourcePath(join(project, 'src', 'notes'))).toBe(join(project, 'src', 'notes'))
  })
})

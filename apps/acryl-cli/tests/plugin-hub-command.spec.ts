import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { renderPluginHubCommand, runPluginHubCommand } from '../src/host/plugin-hub-command.ts'

let root: string
let saved: string | undefined

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'acryl-cli-hub-')))
  saved = process.env['ACRYL_HOME']
  // A pinned, throwaway ACRYL home: the store must land here, never in the user's real ~/.acryl.
  process.env['ACRYL_HOME'] = join(root, 'home')
})
afterEach(() => {
  if (saved === undefined) delete process.env['ACRYL_HOME']
  else process.env['ACRYL_HOME'] = saved
  rmSync(root, { recursive: true, force: true })
})

function project(): string {
  const workspace = join(root, 'project')
  const folder = join(workspace, '.acryl-plugins', 'quick-notes')
  mkdirSync(folder, { recursive: true })
  writeFileSync(join(folder, 'package.json'), `${JSON.stringify({ name: '@inboxxobni/notes.sidebar.quick-notes', version: '0.2.1', type: 'module' }, null, 2)}\n`)
  writeFileSync(join(folder, 'index.js'), 'export function apply() {}\n')
  return workspace
}

describe('acryl plugin saved | save | version', () => {
  it('saves a project plugin by name into the pinned home\'s store, bumps it, saves again, and lists both', async () => {
    const cwd = project()
    const first = await runPluginHubCommand({ profile: 'acryl', action: 'save', target: 'quick-notes', cwd })
    expect(first.kind).toBe('save')
    if (first.kind !== 'save') return
    expect(first.store).toBe(join(root, 'home', 'plugins', '.store'))
    expect(existsSync(first.result.path)).toBe(true)
    expect(renderPluginHubCommand(first, false).lines[0]).toBe(`Saved @inboxxobni/notes.sidebar.quick-notes 0.2.1 (2 files) to ${first.store}.`)

    const bumped = await runPluginHubCommand({ profile: 'acryl', action: 'version', bump: 'patch', target: './.acryl-plugins/quick-notes', cwd })
    expect(renderPluginHubCommand(bumped, false).lines[0]).toMatch(/^@inboxxobni\/notes\.sidebar\.quick-notes: 0\.2\.1 -> 0\.2\.2 /u)
    expect(JSON.parse(readFileSync(join(cwd, '.acryl-plugins', 'quick-notes', 'package.json'), 'utf8')).version).toBe('0.2.2')

    await runPluginHubCommand({ profile: 'acryl', action: 'save', target: '@inboxxobni/notes.sidebar.quick-notes', cwd })
    const listed = await runPluginHubCommand({ profile: 'acryl', action: 'saved', cwd })
    const lines = renderPluginHubCommand(listed, false).lines
    expect(lines.map(line => line.split('  ')[0])).toEqual(['@inboxxobni/notes.sidebar.quick-notes 0.2.2', '@inboxxobni/notes.sidebar.quick-notes 0.2.1'])
    const json = JSON.parse(renderPluginHubCommand(listed, true).lines[0] ?? '{}') as { saved: { version: string }[] }
    expect(json.saved.map(entry => entry.version)).toEqual(['0.2.2', '0.2.1'])
  })

  it('names where it looked when no plugin folder matches', async () => {
    await expect(runPluginHubCommand({ profile: 'acryl', action: 'save', target: 'missing', cwd: project() })).rejects.toThrow(/no plugin folder "missing"/u)
  })
})

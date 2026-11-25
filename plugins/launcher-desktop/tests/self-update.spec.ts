/** The Control Center updating itself: where an update stands is read from its record files, so a reloaded service still knows. */
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { LauncherRefusal, LauncherService } from '../src/service.ts'
import type { Command } from '../src/runner.ts'
import { nodeSelfFiles, originOf, selfUpdateCommand, selfView, type SelfFiles } from '../src/self-update.ts'

const newer = (a: string, b: string): boolean => a.localeCompare(b, undefined, { numeric: true }) > 0
const copy = { folder: '/h/.acryl/control-center', name: 'ACRYL Control Center', blend: 'acryl.control-center', version: '0.2.14' }

function memory(): SelfFiles & { makeFolder: (path: string) => void, files: Map<string, { text: string, at: number }> } {
  const files = new Map<string, { text: string, at: number }>()
  return {
    files,
    read: path => files.get(path)?.text,
    write: (path, text) => { files.set(path, { text, at: Date.now() }) },
    remove: (path) => { files.delete(path) },
    modified: path => files.get(path)?.at,
    makeFolder: () => {},
  }
}

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

describe('originOf', () => {
  it('reads the Blend and version a copy was made from', () => {
    expect(originOf(JSON.stringify({ acryl: { from: 'acryl.control-center#0.2.14' } }))).toEqual({ blend: 'acryl.control-center', version: '0.2.14' })
    expect(originOf(JSON.stringify({ name: 'x' }))).toBeUndefined()
    expect(originOf('not json')).toBeUndefined()
    expect(originOf(undefined)).toBeUndefined()
  })
})

describe('selfView', () => {
  it('offers a newer release, says nothing when up to date', () => {
    const files = memory()
    expect(selfView(copy, '0.2.15', files, '/h/.acryl', 0, newer)).toEqual({ name: 'ACRYL Control Center', version: '0.2.14', update: '0.2.15', status: 'available' })
    expect(selfView(copy, '0.2.14', files, '/h/.acryl', 0, newer)).toMatchObject({ status: 'current', update: '0.2.14' })
    expect(selfView(copy, undefined, files, '/h/.acryl', 0, newer)).toMatchObject({ status: 'checking' })
  })

  it('follows an update from its files: running, done until the app is opened again, failed with its output', () => {
    const files = memory()
    const command = selfUpdateCommand(copy, '0.2.15', files, '/h/.acryl', 1000)
    expect(command).toMatchObject({ program: 'node', cwd: copy.folder, log: join('/h/.acryl', 'logs', 'control-center-update.log') })
    files.write(command.log, 'npm http fetch GET 200\n')
    expect(selfView(copy, '0.2.15', files, '/h/.acryl', 0, newer)).toMatchObject({ status: 'updating', update: '0.2.15', since: 1000, output: 'npm http fetch GET 200' })
    files.write(join('/h/.acryl', 'logs', 'control-center-update.end'), '0')
    // This process began before the update ended: open the app again to run the new release.
    expect(selfView({ ...copy, version: '0.2.15' }, '0.2.15', files, '/h/.acryl', 0, newer)).toMatchObject({ status: 'done', update: '0.2.15' })
    // Opened again after it ended: the record is cleared, nothing to say.
    expect(selfView({ ...copy, version: '0.2.15' }, '0.2.15', files, '/h/.acryl', Date.now() + 1, newer)).toMatchObject({ status: 'current' })
    expect(files.files.size).toBe(1)

    selfUpdateCommand(copy, '0.2.15', files, '/h/.acryl', 2000)
    files.write(join('/h/.acryl', 'logs', 'control-center-update.log'), 'CONFLICT (content): Merge conflict in src/routes.ts\n')
    files.write(join('/h/.acryl', 'logs', 'control-center-update.end'), '1')
    expect(selfView(copy, '0.2.15', files, '/h/.acryl', 0, newer)).toMatchObject({ status: 'failed', output: 'CONFLICT (content): Merge conflict in src/routes.ts' })
  })

  it.skipIf(process.platform === 'win32')('the command runs npm exec acrylblends update in the copy and records its exit code', () => {
    const root = mkdtempSync(join(tmpdir(), 'acryl-self-update-'))
    roots.push(root)
    const bin = join(root, 'bin')
    const folder = join(root, 'control-center')
    mkdirSync(bin)
    mkdirSync(folder)
    // A stand-in npm: it records what it was asked and where, and fails the second time.
    writeFileSync(join(bin, 'npm'), `#!/bin/sh\necho "$PWD $*" >> "${join(root, 'asked')}"\n[ -f "${join(root, 'fail')}" ] && exit 3\nexit 0\n`)
    chmodSync(join(bin, 'npm'), 0o755)
    const home = join(root, '.acryl')
    const run = (): string => {
      const command = selfUpdateCommand({ ...copy, folder }, '0.2.15', nodeSelfFiles, home, Date.now())
      spawnSync(command.program, command.args, { cwd: command.cwd, env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}` } })
      return readFileSync(join(home, 'logs', 'control-center-update.end'), 'utf8')
    }
    expect(run()).toBe('0')
    expect(readFileSync(join(root, 'asked'), 'utf8').trim()).toMatch(/control-center exec --yes acrylblends@latest -- update$/u)
    writeFileSync(join(root, 'fail'), '')
    expect(run()).toBe('3')
  })
})

describe('LauncherService.updateSelf', () => {
  it('updates its own copy when a newer release is out, and refuses when there is none', async () => {
    const root = mkdtempSync(join(tmpdir(), 'acryl-self-service-'))
    roots.push(root)
    const folder = join(root, 'control-center')
    mkdirSync(folder)
    writeFileSync(join(folder, 'package.json'), JSON.stringify({ name: 'control-center', acryl: { from: 'acryl.control-center#0.2.14' } }))
    writeFileSync(join(folder, 'blend.yaml'), 'metadata:\n  id: acrylblends.control-center\n  name: control-center\n  version: 0.2.14\n')
    const commands: Command[] = []
    const make = (latest: string) => new LauncherService({
      home: join(root, '.acryl'), appsFolder: join(root, 'ACRYL'), environment: () => ({}), exists: () => true, makeFolder: (path) => { mkdirSync(path, { recursive: true }) },
      runner: (command) => { commands.push(command); return { onOutput: () => {}, onEnd: () => {}, stop: () => {} } },
      blends: async () => [{ id: 'acryl.control-center', name: 'ACRYL Control Center', version: latest, category: '', description: '', origin: 'official' as const }],
      door: { call: async () => ({ ok: true }), confirmPublish: async () => ({ ok: true }) },
      self: { folder, name: 'ACRYL Control Center', files: nodeSelfFiles, startedAt: Date.now() },
    })
    const current = make('0.2.14')
    await current.blends()
    expect(current.state().self).toMatchObject({ status: 'current', version: '0.2.14' })
    expect(() => { current.updateSelf() }).toThrow(LauncherRefusal)
    const service = make('0.2.15')
    await service.blends()
    expect(service.state().self).toMatchObject({ status: 'available', version: '0.2.14', update: '0.2.15' })
    service.updateSelf()
    expect(commands).toHaveLength(1)
    expect(commands[0]).toMatchObject({ program: 'node', cwd: folder, log: join(root, '.acryl', 'logs', 'control-center-update.log') })
    expect(service.state().self).toMatchObject({ status: 'updating', update: '0.2.15' })
    expect(() => { service.updateSelf() }).toThrow(/already being updated/u)
  })
})

// The regression of 2026-11-26: the package's plugin (spec 052 T055) built its service without the copy it runs from, so Control Center never offered
// its own updates. Whatever creates the node launcher with a self copy gets that copy's update state on the screen.
describe('the node launcher with the copy it runs from', () => {
  it('reports the copy\'s update in its state', async () => {
    const { createNodeLauncher } = await import('../src/node.ts')
    const home = mkdtempSync(join(tmpdir(), 'acryl-self-node-'))
    const folder = mkdtempSync(join(tmpdir(), 'acryl-self-copy-'))
    try {
      writeFileSync(join(folder, 'package.json'), JSON.stringify({ acryl: { from: 'acryl.control-center#0.2.28' } }))
      mkdirSync(join(home, 'logs'), { recursive: true })
      writeFileSync(join(home, 'logs', 'control-center-update.json'), JSON.stringify({ to: '0.2.31', since: Date.now() }))
      const service = createNodeLauncher(home, () => ({}), { folder, name: 'ACRYL Control Center' })
      expect(service.state().self).toMatchObject({ name: 'ACRYL Control Center', status: 'updating', update: '0.2.31' })
      expect(createNodeLauncher(home, () => ({})).state().self).toBeUndefined()
    } finally {
      rmSync(home, { recursive: true, force: true })
      rmSync(folder, { recursive: true, force: true })
    }
  })
})

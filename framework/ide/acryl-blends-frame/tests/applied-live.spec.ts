import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { digestFolder } from '@webboxes/blends-core'
import { afterEach, describe, expect, it } from 'vitest'
import { AppliedLive, pulledDigestOf, readDefinition, watchAppFiles } from '../src/applied-live.ts'

const BLEND = (pulled: Readonly<Record<string, string>>, extraRow = ''): string => {
  const records = Object.entries(pulled)
    .map(([name, digest]) => `          ${name}:\n            source: github:ana/${name}@1.0.0\n            integrity: sha512-x\n            digest: ${digest}\n`)
    .join('')
  return `# the app\nspec:\n  rows:\n    - name: extensions\n    - name: plugin-share\n      config:\n        dir: plugins\n${records === '' ? '' : `        pulled:\n${records}`}${extraRow}`
}

const folders: string[] = []
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

/** An app folder with `src/`, `plugins/` and a `blend.yaml` remembering nothing. */
function app(): string {
  const root = mkdtempSync(join(tmpdir(), 'applied-live-'))
  folders.push(root)
  mkdirSync(join(root, 'src'))
  mkdirSync(join(root, 'plugins'))
  writeFileSync(join(root, 'src', 'app.ts'), 'export {}\n')
  writeFileSync(join(root, 'blend.yaml'), BLEND({}))
  return root
}

/** What plugin-share writes for a pull, in its order: the files beside, the folder renamed in, then the record. @returns the folder's digest. */
function pull(root: string, name: string, remembered: Record<string, string>): string {
  const incoming = join(root, 'plugins', `.pulling-${name}`)
  mkdirSync(incoming, { recursive: true })
  writeFileSync(join(incoming, 'index.ts'), `export const name = '${name}'\nexport function apply() {}\n`)
  writeFileSync(join(incoming, 'plugin.json'), `{ "name": "${name}" }\n`)
  const digest = digestFolder(incoming)
  renameSync(incoming, join(root, 'plugins', name))
  remembered[name] = digest
  writeFileSync(join(root, 'blend.yaml.tmp'), BLEND(remembered))
  renameSync(join(root, 'blend.yaml.tmp'), join(root, 'blend.yaml'))
  return digest
}

/** A refused pull, as plugin-share undoes it: the folder taken away and the record put back. */
function undo(root: string, name: string, remembered: Record<string, string>): void {
  rmSync(join(root, 'plugins', name), { recursive: true, force: true })
  delete remembered[name]
  writeFileSync(join(root, 'blend.yaml'), BLEND(remembered))
}

describe('readDefinition', () => {
  it('takes the pulled records out, so a definition that differs only in them is the same app', () => {
    const none = readDefinition(BLEND({}))
    const one = readDefinition(BLEND({ timer: 'abc' }))
    expect(one.app).toBe(none.app)
    expect(one.pulled).toEqual({ timer: 'abc' })
    expect(readDefinition(BLEND({}, '    - name: notes\n')).app).not.toBe(none.app)
  })

  it('is its own text when it does not parse, so any change to it loads the app again', () => {
    expect(readDefinition('spec: [').app).toBe('spec: [')
  })
})

describe('AppliedLive', () => {
  it('does not load the app again for a pulled plugin and its record', () => {
    const root = app()
    const applied = new AppliedLive(root)
    pull(root, 'timer', {})
    expect(applied.needsReload([join(root, 'plugins', 'timer'), join(root, 'plugins', 'timer', 'index.ts'), join(root, 'blend.yaml')])).toBe(false)
  })

  it('does not load the app again for the first record of a plugin-share row with no config, whose library copy is in plugins/ (the Blank app)', () => {
    const root = app()
    mkdirSync(join(root, 'plugins', 'plugin-share'))
    writeFileSync(join(root, 'plugins', 'plugin-share', 'index.ts'), 'export {}\n')
    const plain = '# the app\nspec:\n  rows:\n    - id: extensions\n      name: extensions\n    - id: plugin-share\n      name: plugin-share\n'
    writeFileSync(join(root, 'blend.yaml'), plain)
    const applied = new AppliedLive(root)
    writeFileSync(
      join(root, 'blend.yaml'),
      `${plain}      config:\n        pulled:\n          timer:\n            source: github:ana/timer@1.0.0\n            digest: abc\n`,
    )
    expect(applied.needsReload([join(root, 'blend.yaml')])).toBe(false)
  })

  it('loads the app again when an agent edits a pulled plugin', () => {
    const root = app()
    const applied = new AppliedLive(root)
    pull(root, 'timer', {})
    writeFileSync(join(root, 'plugins', 'timer', 'index.ts'), "export const name = 'timer'\nexport function apply() { /* edited */ }\n")
    expect(applied.needsReload([join(root, 'plugins', 'timer', 'index.ts')])).toBe(true)
  })

  it('loads the app again for a plugin folder nothing remembers, a change of src/, and a row added to blend.yaml', () => {
    const root = app()
    const applied = new AppliedLive(root)
    mkdirSync(join(root, 'plugins', 'notes'))
    writeFileSync(join(root, 'plugins', 'notes', 'index.ts'), 'export {}\n')
    expect(applied.needsReload([join(root, 'plugins', 'notes', 'index.ts')])).toBe(true)
    expect(applied.needsReload([join(root, 'src', 'app.ts')])).toBe(true)
    writeFileSync(join(root, 'blend.yaml'), BLEND({}, '    - name: notes\n'))
    expect(applied.needsReload([join(root, 'blend.yaml')])).toBe(true)
  })

  it('does not load the app again for a folder that came and went, but does for one the app was loaded with', () => {
    const root = app()
    mkdirSync(join(root, 'plugins', 'board'))
    const applied = new AppliedLive(root)
    const remembered: Record<string, string> = {}
    pull(root, 'timer', remembered)
    undo(root, 'timer', remembered)
    expect(applied.needsReload([join(root, 'plugins', 'timer'), join(root, 'blend.yaml')])).toBe(false)
    rmSync(join(root, 'plugins', 'board'), { recursive: true })
    expect(applied.needsReload([join(root, 'plugins', 'board')])).toBe(true)
  })
})

describe('a pull blend.yaml does not remember (from a local file)', () => {
  /** What plugin-share writes for a local pull: the folder only, no record; the running service knows the digest. */
  function pullLocal(root: string, name: string, live: Map<string, string>): void {
    const incoming = join(root, 'plugins', `.pulling-${name}`)
    mkdirSync(incoming, { recursive: true })
    writeFileSync(join(incoming, 'index.ts'), `export const name = '${name}'\nexport function apply() {}\n`)
    live.set(name, digestFolder(incoming))
    renameSync(incoming, join(root, 'plugins', name))
  }

  it('does not load the app again for the folder the running pluginShare installed, and does for an edit to it', () => {
    const root = app()
    const live = new Map<string, string>()
    const applied = new AppliedLive(root, (name) => live.get(name))
    pullLocal(root, 'gate', live)
    expect(applied.needsReload([join(root, 'plugins', 'gate'), join(root, 'plugins', 'gate', 'index.ts')])).toBe(false)
    writeFileSync(join(root, 'plugins', 'gate', 'index.ts'), "export const name = 'gate'\nexport function apply() { /* edited */ }\n")
    expect(applied.needsReload([join(root, 'plugins', 'gate', 'index.ts')])).toBe(true)
  })

  it('loads the app again when no running pluginShare knows the folder', () => {
    const root = app()
    const applied = new AppliedLive(root)
    pullLocal(root, 'gate', new Map())
    expect(applied.needsReload([join(root, 'plugins', 'gate')])).toBe(true)
  })

  it('reads the service at each call and answers only a string digest', () => {
    let service: unknown
    const digest = pulledDigestOf(() => service)
    expect(digest('gate')).toBeUndefined()
    service = { pulledDigest: () => 42 }
    expect(digest('gate')).toBeUndefined()
    service = { live: new Map([['gate', 'abc']]), pulledDigest(this: { live: Map<string, string> }, name: string) { return this.live.get(name) } }
    expect(digest('gate')).toBe('abc')
    expect(digest('other')).toBeUndefined()
  })
})

describe('watchAppFiles', () => {
  const settle = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

  it('two pulls inside one debounce, one of them refused, load nothing; an edit after them loads the app once', async () => {
    const root = app()
    let reloads = 0
    const reported: unknown[] = []
    const stop = watchAppFiles(root, () => { reloads += 1 }, { debounceMs: 150, report: (cause) => { reported.push(cause) } })
    try {
      // macOS replays the folder's past as a watch starts; the watcher ignores its first moments.
      await settle(350)
      const remembered: Record<string, string> = {}
      pull(root, 'timer', remembered)
      await settle(40)
      pull(root, 'dice', remembered)
      await settle(40)
      undo(root, 'dice', remembered)
      await settle(600)
      expect(reloads).toBe(0)
      writeFileSync(join(root, 'plugins', 'timer', 'index.ts'), "export const name = 'timer'\nexport function apply() { /* edited */ }\n")
      const until = Date.now() + 3000
      while (reloads === 0 && Date.now() < until) await settle(20)
      await settle(300)
      expect(reloads).toBe(1)
      expect(reported).toEqual([])
    } finally {
      stop()
    }
  })
})

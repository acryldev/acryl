/** `acrylblends add` reads and edits an app's blend.yaml and registry; a Windows checkout writes both with CRLF, and the rows must still be found and kept in that style. */
import {
  mkdtempSync as makeTempDir,
  mkdirSync,
  readFileSync,
  rmSync as removeTempDir,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { MOUNTED, mount, rowNames } from '../src/mount.ts'

/** Temporary folders this file makes; removed after its tests, also when one fails. */
const tempDirs: string[] = []
const tempDir = (prefix: string): string => {
  const dir = makeTempDir(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}
afterAll(() => {
  for (const dir of tempDirs.splice(0)) removeTempDir(dir, { recursive: true, force: true })
})

const panel = MOUNTED.find((plugin) => plugin.name === 'agent-panel')
if (panel === undefined) throw new Error('agent-panel is not a mounted plugin')

const BLEND = [
  'apiVersion: blends.acryl.dev/v1alpha1',
  'kind: Blueprint',
  'metadata:',
  '  id: example',
  'spec:',
  '  rows:',
  '    - id: agent',
  '      name: agent',
  '    - id: extensions',
  '      name: extensions',
  '    - id: routes',
  '      name: routes',
]

const APP = [
  "import type { Context } from '@deepseek-ai/cordis'",
  "import * as routes from '../plugins/routes/index.ts'",
  '',
  'export const registry = {',
  '  routes,',
  '}',
]

/** An app folder holding the two files `add` edits, joined with `eol`. */
function app(eol: '\n' | '\r\n'): string {
  const dir = tempDir('mount-test-')
  mkdirSync(join(dir, 'src'))
  writeFileSync(join(dir, 'blend.yaml'), `${BLEND.join(eol)}${eol}`)
  writeFileSync(join(dir, 'src', 'app.ts'), `${APP.join(eol)}${eol}`)
  return dir
}

describe('a Blend written with CRLF', () => {
  it('has the same rows as one with LF', () => {
    expect(rowNames(app('\n'))).toEqual(['agent', 'extensions', 'routes'])
    expect(rowNames(app('\r\n'))).toEqual(['agent', 'extensions', 'routes'])
  })

  for (const [name, eol] of [
    ['LF', '\n'],
    ['CRLF', '\r\n'],
  ] as const) {
    it(`mounts a row and its registry entry in a ${name} app, keeping that line ending`, () => {
      const dir = app(eol)
      const result = mount(dir, panel)
      expect(result.done, result.note).toBe(true)
      const blend = readFileSync(join(dir, 'blend.yaml'), 'utf8')
      expect(blend).toContain(
        `    - id: agent-panel${eol}      name: agent-panel${eol}    - id: routes`,
      )
      const source = readFileSync(join(dir, 'src', 'app.ts'), 'utf8')
      expect(source).toContain(`import * as panel from '../plugins/agent-panel/index.ts'${eol}`)
      expect(source).toContain(`  'agent-panel': panel,${eol}`)
    })
  }
})

describe('plugin-share, for an app made from a starter older than sharing', () => {
  const share = MOUNTED.find((plugin) => plugin.name === 'plugin-share')
  if (share === undefined) throw new Error('plugin-share is not a mounted plugin')

  it('gets its row after extensions and a named import, since the plugin is an export of its entry', () => {
    const dir = app('\n')
    const result = mount(dir, share)
    expect(result.done, result.note).toBe(true)
    expect(readFileSync(join(dir, 'blend.yaml'), 'utf8')).toContain(
      '    - id: extensions\n      name: extensions\n    - id: plugin-share\n      name: plugin-share\n    - id: routes',
    )
    const source = readFileSync(join(dir, 'src', 'app.ts'), 'utf8')
    expect(source).toContain("import { pluginShare } from '../plugins/plugin-share/index.ts'\n")
    expect(source).toContain("export const registry = {\n  'plugin-share': pluginShare,\n")
  })

  it('is left alone in an app that already has it', () => {
    const dir = app('\n')
    mount(dir, share)
    const before = readFileSync(join(dir, 'src', 'app.ts'), 'utf8')
    expect(mount(dir, share).done).toBe(true)
    expect(readFileSync(join(dir, 'src', 'app.ts'), 'utf8')).toBe(before)
  })
})

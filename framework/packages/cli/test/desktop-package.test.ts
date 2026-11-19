import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { planDesktopPackage } from '../src/desktop-package.ts'

const made: string[] = []
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function app(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'desktop-package-'))
  made.push(dir)
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, file)), { recursive: true })
    writeFileSync(join(dir, file), text)
  }
  return dir
}

const table = new Map([
  ['@acryldev/instance', 'instance/index.ts'],
  ['@acryldev/instance/storage', 'instance/storage.ts'],
  ['@acryldev/desktop-shell/main', 'desktop/main.ts'],
])
const versions = { '@acryldev/desktop-shell': '0.1.0', '@acryldev/instance': '0.1.0' }
const always = () => true

const copies = {
  'plugins/desktop/main.ts': 'export {}\n',
  'plugins/instance/index.ts': 'export const selectInstance = () => {}\n',
  'plugins/instance/storage.ts': 'export const open = () => {}\n',
}

describe('planDesktopPackage (spec 051 T011)', () => {
  it("moves untouched copies to packages and rewrites the app's imports of them", () => {
    const dir = app({
      ...copies,
      'src/main.ts': "import { selectInstance } from '../plugins/instance/index.ts'\n",
      'plugins/agent-panel/headless.ts': "import { open } from '../instance/storage.ts'\n",
      'src/routes.ts': "import { x } from './x.ts'\n",
    })
    const plan = planDesktopPackage(dir, table, versions, always)
    expect(plan).toEqual({
      kind: 'move',
      remove: ['plugins/desktop', 'plugins/instance'],
      dependencies: versions,
      rewrites: [
        { file: 'src/main.ts', text: "import { selectInstance } from '@acryldev/instance'\n" },
        {
          file: 'plugins/agent-panel/headless.ts',
          text: "import { open } from '@acryldev/instance/storage'\n",
        },
      ],
    })
  })

  it('keeps a copy the app edited, naming each edited file, and changes nothing', () => {
    const dir = app({
      ...copies,
      'plugins/instance/storage.ts': 'export const open = () => "mine"\n',
    })
    const plan = planDesktopPackage(dir, table, versions, (_plugin, file) => file !== 'storage.ts')
    expect(plan).toEqual({ kind: 'conflict', files: ['plugins/instance/storage.ts'] })
  })

  it('has nothing to do for an app without the copies (a web app, or one already moved)', () => {
    expect(planDesktopPackage(app({ 'src/app.ts': '' }), table, versions, always)).toEqual({
      kind: 'nothing',
    })
  })

  it('refuses to plan a move to a package that has no published version', () => {
    expect(() => planDesktopPackage(app(copies), table, {}, always)).toThrow(/must be published/)
  })
})

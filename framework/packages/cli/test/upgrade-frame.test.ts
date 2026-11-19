/**
 * The frame half of `acrylblends upgrade` on apps made by this version (spec 051 T038, day 0): an app that already has the frame is left alone, an app
 * that never carried it stays standalone and says so, and an overlay the app wrote is never replaced. No released scaffold is involved.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { type Io, init, parseUpgradeOptions, upgrade } from '../src/index'
import type { Template } from '../src/templates'

const scratch = mkdtempSync(join(tmpdir(), 'acrylblends-upgrade-frame-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))
afterEach(() => {
  delete process.env.ACRYLBLENDS_FRAME_PACKAGES
})

function session(cwd: string) {
  const out: string[] = []
  const err: string[] = []
  const io: Io = {
    stdout: { write: (text: string) => out.push(text) },
    stderr: { write: (text: string) => err.push(text) },
    cwd,
    ask: undefined,
    install: async () => 0,
  }
  return { io, out: () => out.join(''), err: () => err.join('') }
}

const FRAME_SPECS = JSON.stringify({
  dshVersion: '0.2.0-rc.2',
  frameworkVersion: '^1.0.10',
  packages: {
    '@acryldev/app-shell': 'file:/checkout/plugins/app-shell',
    '@acryldev/web': 'file:/checkout/runtime/web',
  },
})

async function app(name: string, template: Template, desktop: boolean): Promise<string> {
  delete process.env.ACRYLBLENDS_FRAME_PACKAGES
  const { io, err } = session(scratch)
  const code = await init(
    { directory: name, template, yes: true, name, install: false, desktop, quietNext: true },
    io,
  )
  expect(code, err()).toBe(0)
  return join(scratch, name)
}

const runUpgrade = async (root: string, argv: readonly string[] = []) => {
  const { io, out, err } = session(root)
  const code = await upgrade(parseUpgradeOptions(argv), io)
  return { code, out, err }
}

describe('the frame step on an app made by this version', () => {
  it('leaves a framed app alone and changes no bytes', async () => {
    const root = await app('framed', 'blank', true)
    const overlay = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')
    process.env.ACRYLBLENDS_FRAME_PACKAGES = FRAME_SPECS
    const first = await runUpgrade(root)
    expect(first.code, first.err()).toBe(0)
    expect(first.out()).toContain('up to date')
    const second = await runUpgrade(root)
    expect(second.code).toBe(0)
    expect(second.out()).toContain('up to date')
    expect(readFileSync(join(root, 'cordis.patch.yml'), 'utf8')).toBe(overlay)
  })

  it('adds the frame to an app that never carried it, and is idempotent', async () => {
    const root = await app('standalone', 'blank', false)
    expect(existsSync(join(root, 'cordis.patch.yml'))).toBe(false)
    process.env.ACRYLBLENDS_FRAME_PACKAGES = FRAME_SPECS
    const first = await runUpgrade(root)
    expect(first.code, first.err()).toBe(0)
    const overlay = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')
    expect(overlay).toContain('- id: app-routes')
    expect(overlay).toContain('name: ./src/frame.ts')
    expect(existsSync(join(root, 'cordis.yml'))).toBe(true)
    expect(existsSync(join(root, 'scripts', 'ide-host.mjs'))).toBe(true)
    expect(existsSync(join(root, 'app', 'runtime.mjs'))).toBe(true)
    expect(existsSync(join(root, 'src', 'frame.ts'))).toBe(true)
    expect(existsSync(join(root, 'plugins', 'page', 'src', 'index.ts'))).toBe(true)
    expect(existsSync(join(root, 'plugins', 'web-server', 'src', 'index.ts'))).toBe(true)
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }
    expect(manifest.scripts.dev).toBe(
      'node --import ./plugins/node-server/src/register.ts scripts/ide-host.mjs',
    )
    expect(manifest.scripts.start).toBe(
      'node --import ./plugins/node-server/src/register.ts src/main.ts',
    )
    const second = await runUpgrade(root)
    expect(second.code, second.err()).toBe(0)
    expect(readFileSync(join(root, 'cordis.patch.yml'), 'utf8')).toBe(overlay)
  })

  it('never replaces an overlay the app wrote', async () => {
    const root = await app('own-overlay', 'blank', true)
    const own = '# mine\n- insert:\n    - id: mine\n      name: ./mine.ts\n'
    writeFileSync(join(root, 'cordis.patch.yml'), own)
    process.env.ACRYLBLENDS_FRAME_PACKAGES = FRAME_SPECS
    const run = await runUpgrade(root)
    expect(run.code).toBe(1)
    expect(run.err()).toContain('cordis.patch.yml')
    expect(readFileSync(join(root, 'cordis.patch.yml'), 'utf8')).toBe(own)
  })
})

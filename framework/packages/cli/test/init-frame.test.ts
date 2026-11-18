/**
 * Slice 6 of the IDE port: a template with a frame row (`src/frame.ts`) is scaffolded with the app's own DSH profile and overlay, so `npm run dev`
 * opens the app inside the ACRYL frame with its page at /app. A desktop app installs the frame's published packages (frame/packages.json);
 * ACRYLBLENDS_FRAME_PACKAGES overrides them (a checkout's build, or `none`), and an app with neither stays on the framework only and says why.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { FRAME_DSH_VERSION, FRAME_RELEASE, FRAME_SCOPE } from '../src/frame-release.ts'
import { FRAME_IDENTITY, FRAME_PACKAGES, FRAME_PAGE_PREFIX, FRAME_PLUGINS } from '../src/ide-profile.ts'
import { type Io, init } from '../src/index'
import { TEMPLATES, templatesRoot } from '../src/templates.ts'
import { VERSION } from '../src/version.ts'

const scratch = mkdtempSync(join(tmpdir(), 'acrylblends-init-frame-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))
afterEach(() => {
  delete process.env.ACRYLBLENDS_FRAME_PACKAGES
})

function fakeIo(cwd: string) {
  const out: string[] = []
  const io: Io = {
    stdout: { write: (text: string) => out.push(text) },
    stderr: { write: () => {} },
    cwd,
    ask: undefined,
    install: async () => 0,
  }
  return { io, out }
}

const FRAME_SPECS = JSON.stringify({
  dshVersion: '0.2.0-rc.2',
  frameworkVersion: '^1.0.10',
  packages: {
    'acryl-app-shell': 'file:/checkout/ide/acryl-app-shell',
    'acryl-web': 'file:/checkout/ide/acryl-web',
  },
})

describe('scaffolding a template into the frame', () => {
  it('every template mounts its page at the path the overlay advertises, so the first tile opens it', () => {
    const root = templatesRoot()
    for (const template of TEMPLATES) {
      const folder = join(root, template, 'src')
      if (!existsSync(join(folder, 'frame.ts'))) continue
      const prefixes = readdirSync(folder)
        .filter((name) => name.endsWith('.ts'))
        .flatMap((name) =>
          [
            ...readFileSync(join(folder, name), 'utf8').matchAll(
              /FRAME_MOUNT_PREFIX = '([^']+)'/gu,
            ),
          ].map((match) => match[1]),
        )
      expect(prefixes, template).toContain(FRAME_PAGE_PREFIX)
    }
  })

  it('a new app is a git repository with the scaffold as its first commit, even where git has no identity, so Files works and Changes starts from your edits', async () => {
    // A machine without a configured git identity must still get the first commit: point git at empty global and system configs for the scaffold.
    const empty = join(scratch, 'empty-gitconfig')
    writeFileSync(empty, '')
    const before = { global: process.env.GIT_CONFIG_GLOBAL, system: process.env.GIT_CONFIG_SYSTEM }
    process.env.GIT_CONFIG_GLOBAL = empty
    process.env.GIT_CONFIG_SYSTEM = empty
    try {
      const { io } = fakeIo(scratch)
      const code = await init(
        {
          directory: 'versioned',
          template: 'blank',
          yes: true,
          name: 'versioned',
          install: false,
          desktop: false,
          quietNext: true,
        },
        io,
      )
      expect(code).toBe(0)
      // A machine without git is left alone; every workshop machine has it (the preflight checks it).
      if (spawnSync('git', ['--version'], { stdio: 'ignore' }).status === 0) {
        expect(existsSync(join(scratch, 'versioned', '.git'))).toBe(true)
        const log = spawnSync('git', ['log', '-1', '--format=%s'], {
          cwd: join(scratch, 'versioned'),
          encoding: 'utf8',
          env: process.env,
        })
        expect(log.stdout.trim()).toBe('Initial commit from acrylblends')
      }
    } finally {
      if (before.global === undefined) delete process.env.GIT_CONFIG_GLOBAL
      else process.env.GIT_CONFIG_GLOBAL = before.global
      if (before.system === undefined) delete process.env.GIT_CONFIG_SYSTEM
      else process.env.GIT_CONFIG_SYSTEM = before.system
    }
  })

  it('writes the profile and overlay with the app row and the frame rows, and points dev at the profile', async () => {
    process.env.ACRYLBLENDS_FRAME_PACKAGES = FRAME_SPECS
    const { io } = fakeIo(scratch)
    const code = await init(
      {
        directory: 'framed',
        template: 'blank',
        yes: true,
        name: 'framed',
        install: false,
        desktop: false,
        quietNext: true,
      },
      io,
    )
    expect(code).toBe(0)
    const root = join(scratch, 'framed')
    const overlay = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')
    // The app's own row is in the overlay, at the prefix its frame row mounts.
    expect(overlay).toContain('- id: app-routes')
    expect(overlay).toContain('name: ./src/frame.ts')
    // The frame's rows are there too.
    expect(overlay).toContain('name: acryl-app-shell')
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    expect(String(manifest.scripts.dev)).toBe(
      'node --import ./plugins/acryl-node-server/src/register.ts scripts/ide-host.mjs',
    )
    expect(manifest.scripts.profile).toBeUndefined()
    expect(existsSync(join(root, 'scripts', 'ide-host.mjs'))).toBe(true)
    expect(existsSync(join(root, 'cordis.yml'))).toBe(true)
    expect(manifest.dependencies['@deepseek-ai/dsh-base']).toBe('0.2.0-rc.2')
    expect(manifest.dependencies['acryl-app-shell']).toBe('file:/checkout/ide/acryl-app-shell')
    expect(existsSync(join(root, 'app', 'runtime.mjs'))).toBe(true)
  })

  it('without frame package specs it writes no profile and says why, leaving the framework-only app runnable', async () => {
    const { io, out } = fakeIo(scratch)
    const code = await init(
      {
        directory: 'plain',
        template: 'blank',
        yes: true,
        name: 'plain',
        install: false,
        desktop: false,
        quietNext: true,
      },
      io,
    )
    expect(code).toBe(0)
    const root = join(scratch, 'plain')
    expect(existsSync(join(root, 'cordis.patch.yml'))).toBe(false)
    expect(out.join('')).toMatch(/framework alone; init --desktop puts it inside the ACRYL frame/u)
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    expect(manifest.scripts.dev).not.toBe('node scripts/ide-host.mjs')
  })

  it('init --desktop installs the published frame: every row by its npm name and version, its row id kept, the framework at this release', async () => {
    const { io } = fakeIo(scratch)
    const code = await init(
      {
        directory: 'published',
        template: 'blank',
        yes: true,
        name: 'published',
        install: false,
        desktop: true,
        quietNext: true,
      },
      io,
    )
    expect(code).toBe(0)
    const root = join(scratch, 'published')
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    const overlay = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')
    const published = new Map(FRAME_RELEASE.map((entry) => [entry.source, entry]))
    for (const row of FRAME_PACKAGES) {
      if (row.installed === true) continue
      const entry = published.get(row.name)
      expect(entry, row.name).toBeDefined()
      expect(manifest.dependencies[String(entry?.name)]).toBe(`^${String(entry?.version)}`)
      expect(manifest.dependencies[row.name], row.name).toBeUndefined()
      expect(overlay).toContain(
        `- id: ${row.row ?? row.name}\n      name: '${String(entry?.name)}'`,
      )
    }
    // Plugins from their own repositories (Settings > Skills & MCP) are in every framed app, by their own names.
    for (const plugin of FRAME_PLUGINS) {
      expect(manifest.dependencies[plugin.name], plugin.name).toBe(plugin.spec)
      expect(overlay).toContain(`- id: ${plugin.name}\n      name: ${plugin.name}`)
    }
    expect(FRAME_PLUGINS.map((plugin) => plugin.name)).toContain('skill-mcp-manager')
    // The agent's opening line is the Blends one (the package's own default is ACRYL's), passed on the row.
    expect(overlay).toContain(
      `name: '${FRAME_SCOPE}/system-prompt'\n      config:\n        identity: ${JSON.stringify(FRAME_IDENTITY)}`,
    )
    expect(manifest.dependencies.acrylblends).toBe(`^${VERSION}`)
    expect(manifest.dependencies['@deepseek-ai/dsh-base']).toBe(FRAME_DSH_VERSION)
    // The launcher's development hook is the Blends frame's, by the name it installs as.
    expect(readFileSync(join(root, 'scripts', 'ide-host.mjs'), 'utf8')).toContain(
      `import('${FRAME_SCOPE}/blends-frame/app-generation')`,
    )
  })

  it('ACRYLBLENDS_FRAME_PACKAGES=none leaves a desktop app on the framework alone and says so', async () => {
    process.env.ACRYLBLENDS_FRAME_PACKAGES = 'none'
    const { io, out } = fakeIo(scratch)
    const code = await init(
      {
        directory: 'desktop-alone',
        template: 'blank',
        yes: true,
        name: 'desktop-alone',
        install: false,
        desktop: true,
        quietNext: true,
      },
      io,
    )
    expect(code).toBe(0)
    expect(existsSync(join(scratch, 'desktop-alone', 'cordis.patch.yml'))).toBe(false)
    expect(out.join('')).toMatch(/framework alone; ACRYLBLENDS_FRAME_PACKAGES is none/u)
  })
})

describe('frame/packages.json, the release the CLI installs', () => {
  const ide = join(templatesRoot(), '..', '..', '..', 'ide')
  const manifestOf = (folder: string) =>
    JSON.parse(readFileSync(join(ide, folder, 'package.json'), 'utf8')) as {
      name: string
      version: string
      dependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
    }

  it("names each package at its folder's version", () => {
    for (const entry of FRAME_RELEASE)
      expect(manifestOf(entry.source).version, entry.source).toBe(entry.version)
  })

  it('is exactly the closure of the frame rows, so nothing is published that the frame does not install and nothing it installs is missing', () => {
    const folderOf = new Map(
      readdirSync(ide)
        .filter((folder) => existsSync(join(ide, folder, 'package.json')))
        .map((folder) => [manifestOf(folder).name, folder]),
    )
    const closure = new Set<string>()
    const need = (name: string) => {
      const folder = folderOf.get(name)
      if (folder === undefined || closure.has(folder)) return
      closure.add(folder)
      const manifest = manifestOf(folder)
      for (const field of [manifest.dependencies, manifest.peerDependencies])
        for (const [dependency, range] of Object.entries(field ?? {}))
          if (range.startsWith('workspace:')) need(dependency)
    }
    for (const row of FRAME_PACKAGES) if (row.installed !== true) need(row.name)
    expect(new Set(FRAME_RELEASE.map((entry) => entry.source))).toEqual(closure)
  })
})

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { boot } from '@deepseek-ai/dsh-app-boot'
import { PluginLifecycleController } from '../src/plugin-lifecycle-controller.ts'
import { pluginLifecyclePatches } from '../src/plugin-lifecycle-state.ts'

const roots: string[] = []
const PACKAGE = 'acryl-development-canvas'
const MARKET_PACKAGE = 'cordis-plugin-graph'
// In the bundle list + node_modules but NOT in cordis.yml - the shape of a
// just-installed market plugin before a restart. Its patch row id differs from
// the package name, like the real acryl-dsh-editor-plugin.
const INSTALLED_PACKAGE = 'acryl-dsh-editor-plugin'
const INSTALLED_ROW_ID = 'dsh-editor'

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

async function harness() {
  const root = mkdtempSync(join(tmpdir(), 'dsh-plugin-lifecycle-controller-'))
  roots.push(root)
  const packageDir = join(root, 'node_modules', PACKAGE)
  mkdirSync(packageDir, { recursive: true })
  const logPath = join(root, 'lifecycle.log')
  writeFileSync(join(packageDir, 'package.json'), JSON.stringify({
    name: PACKAGE,
    version: '1.0.0',
    type: 'module',
    exports: {
      '.': './index.mjs',
      './client': './client.js',
      './package.json': './package.json',
    },
    dsh: { client: { platform: 'web' } },
  }))
  writeFileSync(join(packageDir, 'index.mjs'), [
    "import { appendFileSync } from 'node:fs'",
    'export const name = "test-canvas"',
    `export function apply(ctx) { appendFileSync(${JSON.stringify(logPath)}, 'mount\\n'); ctx.effect(() => () => { appendFileSync(${JSON.stringify(logPath)}, 'unmount\\n') }) }`,
    '',
  ].join('\n'))
  writeFileSync(join(packageDir, 'client.js'), 'window.__testCanvas = true\n')
  writeFileSync(join(root, 'cordis.yml'), [
    '- id: desktop-development-canvas',
    `  name: ${PACKAGE}`,
    '- id: protected-test',
    `  name: ${PACKAGE}`,
    '- id: market-plugin',
    `  name: ${MARKET_PACKAGE}`,
    '',
  ].join('\n'))
  // A profile manifest whose bundle list contains a user-added package makes
  // that package's inserted row user-mutable, without any allowlist edit.
  writeFileSync(join(root, 'package.json'), JSON.stringify({
    name: 'dsh-profile-desktop',
    private: true,
    dependencies: { [MARKET_PACKAGE]: '1.0.0', [INSTALLED_PACKAGE]: '0.2.6' },
    dsh: {
      profile: {
        bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', MARKET_PACKAGE, INSTALLED_PACKAGE],
      },
    },
  }))
  const marketDir = join(root, 'node_modules', MARKET_PACKAGE)
  mkdirSync(marketDir, { recursive: true })
  writeFileSync(join(marketDir, 'package.json'), JSON.stringify({ name: MARKET_PACKAGE, version: '1.0.0', type: 'module', exports: { '.': './index.mjs' } }))
  writeFileSync(join(marketDir, 'index.mjs'), 'export const name = "market-plugin"\nexport function apply() {}\n')
  const installedDir = join(root, 'node_modules', INSTALLED_PACKAGE)
  mkdirSync(installedDir, { recursive: true })
  writeFileSync(join(installedDir, 'package.json'), JSON.stringify({
    name: INSTALLED_PACKAGE,
    version: '0.2.6',
    type: 'module',
    exports: { '.': './index.mjs', './package.json': './package.json' },
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  }))
  writeFileSync(join(installedDir, 'index.mjs'), 'export const name = "dsh-editor"\nexport function apply() {}\n')
  writeFileSync(join(installedDir, 'cordis.patch.yml'), `- insert:\n    - id: ${INSTALLED_ROW_ID}\n      name: '${INSTALLED_PACKAGE}'\n`)
  const ctx = await boot('plugin-lifecycle-controller-test', join(root, 'cordis.yml'))
  const statePath = join(root, 'state', 'lifecycle.json')
  const controller = new PluginLifecycleController(ctx, { profileName: 'desktop', statePath, profileDir: root })
  return { ctx, controller, logPath, statePath }
}

function lines(path: string): string[] {
  return readFileSync(path, 'utf8').trim().split('\n')
}

describe('PluginLifecycleController', () => {
  it('projects Host phase, Client declaration, and mutation policy', async () => {
    const { ctx, controller } = await harness()
    try {
      const snapshot = controller.snapshot()
      const canvas = snapshot.entries.find(entry => entry.entryId === 'include:desktop-development-canvas')
      const protectedEntry = snapshot.entries.find(entry => entry.entryId === 'include:protected-test')

      expect(canvas).toEqual(expect.objectContaining({
        moduleName: PACKAGE,
        enabled: true,
        hostPhase: 'active',
        clientPackage: PACKAGE,
        clientInBootGraph: false,
        mutable: true,
        protectedReason: null,
      }))
      expect(protectedEntry).toEqual(expect.objectContaining({
        mutable: false,
        protectedReason: expect.any(String),
      }))

      const marketEntry = snapshot.entries.find(entry => entry.entryId === 'include:market-plugin')
      expect(marketEntry).toEqual(expect.objectContaining({
        moduleName: MARKET_PACKAGE,
        mutable: true,
        protectedReason: null,
      }))
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('toggles a profile-bundle plugin that is not on any allowlist', async () => {
    const { ctx, controller, statePath } = await harness()
    try {
      const disabled = await controller.setEnabled('include:market-plugin', false)
      expect(disabled.action).toBe('disable')
      expect(disabled.snapshot.entries.find(entry => entry.entryId === 'include:market-plugin'))
        .toEqual(expect.objectContaining({ enabled: false, hostPhase: null }))
      expect(pluginLifecyclePatches({ profileName: 'desktop', statePath })).toEqual([
        { id: 'market-plugin', disabled: true },
      ])

      await controller.setEnabled('include:market-plugin', true)
      expect(pluginLifecyclePatches({ profileName: 'desktop', statePath })).toEqual([])
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('disables and enables Canvas with persistence and settled Fiber cleanup', async () => {
    const { ctx, controller, logPath, statePath } = await harness()
    try {
      const disabled = await controller.setEnabled('include:desktop-development-canvas', false)
      expect(disabled.action).toBe('disable')
      expect(disabled.rendererReloadRequired).toBe(true)
      expect(disabled.snapshot.entries.find(entry => entry.entryId === 'include:desktop-development-canvas'))
        .toEqual(expect.objectContaining({ enabled: false, hostPhase: null }))
      expect(lines(logPath)).toEqual(['mount', 'mount', 'unmount'])
      expect(pluginLifecyclePatches({ profileName: 'desktop', statePath })).toEqual([{
        id: 'desktop-development-canvas',
        disabled: true,
      }])

      const enabled = await controller.setEnabled('include:desktop-development-canvas', true)
      expect(enabled.action).toBe('enable')
      expect(enabled.snapshot.entries.find(entry => entry.entryId === 'include:desktop-development-canvas'))
        .toEqual(expect.objectContaining({ enabled: true, hostPhase: 'active' }))
      expect(lines(logPath)).toEqual(['mount', 'mount', 'unmount', 'mount'])
      expect(pluginLifecyclePatches({ profileName: 'desktop', statePath })).toEqual([])
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('reloads through Fiber restart without changing persistence', async () => {
    const { ctx, controller, logPath, statePath } = await harness()
    try {
      const receipt = await controller.reload('include:desktop-development-canvas')
      expect(receipt).toEqual(expect.objectContaining({
        action: 'reload',
        entryIds: ['include:desktop-development-canvas'],
        rendererReloadRequired: true,
      }))
      expect(lines(logPath)).toEqual(['mount', 'mount', 'unmount', 'mount'])
      expect(pluginLifecyclePatches({ profileName: 'desktop', statePath })).toEqual([])
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('activates a just-installed bundle into the running tree, then deactivates it', async () => {
    const { ctx, controller } = await harness()
    try {
      expect(controller.snapshot().entries.some(e => e.entryId === 'include:dsh-editor')).toBe(false)

      const activated = await controller.activate(INSTALLED_PACKAGE)
      expect(activated.action).toBe('enable')
      const mounted = controller.snapshot().entries.find(e => e.entryId === 'include:dsh-editor')
      expect(mounted).toEqual(expect.objectContaining({
        moduleName: INSTALLED_PACKAGE,
        enabled: true,
        hostPhase: 'active',
        mutable: true,
      }))

      // Idempotent.
      await expect(controller.activate(INSTALLED_PACKAGE)).resolves.toEqual(
        expect.objectContaining({ action: 'enable' }),
      )

      await controller.deactivate(INSTALLED_PACKAGE)
      expect(controller.snapshot().entries.some(e => e.entryId === 'include:dsh-editor')).toBe(false)
      // Deactivate is a no-op when already gone.
      await expect(controller.deactivate(INSTALLED_PACKAGE)).resolves.toEqual(
        expect.objectContaining({ action: 'disable', entryIds: [] }),
      )
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('refuses to activate a package that is not a profile bundle', async () => {
    const { ctx, controller } = await harness()
    try {
      await expect(controller.activate('some-unrelated-package'))
        .rejects.toMatchObject({ code: 'protected-entry' })
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('rejects protected, unknown, duplicate, and unmounted actions', async () => {
    const { ctx, controller } = await harness()
    try {
      await expect(controller.setEnabled('include:protected-test', false))
        .rejects.toMatchObject({ code: 'protected-entry' })
      await expect(controller.setEnabled('include:missing', false))
        .rejects.toMatchObject({ code: 'unknown-entry' })
      await expect(controller.setEnabled('include:desktop-development-canvas', true))
        .rejects.toMatchObject({ code: 'already-enabled' })
      await controller.setEnabled('include:desktop-development-canvas', false)
      await expect(controller.reload('include:desktop-development-canvas'))
        .rejects.toMatchObject({ code: 'not-mounted' })
    } finally {
      await ctx.fiber.dispose()
    }
  })
})

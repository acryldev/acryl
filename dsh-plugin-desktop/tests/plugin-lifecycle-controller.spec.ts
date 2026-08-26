import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { boot } from '@deepseek-ai/dsh-app-boot'
import { PluginLifecycleController } from '../src/plugin-lifecycle-controller.ts'
import { pluginLifecyclePatches } from '../src/plugin-lifecycle-state.ts'

const roots: string[] = []
const PACKAGE = 'dsh-plugin-development-canvas'

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
    '',
  ].join('\n'))
  const ctx = await boot('plugin-lifecycle-controller-test', join(root, 'cordis.yml'))
  const statePath = join(root, 'state', 'lifecycle.json')
  const controller = new PluginLifecycleController(ctx, { profileName: 'desktop', statePath })
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
        name: PACKAGE,
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

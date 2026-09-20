/**
 * Real-engine proof for the Extension Context Pack (spec 037): the web engine
 * mounts the plugin, the assembled system prompt carries the docs router with
 * paths that exist on disk, and the install tool the agent needs is registered.
 */
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'
import { afterEach, describe, expect, it } from 'vitest'
import { createDshEngineDefinition, createWebEngineDefinition } from '../src/engine-dsh.ts'
import { createAcrylEngineHost } from '../src/engine-host.ts'

const temporaryHomes: string[] = []
const initialDshHome = process.env.DSH_HOME

afterEach(async () => {
  process.env.DSH_HOME = initialDshHome
  await Promise.all(temporaryHomes.splice(0).map(home => rm(home, { force: true, recursive: true })))
})

describe('extension context on the web engine', () => {
  it('mounts, routes the prompt to docs that exist, and registers the install tool', async () => {
    const home = await mkdtemp(join(tmpdir(), 'acryl-extension-context-'))
    temporaryHomes.push(home)
    process.env.DSH_HOME = home
    const installPackageUrl = new URL('../package.json', import.meta.url).href
    const host = await createAcrylEngineHost({
      engines: [createWebEngineDefinition(installPackageUrl)],
      initialEngine: 'dsh',
      prepare: hostCtx => {
        provideCmdline(hostCtx, { args: ['--no-open', '--port', '0'], exit: () => {} })
      },
    })
    try {
      const rows = [...host.ctx.loader.entries()]
      expect(rows.some(entry => entry.options.id === 'extension-context')).toBe(true)

      const context = host.ctx.get('extensionContext' as never) as { root: string } | undefined
      expect(context).toBeDefined()
      expect(existsSync(join(context!.root, 'docs', 'docs.json'))).toBe(true)

      const assembly = await host.ctx.get('systemPrompt')!.assemble()
      const router = assembly.sections.find(section => section.name === 'acryl:extension-router')
      expect(router).toBeDefined()
      const text = String((router as { text?: unknown }).text)
      expect(text).toContain(join(context!.root, 'docs', 'README.md'))
      expect(text).toContain('acryl_install_plugin')
      expect(existsSync(join(context!.root, 'docs', 'start-here', 'this-runtime.md'))).toBe(true)

      const toolNames = assembly.tools.map(tool => tool.name)
      expect(toolNames).toEqual(expect.arrayContaining(['acryl_install_plugin', 'acryl_list_plugins', 'acryl_remove_plugin', 'acryl_prepare_publish', 'acryl_verify_plugin']))
    } finally {
      await host.dispose()
    }
  }, 60_000)

  it('mounts on the CLI (tui) engine too', async () => {
    const home = await mkdtemp(join(tmpdir(), 'acryl-extension-context-tui-'))
    temporaryHomes.push(home)
    process.env.DSH_HOME = home
    const host = await createAcrylEngineHost({
      engines: [createDshEngineDefinition('acryl-ext-test')],
      initialEngine: 'dsh',
    })
    try {
      const rows = [...host.ctx.loader.entries()]
      expect(rows.some(entry => entry.options.id === 'extension-context')).toBe(true)
      const assembly = await host.ctx.get('systemPrompt')!.assemble()
      expect(assembly.sections.some(section => section.name === 'acryl:extension-router')).toBe(true)
      expect(assembly.tools.map(tool => tool.name)).toEqual(expect.arrayContaining(['acryl_install_plugin']))
    } finally {
      await host.dispose()
    }
  }, 60_000)
})

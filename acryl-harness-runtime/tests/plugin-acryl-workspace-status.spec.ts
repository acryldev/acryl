import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_PROFILE_BUNDLES, initProfile, resolveProfileDir } from '@deepseek-ai/dsh-app-boot'
import { bootAcrylHarnessProfile } from '../src/index.ts'
import { TOOL_NAME } from '../src/plugin-acryl-workspace-status.ts'

const temporaryHomes: string[] = []
const initialDshHome = process.env.DSH_HOME

async function bootRuntime(profile: string) {
  process.env.DSH_HOME = await mkdtemp(join(tmpdir(), 'acryl-tool-'))
  temporaryHomes.push(process.env.DSH_HOME)
  const profileDirectory = resolveProfileDir(profile)
  initProfile(profileDirectory, DEFAULT_PROFILE_BUNDLES)
  await writeFile(join(profileDirectory, 'cordis.patch.yml'), '- id: hmr\n  disabled: true\n')
  return bootAcrylHarnessProfile({ profile })
}

afterEach(async () => {
  process.env.DSH_HOME = initialDshHome
  await Promise.all(temporaryHomes.splice(0).map(home => rm(home, { force: true, recursive: true })))
})

describe('acryl_workspace_status tool (the ACRYL Cordis Tool gate)', () => {
  it('is auto-mounted on the booted ctx.tools, executes, and renders canonical typed output', async () => {
    const runtime = await bootRuntime('acryl-tool-gate')

    // The boot path must have registered the tool on the native ctx.tools seam.
    const definition = runtime.ctx.tools.get(TOOL_NAME)
    expect(definition).toBeDefined()
    expect(definition?.name).toBe(TOOL_NAME)
    expect(definition?.description).toContain('ACRYL workspace context')
    expect(definition?.output?.schema).toBeDefined()

    // Execute and assert the canonical value matches the declared output schema.
    const value = await definition!.execute({}, { signal: new AbortController().signal } as never)
    expect(value).toMatchObject({ cwd: expect.any(String) })

    // Render to a model-facing text block.
    const blocks = definition!.output.render({}, value)
    expect(blocks[0]).toMatchObject({ type: 'text' })
    expect((blocks[0] as { text: string }).text).toContain('ACRYL workspace context')
  }, 60_000)

  it('is a proper Cordis plugin entry (name/inject/apply)', async () => {
    const mod = await import('../src/plugin-acryl-workspace-status.ts')
    expect(mod.name).toBe('acryl-workspace-status')
    expect(mod.inject).toEqual(['tools'])
    expect(typeof mod.apply).toBe('function')
    expect(typeof mod.installAcrylWorkspaceStatusTool).toBe('function')
  }, 60_000)
})

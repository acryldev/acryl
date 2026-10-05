/**
 * The project registry (T046 S2) on the real web engine: ACRYL's own list of project folders, kept in the ACRYL home through `acryl-settings`,
 * served by the workspace Host plugin, and still there after the engine is torn down and booted again on the same home. The chat's workspaces are not
 * involved: nothing here needs the DSH chat.
 */
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'
import { afterEach, describe, expect, it } from 'vitest'
import { createWebEngineDefinition } from '../src/engine-dsh.ts'
import { createAcrylEngineHost } from '../src/engine-host.ts'

const initialDshHome = process.env.DSH_HOME
const initialBlueprint = process.env.ACRYL_BLUEPRINT
const folders: string[] = []
afterEach(async () => {
  for (const [key, value] of [['DSH_HOME', initialDshHome], ['ACRYL_BLUEPRINT', initialBlueprint]] as const) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  await Promise.all(folders.splice(0).map(folder => rm(folder, { force: true, recursive: true })))
})

type Host = Awaited<ReturnType<typeof createAcrylEngineHost>>

async function boot(home: string, blueprint: string): Promise<{ host: Host, origin: string, acrylHome: string }> {
  process.env.DSH_HOME = home
  process.env.ACRYL_BLUEPRINT = blueprint
  const host = await createAcrylEngineHost({
    engines: [createWebEngineDefinition(new URL('../package.json', import.meta.url).href)],
    initialEngine: 'dsh',
    prepare: ctx => { provideCmdline(ctx, { args: ['--no-open', '--port', '0'], exit: () => {} }) },
  })
  await host.ctx.loader.await()
  await new Promise(resolve => setTimeout(resolve, 300))
  const web = host.ctx.get('webServer' as never) as { port: number }
  const instance = host.ctx.get('appInstance' as never) as { home: string }
  return { host, origin: `http://127.0.0.1:${String(web.port)}`, acrylHome: instance.home }
}

async function projects(origin: string, body?: unknown): Promise<{ status: number, json: any }> {
  const headers: Record<string, string> = { origin, 'sec-fetch-site': 'same-origin' }
  if (body !== undefined) headers['content-type'] = 'application/json'
  const response = await fetch(`${origin}/api/acryl-workspace/projects`, { method: body === undefined ? 'GET' : 'POST', headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  return { status: response.status, json: await response.json() }
}

describe('the project registry on the real engine', () => {
  it('keeps the list in the ACRYL home across a restart, with the DSH chat on or off', async () => {
    const home = await mkdtemp(join(tmpdir(), 'acryl-projects-'))
    folders.push(home)
    const projectA = mkdtempSync(join(tmpdir(), 'acryl-project-a-'))
    const projectB = mkdtempSync(join(tmpdir(), 'acryl-project-b-'))
    folders.push(projectA, projectB)

    const first = await boot(home, 'acryl.agents')   // the chat is off: the list never needed it
    try {
      expect((await projects(first.origin)).json).toEqual({ ok: true, view: { paths: [], adopted: false } })
      expect((await projects(first.origin, { op: 'add', path: projectA })).json.view.paths).toEqual([projectA])
      expect((await projects(first.origin, { op: 'add', path: projectB })).json.view.paths).toEqual([projectA, projectB])
      expect((await projects(first.origin, { op: 'add', path: '/definitely/not/here' })).json).toMatchObject({ ok: false, code: 'not-a-folder' })
      const file = join(first.acrylHome, 'acryl-settings.yaml')
      expect(existsSync(file)).toBe(true)
      expect(readFileSync(file, 'utf8')).toContain(projectA)
    } finally { await first.host.dispose() }

    const second = await boot(home, 'acryl.ide')     // a different composition, the same home
    try {
      expect((await projects(second.origin)).json.view.paths).toEqual([projectA, projectB])
      expect((await projects(second.origin, { op: 'remove', path: projectA })).json.view.paths).toEqual([projectB])
      expect((await projects(second.origin, { op: 'adopt', paths: [projectA] })).json.view).toEqual({ paths: [projectB, projectA], adopted: true })
      expect((await projects(second.origin, { op: 'adopt', paths: [] })).json.view.adopted).toBe(true)
    } finally { await second.host.dispose() }
  }, 180_000)
})

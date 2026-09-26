/**
 * Web runs the same ACRYL workspace Desktop does (spec 040, "Surface sharing"). This boots the real Web
 * engine on a throwaway home and checks the composition that the shared capability declarations promise,
 * plus one real Host route, so a Web that drifts from Desktop fails here rather than in a user's browser.
 */
import { execFileSync } from 'node:child_process'
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'
import { createAcrylEngineHost, createWebEngineDefinition } from 'acryl-harness-runtime'
import { afterEach, describe, expect, it } from 'vitest'

const temporaryHomes: string[] = []
const initialAcrylHome = process.env.ACRYL_HOME

afterEach(async () => {
  if (initialAcrylHome === undefined) delete process.env.ACRYL_HOME
  else process.env.ACRYL_HOME = initialAcrylHome
  await Promise.all(temporaryHomes.splice(0).map(home => rm(home, { force: true, recursive: true })))
})

describe('the ACRYL workspace on the Web surface', () => {
  it('composes the workspace row, hands the frame to the ACRYL shell, and serves the workspace Host routes', async () => {
    const home = await realpath(await mkdtemp(join(tmpdir(), 'acryl-web-workspace-')))
    temporaryHomes.push(home)
    process.env.ACRYL_HOME = home
    const repo = join(home, 'repo')
    execFileSync('git', ['init', '-q', repo])
    await writeFile(join(repo, 'a.txt'), 'hello\n')

    const host = await createAcrylEngineHost({
      engines: [createWebEngineDefinition(new URL('../package.json', import.meta.url).href)],
      initialEngine: 'dsh',
      prepare: hostCtx => {
        provideCmdline(hostCtx, { args: ['--no-open', '--port', '0'], exit: () => {} })
      },
    })
    try {
      const rows = new Map([...host.ctx.loader.entries()].map(entry => [entry.options.id, entry]))
      expect(rows.get('acryl-workspace')?.fiber).toBeDefined()
      // The stock frame is off and the sidebar and conversation are on: the same toggles Desktop's advanced mode applies.
      expect(rows.get('ui-layout')?.options.disabled).toBe(true)
      expect(rows.get('ui-sidebar')?.options.disabled).not.toBe(true)
      expect(rows.get('ui-conversation')?.options.disabled).not.toBe(true)

      const server = host.ctx.get('webServer') as { port: number } | undefined
      expect(server?.port).toBeGreaterThan(0)
      const origin = `http://127.0.0.1:${String(server?.port)}`
      const headers = { origin, 'sec-fetch-site': 'same-origin' }
      const repoRoute = await fetch(`${origin}/api/acryl-workspace/git/repo?cwd=${encodeURIComponent(repo)}`, { headers })
      expect(repoRoute.status).toBe(200)
      expect(await repoRoute.json()).toMatchObject({ repo: { root: repo } })
      const tree = await fetch(`${origin}/api/acryl-workspace/files/tree?path=${encodeURIComponent(repo)}&dir=`, { headers })
      expect(tree.status).toBe(200)
      expect(await tree.json()).toMatchObject({ entries: [{ name: 'a.txt', kind: 'file' }] })
    } finally {
      await host.dispose()
    }
  }, 60_000)
})

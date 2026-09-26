/**
 * Web runs the same ACRYL workspace Desktop does (spec 040, "Surface sharing"). This boots the real Web
 * engine on a throwaway home and checks the composition that the shared capability declarations promise,
 * plus one real Host route, so a Web that drifts from Desktop fails here rather than in a user's browser.
 */
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
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
      // Plugin administration is the same shared plugin as on Desktop: composed, and its routes answer.
      expect(rows.get('acryl-plugin-admin')?.fiber).toBeDefined()
      const lifecycle = await fetch(`${origin}/api/acryl-plugin-admin/lifecycle`, { headers })
      expect(lifecycle.status).toBe(200)
      const snapshot = await lifecycle.json() as { entries: { entryId: string; moduleName: string }[]; blend: unknown }
      expect(snapshot.entries.some(entry => entry.moduleName === 'acryl-workspace')).toBe(true)
      expect(snapshot.blend).toBeNull()
      const architecture = await fetch(`${origin}/api/acryl-plugin-admin/architecture`, { headers })
      expect(architecture.status).toBe(200)
      // The served page's client manifest names the workspace bundle, so the browser loads the shell and the workspace.
      const connection = host.ctx.get('connection') as { authenticatedUrl(base: string): string } | undefined
      const entry = await fetch(connection?.authenticatedUrl(origin) ?? origin, { redirect: 'manual' })
      const cookie = entry.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
      const page = await fetch(origin, { headers: { cookie } })
      expect(page.status).toBe(200)
      const html = await page.text()
      expect(html).toContain('acryl-workspace')
      const repoRoute = await fetch(`${origin}/api/acryl-workspace/git/repo?cwd=${encodeURIComponent(repo)}`, { headers })
      expect(repoRoute.status).toBe(200)
      expect(await repoRoute.json()).toMatchObject({ repo: { root: repo } })
      // A real terminal starts in the worktree on Web exactly as it does on Desktop, and reads back its own output.
      const started = await fetch(`${origin}/api/acryl-workspace/pty`, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ commandId: 'shell', cwd: repo }),
      })
      expect(started.status).toBe(200)
      const terminal = await started.json() as { id: string }
      await fetch(`${origin}/api/acryl-workspace/pty/input`, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ id: terminal.id, data: 'pwd\r' }),
      })
      let output = ''
      for (let attempt = 0; attempt < 40 && !output.includes(repo); attempt += 1) {
        await new Promise(resolve => { setTimeout(resolve, 100) })
        output = ((await (await fetch(`${origin}/api/acryl-workspace/pty?id=${terminal.id}`, { headers })).json()) as { output: string }).output
      }
      expect(output).toContain(repo)
      await fetch(`${origin}/api/acryl-workspace/pty/close`, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ id: terminal.id }),
      })
      const tree = await fetch(`${origin}/api/acryl-workspace/files/tree?path=${encodeURIComponent(repo)}&dir=`, { headers })
      expect(tree.status).toBe(200)
      expect(await tree.json()).toMatchObject({ entries: [{ name: 'a.txt', kind: 'file' }] })
      // Staging and committing work the same: the workspace's git write routes are the shared plugin's, on Web too.
      execFileSync('git', ['config', 'user.email', 't@t'], { cwd: repo })
      execFileSync('git', ['config', 'user.name', 't'], { cwd: repo })
      const stage = await fetch(`${origin}/api/acryl-workspace/git/stage`, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ path: repo, files: ['a.txt'] }),
      })
      expect(stage.status).toBe(200)
      const commit = await fetch(`${origin}/api/acryl-workspace/git/commit`, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ path: repo, message: 'first commit from web' }),
      })
      expect(commit.status).toBe(200)
      expect(await commit.json()).toMatchObject({ subject: 'first commit from web' })
      // Editing works the same: read a file, save it through the confined route, and see it on disk.
      const read = await (await fetch(`${origin}/api/acryl-workspace/files/read?path=${encodeURIComponent(repo)}&file=a.txt`, { headers })).json() as { mtimeMs: number }
      const saved = await fetch(`${origin}/api/acryl-workspace/files/write`, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ path: repo, file: 'a.txt', content: 'saved on web\n', expectedMtimeMs: read.mtimeMs }),
      })
      expect(saved.status).toBe(200)
      expect(await readFile(join(repo, 'a.txt'), 'utf8')).toBe('saved on web\n')
    } finally {
      await host.dispose()
    }
  }, 60_000)
})

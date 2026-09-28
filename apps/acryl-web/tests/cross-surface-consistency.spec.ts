/**
 * T076 (spec 040, "Real evidence, not unit tests alone"): a real browser pass with a real Desktop window is
 * still open (needs a person past the DSH Internal Testing Notice - see specs/040-agentic-multiplexer-ade/
 * research.md, "T096 attempt, 2026-09-28"). This proves the exact claim T076 makes - a project opened from two
 * independent surface processes shows the same git state, and an edit from one shows on the other - the one
 * way this can be proven headlessly: two real, independently booted engine hosts (their own throwaway home,
 * their own port), pointed at one shared real git repository they neither of them owns, running concurrently.
 *
 * `acryl-desktop`'s own Electron host cannot be booted this way (its web server row is Electron-coupled), so
 * this is two Web engine hosts standing in for "two independent surface processes" rather than literally Web
 * and Desktop - but `acryl-workspace`'s git and files routes are the identical shared plugin either surface
 * composes (surface-parity.spec.ts already proves that composition is identical), so this is a real test of
 * the thing T076 actually worries about (does the shared profile's git state disagree across processes), not
 * an approximation of it. Checks (the worktree's own package scripts, read from disk) are included for the
 * same reason; Review is deliberately not, since its line comments are browser-local state (`review-store.ts`)
 * that no server-side request can reach, in either surface.
 */
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'
import { createAcrylEngineHost, createWebEngineDefinition } from 'acryl-harness-runtime'
import { afterEach, describe, expect, it } from 'vitest'

const temporaryDirs: string[] = []
const initialAcrylHome = process.env.ACRYL_HOME

afterEach(async () => {
  if (initialAcrylHome === undefined) delete process.env.ACRYL_HOME
  else process.env.ACRYL_HOME = initialAcrylHome
  await Promise.all(temporaryDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
})

/** Boots one real, independent Web engine host on its own throwaway home; `process.env.ACRYL_HOME` is read once
 * at boot (the bulkhead selector, spec 036), so a later host's own boot does not retroactively move this one. */
async function bootSurface(homeName: string) {
  const home = await realpath(await mkdtemp(join(tmpdir(), `acryl-cross-${homeName}-`)))
  temporaryDirs.push(home)
  process.env.ACRYL_HOME = home
  const host = await createAcrylEngineHost({
    engines: [createWebEngineDefinition(new URL('../package.json', import.meta.url).href)],
    initialEngine: 'dsh',
    prepare: hostCtx => { provideCmdline(hostCtx, { args: ['--no-open', '--port', '0'], exit: () => {} }) },
  })
  const server = host.ctx.get('webServer') as { port: number }
  const origin = `http://127.0.0.1:${String(server.port)}`
  const headers = { origin, 'sec-fetch-site': 'same-origin' } as const
  return { host, origin, headers }
}

describe('T076: two independent surface processes sharing one project agree on its git state', () => {
  it('one process sees the git status and file content the other one just wrote', async () => {
    const repo = await realpath(await mkdtemp(join(tmpdir(), 'acryl-cross-repo-')))
    temporaryDirs.push(repo)
    execFileSync('git', ['init', '-q', repo])
    execFileSync('git', ['config', 'user.email', 't@t'], { cwd: repo })
    execFileSync('git', ['config', 'user.name', 't'], { cwd: repo })
    await writeFile(join(repo, 'a.txt'), 'hello\n')
    await writeFile(join(repo, 'package.json'), JSON.stringify({ name: 'x', scripts: { build: 'echo built', test: 'echo tested' } }))
    execFileSync('git', ['add', 'a.txt', 'package.json'], { cwd: repo })
    execFileSync('git', ['commit', '-q', '-m', 'first'], { cwd: repo })

    // Two real, concurrently running surfaces (T076's "Web and Desktop"), neither aware of the other, sharing
    // nothing but the one real repository directory on disk.
    const a = await bootSurface('a')
    const b = await bootSurface('b')
    try {
      // Same branch and clean status on both, before either does anything (the "open the same project" half).
      const statusA1 = await (await fetch(`${a.origin}/api/acryl-workspace/git/status?path=${encodeURIComponent(repo)}`, { headers: a.headers })).json() as { branch: string; changes: unknown[] }
      const statusB1 = await (await fetch(`${b.origin}/api/acryl-workspace/git/status?path=${encodeURIComponent(repo)}`, { headers: b.headers })).json() as { branch: string; changes: unknown[] }
      expect(statusA1).toEqual(statusB1)
      expect(statusA1.changes).toEqual([])

      // Checks (the worktree's own package scripts) agree too - the other half of T076's "Review, Checks and
      // Files" claim that is genuinely server-side data (Review's line comments are browser-local state, which
      // a server-only test cannot reach; Checks are read from the repo's own package.json, which this can).
      const checksA = await (await fetch(`${a.origin}/api/acryl-workspace/git/checks?path=${encodeURIComponent(repo)}`, { headers: a.headers })).json() as { scripts: readonly { name: string }[] }
      const checksB = await (await fetch(`${b.origin}/api/acryl-workspace/git/checks?path=${encodeURIComponent(repo)}`, { headers: b.headers })).json() as { scripts: readonly { name: string }[] }
      expect(checksA).toEqual(checksB)
      expect(checksA.scripts.map(s => s.name).sort()).toEqual(['build', 'test'])

      // An edit saved through B's own confined write route ...
      const readB = await (await fetch(`${b.origin}/api/acryl-workspace/files/read?path=${encodeURIComponent(repo)}&file=a.txt`, { headers: b.headers })).json() as { mtimeMs: number }
      const written = await fetch(`${b.origin}/api/acryl-workspace/files/write`, {
        method: 'POST',
        headers: { ...b.headers, 'content-type': 'application/json' },
        body: JSON.stringify({ path: repo, file: 'a.txt', content: 'edited from surface B\n', expectedMtimeMs: readB.mtimeMs }),
      })
      expect(written.status).toBe(200)

      // ... shows up on A: the real file content, and git status now reporting the same change.
      const readA = await (await fetch(`${a.origin}/api/acryl-workspace/files/read?path=${encodeURIComponent(repo)}&file=a.txt`, { headers: a.headers })).json() as { content: string }
      expect(readA.content).toBe('edited from surface B\n')
      const statusA2 = await (await fetch(`${a.origin}/api/acryl-workspace/git/status?path=${encodeURIComponent(repo)}`, { headers: a.headers })).json() as { changes: readonly { path: string; code: string; staged: boolean }[] }
      expect(statusA2.changes).toMatchObject([{ path: 'a.txt', code: 'M', staged: false }])
      const diffA = await (await fetch(`${a.origin}/api/acryl-workspace/git/diff?path=${encodeURIComponent(repo)}&file=a.txt`, { headers: a.headers })).json() as { text: string }
      expect(diffA.text).toContain('edited from surface B')

      // Confirmed independently through the real file on disk too, not only through either process's own routes.
      expect(await readFile(join(repo, 'a.txt'), 'utf8')).toBe('edited from surface B\n')
    } finally {
      await a.host.dispose()
      await b.host.dispose()
    }
  }, 120_000)
})

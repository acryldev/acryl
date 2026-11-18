import { realpathSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import type { VersionsLogView } from '../src/contract.ts'
import { VERSIONS_LOG_PATH, VERSIONS_RESTORE_PATH, VERSIONS_SAVE_PATH, VERSIONS_SHARE_PATH, VERSIONS_SHARE_PLAN_PATH } from '../src/contract.ts'
import { GitRunner } from '../src/git/runner.ts'
import { versionsRoutes } from '../src/route.ts'
import { Versions } from '../src/versions.ts'
import { call, post } from './call.ts'
import { commitAll, git, makeRepository, tempDirectory, writeFile, type TempDirectory } from './repo.ts'

const cleanups: Array<() => void> = []
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.()
})

function repository(): TempDirectory {
  const repo = makeRepository()
  cleanups.push(repo.cleanup)
  return repo
}

function plainDirectory(): TempDirectory {
  const dir = tempDirectory('acryl-versions-plain-')
  cleanups.push(dir.cleanup)
  return dir
}

const app = () => versionsRoutes(new Versions(new GitRunner()))
const logUrl = (path: string): string => `${VERSIONS_LOG_PATH}?path=${encodeURIComponent(path)}&limit=10`

describe('Versions routes', () => {
  it('answers the log to the app own page and refuses another page', async () => {
    const repo = repository()
    writeFile(repo.dir, 'a.txt', 'one')
    commitAll(repo.dir, 'first version')

    const res = await call(app(), logUrl(repo.dir))
    expect(res.status).toBe(200)
    const body = await res.json() as VersionsLogView
    expect(body.path).toBe(realpathSync(repo.dir))
    expect(body.branch).toBe('main')
    expect(body.upstream).toBeNull()
    expect(body.entries.map(entry => entry.subject)).toEqual(['first version'])

    const foreign = await call(app(), logUrl(repo.dir), { headers: { origin: 'http://evil.example' } })
    expect(foreign.status).toBe(403)
  })

  it('refuses a malformed body with 400 and leaves the repository alone', async () => {
    const repo = repository()
    writeFile(repo.dir, 'a.txt', 'one')
    const head = commitAll(repo.dir, 'first')

    const malformed = await call(app(), VERSIONS_SAVE_PATH, {
      method: 'POST',
      body: '{',
      headers: { 'content-type': 'application/json' },
    })
    expect(malformed.status).toBe(400)

    const wrongShape = await post(app(), VERSIONS_SAVE_PATH, { path: repo.dir, message: 42 })
    expect(wrongShape.status).toBe(400)

    const missingPath = await call(app(), VERSIONS_LOG_PATH)
    expect(missingPath.status).toBe(400)
    expect((await missingPath.json() as { error: string }).error).toBe('missing path')
    expect(git(repo.dir, ['rev-parse', 'HEAD'])).toBe(head)
    expect(git(repo.dir, ['status', '--porcelain'])).toBe('')
  })

  it('answers 404 for a directory that is not a repository', async () => {
    const plain = plainDirectory()
    const res = await call(app(), logUrl(plain.dir))
    expect(res.status).toBe(404)
    expect((await res.json() as { error: string }).error).toBe('not a git repository')
  })

  it('saves over HTTP and answers the new commit without a status field', async () => {
    const repo = repository()
    writeFile(repo.dir, 'a.txt', 'one')
    commitAll(repo.dir, 'first')
    writeFile(repo.dir, 'b.txt', 'new')

    const res = await post(app(), VERSIONS_SAVE_PATH, { path: repo.dir, message: 'saved over HTTP' })
    expect(res.status).toBe(200)
    const body = await res.json() as { entry: { subject: string }, commit: { hash: string, short: string, subject: string } }
    expect(body.entry.subject).toBe('saved over HTTP')
    expect(body.commit.subject).toBe('saved over HTTP')
    expect(body.commit.hash).toHaveLength(40)
    expect('status' in body.commit).toBe(false)
  })

  it('answers 409 when a restore is refused while the worktree is dirty', async () => {
    const repo = repository()
    writeFile(repo.dir, 'a.txt', 'one')
    const first = commitAll(repo.dir, 'first')
    writeFile(repo.dir, 'a.txt', 'two')
    commitAll(repo.dir, 'second')
    writeFile(repo.dir, 'a.txt', 'dirty')

    const res = await post(app(), VERSIONS_RESTORE_PATH, { path: repo.dir, hash: first.slice(0, 8) })
    expect(res.status).toBe(409)
    expect((await res.json() as { error: string }).error).toBe('commit or discard the uncommitted changes first')
  })

  it('refuses a share that does not carry a confirmed plan, and plans without sending', async () => {
    const repo = repository()
    writeFile(repo.dir, 'a.txt', 'one')
    commitAll(repo.dir, 'first')

    const bare = await post(app(), VERSIONS_SHARE_PATH, { path: repo.dir })
    expect(bare.status).toBe(400)
    expect((await bare.json() as { error: string }).error).toBe('a share is sent only after the person confirms its plan')
    const forged = await post(app(), VERSIONS_SHARE_PATH, { path: repo.dir, confirmed: { upstream: 'origin/main' } })
    expect(forged.status).toBe(400)

    const planned = await post(app(), VERSIONS_SHARE_PLAN_PATH, { path: repo.dir })
    expect(planned.status).toBe(409)
    expect((await planned.json() as { error: string }).error).toBe('the branch has no upstream: publish it first')
  })
})

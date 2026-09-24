import { describe, expect, it } from 'vitest'
import { createWorkspaceGitApi } from '../src/client/workspace/git-api.ts'

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const REPO = { name: 'p', root: '/p', current: '/p', worktrees: [{ path: '/p', branch: 'main', head: 'a', main: true }] }

describe('createWorkspaceGitApi.repo', () => {
  it('returns null when the directory is not a repository', async () => {
    const api = createWorkspaceGitApi(async () => json(200, { repo: null }))
    expect(await api.repo('/tmp/x')).toBeNull()
  })

  it('returns the validated repository view', async () => {
    const api = createWorkspaceGitApi(async () => json(200, { repo: REPO }))
    expect((await api.repo('/p'))?.name).toBe('p')
  })

  it('rejects a malformed body and an error status', async () => {
    await expect(createWorkspaceGitApi(async () => json(200, { nope: 1 })).repo('/p')).rejects.toThrow(/invalid response/)
    await expect(createWorkspaceGitApi(async () => json(200, { repo: { name: 1 } })).repo('/p')).rejects.toThrow(/invalid git repo/)
    await expect(createWorkspaceGitApi(async () => json(400, { error: 'bad path' })).repo('/p')).rejects.toThrow(/bad path/)
  })
})

import { existsSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { remoteAddress } from '../src/contract.ts'
import { VersionsGitError } from '../src/git/errors.ts'
import { GitRunner } from '../src/git/runner.ts'
import { Versions } from '../src/versions.ts'
import { commitAll, git, makeBareRemote, makeRepository, tempDirectory, writeFile, type TempDirectory } from './repo.ts'

const cleanups: Array<() => void> = []
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.()
})

function repository(): TempDirectory {
  const repo = makeRepository()
  cleanups.push(repo.cleanup)
  return repo
}

function bareRemote(): TempDirectory {
  const remote = makeBareRemote()
  cleanups.push(remote.cleanup)
  return remote
}

function scratch(prefix: string): TempDirectory {
  const dir = tempDirectory(prefix)
  cleanups.push(dir.cleanup)
  return dir
}

/** The failure a call threw, so a test can read both its kind and its message. */
async function failureOf(call: Promise<unknown>): Promise<VersionsGitError> {
  try {
    await call
  } catch (cause) {
    if (cause instanceof VersionsGitError) return cause
    throw cause
  }
  throw new Error('the call did not fail')
}

const versions = (): Versions => new Versions(new GitRunner())


describe('a log that fails', () => {
  it('answers only after every git call it started has finished, so nothing still runs in the folder', async () => {
    // On Windows a folder a git process still runs in cannot be removed: answering at the first failure left two running.
    let slowFinished = false
    const runner = {
      resolveDirectory: async (path: string) => path,
      run: async (args: readonly string[]) => {
        if (args[0] !== 'log') throw new VersionsGitError('not a git repository', 'not-repo')
        await new Promise(done => setTimeout(done, 50))
        slowFinished = true
        return { stdout: '', truncated: false }
      },
    } as unknown as GitRunner
    await expect(new Versions(runner).log('/plain')).rejects.toThrow('not a git repository')
    expect(slowFinished).toBe(true)
  })
})
describe('versions log', () => {
  it('lists the branch commits newest first with their full shape', async () => {
    const repo = repository()
    writeFile(repo.dir, 'a.txt', 'one')
    const first = commitAll(repo.dir, 'first version')
    writeFile(repo.dir, 'b.txt', 'two')
    const second = commitAll(repo.dir, 'second version')

    const view = await versions().log(repo.dir, 10)

    expect(view.path).toBe(realpathSync(repo.dir))
    expect(view.branch).toBe('main')
    expect(view.upstream).toBeNull()
    expect(view.ahead).toBe(0)
    expect(view.behind).toBe(0)
    expect(view.entries.map(entry => entry.subject)).toEqual(['second version', 'first version'])
    const [newest, oldest] = view.entries
    expect(newest?.hash).toBe(second)
    expect(newest?.short.length).toBeGreaterThanOrEqual(7)
    expect(second.startsWith(newest?.short ?? '')).toBe(true)
    expect(newest?.author).toBe('Test Person')
    expect(Number.isNaN(Date.parse(newest?.at ?? ''))).toBe(false)
    expect(oldest?.hash).toBe(first)
  })

  it('honours the limit and treats an unborn branch as an empty log', async () => {
    const repo = repository()
    writeFile(repo.dir, 'a.txt', 'one')
    commitAll(repo.dir, 'first')
    writeFile(repo.dir, 'b.txt', 'two')
    commitAll(repo.dir, 'second')

    expect((await versions().log(repo.dir, 1)).entries).toHaveLength(1)

    const empty = repository()
    const view = await versions().log(empty.dir)
    expect(view.entries).toEqual([])
    expect(view.branch).toBe('main')
    expect(view.upstream).toBeNull()
  })

  it('reports the upstream and its divergence once one is set', async () => {
    const repo = repository()
    writeFile(repo.dir, 'a.txt', 'one')
    commitAll(repo.dir, 'first')
    const remote = bareRemote()
    git(repo.dir, ['remote', 'add', 'origin', remote.dir])
    git(repo.dir, ['push', '-q', '-u', 'origin', 'main'])
    writeFile(repo.dir, 'a.txt', 'two')
    commitAll(repo.dir, 'second')

    const view = await versions().log(repo.dir)
    expect(view.upstream).toBe('origin/main')
    expect(view.ahead).toBe(1)
    expect(view.behind).toBe(0)
  })

  it('rejects a path that is not an absolute directory', async () => {
    expect((await failureOf(versions().log('relative/path'))).kind).toBe('invalid')
  })
})

describe('versions save', () => {
  it('commits staged and unstaged changes together and answers the new entry', async () => {
    const repo = repository()
    writeFile(repo.dir, 'a.txt', 'one')
    commitAll(repo.dir, 'initial')
    writeFile(repo.dir, 'a.txt', 'changed')
    writeFile(repo.dir, 'b.txt', 'new')

    const saved = await versions().save(repo.dir, '  save point  ')

    expect(saved.commit.subject).toBe('save point')
    expect(saved.commit.hash).toBe(git(repo.dir, ['rev-parse', 'HEAD']))
    expect(saved.entry.hash).toBe(saved.commit.hash)
    expect(saved.entry.short).toBe(saved.commit.short)
    expect(saved.entry.subject).toBe('save point')
    expect(git(repo.dir, ['log', '-1', '--format=%s'])).toBe('save point')
    expect(git(repo.dir, ['status', '--porcelain'])).toBe('')
    expect(git(repo.dir, ['ls-files', 'b.txt'])).toBe('b.txt')
    expect(git(repo.dir, ['show', 'HEAD:a.txt'])).toBe('changed')
  })

  it('refuses an empty or oversized message and an empty stage with reasons to act on', async () => {
    const repo = repository()
    writeFile(repo.dir, 'a.txt', 'one')
    commitAll(repo.dir, 'initial')

    const empty = await failureOf(versions().save(repo.dir, '   '))
    expect(empty.kind).toBe('invalid')
    expect(empty.message).toBe('write a commit message (up to 5000 characters)')

    const oversized = await failureOf(versions().save(repo.dir, 'x'.repeat(5001)))
    expect(oversized.kind).toBe('invalid')

    const nothing = await failureOf(versions().save(repo.dir, 'nothing changed'))
    expect(nothing.kind).toBe('conflict')
    expect(nothing.message).toBe('nothing to commit')
    expect(git(repo.dir, ['log', '--format=%s'])).toBe('initial')
  })

})

describe('versions restore', () => {
  it('brings a version tree back as a new commit without rewriting history', async () => {
    const repo = repository()
    writeFile(repo.dir, 'a.txt', 'one')
    const first = commitAll(repo.dir, 'first')
    writeFile(repo.dir, 'a.txt', 'two')
    const second = commitAll(repo.dir, 'second')
    const countBefore = Number(git(repo.dir, ['rev-list', '--count', 'HEAD']))

    const restored = await versions().restore(repo.dir, first.slice(0, 8))

    expect(restored.restored).toBe(git(repo.dir, ['rev-parse', '--short', first]))
    expect(restored.commit.subject).toBe(`Restore ${restored.restored}`)
    expect(restored.commit.hash).not.toBe(first)
    expect(restored.commit.hash).toBe(git(repo.dir, ['rev-parse', 'HEAD']))
    expect(git(repo.dir, ['show', 'HEAD:a.txt'])).toBe('one')
    expect(git(repo.dir, ['rev-parse', second])).toBe(second)
    expect(Number(git(repo.dir, ['rev-list', '--count', 'HEAD']))).toBe(countBefore + 1)
    expect(git(repo.dir, ['status', '--porcelain'])).toBe('')
  })

  it('removes a file added after the version, and names the commit as asked', async () => {
    const repo = repository()
    writeFile(repo.dir, 'a.txt', 'one')
    const first = commitAll(repo.dir, 'first')
    writeFile(repo.dir, 'b.txt', 'added later')
    commitAll(repo.dir, 'second')

    const restored = await versions().restore(repo.dir, first, 'Back to v1 · first')

    expect(restored.commit.subject).toBe('Back to v1 · first')
    expect(existsSync(join(repo.dir, 'b.txt'))).toBe(false)
    expect(git(repo.dir, ['status', '--porcelain'])).toBe('')
    await expect(versions().restore(repo.dir, first, '  ')).rejects.toThrow(/commit message/)
  })

  it('refuses while the worktree has uncommitted changes and changes nothing', async () => {
    const repo = repository()
    writeFile(repo.dir, 'a.txt', 'one')
    const first = commitAll(repo.dir, 'first')
    writeFile(repo.dir, 'a.txt', 'two')
    commitAll(repo.dir, 'second')
    writeFile(repo.dir, 'a.txt', 'dirty')
    const headBefore = git(repo.dir, ['rev-parse', 'HEAD'])

    const failure = await failureOf(versions().restore(repo.dir, first.slice(0, 8)))

    expect(failure.kind).toBe('conflict')
    expect(failure.message).toBe('commit or discard the uncommitted changes first')
    expect(git(repo.dir, ['rev-parse', 'HEAD'])).toBe(headBefore)
    expect(git(repo.dir, ['show', 'HEAD:a.txt'])).toBe('two')
  })

  it('refuses a malformed or unknown version id', async () => {
    const repo = repository()
    writeFile(repo.dir, 'a.txt', 'one')
    commitAll(repo.dir, 'first')

    const malformed = await failureOf(versions().restore(repo.dir, 'not-a-hash'))
    expect(malformed.kind).toBe('invalid')
    expect(malformed.message).toContain('7 to 40 hexadecimal')

    const unknown = await failureOf(versions().restore(repo.dir, 'deadbee'))
    expect(unknown.kind).toBe('invalid')
    expect(unknown.message).toContain('no version matches')
  })

  it('refuses to restore the tree the worktree already has', async () => {
    const repo = repository()
    writeFile(repo.dir, 'a.txt', 'one')
    const first = commitAll(repo.dir, 'first')

    const failure = await failureOf(versions().restore(repo.dir, first))
    expect(failure.kind).toBe('conflict')
    expect(failure.message).toBe('the working tree already matches this version')
  })
})

describe('versions share', () => {
  it('refuses a branch without an upstream', async () => {
    const repo = repository()
    writeFile(repo.dir, 'a.txt', 'one')
    commitAll(repo.dir, 'first')

    const failure = await failureOf(versions().planShare(repo.dir))
    expect(failure.kind).toBe('conflict')
    expect(failure.message).toBe('the branch has no upstream: publish it first')
  })

  it('pushes the branch to its upstream', async () => {
    const repo = repository()
    writeFile(repo.dir, 'a.txt', 'one')
    commitAll(repo.dir, 'first')
    const remote = bareRemote()
    git(repo.dir, ['remote', 'add', 'origin', remote.dir])
    git(repo.dir, ['push', '-q', '-u', 'origin', 'main'])
    writeFile(repo.dir, 'a.txt', 'two')
    const head = commitAll(repo.dir, 'second')

    const plan = await versions().planShare(repo.dir)
    // Planning sends nothing.
    expect(git(remote.dir, ['rev-parse', 'main'])).not.toBe(head)
    expect(plan).toEqual({ upstream: 'origin/main', address: remote.dir, ahead: 1, head })

    const shared = await versions().share(repo.dir, plan)

    expect(shared).toEqual({ pushed: true, upstream: 'origin/main' })
    expect(git(remote.dir, ['rev-parse', 'main'])).toBe(head)
  })

  it('sends nothing when a version was made after the person confirmed', async () => {
    const repo = repository()
    writeFile(repo.dir, 'a.txt', 'one')
    const first = commitAll(repo.dir, 'first')
    const remote = bareRemote()
    git(repo.dir, ['remote', 'add', 'origin', remote.dir])
    git(repo.dir, ['push', '-q', '-u', 'origin', 'main'])
    writeFile(repo.dir, 'a.txt', 'two')
    commitAll(repo.dir, 'second')
    const plan = await versions().planShare(repo.dir)
    writeFile(repo.dir, 'a.txt', 'three')
    commitAll(repo.dir, 'third')

    const failure = await failureOf(versions().share(repo.dir, plan))
    expect(failure.kind).toBe('conflict')
    expect(failure.message).toBe('the push changed since you confirmed it; nothing was sent. Look at it again.')
    expect(git(remote.dir, ['rev-parse', 'main'])).toBe(first)
  })

  it('answers a refused push with a conflict that keeps git reason', async () => {
    const repo = repository()
    writeFile(repo.dir, 'a.txt', 'one')
    commitAll(repo.dir, 'first')
    const remote = bareRemote()
    git(repo.dir, ['remote', 'add', 'origin', remote.dir])
    git(repo.dir, ['push', '-q', '-u', 'origin', 'main'])

    const other = scratch('acryl-versions-other-')
    git(other.dir, ['clone', '-q', remote.dir, '.'])
    git(other.dir, ['config', 'user.name', 'Other Person'])
    git(other.dir, ['config', 'user.email', 'other@example.com'])
    writeFile(other.dir, 'a.txt', 'theirs')
    commitAll(other.dir, 'theirs')
    git(other.dir, ['push', '-q', 'origin', 'HEAD:main'])

    writeFile(repo.dir, 'a.txt', 'ours')
    commitAll(repo.dir, 'ours')

    const failure = await failureOf(versions().planShare(repo.dir).then(plan => versions().share(repo.dir, plan)))
    expect(failure.kind).toBe('conflict')
    expect(failure.message).toContain('git could not push the branch')
  })
})

describe('a remote as the person sees it', () => {
  it('drops any credential and keeps the host and path', () => {
    expect(remoteAddress('https://ana:ghp_secret@github.com/ana/notes.git')).toBe('github.com/ana/notes')
    expect(remoteAddress('git@github.com:ana/notes.git')).toBe('github.com/ana/notes')
    expect(remoteAddress('ssh://git@example.com/ana/notes')).toBe('example.com/ana/notes')
    expect(remoteAddress('/srv/remotes/notes.git')).toBe('/srv/remotes/notes')
    expect(remoteAddress('file:///srv/remotes/notes.git')).toBe('/srv/remotes/notes')
    // A Windows path keeps its drive: C: is not a URL scheme.
    expect(remoteAddress('C:\\Users\\ana\\remotes\\notes.git')).toBe('C:\\Users\\ana\\remotes\\notes')
    expect(remoteAddress('D:/remotes/notes')).toBe('D:/remotes/notes')
    expect(remoteAddress('\\\\server\\share\\notes.git')).toBe('\\\\server\\share\\notes')
    expect(remoteAddress('file:///C:/remotes/notes.git')).toBe('C:/remotes/notes')
  })
})

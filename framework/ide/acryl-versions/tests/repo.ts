/** Real git repositories in temp directories, for the Versions suites. */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export interface TempDirectory {
  readonly dir: string
  cleanup(): void
}

/** A fresh temp directory the caller removes with `cleanup()`. */
export function tempDirectory(prefix: string): TempDirectory {
  // The versions routes resolve a directory to its real path; on Windows that is the long user name and the real
  // case, while the non-native realpath keeps the 8.3 short name mkdtemp returned. The native call settles on the
  // same spelling the route answers with, so every assertion compares like with like.
  const dir = realpathSync.native(mkdtempSync(join(tmpdir(), prefix)))
  return { dir, cleanup: () => { rmSync(dir, { recursive: true, force: true }) } }
}

/** Run git in `dir`; throws on a non-zero exit, which in a test is always a broken fixture. */
export function git(dir: string, args: readonly string[]): string {
  return execFileSync('git', args, {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' },
  }).trim()
}

/** A repository on `main` with a local identity, so commits work without the machine's config. */
export function makeRepository(prefix = 'acryl-versions-repo-'): TempDirectory {
  const repo = tempDirectory(prefix)
  git(repo.dir, ['init', '-q', '-b', 'main'])
  git(repo.dir, ['config', 'user.name', 'Test Person'])
  git(repo.dir, ['config', 'user.email', 'test@example.com'])
  return repo
}

/** A bare repository that plays the remote in share tests. */
export function makeBareRemote(prefix = 'acryl-versions-remote-'): TempDirectory {
  const remote = tempDirectory(prefix)
  git(remote.dir, ['init', '--bare', '-q'])
  // The remote's HEAD names the branch a clone checks out; without this it is the machine's init.defaultBranch
  // (master on a CI runner, main here), and a clone then commits to a branch the share test pushes as main.
  git(remote.dir, ['symbolic-ref', 'HEAD', 'refs/heads/main'])
  return remote
}

export function writeFile(dir: string, name: string, content: string): void {
  writeFileSync(join(dir, name), content)
}

/** Stage everything and commit it; answers the full commit id. */
export function commitAll(dir: string, message: string): string {
  git(dir, ['add', '-A'])
  git(dir, ['commit', '-q', '-m', message])
  return git(dir, ['rev-parse', 'HEAD'])
}

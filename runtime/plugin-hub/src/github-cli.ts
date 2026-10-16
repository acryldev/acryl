// The share ports over the user's own `gh` and `git` (spec 044 guards: credentials stay with the user's tools; nothing waits on a prompt).
// In the shipped app these come from the user's machine: a missing tool or a missing login is reported with what to do, never worked around.
import { spawnSync } from 'node:child_process'
import type { PublishGitPort, RepositoryHostPort, Visibility } from './share.js'

export class ToolError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ToolError'
  }
}

const HINT: Record<string, string> = {
  gh: 'install GitHub CLI (https://cli.github.com) and sign in with: gh auth login',
  git: 'install git (https://git-scm.com)',
}

function run(command: string, args: readonly string[], cwd?: string): { readonly status: number; readonly stdout: string; readonly stderr: string } {
  const result = spawnSync(command, [...args], { cwd, encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GH_PROMPT_DISABLED: '1' }, maxBuffer: 64 * 1024 * 1024 })
  if (result.error !== undefined) throw new ToolError(`${command} is not available here: ${HINT[command] ?? result.error.message}`)
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

function must(command: string, args: readonly string[], cwd?: string): string {
  const result = run(command, args, cwd)
  if (result.status !== 0) {
    const last = result.stderr.trim().split('\n').at(-1) ?? `exit ${String(result.status)}`
    throw new ToolError(`${command} ${args.slice(0, 2).join(' ')} failed: ${last}${/auth|login|credential/iu.test(result.stderr) ? ` (${HINT[command] ?? ''})` : ''}`)
  }
  return result.stdout
}

export function githubCli(): RepositoryHostPort {
  return {
    login: () => must('gh', ['api', 'user', '--jq', '.login']).trim(),
    repository(owner, repo) {
      const result = run('gh', ['repo', 'view', `${owner}/${repo}`, '--json', 'visibility,url'])
      if (result.status !== 0) {
        if (/could not resolve to a repository|not found/iu.test(result.stderr)) return undefined
        throw new ToolError(`gh repo view ${owner}/${repo} failed: ${result.stderr.trim().split('\n').at(-1) ?? ''}`)
      }
      const body = JSON.parse(result.stdout) as { visibility?: string; url?: string }
      return { visibility: body.visibility?.toLowerCase() === 'public' ? 'public' : 'private', url: body.url ?? `https://github.com/${owner}/${repo}` }
    },
    createRepository(owner, repo, visibility, description) {
      must('gh', ['repo', 'create', `${owner}/${repo}`, `--${visibility}`, '--description', description])
    },
    setVisibility(owner, repo, visibility: Visibility) {
      must('gh', ['repo', 'edit', `${owner}/${repo}`, '--visibility', visibility, '--accept-visibility-change-consequences'])
    },
    addTopics(owner, repo, topics) {
      must('gh', ['repo', 'edit', `${owner}/${repo}`, ...topics.flatMap(topic => ['--add-topic', topic])])
    },
    releaseExists: (owner, repo, tag) => run('gh', ['release', 'view', tag, '-R', `${owner}/${repo}`, '--json', 'tagName']).status === 0,
    createRelease(owner, repo, tag, title, notes, assetPath) {
      return must('gh', ['release', 'create', tag, assetPath, '-R', `${owner}/${repo}`, '--title', title, '--notes', notes, '--verify-tag']).trim()
    },
    cloneUrl: (owner, repo) => `https://github.com/${owner}/${repo}.git`,
  }
}

export function gitCli(): PublishGitPort {
  return {
    clone(url, dir) { must('git', ['clone', '--quiet', url, dir]) },
    commitAll(dir, message) {
      must('git', ['add', '--all', '.'], dir)
      if (run('git', ['diff', '--cached', '--quiet'], dir).status === 0) return false
      must('git', ['commit', '--quiet', '-m', message], dir)
      return true
    },
    tag(dir, tag, message) { must('git', ['tag', '-a', tag, '-m', message], dir) },
    push(dir, tag, fallbackBranch) {
      const branch = run('git', ['symbolic-ref', '--short', 'HEAD'], dir).stdout.trim() || fallbackBranch
      must('git', ['push', '--quiet', 'origin', `HEAD:refs/heads/${branch}`], dir)
      must('git', ['push', '--quiet', 'origin', `refs/tags/${tag}`], dir)
    },
  }
}

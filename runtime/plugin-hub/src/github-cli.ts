// The share ports over the user's own `gh` and `git` (spec 044 guards: credentials stay with the user's tools; nothing waits on a prompt).
// In the shipped app these come from the user's machine: a missing tool or a missing login is reported with what to do, never worked around.
import { spawnSync } from 'node:child_process'
import type { ReleasePort } from './pull.js'
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

/**
 * GitHub releases through the user's own `gh` login: what a pull of a private repository needs (an anonymous request cannot see it). Assets
 * are fetched by their API address with `Accept: application/octet-stream`, which works for private and public repositories alike.
 */
export function githubReleasesViaGh(): ReleasePort {
  return {
    async release(owner, repo, tag) {
      const path = tag === undefined ? 'releases/latest' : `releases/tags/${encodeURIComponent(tag)}`
      const result = run('gh', ['api', `repos/${owner}/${repo}/${path}`])
      if (result.status !== 0) {
        if (/HTTP 404|Not Found/iu.test(result.stderr)) return undefined
        throw new ToolError(`gh api repos/${owner}/${repo}/${path} failed: ${result.stderr.trim().split('\n').at(-1) ?? ''}`)
      }
      const body = JSON.parse(result.stdout) as { tag_name?: unknown; assets?: { name?: unknown; url?: unknown }[] }
      if (typeof body.tag_name !== 'string' || !Array.isArray(body.assets)) throw new ToolError(`gh returned an unexpected release for ${owner}/${repo}`)
      return { tag: body.tag_name, assets: body.assets.flatMap(asset => (typeof asset.name === 'string' && typeof asset.url === 'string' ? [{ name: asset.name, url: asset.url }] : [])) }
    },
    async download(url) {
      const result = spawnSync('gh', ['api', '-H', 'Accept: application/octet-stream', url], { env: { ...process.env, GH_PROMPT_DISABLED: '1' }, maxBuffer: 64 * 1024 * 1024 })
      if (result.error !== undefined) throw new ToolError(`gh is not available here: ${HINT['gh'] ?? ''}`)
      if (result.status !== 0) throw new ToolError(`gh could not download ${url}: ${String(result.stderr).trim().split('\n').at(-1) ?? ''}`)
      return new Uint8Array(result.stdout)
    },
  }
}

/**
 * Releases from the first port that sees the repository: anonymous HTTPS for a public one, then the user's `gh` for a private one. Downloads
 * go to the port that answered for the release, since only it can fetch its asset addresses.
 */
export function firstReleasePort(...ports: readonly ReleasePort[]): ReleasePort {
  const answered = new Map<string, ReleasePort>()
  return {
    async release(owner, repo, tag) {
      let lastError: unknown
      for (const port of ports) {
        try {
          const found = await port.release(owner, repo, tag)
          if (found !== undefined) {
            for (const asset of found.assets) answered.set(asset.url, port)
            return found
          }
        } catch (cause) { lastError = cause }
      }
      if (lastError !== undefined) throw lastError
      return undefined
    },
    async download(url) {
      return (answered.get(url) ?? ports[0]!).download(url)
    },
  }
}

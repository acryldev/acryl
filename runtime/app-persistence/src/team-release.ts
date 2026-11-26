// Share with team (ACRYL spec 052 T061): the app's installers for every computer, built by GitHub, and one link to send. In the app's folder: the release
// workflow is added when missing (`acrylblends release-workflow`), unsaved changes are saved, the version is tagged (the next patch when that version
// was released already), the app and the tag are pushed, and GitHub's Release run is followed until its release page is there. Git pushes through gh's
// credential helper, which reads GH_TOKEN from the environment, so the token is never on a command line. Every outside effect is a port, so the rules
// here run in a test without git, npm or the network. One home for Control Center (through @acryldev/launcher) and an app's own Settings > Share.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { GITHUB_VIA_GH } from './adapters.js'

/** The command form, for a caller that runs commands: `node <TEAM_RELEASE_CLI>` in the app's folder, GH_TOKEN set. */
export const TEAM_RELEASE_CLI = fileURLToPath(new URL('./bin/team-release.js', import.meta.url))
export const RELEASE_WORKFLOW_FILE = join('.github', 'workflows', 'release.yml')
/** What runs `acrylblends release-workflow` (the published CLI: an app made on an older one does not carry the command). */
export const RELEASE_WORKFLOW_SPEC = '@acryldev/blends@latest'
/** Every line the command says to its caller starts with this; `release:` carries the link, `failed:` the reason. */
export const TEAM_RELEASE_SAY = 'acryl-team:'
const POLL_MS = 15_000
const START_MS = 3 * 60_000
const LIMIT_MS = 100 * 60_000

export interface Ran {
  readonly status: number
  readonly stdout: string
  readonly stderr: string
}
/** The fields of GitHub's answers this file reads: a list of runs, a run's jobs, or a release. */
export interface GithubAnswer {
  readonly workflow_runs?: readonly { readonly id: number; readonly name?: string; readonly status?: string; readonly conclusion?: string; readonly html_url?: string }[]
  readonly jobs?: readonly { readonly status?: string }[]
  readonly html_url?: string
}
/** GitHub's JSON for a path under the repository, or undefined on an error answer. */
export type RepositoryApi = (path: string) => Promise<GithubAnswer | undefined>
export type TeamReleaseResult = { readonly ok: true; readonly url: string } | { readonly ok: false; readonly reason: string; readonly url?: string }

interface Clock {
  readonly wait: (ms: number) => Promise<void>
  readonly now?: () => number
}

/** `owner/repo` of a GitHub remote (https or ssh), or undefined. */
export function repositoryOf(remote: string): string | undefined {
  return /github\.com[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/u.exec(String(remote).trim())?.[1]
}

/** The version to release: the package's, or the next free patch when `v<version>` is taken already. */
export function nextReleaseVersion(version: unknown, tags: ReadonlySet<string>): string {
  const match = /^(\d+)\.(\d+)\.(\d+)$/u.exec(String(version))
  if (match === null) return '0.1.0'
  const [major, minor] = [Number(match[1]), Number(match[2])]
  let patch = Number(match[3])
  while (tags.has(`v${major}.${minor}.${patch}`)) patch += 1
  return `${major}.${minor}.${patch}`
}

/** The tags `git ls-remote --tags` and `git tag` print, as a set of names (`v1.2.0`). */
export function tagNames(text: string): Set<string> {
  return new Set(
    String(text)
      .split('\n')
      .map(line => line.trim().split(/\s+/u).pop() ?? '')
      .map(ref => ref.replace(/^refs\/tags\//u, '').replace(/\^\{\}$/u, ''))
      .filter(Boolean),
  )
}

/** Follow the Release run GitHub started for `sha` until its release page is there, or say why not. */
export async function followRelease({ api, tag, sha, say, wait, now = Date.now }: { api: RepositoryApi; tag: string; sha: string; say: (line: string) => void } & Clock): Promise<TeamReleaseResult> {
  const started = now()
  let last = ''
  for (;;) {
    const runs = await api(`/actions/runs?event=push&head_sha=${sha}&per_page=20`)
    const run = runs?.workflow_runs?.find(candidate => candidate.name === 'Release')
    if (run === undefined) {
      if (now() - started > START_MS) return { ok: false, reason: 'GitHub started no Release run for this tag: Actions may be off for this repository (Settings, Actions)' }
    } else if (run.status === 'completed') {
      if (run.conclusion !== 'success') return { ok: false, reason: `the Release run ended ${run.conclusion}: its log says why`, url: run.html_url }
      const release = await api(`/releases/tags/${tag}`)
      return release?.html_url === undefined ? { ok: false, reason: 'the Release run ended but no release page is there', url: run.html_url } : { ok: true, url: release.html_url }
    } else {
      const jobs = await api(`/actions/runs/${run.id}/jobs?per_page=50`)
      const list = jobs?.jobs ?? []
      const line = `GitHub is building the installers: ${list.filter(job => job.status === 'completed').length} of ${Math.max(list.length, 5)} steps done`
      if (line !== last) {
        say(`step: ${line}`)
        last = line
      }
    }
    if (now() - started > LIMIT_MS) return { ok: false, reason: 'the Release run took longer than 100 minutes', ...(run?.html_url === undefined ? {} : { url: run.html_url }) }
    await wait(POLL_MS)
  }
}

/**
 * The whole Share with team in `folder`. `git(args)` and `npmExec(args)` run in the folder; `api` and the clock as for followRelease. A refusal
 * before anything is pushed is `{ ok: false, reason }` and pushes nothing.
 */
export async function teamRelease({ folder, git, npmExec, api, say, wait, now = Date.now }: {
  folder: string
  git: (args: readonly string[]) => Ran
  npmExec: (args: readonly string[]) => Ran
  api: RepositoryApi
  say: (line: string) => void
} & Clock): Promise<TeamReleaseResult> {
  const repository = repositoryOf(git(['remote', 'get-url', 'origin']).stdout ?? '')
  if (repository === undefined) return { ok: false, reason: 'the app is not on GitHub yet: Share to GitHub first' }
  const must = (args: readonly string[], what: string): Ran => {
    const done = git(args)
    if (done.status !== 0) throw new Error(`${what}: ${String(done.stderr || done.stdout).trim()}`)
    return done
  }
  const identity = git(['config', 'user.email']).status === 0 ? [] : ['-c', 'user.name=ACRYL', '-c', 'user.email=share@acryldev.invalid']
  if (!existsSync(join(folder, RELEASE_WORKFLOW_FILE))) {
    say('step: adding the release workflow (it builds the installers on GitHub)')
    const made = npmExec(['exec', '--yes', RELEASE_WORKFLOW_SPEC, '--', 'release-workflow'])
    if (made.status !== 0 || !existsSync(join(folder, RELEASE_WORKFLOW_FILE))) throw new Error(`the release workflow could not be written: ${String(made.stderr || made.stdout).trim()}`)
  }
  if (must(['status', '--porcelain'], 'git status').stdout.trim() !== '') {
    say('step: saving the changes first')
    must(['add', '-A'], 'git add')
    must([...identity, 'commit', '-q', '-m', 'Changes before sharing with team'], 'git commit')
  }
  const packageFile = join(folder, 'package.json')
  const manifest = JSON.parse(readFileSync(packageFile, 'utf8')) as { version?: unknown }
  const tags = new Set([...tagNames(must([...GITHUB_VIA_GH, 'ls-remote', '--tags', 'origin'], 'could not read the repository\'s tags').stdout), ...tagNames(git(['tag']).stdout ?? '')])
  const version = nextReleaseVersion(manifest.version, tags)
  if (version !== manifest.version) {
    writeFileSync(packageFile, `${JSON.stringify({ ...manifest, version }, null, 2)}\n`)
    must(['add', 'package.json'], 'git add')
    must([...identity, 'commit', '-q', '-m', `Version ${version}`], 'git commit')
  }
  const tag = `v${version}`
  say(`step: pushing ${repository} and its tag ${tag}`)
  must([...identity, 'tag', tag], `could not tag ${tag}`)
  must([...GITHUB_VIA_GH, 'push', '--quiet', 'origin', 'HEAD'], 'could not push the app')
  must([...GITHUB_VIA_GH, 'push', '--quiet', 'origin', `refs/tags/${tag}`], `could not push ${tag}`)
  const sha = must(['rev-parse', 'HEAD'], 'git rev-parse').stdout.trim()
  say(`step: GitHub is starting the build of ${tag} (macOS, Windows, Linux: about 20 minutes)`)
  return followRelease({ api, tag, sha, say, wait, now })
}

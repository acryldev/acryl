// Share with team (spec 052 T061): the app's installers for every computer, built by GitHub, and one link to send. In the app's folder: the release
// workflow is added when missing (`acrylblends release-workflow`), unsaved changes are saved, the version is tagged (the next patch when that version
// was released already), the app and the tag are pushed, and GitHub's Release run is followed until its release page is there. Git pushes through gh's
// credential helper, which reads GH_TOKEN from the environment, so the token is never on a command line. Every outside effect is a port, so the rules
// here run in a test without git, npm or the network.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The command form, for a caller that runs commands (Control Center's runner): `node team-release-cli.mjs` in the app's folder, GH_TOKEN set. */
export const TEAM_RELEASE_CLI = fileURLToPath(new URL('./team-release-cli.mjs', import.meta.url))
export const RELEASE_WORKFLOW_FILE = join('.github', 'workflows', 'release.yml')
/** What runs `acrylblends release-workflow` (the published CLI: an app made on an older one does not carry the command). */
export const RELEASE_WORKFLOW_SPEC = 'acrylblends@latest'
/** Every line the script says to its caller starts with this; `release:` carries the link. */
export const SAY = 'acryl-team:'
/** git through gh's credential helper for github.com only (@acryldev/app-persistence GITHUB_VIA_GH). */
const VIA_GH = ['-c', 'credential.https://github.com.helper=', '-c', 'credential.https://github.com.helper=!gh auth git-credential']
const POLL_MS = 15_000
const START_MS = 3 * 60_000
const LIMIT_MS = 100 * 60_000

/** `owner/repo` of a GitHub remote (https or ssh), or undefined. */
export function repositoryOf(remote) {
  return /github\.com[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/u.exec(String(remote).trim())?.[1]
}

/** The version to release: the package's, or the next free patch when `v<version>` is taken already. */
export function nextReleaseVersion(version, tags) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/u.exec(String(version))
  if (match === null) return '0.1.0'
  let [major, minor, patch] = match.slice(1).map(Number)
  while (tags.has(`v${major}.${minor}.${patch}`)) patch += 1
  return `${major}.${minor}.${patch}`
}

/** The tags `git ls-remote --tags` and `git tag` print, as a set of names (`v1.2.0`). */
export function tagNames(text) {
  return new Set(String(text).split('\n').map(line => line.trim().split(/\s+/u).pop() ?? '').map(ref => ref.replace(/^refs\/tags\//u, '').replace(/\^\{\}$/u, '')).filter(Boolean))
}

/**
 * Follow the Release run GitHub started for `sha` and resolve to `{ ok: true, url }` (the release page) or `{ ok: false, reason, url? }`.
 * `api(path)` answers GitHub's JSON for a path under the repository (undefined on an error answer); `wait(ms)` and `now()` are the clock.
 */
export async function followRelease({ api, tag, sha, say, wait, now = Date.now }) {
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
      if (line !== last) { say(`step: ${line}`); last = line }
    }
    if (now() - started > LIMIT_MS) return { ok: false, reason: 'the Release run took longer than 100 minutes', url: run?.html_url }
    await wait(POLL_MS)
  }
}

/**
 * The whole Share with team in `folder`. `git(args)` and `npmExec(args)` run in the folder and answer `{ status, stdout, stderr }`; `api` and the clock
 * as for followRelease. Resolves to followRelease's answer; a refusal before anything is pushed is `{ ok: false, reason }` and changes nothing pushed.
 */
export async function teamRelease({ folder, git, npmExec, api, say, wait, now = Date.now }) {
  const repository = repositoryOf(git(['remote', 'get-url', 'origin']).stdout ?? '')
  if (repository === undefined) return { ok: false, reason: 'the app is not on GitHub yet: Save to GitHub first (Share, step 1)' }
  const must = (args, what) => {
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
  const manifest = JSON.parse(readFileSync(packageFile, 'utf8'))
  const tags = new Set([...tagNames(must([...VIA_GH, 'ls-remote', '--tags', 'origin'], 'could not read the repository\'s tags').stdout), ...tagNames(git(['tag']).stdout ?? '')])
  const version = nextReleaseVersion(manifest.version, tags)
  if (version !== manifest.version) {
    writeFileSync(packageFile, `${JSON.stringify({ ...manifest, version }, null, 2)}\n`)
    must(['add', 'package.json'], 'git add')
    must([...identity, 'commit', '-q', '-m', `Version ${version}`], 'git commit')
  }
  const tag = `v${version}`
  say(`step: pushing ${repository} and its tag ${tag}`)
  must([...identity, 'tag', tag], `could not tag ${tag}`)
  must([...VIA_GH, 'push', '--quiet', 'origin', 'HEAD'], 'could not push the app')
  must([...VIA_GH, 'push', '--quiet', 'origin', `refs/tags/${tag}`], `could not push ${tag}`)
  const sha = must(['rev-parse', 'HEAD'], 'git rev-parse').stdout.trim()
  say(`step: GitHub is starting the build of ${tag} (macOS, Windows, Linux: about 20 minutes)`)
  return followRelease({ api, tag, sha, say, wait, now })
}

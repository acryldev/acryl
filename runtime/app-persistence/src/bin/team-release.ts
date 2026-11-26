#!/usr/bin/env node
// `node team-release.js` in the app's folder, GH_TOKEN set: Share with team (../team-release.ts) as one command, so Control Center's runner and an app's own
// Settings > Share run it the same way. It says `acryl-team: step: ...` as it goes and ends with `acryl-team: release: <url>`, or `acryl-team: failed: <reason>`
// and exit code 1.
import { spawnSync } from 'node:child_process'
import { type GithubAnswer, repositoryOf, type Ran, TEAM_RELEASE_SAY, teamRelease } from '../team-release.js'

const folder = process.cwd()
const token = process.env['GH_TOKEN'] ?? ''
const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', GH_PROMPT_DISABLED: '1' }
const run = (program: string, args: readonly string[]): Ran => {
  const done = spawnSync(program, [...args], { cwd: folder, encoding: 'utf8', env, windowsHide: true, shell: process.platform === 'win32' && program === 'npm' })
  return { status: done.status ?? 1, stdout: done.stdout ?? '', stderr: done.stderr ?? (done.error?.message ?? '') }
}
const say = (line: string): void => { console.log(`${TEAM_RELEASE_SAY} ${line}`) }
let repository: string | undefined
const git = (args: readonly string[]): Ran => {
  const done = run('git', args)
  if (args[0] === 'remote' && done.status === 0) repository = repositoryOf(done.stdout)
  return done
}
const api = async (path: string): Promise<GithubAnswer | undefined> => {
  try {
    const answer = await fetch(`https://api.github.com/repos/${repository}${path}`, {
      headers: { Accept: 'application/vnd.github+json', ...(token === '' ? {} : { Authorization: `Bearer ${token}` }) },
      signal: AbortSignal.timeout(20_000),
    })
    return answer.ok ? ((await answer.json()) as GithubAnswer) : undefined
  } catch {
    return undefined
  }
}

try {
  const result = await teamRelease({ folder, git, npmExec: args => run('npm', args), api, say, wait: ms => new Promise(done => { setTimeout(done, ms) }) })
  if (result.ok) say(`release: ${result.url}`)
  else {
    say(`failed: ${result.reason}${result.url === undefined ? '' : ` (${result.url})`}`)
    process.exitCode = 1
  }
} catch (cause) {
  say(`failed: ${cause instanceof Error ? cause.message : String(cause)}`)
  process.exitCode = 1
}

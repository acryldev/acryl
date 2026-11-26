/**
 * Share with team from the app's own Settings > Share (ACRYL spec 052 T061; WebBoxes.ai, owner 2026-11-26): GitHub builds the app's desktop installers
 * for every computer and one link is there to send. The same command Control Center runs (`TEAM_RELEASE_CLI` of @acryldev/app-persistence), in the app's
 * folder, on the GitHub connection this host already holds (its GH_TOKEN). One run at a time; the page asks where it is.
 */
import { type ChildProcess, spawn } from 'node:child_process'
import { canPushWorkflows, readGithub, TEAM_RELEASE_CLI, TEAM_RELEASE_SAY } from '@acryldev/app-persistence'
import type { AppTeamReleaseView } from './contract.ts'

/** A start refused before anything ran, in the person's words. */
export class AppTeamReleaseRefused extends Error {}

export interface AppTeamReleasePort {
  start(): AppTeamReleaseView
  view(): AppTeamReleaseView
}

/** Starts the command in `root`; its lines arrive through `onLine`, its end through `onEnd`. */
export type Launch = (root: string, onLine: (line: string) => void, onEnd: (code: number | null) => void) => void

const launchNode: Launch = (root, onLine, onEnd) => {
  const child: ChildProcess = spawn(process.execPath, [TEAM_RELEASE_CLI], { cwd: root, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true })
  let rest = ''
  child.stdout?.on('data', (chunk: Buffer) => {
    const lines = (rest + chunk.toString('utf8')).split(/\r?\n/u)
    rest = lines.pop() ?? ''
    for (const line of lines) onLine(line)
  })
  child.on('error', () => { onEnd(1) })
  child.on('close', (code) => {
    if (rest !== '') onLine(rest)
    onEnd(code)
  })
}

/**
 * `githubHome` is where the GitHub connection is kept (the one Settings > Share connects). shortcut: the run's progress lives in this host's memory, so a
 * host restart mid-run loses the view (the run on GitHub goes on and its release still appears); keep it in a file if boxes restart during builds.
 */
export function appTeamRelease(root: string, githubHome: string, launch: Launch = launchNode): AppTeamReleasePort {
  let view: AppTeamReleaseView = { status: 'idle' }
  return {
    view: () => view,
    start() {
      if (view.status === 'running') throw new AppTeamReleaseRefused('Share with team is already running for this app.')
      const connection = readGithub(githubHome)
      if (connection === undefined) throw new AppTeamReleaseRefused('Connect GitHub first (above).')
      if (!canPushWorkflows(connection)) {
        throw new AppTeamReleaseRefused('Share with team needs GitHub\'s workflow permission, which this connection was not given: Disconnect, then Connect GitHub again.')
      }
      view = { status: 'running', step: 'Starting' }
      launch(root, (line) => {
        if (!line.startsWith(`${TEAM_RELEASE_SAY} `)) return
        const said = line.slice(TEAM_RELEASE_SAY.length + 1)
        if (said.startsWith('step: ')) view = { status: 'running', step: said.slice(6) }
        else if (said.startsWith('release: ')) view = { status: 'done', link: said.slice(9).trim() }
        else if (said.startsWith('failed: ')) view = { status: 'failed', reason: said.slice(8) }
      }, (code) => {
        if (view.status === 'running') view = { status: 'failed', reason: `the command ended with ${String(code)} before GitHub's release was there` }
      })
      return view
    },
  }
}

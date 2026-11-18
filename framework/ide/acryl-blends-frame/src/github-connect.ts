/**
 * Connect GitHub from the app, for a person who has never opened a terminal: GitHub's own browser sign-in (`gh auth login --web`), started by a button.
 *
 * gh prints a one-time code and the address github.com/login/device, then waits until the person enters the code there and says yes. This module runs
 * that one gh process, reads the code from what it prints, and reports where the sign-in is. No password or token passes through the app: the person
 * signs in on github.com, and gh keeps its credential where it always does. When the sign-in succeeded, `gh auth setup-git` lets git push over HTTPS
 * with the same account, which a share needs.
 *
 * One sign-in at a time. The owner (the frame's Host) disposes it with the plugin, which ends a sign-in still waiting.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import type { GithubConnectState } from './contract.ts'

export type { GithubConnectState }

/** What this module needs from the computer: start gh's sign-in, and run one gh command to the end. Tests give their own. */
export interface GithubConnectPorts {
  /** Start `gh auth login --web`; undefined when gh is not installed. */
  readonly startLogin: () => ChildProcess | undefined
  /** Run `gh <args>` to the end; the exit status (non-zero when gh is missing). */
  readonly run: (args: readonly string[]) => number
}

const DEVICE_URL = 'https://github.com/login/device'
const CODE = /\b([A-Z0-9]{4}-[A-Z0-9]{4})\b/u
const URL_IN_TEXT = /https:\/\/github\.com\/login\/device\b/u
/** How long a code stays usable on GitHub's side (15 minutes); after that this gives up and the person starts again. */
const GIVE_UP_MS = 15 * 60_000

export const GITHUB_CONNECT_MISSING =
  'Connecting needs a free helper program from GitHub, and it is not installed on this computer. Install it from cli.github.com, then try again.'

/** The gh this computer has, without a terminal: no prompts, no browser opened by gh itself (the page offers the link). */
export function githubConnectPorts(): GithubConnectPorts {
  const env = { ...process.env, GH_BROWSER: 'true', GH_PROMPT_DISABLED: '1', GIT_TERMINAL_PROMPT: '0' }
  return {
    startLogin: () => {
      const probe = spawnSync('gh', ['--version'], { env, encoding: 'utf8' })
      if (probe.error !== undefined) return undefined
      return spawn('gh', ['auth', 'login', '--hostname', 'github.com', '--git-protocol', 'https', '--web', '--skip-ssh-key'], {
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    },
    run: args => {
      const result = spawnSync('gh', [...args], { env, encoding: 'utf8' })
      return result.error !== undefined ? 1 : (result.status ?? 1)
    },
  }
}

export class GithubConnect {
  private current: GithubConnectState = { status: 'idle' }
  private child: ChildProcess | undefined
  private timer: ReturnType<typeof setTimeout> | undefined
  private disposed = false

  constructor(private readonly ports: GithubConnectPorts, private readonly giveUpMs = GIVE_UP_MS) {}

  state(): GithubConnectState {
    return this.current
  }

  /**
   * Start a sign-in, or return the one already waiting. Resolves when the code is known (or the start failed), which is well before the person
   * finishes on github.com; ask `state()` for the rest.
   */
  async start(): Promise<GithubConnectState> {
    if (this.disposed) return this.current
    if (this.child !== undefined) return this.waitForCode()
    const child = this.ports.startLogin()
    if (child === undefined) {
      this.current = { status: 'failed', say: GITHUB_CONNECT_MISSING }
      return this.current
    }
    this.child = child
    this.current = { status: 'starting' }
    let said = ''
    const read = (chunk: Buffer | string): void => {
      said += String(chunk)
      if (this.current.status !== 'starting') return
      const code = CODE.exec(said)?.[1]
      if (code !== undefined) this.current = { status: 'code', code, url: URL_IN_TEXT.exec(said)?.[0] ?? DEVICE_URL }
    }
    child.stdout?.on('data', read)
    child.stderr?.on('data', read)
    // In a terminal gh asks for Enter before it shows the code; without one it shows it at once. Either way one Enter is harmless.
    child.stdin?.on('error', () => {})
    child.stdin?.write('\n')
    child.on('error', cause => this.finish({ status: 'failed', say: GITHUB_CONNECT_MISSING, details: cause.message }))
    child.on('exit', status => {
      if (status === 0) {
        // Let git push over HTTPS with the account just signed in; a share pushes the plugin's repository.
        this.ports.run(['auth', 'setup-git'])
        this.finish({ status: 'connected' })
      } else if (this.current.status !== 'failed') {
        this.finish({
          status: 'failed',
          say: 'GitHub did not finish connecting. Press Connect GitHub to try again.',
          details: said.trim().split('\n').at(-1) ?? '',
        })
      }
    })
    this.timer = setTimeout(() => {
      this.finish({ status: 'failed', say: 'The code ran out before GitHub was connected. Press Connect GitHub to get a new one.' })
    }, this.giveUpMs)
    return this.waitForCode()
  }

  /** End a waiting sign-in (the person closed the chooser, or the plugin unloads). Nothing on GitHub changes. */
  cancel(): void {
    if (this.child === undefined) return
    this.finish({ status: 'idle' })
  }

  dispose(): void {
    this.disposed = true
    this.cancel()
  }

  private finish(next: GithubConnectState): void {
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
    const child = this.child
    this.child = undefined
    if (child !== undefined && child.exitCode === null && child.signalCode === null) child.kill()
    this.current = next
  }

  /** The code usually arrives within a second; give up waiting for it after a few, and let the page ask again. */
  private async waitForCode(): Promise<GithubConnectState> {
    for (let waited = 0; waited < 5_000 && this.current.status === 'starting'; waited += 50) {
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    return this.current
  }
}

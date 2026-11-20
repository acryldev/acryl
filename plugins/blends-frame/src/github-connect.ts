/**
 * Connect GitHub from the app, for a person who has never opened a terminal: the same GitHub sign-in ACRYL Control Center has (one implementation, in
 * `@acryldev/app-persistence`), started by a button. GitHub's device flow gives a one-time code and the address github.com/login/device; this module shows them,
 * asks GitHub every few seconds whether the person approved, and then the token is in `<ACRYL home>/github.json`, the file Control Center reads too, so signing
 * in once counts in both. The token never passes through the page. The process's own `GH_TOKEN` is then that token, so the `gh` and `git` a share starts use it.
 *
 * One sign-in at a time. The owner (the frame's Host) disposes it with the plugin, which ends a sign-in still waiting.
 */
import { clearGithub, githubClientId, pollGithubSignIn, readGithub, startGithubSignIn, type GithubConnection } from '@acryldev/app-persistence'
import type { GithubConnectState } from './contract.ts'

export type { GithubConnectState }

type FetchLike = typeof fetch

/** What this module needs from the computer. Tests give their own. */
export interface GithubConnectPorts {
  /** ACRYL's home: where `github.json` is, the same one Control Center uses. */
  readonly home: string
  /** The process environment: its `GH_TOKEN` is what the `gh` and `git` a share starts read. */
  readonly env: Record<string, string | undefined>
  /** The OAuth client id; undefined when none is valid. */
  readonly clientId?: () => string | undefined
  readonly fetch?: FetchLike
}

export interface GithubConnectOptions {
  /** How long a code is waited for before giving up (GitHub's own is 15 minutes). */
  readonly giveUpMs?: number
  /** Milliseconds between asking GitHub; GitHub's own interval when absent (a test sets it short). */
  readonly pollMs?: number
}

export const GITHUB_CONNECT_UNAVAILABLE = 'GitHub could not be reached. Check your internet connection and try again.'
export const GITHUB_CONNECT_NO_CLIENT = 'GitHub sign-in is not set up in this copy of ACRYL.'

export class GithubConnect {
  private current: GithubConnectState = { status: 'idle' }
  private timer: ReturnType<typeof setTimeout> | undefined
  private giveUp: ReturnType<typeof setTimeout> | undefined
  /** Counts sign-ins: a poll still in flight when the sign-in ended or a new one began must not touch the state. */
  private generation = 0
  private disposed = false
  /** The token this process took into its environment from the file; a token the person's own environment named is never replaced. */
  private adopted: string | undefined

  constructor(private readonly ports: GithubConnectPorts, private readonly options: GithubConnectOptions = {}) {}

  state(): GithubConnectState {
    return this.current
  }

  /** The stored connection, `{ token, login }`, or undefined. */
  connection(): GithubConnection | undefined {
    return readGithub(this.ports.home)
  }

  /**
   * Make the stored connection the one `gh` and `git` use in this process, unless the environment already names a token of the person's own.
   * Returns whether the stored connection is the one in use.
   */
  adopt(): boolean {
    const stored = readGithub(this.ports.home)
    if (stored === undefined) return false
    const env = this.ports.env
    if (env['GITHUB_TOKEN'] || (env['GH_TOKEN'] && env['GH_TOKEN'] !== this.adopted && env['GH_TOKEN'] !== stored.token)) return false
    env['GH_TOKEN'] = stored.token
    this.adopted = stored.token
    return true
  }

  /** Forget the connection for every ACRYL place, and stop this process using it. Returns whether there was one. */
  disconnect(): boolean {
    const stored = readGithub(this.ports.home)
    const had = clearGithub(this.ports.home)
    const env = this.ports.env
    if (stored !== undefined && (env['GH_TOKEN'] === stored.token || env['GH_TOKEN'] === this.adopted)) delete env['GH_TOKEN']
    this.adopted = undefined
    return had
  }

  /** Start a sign-in, or return the one already waiting. Resolves when the code is known (or the start failed); ask `state()` for the rest. */
  async start(): Promise<GithubConnectState> {
    if (this.disposed) return this.current
    if (this.current.status === 'code' || this.current.status === 'starting') return this.current
    const clientId = (this.ports.clientId ?? githubClientId)()
    if (clientId === undefined) {
      this.current = { status: 'failed', say: GITHUB_CONNECT_NO_CLIENT }
      return this.current
    }
    const mine = ++this.generation
    this.current = { status: 'starting' }
    try {
      const code = await startGithubSignIn(clientId, this.ports.fetch)
      if (mine !== this.generation) return this.current
      const url = code.verificationUri.startsWith('https://github.com/') ? code.verificationUri : 'https://github.com/login/device'
      this.current = { status: 'code', code: code.userCode, url }
      this.giveUp = setTimeout(() => {
        this.finish({ status: 'failed', say: 'The code ran out before GitHub was connected. Press Connect GitHub to get a new one.' })
      }, this.options.giveUpMs ?? Math.min(code.expiresIn * 1000, 15 * 60_000))
      this.schedule(clientId, code.deviceCode, this.options.pollMs ?? code.interval * 1000, mine)
    } catch (cause) {
      if (mine !== this.generation) return this.current
      this.current = { status: 'failed', say: GITHUB_CONNECT_UNAVAILABLE, details: cause instanceof Error ? cause.message : String(cause) }
    }
    return this.current
  }

  /** End a waiting sign-in (the person closed the chooser, or the plugin unloads). Nothing on GitHub changes. */
  cancel(): void {
    if (this.current.status !== 'code' && this.current.status !== 'starting') return
    this.finish({ status: 'idle' })
  }

  dispose(): void {
    this.disposed = true
    this.cancel()
  }

  private schedule(clientId: string, deviceCode: string, waitMs: number, mine: number): void {
    this.timer = setTimeout(() => { void this.poll(clientId, deviceCode, waitMs, mine) }, waitMs)
  }

  private async poll(clientId: string, deviceCode: string, waitMs: number, mine: number): Promise<void> {
    if (mine !== this.generation) return
    try {
      const answer = await pollGithubSignIn(this.ports.home, clientId, deviceCode, this.ports.fetch)
      if (mine !== this.generation) return
      if (answer.state === 'pending') {
        this.schedule(clientId, deviceCode, answer.interval === undefined || this.options.pollMs !== undefined ? waitMs : answer.interval * 1000, mine)
      } else if (answer.state === 'connected') {
        this.adopt()
        this.finish({ status: 'connected' })
      } else {
        this.finish({ status: 'failed', say: `GitHub was not connected: ${answer.reason}. Press Connect GitHub to try again.` })
      }
    } catch (cause) {
      if (mine !== this.generation) return
      // A network hiccup while the person is still on github.com: ask again until the code runs out.
      this.schedule(clientId, deviceCode, waitMs, mine)
      void cause
    }
  }

  private finish(next: GithubConnectState): void {
    this.generation += 1
    if (this.timer !== undefined) clearTimeout(this.timer)
    if (this.giveUp !== undefined) clearTimeout(this.giveUp)
    this.timer = undefined
    this.giveUp = undefined
    this.current = next
  }
}

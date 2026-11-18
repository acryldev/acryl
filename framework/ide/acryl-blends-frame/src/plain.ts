/**
 * What the person reads when sharing or adding a plugin goes wrong or cannot start: plain words and the one thing to do, never a git line, a stack or a
 * tool's own message. The technical text is kept next to it as `details`, behind a "Details" toggle for developers, so nothing is lost.
 */

import type { GithubReadiness } from './contract.ts'

export type { GithubReadiness }

/** A message for a person and, for a developer, what the tool said. */
export interface Plain {
  readonly say: string
  readonly details?: string
}

/** A failure whose message is already for the person; a route answers it as it is. */
export class PlainError extends Error {
  constructor(readonly plain: Plain) {
    super(plain.say)
    this.name = 'PlainError'
  }
}

const KEEP_HERE = 'Keeping the plugin on this computer still works.'

export const GITHUB_MISSING: GithubReadiness = {
  status: 'missing',
  say: `Sharing needs a free helper program from GitHub, and it is not installed on this computer. Install it from cli.github.com, then sign in once. ${KEEP_HERE}`,
  link: 'https://cli.github.com',
}

export const GITHUB_SIGNED_OUT: GithubReadiness = {
  status: 'signed-out',
  say: `To share, connect your GitHub account once. ${KEEP_HERE}`,
  command: 'gh auth login',
}

/** What a failed tool call says about the person's setup: the helper is not installed, or it is not signed in. */
export function githubProblemOf(message: string): 'missing' | 'signed-out' | undefined {
  if (/is not available here/iu.test(message)) return 'missing'
  if (/auth login|not logged in|credential|HTTP 401|authentication/iu.test(message)) return 'signed-out'
  return undefined
}

/** Read whether sharing to GitHub can work: ask who is signed in. `login` is the host's own check (it throws a tool message when it cannot). */
export function githubReadiness(login: () => string): GithubReadiness {
  try {
    const account = login().trim()
    return account === '' ? GITHUB_SIGNED_OUT : { status: 'ready', account }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    const problem = githubProblemOf(message)
    if (problem === 'missing') return GITHUB_MISSING
    if (problem === 'signed-out') return GITHUB_SIGNED_OUT
    return { status: 'unavailable', say: 'GitHub did not answer. Check your internet connection and try again.' }
  }
}

/** A share that could not be planned or sent, in words a person can act on. */
export function plainShareProblem(cause: unknown): Plain {
  const message = cause instanceof Error ? cause.message : String(cause)
  const setup = githubProblemOf(message)
  if (setup === 'missing') {
    return /\bgit is not available/iu.test(message)
      ? { say: `Sharing needs a free program called git, and it is not installed on this computer. Install it from git-scm.com and try again. ${KEEP_HERE}`, details: message }
      : { say: GITHUB_MISSING.status === 'missing' ? GITHUB_MISSING.say : '', details: message }
  }
  if (setup === 'signed-out') return { say: 'GitHub is not connected. Press Connect GitHub, then try again. Nothing was sent.', details: message }
  if (/changed since you confirmed/iu.test(message)) return { say: 'Something changed while you were deciding, so nothing was sent. Please try again.', details: message }
  if (/secret|password|token|private key|credential/iu.test(message)) {
    return { say: 'This plugin contains something that looks like a password or a key, so it was not shared. Remove it from the plugin and try again.', details: message }
  }
  if (/already (released|exists)|released once/iu.test(message)) return { say: 'This version is already shared. Change the plugin, then share it again to send the next version.', details: message }
  if (/could not resolve host|network|timed out|ENOTFOUND|ECONN/iu.test(message)) return { say: 'GitHub could not be reached. Check your internet connection and try again. Nothing was sent.', details: message }
  return { say: 'The plugin could not be shared. Nothing was sent.', details: message }
}

/** Why a plugin could not be added to the app, by the kind of refusal the app's pull gives (`plugins/plugin-share/pull-check.ts`). */
export function plainPullRefusal(refusal: string, reason: string, next: string): Plain {
  const details = [reason, next].filter(part => part !== '').join(' - ')
  const say = ((): string => {
    switch (refusal) {
      case 'source': return 'That address is not one this app understands.'
      case 'fetch': return 'The plugin could not be downloaded. Check your internet connection and that it is still public, then try again.'
      case 'name': return "This plugin's name does not fit in this app, so it was not added."
      case 'digest': return 'The downloaded file is not the one its author published, so nothing was added.'
      case 'portability': return 'This plugin only works on some kinds of computer, so it was not added.'
      case 'dependencies': return 'This plugin needs extra software installed first, so it was not added.'
      case 'entry': return 'This plugin has no starting file this app can use, so it was not added.'
      case 'inject':
      case 'missing-service': return 'This plugin needs parts that this app does not have, so it cannot work here. Nothing was added.'
      case 'folder-exists': return 'You already have a different plugin with this name. Remove it first if you want this one. Nothing was changed.'
      case 'install': return 'The plugin did not start, so nothing was changed.'
      default: return 'The plugin could not be added. Nothing was changed.'
    }
  })()
  return { say, ...(details === '' ? {} : { details }) }
}

/**
 * Share the app: give it a repository of its own on GitHub when it has none (through the person's own `gh` login), save what changed, and push.
 * Two steps, as a plugin publish has: `planShare` says what would be sent and sends nothing; `shareApp` sends only the plan a person read, and
 * nothing when the app no longer matches it. The use cases underneath are `connectRemote` and `saveApp` of `@acryldev/app-persistence`, so the
 * same guards hold: no file that holds a secret, and a private app never goes to a public repository.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import {
  connectRemote,
  type GitPort,
  gitCli,
  githubHosting,
  type HostingPort,
  PersistenceError,
  readAppIdentity,
  type SecretFinding,
  saveApp,
  type Visibility,
} from '@acryldev/app-persistence'

/** What a share would send, and where. */
export interface SharePlan {
  /** The repository: `owner/name` for one to be created, the remote's address for an app that has one. */
  readonly repository: string
  /** Whether the repository is created by the share (the app has no remote yet). */
  readonly create: boolean
  readonly visibility: Visibility
  /** How many files changed since the last save; the share saves them first. */
  readonly changes: number
}

export type ShareRefused = {
  readonly ok: false
  readonly reason: string
  readonly secrets?: readonly SecretFinding[]
}
export type ShareResult =
  | {
      readonly ok: true
      /** The remote the app now pushes to. */
      readonly remote: string
      readonly created: boolean
      /** The version saved by the share, when something had changed. */
      readonly commit?: string
    }
  | ShareRefused

export interface ShareOptions {
  /** The GitHub account or organization for a new repository; the signed-in account when absent. */
  readonly owner?: string
}

/** What a share needs from the computer; tests give their own. */
export interface SharePorts {
  readonly git: GitPort
  readonly hosting: HostingPort
  /** The GitHub account `gh` is signed in as, or undefined when it is not. */
  account(): string | undefined
  /** How many files differ from the last save. */
  pending(): number
}

/** The person's own git and gh, in the app's folder. */
export function sharePorts(appRoot: string): SharePorts {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', GH_PROMPT_DISABLED: '1' }
  const run = (command: string, args: readonly string[]) =>
    spawnSync(command, [...args], { cwd: appRoot, encoding: 'utf8', env })
  return {
    git: gitCli(appRoot),
    hosting: githubHosting(appRoot),
    account: () => {
      const result = run('gh', ['api', 'user', '--jq', '.login'])
      const login = result.status === 0 ? result.stdout.trim() : ''
      return login === '' ? undefined : login
    },
    pending: () => {
      const result = run('git', ['status', '--porcelain'])
      return result.status === 0 ? result.stdout.split('\n').filter(Boolean).length : 0
    },
  }
}

const ACCOUNT = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/u
const refused = (reason: string): ShareRefused => ({ ok: false, reason })
const manifestOf = (appRoot: string): string => readFileSync(join(appRoot, 'blend.yaml'), 'utf8')

/** A repository name from the app's name: what GitHub accepts (letters, digits, `-`, `_`, `.`). */
const repositoryName = (name: string): string =>
  name
    .replace(/[^A-Za-z0-9._-]+/gu, '-')
    .replace(/^[-.]+|[-.]+$/gu, '')
    .toLowerCase()

/** What sharing the app would send. Sends nothing and changes nothing. */
export function planShare(
  appRoot: string,
  options: ShareOptions = {},
  ports: SharePorts = sharePorts(appRoot),
): SharePlan | ShareRefused {
  const identity = readAppIdentity(manifestOf(appRoot))
  const changes = ports.pending()
  const remote = ports.git.remoteUrl()
  if (remote !== undefined) {
    const known = ports.hosting.visibilityOf(remote)
    if (identity.visibility === 'private' && known === 'public')
      return refused(
        `this app is private (blend.yaml metadata.visibility) but its remote ${remote} is public. Make the remote private, or set visibility: public if you mean to open it`,
      )
    return {
      repository: remote,
      create: false,
      visibility: known === 'unknown' ? identity.visibility : known,
      changes,
    }
  }
  if (options.owner !== undefined && !ACCOUNT.test(options.owner))
    return refused(`"${options.owner}" is not a GitHub account or organization name`)
  const owner = options.owner ?? ports.account()
  if (owner === undefined)
    return refused(
      'you are not signed in to GitHub on this computer: run gh auth login (or connect GitHub in Settings), then try again',
    )
  const name = repositoryName(identity.name ?? basename(appRoot))
  if (name === '')
    return refused('the app has no name to call its repository by (blend.yaml metadata.name)')
  return { repository: `${owner}/${name}`, create: true, visibility: identity.visibility, changes }
}

export const sameSharePlan = (a: SharePlan, b: SharePlan): boolean =>
  a.repository === b.repository &&
  a.create === b.create &&
  a.visibility === b.visibility &&
  a.changes === b.changes

/** The person's yes: share exactly the plan they read. An app that changed since is not shared; the plan is read again first. */
export function shareApp(
  appRoot: string,
  confirmed: SharePlan,
  options: ShareOptions = {},
  ports: SharePorts = sharePorts(appRoot),
): ShareResult {
  const now = planShare(appRoot, options, ports)
  if ('ok' in now) return now
  if (!sameSharePlan(now, confirmed))
    return refused(
      'the app changed since this plan was shown, so nothing was sent. Read the new plan and confirm it',
    )
  const manifestText = manifestOf(appRoot)
  try {
    let remote = now.repository
    if (now.create) {
      const connected = connectRemote(
        { manifestText, name: now.repository, visibility: now.visibility },
        ports.git,
        ports.hosting,
      )
      if (connected.status === 'refused') return refused(connected.reason)
      remote = connected.remote
    }
    const saved = saveApp({ manifestText, message: 'share the app' }, ports.git, ports.hosting)
    if (saved.status === 'refused')
      return {
        ok: false,
        reason: saved.reason,
        ...(saved.secrets ? { secrets: saved.secrets } : {}),
      }
    // Nothing new to save: the versions already saved still have to reach the remote.
    if (saved.status === 'nothing-to-save') ports.git.push()
    return {
      ok: true,
      remote,
      created: now.create,
      ...(saved.status === 'saved' ? { commit: saved.commit } : {}),
    }
  } catch (error) {
    if (error instanceof PersistenceError) return refused(error.message)
    throw error
  }
}

/** The plan as a person reads it. */
export function renderSharePlan(plan: SharePlan): string {
  const where = plan.create
    ? `a new ${plan.visibility} repository github.com/${plan.repository}`
    : `${plan.repository} (${plan.visibility})`
  const what =
    plan.changes === 0
      ? 'the versions saved so far'
      : `${String(plan.changes)} changed ${plan.changes === 1 ? 'file' : 'files'}, saved first, and the versions saved so far`
  return `Share this app to ${where}: ${what}.`
}

/**
 * Share the app: give it a repository of its own on GitHub when it has none (through the person's own `gh` login), save what changed, and push.
 * Two steps, as a plugin publish has: `planShare` says what would be sent and sends nothing; `shareApp` sends only the plan a person read, and
 * nothing when the app no longer matches it. The use cases underneath are `connectRemote` and `saveApp` of `@acryldev/app-persistence`, so the
 * same guards hold: no file that holds a secret, and a private app never goes to a public repository.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import {
  type AppIdentity,
  type CatalogCategory,
  connectRemote,
  type GitPort,
  GITHUB_VIA_GH,
  gitCli,
  githubHosting,
  type HostingPort,
  PersistenceError,
  type Placement,
  placementOf,
  placementProblem,
  readAppIdentity,
  type SecretFinding,
  saveApp,
  suggestPlacement,
  type Visibility,
  withId,
  withLicense,
  withPlacement,
  withVisibility,
} from '@acryldev/app-persistence'

/** The GitHub topic acrylblends.github.io's hourly sync finds a Blend's repository by. */
export const BLEND_TOPIC = 'acrylblends-blend'

/** Where and how the Blends store lists the app: shown in the plan, written by the share. */
export interface StoreListing {
  /** Its id in the store, under its owner's name (`ana.notes`): an app made from a starter is `acrylblends.<name>`, which only official owners may list. */
  readonly id: string
  readonly placement: Placement
  /** An SPDX licence id (MIT): a public Blend names its terms. */
  readonly license: string
  /** The tag people start from (`--from github:owner/repo#v1.0.0`): v and the app's version. */
  readonly tag: string
}

/** What a share would send, and where. */
export interface SharePlan {
  /** The repository: `owner/name` for one to be created, the remote's address for an app that has one. */
  readonly repository: string
  /** Whether the repository is created by the share (the app has no remote yet). */
  readonly create: boolean
  readonly visibility: Visibility
  /** How many files changed since the last save; the share saves them first. */
  readonly changes: number
  /** Listed in the Blends store too (acrylblends.github.io and Control Center's store), as Community under the owner's name. */
  readonly listing?: StoreListing
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
      /** The store listing: its tag, and whether this share made it (an existing tag is kept, so a new listing needs a new version). */
      readonly listed?: { readonly tag: string; readonly created: boolean }
    }
  | ShareRefused

export interface ShareOptions {
  /** The GitHub account or organization for a new repository; the signed-in account when absent. */
  readonly owner?: string
  /** Who may see a new repository; blend.yaml's metadata.visibility when absent. A share with it records it there, so later saves agree. */
  readonly visibility?: Visibility
  /** List it in the Blends store. Any part not given is taken from the app: its earlier listing, else its starter's category; licence MIT. */
  readonly list?: { readonly category?: string; readonly subcategory?: string; readonly license?: string }
  /** The published category list (acrylblends.github.io/categories.json), to check the place against; unchecked when absent. */
  readonly categories?: readonly CatalogCategory[]
}

/** What a share needs from the computer; tests give their own. */
export interface SharePorts {
  readonly git: GitPort
  readonly hosting: HostingPort
  /** The GitHub account `gh` is signed in as, or undefined when it is not. */
  account(): string | undefined
  /** How many files differ from the last save. */
  pending(): number
  /** Label `owner/repo` for the Blends store and push the tag; false when the tag already existed (it is never moved). */
  list(repository: string, tag: string): boolean
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
    list: (repository, tag) => {
      const must = (command: string, args: readonly string[], what: string) => {
        const result = run(command, args)
        if (result.status !== 0) throw new PersistenceError(`${what}: ${(result.stderr || result.stdout).trim()}`)
      }
      must('gh', ['repo', 'edit', repository, '--add-topic', BLEND_TOPIC], 'could not label the repository for the Blends store')
      if (run('git', ['rev-parse', '-q', '--verify', `refs/tags/${tag}`]).status === 0) return false
      must('git', ['tag', tag], `could not tag ${tag}`)
      must('git', [...GITHUB_VIA_GH, 'push', '--quiet', 'origin', `refs/tags/${tag}`], `could not push ${tag}`)
      return true
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

/** `owner/repo` of a GitHub remote address, or undefined for another host. */
export const githubRepository = (remote: string): string | undefined =>
  /github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?\/?$/u.exec(remote)?.[1]

const INSTALL_SCRIPTS = ['preinstall', 'install', 'postinstall', 'prepublish', 'preprepare', 'prepare', 'postprepare']
const LICENSE_ID = /^[A-Za-z0-9][A-Za-z0-9.+-]*$/u

interface PackageJson { version?: unknown; keywords?: unknown; scripts?: Record<string, unknown>; [key: string]: unknown }
const packageOf = (appRoot: string): PackageJson | undefined => {
  try {
    return JSON.parse(readFileSync(join(appRoot, 'package.json'), 'utf8')) as PackageJson
  } catch {
    return undefined
  }
}

/** The store listing a share asked for, as the person will read it, or why it cannot be listed. */
function planListing(appRoot: string, identity: AppIdentity, visibility: Visibility, repository: string | undefined, options: ShareOptions): StoreListing | ShareRefused | undefined {
  const asked = options.list
  if (asked === undefined) return undefined
  if (visibility !== 'public') return refused('only a public app can be listed in the Blends store: choose public')
  if (repository === undefined) return refused('only an app on GitHub can be listed in the Blends store')
  if (identity.description === undefined) return refused('the store lists an app with its description: add one to blend.yaml (metadata.description)')
  const pkg = packageOf(appRoot)
  if (pkg === undefined) return refused('the app has no readable package.json')
  const script = INSTALL_SCRIPTS.find(name => typeof pkg.scripts?.[name] === 'string')
  if (script !== undefined) return refused(`package.json defines the install script "${script}", which a listed app may not`)
  const categories = options.categories ?? []
  const placement: Placement | undefined = asked.category !== undefined
    ? { category: asked.category, ...(asked.subcategory === undefined ? {} : { subcategory: asked.subcategory }) }
    : placementOf(pkg.keywords) ?? suggestPlacement(identity.category, categories)
  if (placement === undefined) return refused('choose its category, one of acrylblends.github.io/blends (for example --category gaming)')
  const problem = categories.length > 0 ? placementProblem(placement, categories) : undefined
  if (problem !== undefined) return refused(problem)
  const license = asked.license ?? identity.license ?? 'MIT'
  if (!LICENSE_ID.test(license)) return refused(`"${license}" is not a licence id (such as MIT or Apache-2.0)`)
  const version = typeof pkg.version === 'string' ? pkg.version : identity.version ?? '0.1.0'
  const name = (identity.id ?? '').split('.').slice(1).join('.') || repository.split('/')[1] || ''
  const id = `${(repository.split('/')[0] ?? '').toLowerCase()}.${name.toLowerCase()}`
  return { id, placement, license, tag: `v${version}` }
}

const MIT = (year: number, holder: string) => `MIT License

Copyright (c) ${String(year)} ${holder}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`

/**
 * The files the store reads, written into the app before it is saved: the licence in blend.yaml (and an MIT LICENSE file when it has none),
 * the marker and placement keywords in package.json, and the acryl.template.json that lets people start an app from it. Returns blend.yaml's text.
 */
function writeListing(appRoot: string, manifestText: string, listing: StoreListing, repository: string): string {
  const identity = readAppIdentity(manifestText)
  let text = manifestText
  if (identity.id !== listing.id) text = withId(text, listing.id)
  if (identity.license !== listing.license) text = withLicense(text, listing.license)
  if (text !== manifestText) writeFileSync(join(appRoot, 'blend.yaml'), text)
  const pkg = packageOf(appRoot) ?? {}
  const before = Array.isArray(pkg.keywords) ? pkg.keywords.filter((word): word is string => typeof word === 'string') : []
  const keywords = withPlacement(before.includes(BLEND_TOPIC) ? before : [...before, BLEND_TOPIC], listing.placement)
  if (JSON.stringify(keywords) !== JSON.stringify(pkg.keywords)) writeFileSync(join(appRoot, 'package.json'), `${JSON.stringify({ ...pkg, keywords }, null, 2)}\n`)
  const template = join(appRoot, 'acryl.template.json')
  if (!existsSync(template)) writeFileSync(template, `${JSON.stringify({ name: identity.name ?? basename(appRoot), description: identity.description ?? '' }, null, 2)}\n`)
  if (listing.license === 'MIT' && !['LICENSE', 'LICENSE.md', 'LICENSE.txt'].some(file => existsSync(join(appRoot, file))))
    writeFileSync(join(appRoot, 'LICENSE'), MIT(new Date().getFullYear(), repository.split('/')[0] ?? ''))
  return text
}

/** What sharing the app would send. Sends nothing and changes nothing. */
export function planShare(
  appRoot: string,
  options: ShareOptions = {},
  ports: SharePorts = sharePorts(appRoot),
): SharePlan | ShareRefused {
  const plan = planRepository(appRoot, options, ports)
  if ('ok' in plan) return plan
  const listing = planListing(appRoot, readAppIdentity(manifestOf(appRoot)), plan.visibility, plan.create ? plan.repository : githubRepository(plan.repository), options)
  if (listing !== undefined && 'ok' in listing) return listing
  return listing === undefined ? plan : { ...plan, listing }
}

function planRepository(appRoot: string, options: ShareOptions, ports: SharePorts): SharePlan | ShareRefused {
  const identity = readAppIdentity(manifestOf(appRoot))
  const visibility = options.visibility ?? identity.visibility
  const changes = ports.pending()
  const remote = ports.git.remoteUrl()
  if (remote !== undefined) {
    const known = ports.hosting.visibilityOf(remote)
    if (visibility === 'private' && known === 'public')
      return refused(
        `this app is private (blend.yaml metadata.visibility) but its remote ${remote} is public. Make the remote private, or set visibility: public if you mean to open it`,
      )
    return {
      repository: remote,
      create: false,
      visibility: known === 'unknown' ? visibility : known,
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
  return { repository: `${owner}/${name}`, create: true, visibility, changes }
}

export const sameSharePlan = (a: SharePlan, b: SharePlan): boolean =>
  a.repository === b.repository &&
  a.create === b.create &&
  a.visibility === b.visibility &&
  a.changes === b.changes &&
  JSON.stringify(a.listing) === JSON.stringify(b.listing)

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
  let manifestText = manifestOf(appRoot)
  if (
    options.visibility !== undefined &&
    readAppIdentity(manifestText).visibility !== options.visibility
  ) {
    manifestText = withVisibility(manifestText, options.visibility)
    writeFileSync(join(appRoot, 'blend.yaml'), manifestText)
  }
  const repository = now.create ? now.repository : githubRepository(now.repository)
  try {
    if (now.listing !== undefined && repository !== undefined) manifestText = writeListing(appRoot, manifestText, now.listing, repository)
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
    const listed = now.listing !== undefined && repository !== undefined
      ? { tag: now.listing.tag, created: ports.list(repository, now.listing.tag) }
      : undefined
    return {
      ok: true,
      remote,
      created: now.create,
      ...(saved.status === 'saved' ? { commit: saved.commit } : {}),
      ...(listed === undefined ? {} : { listed }),
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
  const listed = plan.listing === undefined
    ? ''
    : ` Listed in the Blends store as ${plan.listing.id}, Community, under ${placementWords(plan.listing.placement)} (licence ${plan.listing.license}, people start from ${plan.listing.tag}).`
  return `Share this app to ${where}: ${what}.${listed}`
}

const placementWords = (placement: Placement): string =>
  placement.subcategory === undefined ? placement.category : `${placement.category} › ${placement.subcategory}`

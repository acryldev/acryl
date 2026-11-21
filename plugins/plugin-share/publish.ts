/**
 * Publishing a plugin: what a person is asked to say yes to, and the comparison that makes the yes mean exactly that. Pure; the service does the I/O.
 */
import type { PublishGitPort, RepositoryHostPort } from '@acryldev/plugin-hub-core'
import type { NpmPort } from './npm-login.ts'

/** Everything that leaves the machine, named before anything does. */
export interface PublishPlan {
  /** Where it goes: a GitHub release (absent) or an npm registry. For npm `owner` is the scope and `repo` the plugin's name. */
  readonly target?: 'npm'
  /** npm: the package's name (`@scope/name`) and the registry it is published to. */
  readonly package?: string
  readonly registry?: string
  readonly owner: string
  readonly repo: string
  readonly version: string
  readonly visibility: 'public'
  readonly license: string
  /** The repository does not exist yet: publishing creates it. */
  readonly createsRepository: boolean
  /** The version already released there; the plan then releases the next patch. */
  readonly released?: string
  readonly files: readonly string[]
  /** The sha512 of the release file. */
  readonly integrity: string
  /** The sha256 of the plugin's content. */
  readonly digest: string
  /** What a friend runs to get exactly these bytes. */
  readonly pullLine: string
}

export interface PublishRefused {
  readonly ok: false
  readonly reason: string
  readonly next: string
}

export type PublishResult =
  | {
      readonly ok: true
      readonly url: string
      readonly releaseUrl: string
      readonly version: string
      readonly integrity: string
      readonly digest: string
      readonly pullLine: string
    }
  | PublishRefused

export interface PublishOptions {
  /** The account or organization; the signed-in one when absent. */
  readonly owner?: string
  /** The license the plugin is offered under, as an SPDX id; MIT when absent. The plan shows it before the person says yes. */
  readonly license?: string
  /** `npm`: publish to an npm registry with the person's own npm login instead of to GitHub. */
  readonly to?: 'npm'
  /** npm: the scope of the package; the account npm is signed in as when absent. */
  readonly scope?: string
  /** npm: the registry; the public one when absent. */
  readonly registry?: string
}

/** Where a publish goes through: the person's own `gh` and `git`. A test passes stand-ins, so no test publishes. */
export interface PublishPorts {
  readonly host: RepositoryHostPort
  readonly git: PublishGitPort
  /** The person's own npm (`npm whoami`, `npm publish`); the default is their installed npm. A test passes a stand-in. */
  readonly npm?: NpmPort
}

/** The line a friend copies: it names the bytes, so the check comes for free. */
export const pullLineOf = (owner: string, repo: string, version: string, digest: string): string =>
  `npm run acryl -- plugin pull github:${owner}/${repo}@${version}@sha256:${digest}`

/** The line a friend copies for an npm package. */
export const npmPullLineOf = (name: string, version: string, digest: string): string =>
  `npm run acryl -- plugin pull npm:${name}@${version}@sha256:${digest}`

/**
 * The same plan: what the person confirmed is what would be published now. `released` only explains the version, and is gone once the next one is packaged.
 * Field by field, so a plan that came back through JSON from another surface (the frame's confirm) is the same plan whatever order its fields arrived in.
 */
export function samePlan(a: PublishPlan, b: PublishPlan): boolean {
  return (
    a.target === b.target &&
    a.package === b.package &&
    a.registry === b.registry &&
    a.owner === b.owner &&
    a.repo === b.repo &&
    a.version === b.version &&
    a.visibility === b.visibility &&
    a.license === b.license &&
    a.createsRepository === b.createsRepository &&
    a.integrity === b.integrity &&
    a.digest === b.digest &&
    a.pullLine === b.pullLine &&
    a.files.length === b.files.length &&
    a.files.every((file, index) => file === b.files[index])
  )
}

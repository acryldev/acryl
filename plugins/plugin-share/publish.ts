/**
 * Publishing a plugin: what a person is asked to say yes to, and the comparison that makes the yes mean exactly that. Pure; the service does the I/O.
 */
import type { PublishGitPort, RepositoryHostPort } from '@webboxes/plugin-hub'

/** Everything that leaves the machine, named before anything does. */
export interface PublishPlan {
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
}

/** Where a publish goes through: the person's own `gh` and `git`. A test passes stand-ins, so no test publishes. */
export interface PublishPorts {
  readonly host: RepositoryHostPort
  readonly git: PublishGitPort
}

/** The line a friend copies: it names the bytes, so the check comes for free. */
export const pullLineOf = (owner: string, repo: string, version: string, digest: string): string =>
  `npm run acryl -- plugin pull github:${owner}/${repo}@${version}@sha256:${digest}`

/**
 * The same plan: what the person confirmed is what would be published now. `released` only explains the version, and is gone once the next one is packaged.
 * Field by field, so a plan that came back through JSON from another surface (the frame's confirm) is the same plan whatever order its fields arrived in.
 */
export function samePlan(a: PublishPlan, b: PublishPlan): boolean {
  return (
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

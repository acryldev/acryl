/**
 * Sharing a plugin to npm from the frame: the same plan and the same service as the terminal (`plugin publish <name> --to npm`, plugins/plugin-share), with
 * the person's own npm login. The frame's plan is a view of the service's plan; the confirm is checked against a plan made again, byte for byte (the digest).
 */
import type { SharePlan } from './contract.ts'
import type { ShareAppPluginResult } from './app-plugins.ts'

/** The slice of the app's `pluginShare` service this uses. */
export interface NpmShareService {
  planPublish(name: string, options: { readonly to: 'npm'; readonly scope?: string }): Promise<NpmPlan | Refused>
  publish(name: string, confirmed: NpmPlan, options: { readonly to: 'npm'; readonly scope?: string }): Promise<Published | Refused>
}

export interface NpmPlan {
  readonly target?: 'npm'
  readonly package?: string
  readonly registry?: string
  readonly owner: string
  readonly repo: string
  readonly version: string
  readonly license: string
  readonly released?: string
  readonly digest: string
}

interface Refused {
  readonly ok: false
  readonly reason: string
  readonly next: string
}

interface Published {
  readonly ok: true
  readonly url: string
  readonly version: string
}

/** The running app's service, read at each call; undefined when the app has none (an app made before plugin-share, or one that left the row out). */
export function npmShareOf(service: () => unknown): NpmShareService | undefined {
  const share = service() as Partial<NpmShareService> | undefined
  return typeof share?.planPublish === 'function' && typeof share.publish === 'function' ? (share as NpmShareService) : undefined
}

const asked = (scope: string | undefined): { readonly to: 'npm'; readonly scope?: string } => ({ to: 'npm', ...(scope === undefined ? {} : { scope }) })

const refusedBy = (answer: unknown): answer is Refused => typeof answer === 'object' && answer !== null && (answer as { ok?: unknown }).ok === false

const sentence = (refused: Refused): string => `${refused.reason}. ${refused.next}.`

const planOf = (plan: NpmPlan): SharePlan => ({
  owner: plan.owner,
  repo: plan.repo,
  version: plan.version,
  visibility: 'public',
  createsRepository: false,
  ...(plan.released === undefined ? {} : { released: plan.released }),
  license: plan.license,
  npm: { package: plan.package ?? `@${plan.owner}/${plan.repo}`, registry: plan.registry ?? 'https://registry.npmjs.org/', digest: plan.digest },
})

/** @throws with the service's reason when the plan is refused (not signed in to npm, a secret in the plugin, ...). */
export async function planNpmShare(service: NpmShareService | undefined, name: string, scope?: string): Promise<SharePlan> {
  if (service === undefined) throw new Error('this app has no plugin-share service, which publishing to npm needs')
  const plan = await service.planPublish(name, asked(scope))
  if (refusedBy(plan)) throw new Error(sentence(plan))
  return planOf(plan)
}

/** Publish the plan the person confirmed: a plan made again must be the same, and then the service publishes it. @throws when it changed or was refused. */
export async function shareNpm(service: NpmShareService | undefined, name: string, confirmed: SharePlan, scope?: string): Promise<ShareAppPluginResult> {
  if (service === undefined || confirmed.npm === undefined) throw new Error('this app has no plugin-share service, which publishing to npm needs')
  const plan = await service.planPublish(name, asked(scope))
  if (refusedBy(plan)) throw new Error(sentence(plan))
  const now = planOf(plan)
  if (now.npm?.package !== confirmed.npm.package || now.npm?.registry !== confirmed.npm.registry || now.npm?.digest !== confirmed.npm.digest || now.version !== confirmed.version || now.license !== confirmed.license) {
    throw new Error(`The share changed since you confirmed it (${confirmed.npm.package} v${now.version}); nothing was sent. Look at it again.`)
  }
  const result = await service.publish(name, plan, asked(scope))
  if (refusedBy(result)) throw new Error(sentence(result))
  const published = result as Published
  return { url: published.url, version: published.version, owner: plan.owner, repo: plan.repo, tag: `v${published.version}` }
}

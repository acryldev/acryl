// Publishing a plugin to an npm registry (spec 044 lifecycle.md, "Publish: the methods", npm; build step 6): the public npm registry or a private
// one (GitHub Packages, Verdaccio, a company registry). The same guards as sharing to git, then the same deterministic tarball, published with
// the user's own npm login. A pull of `npm:<name>` checks the registry's own integrity against what was published.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SecretFinding } from '@webboxes/app-persistence'
import { syncServiceContract } from './contract.js'
import { parsePluginName } from './name.js'
import { bundleProblem, packFolder } from './pack.js'
import { PLUGIN_LABELS, secretsIn, type Visibility } from './share.js'
import type { PluginStore } from './store.js'

/** The registry, through the user's own `npm` (an adapter in npm-cli.ts; a test fake otherwise). */
export interface NpmPublishPort {
  /** Whether `name@version` is already on the registry. */
  hasVersion(name: string, version: string, registry: string): boolean
  /** Publish a tarball file; `access` is `public` or `restricted` (a private scoped package). */
  publish(tarballPath: string, registry: string, access: 'public' | 'restricted'): void
}

export interface NpmPublishOptions {
  /** Default: the public npm registry. */
  readonly registry?: string
  /** Default: the plugin's `acryl.visibility`, else private. */
  readonly visibility?: Visibility
}

export type NpmPublishResult =
  | { readonly status: 'published'; readonly name: string; readonly version: string; readonly registry: string; readonly access: 'public' | 'restricted'; readonly integrity: string; readonly files: readonly string[]; readonly updatedManifest: readonly string[] }
  | { readonly status: 'refused'; readonly reason: string; readonly secrets?: readonly SecretFinding[] }

export const NPM_REGISTRY = 'https://registry.npmjs.org/'

export async function publishToNpm(folder: string, options: NpmPublishOptions, ports: { readonly npm: NpmPublishPort; readonly store: PluginStore }): Promise<NpmPublishResult> {
  const refuse = (reason: string, secrets?: readonly SecretFinding[]): NpmPublishResult => ({ status: 'refused', reason, ...(secrets === undefined ? {} : { secrets }) })
  const registry = options.registry ?? NPM_REGISTRY
  const before = JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8')) as Record<string, unknown>
  const name = parsePluginName(String(before['name']))
  const acryl = before['acryl'] as { visibility?: unknown } | undefined
  const visibility: Visibility = options.visibility ?? (acryl?.visibility === 'public' ? 'public' : 'private')
  if (visibility === 'public' && typeof before['license'] !== 'string') return refuse('a public plugin needs a "license" in its package.json (for example "MIT")')
  // An unscoped npm package is always public; a private plugin needs a scope (`@owner/name`) to be published with restricted access.
  if (visibility === 'private' && name.owner === undefined) return refuse(`${name.full} is private, and npm can keep only a scoped package (@owner/name) private; rename it with a scope or publish it publicly`)
  if (before['private'] === true) return refuse('package.json says "private": true, which npm refuses to publish; remove it (ACRYL keeps visibility in acryl.visibility)')

  const contract = await syncServiceContract(folder)
  if (!contract.ok) return refuse(`its service contract cannot be read: ${contract.errors.join('; ')}`)
  const manifest = JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8')) as Record<string, unknown>
  const updatedManifest: string[] = contract.written ? ['service contract and slots'] : []
  const keywords = Array.isArray(manifest['keywords']) ? manifest['keywords'].filter((word): word is string => typeof word === 'string') : []
  const missing = PLUGIN_LABELS.filter(label => !keywords.includes(label))
  if (missing.length > 0) {
    manifest['keywords'] = [...keywords, ...missing]
    writeFileSync(join(folder, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
    updatedManifest.push(`keywords +${missing.join(', +')}`)
  }

  const packed = packFolder(folder)
  const notBundle = bundleProblem(packed)
  if (notBundle !== undefined) return refuse(notBundle)
  const secrets = secretsIn(packed)
  if (secrets.length > 0) return refuse(`the secret check found ${String(secrets.length)} possible secret(s) in the files that would be published; nothing was sent`, secrets)
  if (ports.npm.hasVersion(packed.name.full, packed.version, registry)) return refuse(`${packed.name.full}@${packed.version} is already on ${registry}; a version is published once, so give this change a new version (acryl plugin version patch)`)
  const kept = ports.store.list().find(entry => entry.name === packed.name.full && entry.version === packed.version)
  if (kept !== undefined && kept.integrity !== packed.integrity) return refuse(`${packed.name.full} ${packed.version} was already saved here with different files; give this change a new version (acryl plugin version patch)`)

  const access = visibility === 'public' ? 'public' : 'restricted'
  const work = mkdtempSync(join(tmpdir(), 'plugin-hub-npm-'))
  try {
    const file = join(work, packed.fileName)
    writeFileSync(file, packed.tarball)
    ports.npm.publish(file, registry, access)
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
  ports.store.put(packed.name.full, packed.version, packed.tarball, { from: folder })
  return { status: 'published', name: packed.name.full, version: packed.version, registry, access, integrity: packed.integrity, files: packed.files, updatedManifest }
}

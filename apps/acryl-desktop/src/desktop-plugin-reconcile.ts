/**
 * Reconcile `dsh.profile.bundles` for the Electron-owned `desktop` profile.
 *
 * `@deepseek-ai/dsh@0.1.5`'s `plugin` command hard-rejects `--profile desktop`
 * ("managed exclusively by the Electron application"), so acryl-desktop runs
 * `pnpm add` / `pnpm remove` in the profile itself and then applies the same
 * layer-list reconciliation the upstream CLI applies after its own pnpm run
 * (`@deepseek-ai/dsh/lib/plugin-*.js` `reconcilePlugins`), reproduced here
 * because that logic is CLI-internal.
 *
 * Rule: after pnpm has materialized the install, a profile `dependencies` entry
 * whose resolved package declares `dsh.bundle.patch` must appear in
 * `dsh.profile.bundles` (appended in dependency order); a bundle-list name that
 * is a former dependency and no longer resolves to a `dsh.bundle` package is
 * removed. In-box template bundles (`@deepseek-ai/dsh-base`, `dsh-web-app`) are
 * not dependencies and are never touched.
 */

import { fileURLToPath } from 'node:url'
import { readProfileManifest, resolveBundleDir, writeProfileManifest } from '@deepseek-ai/dsh-app-boot'

const BIN_NAME = 'acryl-desktop'

/** Installation resolution anchor: a file inside the acryl-desktop package. */
export const DESKTOP_INSTALL_ANCHOR = fileURLToPath(new URL('../package.json', import.meta.url))

interface ProfileManifestView {
  readonly dependencies?: Readonly<Record<string, string>>
  readonly dsh?: { readonly profile?: { readonly bundles?: readonly string[] } }
}

/** `readProfileManifest` returns a validated JSON object; read it structurally. */
function manifestView(profileDir: string): ProfileManifestView & Record<string, unknown> {
  return readProfileManifest(BIN_NAME, profileDir) as unknown as ProfileManifestView & Record<string, unknown>
}

/** Outcome of one reconciliation pass, for logging and tests. */
export interface BundleReconcileResult {
  /** `true` when the profile manifest was rewritten. */
  readonly changed: boolean
  /** Bundle package names appended to `dsh.profile.bundles`. */
  readonly added: readonly string[]
  /** Bundle package names dropped from `dsh.profile.bundles`. */
  readonly removed: readonly string[]
  /** New dependencies that declare no `dsh.bundle` - installed as plain libraries. */
  readonly plainDependencies: readonly string[]
}

/** Whether a resolved profile dependency declares a bundle patch. */
function declaresBundlePatch(packageName: string, installAnchor: string, profileDir: string): boolean {
  let dir: string
  try {
    dir = resolveBundleDir(BIN_NAME, packageName, installAnchor, profileDir)
  } catch {
    return false
  }
  const manifest = readProfileManifest(BIN_NAME, dir) as {
    readonly dsh?: { readonly bundle?: { readonly patch?: unknown } }
  }
  return manifest.dsh?.bundle?.patch !== undefined
}

/**
 * Bring `dsh.profile.bundles` in line with the profile's installed dependencies.
 * @param profileDir - the active `desktop` profile directory.
 * @param beforeDependencyNames - dependency names before the pnpm operation ran.
 * @param installAnchor - installation resolution anchor (defaults to acryl-desktop).
 * @returns what changed; `changed: false` leaves the manifest untouched.
 */
export function reconcileProfileBundles(
  profileDir: string,
  beforeDependencyNames: readonly string[],
  installAnchor: string = DESKTOP_INSTALL_ANCHOR,
): BundleReconcileResult {
  const manifest = manifestView(profileDir)
  const beforeDeps = new Set(beforeDependencyNames)
  const dependencies = Object.keys(manifest.dependencies ?? {})
  const dependencySet = new Set(dependencies)
  const bundles = [...(manifest.dsh?.profile?.bundles ?? [])]

  const added: string[] = []
  const removed: string[] = []
  const plainDependencies: string[] = []

  for (const packageName of dependencies) {
    const isBundle = declaresBundlePatch(packageName, installAnchor, profileDir)
    if (isBundle && !bundles.includes(packageName)) {
      bundles.push(packageName)
      added.push(packageName)
    } else if (!isBundle && !beforeDeps.has(packageName)) {
      plainDependencies.push(packageName)
    }
  }

  for (const packageName of [...bundles]) {
    const wasDependency = beforeDeps.has(packageName) || dependencySet.has(packageName)
    const stillBundle = dependencySet.has(packageName)
      && declaresBundlePatch(packageName, installAnchor, profileDir)
    if (wasDependency && !stillBundle) {
      bundles.splice(bundles.indexOf(packageName), 1)
      removed.push(packageName)
    }
  }

  const changed = added.length > 0 || removed.length > 0
  if (changed) {
    writeProfileManifest(profileDir, {
      ...manifest,
      dsh: {
        ...manifest.dsh,
        profile: { ...manifest.dsh?.profile, bundles },
      },
    })
  }
  return { changed, added, removed, plainDependencies }
}

/** Read the current top-level dependency names from a profile manifest. */
export function profileDependencyNames(profileDir: string): readonly string[] {
  return Object.keys(manifestView(profileDir).dependencies ?? {})
}

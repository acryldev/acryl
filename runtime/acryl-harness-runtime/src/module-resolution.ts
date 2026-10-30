/**
 * Profile-relative package resolution for a Node runtime with a persistent,
 * user-mutable profile directory.
 *
 * Extracted verbatim from acryl-desktop's own module-resolution.ts (first
 * built and proven there against Electron's restricted runtime) - the two
 * anchors that varied per surface (the calling installation's own entry
 * module and its own package.json) are now parameters
 * ({@link InstallProfilePackageResolverOptions}) instead of hardcoded
 * Desktop paths; every other line, including the two-layer CJS/ESM hook
 * strategy and its comments, is unchanged. Desktop's own module-resolution.ts
 * is now a thin wrapper supplying its Electron-specific anchors (unpacked
 * ASAR paths) to this function - its own behavior is unaffected.
 */

import Module from 'node:module'
import { basename, dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { requireModuleHooks } from './module-hooks.ts'
import {
  findOverlayPackage,
  packageNameFromSpecifier,
  resolveOverlayPackage,
} from './package-overlay.ts'

interface CommonJsModuleResolver {
  _resolveFilename(
    request: string,
    parent: { filename?: string } | null | undefined,
    isMain: boolean | undefined,
    options?: unknown,
  ): string
}

/** Node's CommonJS package lookup list for a directory: every ancestor's node_modules, nearest first. */
function nodeModulePaths(directory: string): string[] {
  const paths: string[] = []
  for (let current = directory; ; current = dirname(current)) {
    if (basename(current) !== 'node_modules') paths.push(join(current, 'node_modules'))
    if (dirname(current) === current) return paths
  }
}

function packageNameFromManifestSpecifier(specifier: string): string | undefined {
  const suffix = '/package.json'
  if (!specifier.endsWith(suffix)) return undefined
  const packageName = specifier.slice(0, -suffix.length)
  return packageNameFromSpecifier(packageName) === packageName ? packageName : undefined
}

/** Return whether a Loader request needs Node package resolution. */
function isBareSpecifier(specifier: string): boolean {
  return !specifier.startsWith('.') && !specifier.startsWith('/') && !URL.canParse(specifier)
}

export interface InstallProfilePackageResolverOptions {
  /** Diagnostic prefix on thrown errors - the calling surface's own bin name. */
  readonly binName: string
  /** File URL of the calling installation's own package.json. */
  readonly installPackageUrl: string
  /** File URL of the calling installation's own compiled entry module. */
  readonly installEntryUrl: string
  /** File URL resolved by `import.meta.resolve('@deepseek-ai/cordis-plugin-loader')`. */
  readonly loaderEntryUrl: string
}

/**
 * Resolve Cordis Loader bare imports from the selected persistent profile.
 * @param profileBaseUrl - file URL inside the profile that owns plugin dependencies.
 * @param options - the calling installation's own resolution anchors.
 * @returns an idempotent hook disposer.
 */
export function installProfilePackageResolver(
  profileBaseUrl: string,
  options: InstallProfilePackageResolverOptions,
): () => void {
  // Before `_resolveFilename` is wrapped, so a runtime without module hooks leaves nothing behind.
  const registerHooks = requireModuleHooks()
  const { binName, installPackageUrl, installEntryUrl, loaderEntryUrl } = options
  const profileManifestPath = fileURLToPath(profileBaseUrl)
  // Directory-derived `createRequire` bases (e.g. `new URL('.', profileBaseUrl)`)
  // yield a synthetic `noop.js` module as the require parent; the manifest
  // anchor yields the manifest path itself. Both live inside the profile
  // directory, so treat any parent anchored there as profile-owned.
  const profileDirPath = fileURLToPath(new URL('.', profileBaseUrl))

  // ClientModuleRegistry intentionally uses createRequire(ctx.baseUrl) to
  // resolve each browser bundle from the config tree. Node's ESM resolve hook
  // does not observe that CommonJS manifest lookup, so without this narrow
  // bridge the Loader can activate the installation's own copy while the
  // browser receives an older Profile copy of the same package. Intercept
  // only package manifests requested from a parent anchored in this Profile
  // (the manifest itself or a synthetic module under the profile directory);
  // every other CJS resolution remains untouched.
  // Track the module graph rooted at every overlay-selected Loader package.
  const overlayModuleUrls = new Set<string>()
  const commonJsModule = Module as unknown as CommonJsModuleResolver
  const previousResolveFilename = commonJsModule._resolveFilename
  // The parent an installation-selected package resolves from: the installation's own manifest, with Node's node_modules lookup
  // list from its directory upwards (what `Module._nodeModulePaths` computes). Made on first use, so installing the resolver converts no path.
  let installParent: { filename: string, id: string, paths: string[] } | undefined
  const installParentModule = () => {
    if (installParent !== undefined) return installParent
    const installManifestPath = fileURLToPath(installPackageUrl)
    installParent = { filename: installManifestPath, id: installManifestPath, paths: nodeModulePaths(dirname(installManifestPath)) }
    return installParent
  }
  const overlayResolveFilename: CommonJsModuleResolver['_resolveFilename'] = function (
    this: CommonJsModuleResolver,
    request,
    parent,
    isMain,
    resolveOptions,
  ) {
    const profileAnchored = parent?.filename !== undefined
      && (parent.filename === profileManifestPath || parent.filename.startsWith(profileDirPath))
    const manifestPackage = profileAnchored ? packageNameFromManifestSpecifier(request) : undefined
    // A bare plugin import from the Profile anchor (dsh-app-boot's root Include resolves every Loader row this way) takes the
    // same overlay: a package the Profile does not hold, or holds at an older version, comes from the installation. Without
    // this, a fresh Profile (no node_modules since DSH 0.2 removed the link projections) resolved no plugin at all.
    const packageName = manifestPackage
      ?? (profileAnchored && isBareSpecifier(request) ? packageNameFromSpecifier(request) : undefined)
    if (packageName !== undefined) {
      const overlay = findOverlayPackage(packageName, {
        binName,
        installPackageUrl,
        profilePackageUrl: profileBaseUrl,
      })
      if (overlay !== undefined) {
        if (manifestPackage !== undefined) return overlay.selected.manifestPath
        const target = previousResolveFilename.call(
          this, request, overlay.selected.source === 'install' ? installParentModule() : parent, isMain, resolveOptions)
        // The Loader imports this file next: its graph gets the Profile fallback for dependencies, as a Loader import through the ESM hook does.
        if (isAbsolute(target)) overlayModuleUrls.add(pathToFileURL(target).href)
        return target
      }
    }
    return previousResolveFilename.call(this, request, parent, isMain, resolveOptions)
  }
  commonJsModule._resolveFilename = overlayResolveFilename
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      const fromLoader = context.parentURL === loaderEntryUrl
      const packageName = fromLoader ? packageNameFromSpecifier(specifier) : undefined
      if (packageName !== undefined) {
        const overlay = resolveOverlayPackage(packageName, {
          binName,
          installPackageUrl,
          profilePackageUrl: profileBaseUrl,
        })
        const resolved = nextResolve(specifier, {
          ...context,
          parentURL: overlay.selected.source === 'profile' ? profileBaseUrl : installEntryUrl,
        })
        overlayModuleUrls.add(resolved.url)
        return resolved
      }
      if (context.parentURL === undefined || !overlayModuleUrls.has(context.parentURL)) {
        return nextResolve(specifier, context)
      }
      if (!isBareSpecifier(specifier)) {
        const resolved = nextResolve(specifier, context)
        if (specifier.startsWith('.')) overlayModuleUrls.add(resolved.url)
        return resolved
      }
      try {
        const resolved = nextResolve(specifier, context)
        overlayModuleUrls.add(resolved.url)
        return resolved
      } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code !== 'ERR_MODULE_NOT_FOUND') throw cause
        const resolved = nextResolve(specifier, { ...context, parentURL: profileBaseUrl })
        overlayModuleUrls.add(resolved.url)
        return resolved
      }
    },
  })
  let active = true
  return () => {
    if (!active) return
    active = false
    hooks.deregister()
    if (commonJsModule._resolveFilename === overlayResolveFilename) {
      commonJsModule._resolveFilename = previousResolveFilename
    }
  }
}

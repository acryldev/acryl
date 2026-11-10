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

import Module, { isBuiltin } from 'node:module'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { requireModuleHooks } from './module-hooks.ts'
import {
  findOverlayPackage,
  packageNameFromSpecifier,
  resolveOverlayPackage,
} from './package-overlay.ts'

interface CommonJsModuleResolver {
  _nodeModulePaths(from: string): string[]
  _resolveFilename(
    request: string,
    parent: { filename?: string } | null | undefined,
    isMain: boolean | undefined,
    options?: unknown,
  ): string
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

  // Two CommonJS lookups start from the Profile anchor and must follow the
  // same overlay rule as the ESM hook below, because Node's ESM resolve hook
  // does not observe either of them:
  //  - ClientModuleRegistry uses createRequire(ctx.baseUrl) to resolve each
  //    browser bundle from the config tree. Without the bridge the Loader can
  //    activate the installation's own copy while the browser receives an
  //    older Profile copy of the same package.
  //  - The patched Cordis Loader (patches/@deepseek-ai__cordis-plugin-loader)
  //    resolves every plugin name of a tree that has a file: base through
  //    Module._resolveFilename from that base. A package that only the
  //    installation has (acryl-desktop and its sub-plugins, every ACRYL
  //    plugin) is not in the Profile's node_modules, so it was found only
  //    where pnpm happened to hoist it, and the entry failed to import.
  // Only requests from a parent anchored in this Profile are intercepted (the
  // manifest itself or a synthetic module under the profile directory); every
  // other CommonJS resolution remains untouched. A package manifest request
  // answers the overlay's selected manifest. Any other package request is
  // resolved from the selected side: the installation's own dependency graph
  // when the installation wins, the Profile when it does.
  const commonJsModule = Module as unknown as CommonJsModuleResolver
  const previousResolveFilename = commonJsModule._resolveFilename
  const overlayResolveFilename: CommonJsModuleResolver['_resolveFilename'] = function (
    this: CommonJsModuleResolver,
    request,
    parent,
    isMain,
    resolveOptions,
  ) {
    const profileAnchored = parent?.filename !== undefined
      && (parent.filename === profileManifestPath || parent.filename.startsWith(profileDirPath))
    if (profileAnchored) {
      const manifestPackage = packageNameFromManifestSpecifier(request)
      if (manifestPackage !== undefined) {
        const overlay = findOverlayPackage(manifestPackage, {
          binName,
          installPackageUrl,
          profilePackageUrl: profileBaseUrl,
        })
        if (overlay !== undefined) return overlay.selected.manifestPath
      } else if (isBareSpecifier(request) && !isBuiltin(request)) {
        const packageName = packageNameFromSpecifier(request)
        const overlay = packageName === undefined
          ? undefined
          : findOverlayPackage(packageName, {
            binName,
            installPackageUrl,
            profilePackageUrl: profileBaseUrl,
          })
        if (overlay?.selected.source === 'install') {
          // A parent inside the installation, not an `options.paths` lookup: only a real parent lets a
          // package import itself by name (`acryl-desktop/terminal` from the desktop's own entry).
          const installEntryPath = fileURLToPath(installEntryUrl)
          const installParent = {
            id: installEntryPath,
            filename: installEntryPath,
            paths: commonJsModule._nodeModulePaths(dirname(installEntryPath)),
          }
          return previousResolveFilename.call(this, request, installParent, isMain, resolveOptions)
        }
      }
    }
    return previousResolveFilename.call(this, request, parent, isMain, resolveOptions)
  }
  commonJsModule._resolveFilename = overlayResolveFilename

  // Track the module graph rooted at every overlay-selected Loader package.
  const overlayModuleUrls = new Set<string>()
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

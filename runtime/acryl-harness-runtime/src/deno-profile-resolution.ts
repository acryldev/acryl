/**
 * Bare-package resolution from the profile for a Deno host (specs/042 F14).
 *
 * A plugin installed while the app runs lives only in the profile's own `node_modules`. On Node, `PluginPackages` intercepts the module loader so the Cordis
 * Loader can import it; Deno has no such private seam, and the Loader (which has no `internal` loader there) imports a bare plugin name with a plain
 * `import(name)` that resolves from the Loader package's own place in the installation. The import fails and the Loader only logs it, so a live install ends in
 * "plugin ... did not activate". This is the same effect on public API: a `module.registerHooks` resolve hook that leaves every resolution alone unless it
 * produced nothing usable, and then resolves the bare name from the profile's own `package.json` (not cached: a package installed a moment ago is found).
 *
 * Deno differs from Node in one way that shapes the code: `nextResolve` does not throw for a missing package and ignores a replaced `parentURL`; it returns a
 * `file:` URL of a file that does not exist and the failure surfaces later, at load. So "nothing usable" is a `file:` URL that is not on disk, and the profile
 * answer is returned directly rather than asked of `nextResolve`.
 */
import { existsSync } from 'node:fs'
import { createRequire, registerHooks } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** A request the profile could answer: a package name or a package subpath, not a path, a URL or a Node builtin. */
function isBareSpecifier(specifier: string): boolean {
  return !specifier.startsWith('.') && !specifier.startsWith('/') && !URL.canParse(specifier)
}

/**
 * Resolve bare imports that nothing else resolves from the profile that owns the app's plugin packages.
 * @param profileDir - the profile folder (its `package.json` and `node_modules`).
 * @returns an idempotent disposer for the hook.
 */
export function installDenoProfileResolver(profileDir: string): () => void {
  const fromProfile = createRequire(pathToFileURL(`${profileDir.replace(/[\\/]+$/, '')}/package.json`))
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      let resolved: ReturnType<typeof nextResolve> | undefined
      try {
        resolved = nextResolve(specifier, context)
      } catch (cause) {
        if (!isBareSpecifier(specifier)) throw cause
      }
      const missing = resolved === undefined || (resolved.url.startsWith('file:') && !existsSync(fileURLToPath(resolved.url)))
      if (resolved !== undefined && !missing) return resolved
      if (!isBareSpecifier(specifier)) return resolved as ReturnType<typeof nextResolve>
      try {
        return { url: pathToFileURL(fromProfile.resolve(specifier)).href, shortCircuit: true }
      } catch {
        // Not a profile package either: give the caller the result (or error) the runtime itself produced.
        if (resolved !== undefined) return resolved
        return nextResolve(specifier, context)
      }
    },
  })
  let active = true
  return () => {
    if (!active) return
    active = false
    hooks.deregister()
  }
}

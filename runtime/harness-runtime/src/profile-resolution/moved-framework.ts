/**
 * The framework packages that moved into `acrylblends` (spec 049 slice 17). An app plugin written before the move imports them by
 * their old names, which no longer resolve; there is no alias, because `@acryldev/router/middleware` maps to one subpath per middleware
 * and an alias would hide that. This module names what to import instead, and `movedFrameworkImports` registers a resolve hook
 * that adds it to the "cannot find package" error a boot would otherwise end on.
 *
 * @module @acryldev/harness-runtime/profile-resolution/moved-framework
 */

import type { ModuleHooks } from 'node:module'
import { registerModuleHooks } from '../module-hooks.ts'

/** Each old specifier and what replaces it. */
export const MOVED_FRAMEWORK_IMPORTS: Readonly<Record<string, string>> = Object.freeze({
  '@acryldev/router': "'acrylblends' (Acryl, Context and the types), 'acrylblends/http-exception' (HTTPException) and 'acrylblends/cordis/router' (the Cordis plugin, connectionOf, and the ctx.router type)",
  '@acryldev/router/middleware': "one subpath per middleware: 'acrylblends/body-limit', 'acrylblends/loopback-only', 'acrylblends/method-not-allowed', 'acrylblends/trailing-slash', 'acrylblends/bearer-auth' and the others under their names",
  '@acryldev/router/helpers': "'acrylblends/streaming' (streamSSE) and 'acrylblends/schema-validator' (schemaValidator)",
  '@acryldev/router-http': "'acrylblends/cordis/router-http'",
  '@acryldev/state': "'acrylblends/cordis/state'",
  '@acryldev/inspect': "'acrylblends/cordis/inspect'",
  '@acryldev/node-server': "'acrylblends/node-server' (serve) or 'acrylblends/cordis/node-server' (the Cordis plugin)",
  '@acryldev/door': "'acrylblends/cordis/door'",
  '@acryldev/door/protocol': "'acrylblends/door/protocol'",
  '@acryldev/door/host': "'acrylblends/door/host'",
  '@acryldev/door/page': "'acrylblends/door/page'",
  '@acryldev/db': "'acrylblends/db'",
  '@acryldev/db/cordis': "'acrylblends/cordis/db'",
  '@acryldev/db/conformance': "'acrylblends/db/conformance'",
  '@acryldev/db-sqlite': "'acrylblends/db/sqlite' or 'acrylblends/cordis/db-sqlite' (the Cordis plugin)",
  '@acryldev/kv': "'acrylblends/kv'",
  '@acryldev/kv-json': "'acrylblends/kv/json' or 'acrylblends/cordis/kv-json' (the Cordis plugin)",
  '@acryldev/kv-db': "'acrylblends/kv/db' or 'acrylblends/cordis/kv-db' (the Cordis plugin)",
})

/** What replaces an old framework import, or undefined for any other specifier. */
export function movedFrameworkImport(specifier: string): string | undefined {
  return MOVED_FRAMEWORK_IMPORTS[specifier]
}

/** The message for an old framework import that did not resolve. */
export function movedFrameworkMessage(specifier: string, original: string): string {
  return `${original}\n'${specifier}' is part of acrylblends since the framework moved to its own repository: import ${MOVED_FRAMEWORK_IMPORTS[specifier] ?? "from 'acrylblends'"} instead.`
}

/**
 * A resolve hook that names the replacement when an old framework import does not resolve. Registered after the profile's own
 * resolution, so it sees that resolution's failure; anything that resolves, and every other error, passes through unchanged.
 * @returns the hooks, for the caller to deregister with the resolution it wraps.
 */
export function registerMovedFrameworkImports(): ModuleHooks {
  return registerModuleHooks({
    resolve(specifier, context, nextResolve) {
      try {
        return nextResolve(specifier, context)
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (error instanceof Error && movedFrameworkImport(specifier) !== undefined && (code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND')) {
          error.message = movedFrameworkMessage(specifier, error.message)
        }
        throw error
      }
    },
  })
}

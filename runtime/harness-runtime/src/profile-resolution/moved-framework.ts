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
  '@acryldev/router': "'acrylblends' (Acryl, Context and the types), '@acryldev/blends/http-exception' (HTTPException) and '@acryldev/blends/cordis/router' (the Cordis plugin, connectionOf, and the ctx.router type)",
  '@acryldev/router/middleware': "one subpath per middleware: '@acryldev/blends/body-limit', '@acryldev/blends/loopback-only', '@acryldev/blends/method-not-allowed', '@acryldev/blends/trailing-slash', '@acryldev/blends/bearer-auth' and the others under their names",
  '@acryldev/router/helpers': "'@acryldev/blends/streaming' (streamSSE) and '@acryldev/blends/schema-validator' (schemaValidator)",
  '@acryldev/router-http': "'@acryldev/blends/cordis/router-http'",
  '@acryldev/state': "'@acryldev/blends/cordis/state'",
  '@acryldev/inspect': "'@acryldev/blends/cordis/inspect'",
  '@acryldev/node-server': "'@acryldev/blends/node-server' (serve) or '@acryldev/blends/cordis/node-server' (the Cordis plugin)",
  '@acryldev/door': "'@acryldev/blends/cordis/door'",
  '@acryldev/door/protocol': "'@acryldev/blends/door/protocol'",
  '@acryldev/door/host': "'@acryldev/blends/door/host'",
  '@acryldev/door/page': "'@acryldev/blends/door/page'",
  '@acryldev/db': "'@acryldev/blends/db'",
  '@acryldev/db/cordis': "'@acryldev/blends/cordis/db'",
  '@acryldev/db/conformance': "'@acryldev/blends/db/conformance'",
  '@acryldev/db-sqlite': "'@acryldev/blends/db/sqlite' or '@acryldev/blends/cordis/db-sqlite' (the Cordis plugin)",
  '@acryldev/kv': "'@acryldev/blends/kv'",
  '@acryldev/kv-json': "'@acryldev/blends/kv/json' or '@acryldev/blends/cordis/kv-json' (the Cordis plugin)",
  '@acryldev/kv-db': "'@acryldev/blends/kv/db' or '@acryldev/blends/cordis/kv-db' (the Cordis plugin)",
})

/** What replaces an old framework import, or undefined for any other specifier. */
export function movedFrameworkImport(specifier: string): string | undefined {
  return MOVED_FRAMEWORK_IMPORTS[specifier]
}

/** The message for an old framework import that did not resolve. */
export function movedFrameworkMessage(specifier: string, original: string): string {
  return `${original}\n'${specifier}' is part of acrylblends since the framework moved to its own repository: import ${MOVED_FRAMEWORK_IMPORTS[specifier] ?? "from '@acryldev/blends'"} instead.`
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

/*
 * Ported from DeepSeek Harness, packages/boot/app-boot/tests/hooks-thread-stack.ts at dsh-v0.2.0-rc.2 (639ed01539, MIT, Copyright (c) 2026 DeepSeek;
 * see THIRD_PARTY_NOTICES.md). Unchanged.
 */

/** Node resolver errors with the stack property that Node's module-hooks thread returns. */

import { registerHooks, type ModuleHooks } from 'node:module'

/**
 * Register a synchronous resolve hook that rethrows Node's resolver errors with the `stack` property an
 * asynchronous `module.register()` hook chain returns: Node serializes the error on its hooks thread, and the
 * main thread receives the stack accessor as a read-only configurable data property.
 * @returns the hook registration, which the test deregisters.
 */
export function registerHooksThreadStacks(): ModuleHooks {
  return registerHooks({
    resolve(specifier, context, nextResolve) {
      try {
        return nextResolve(specifier, context)
      } catch (error) {
        if (error instanceof Error) Object.defineProperty(error, 'stack', { value: error.stack, writable: false })
        throw error
      }
    },
  })
}

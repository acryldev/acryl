/**
 * The one way this runtime registers Node module hooks. Profile package routing (the overlay resolver and the DSH engine's profile
 * resolution) needs the public `module.registerHooks`; a Node or Electron build without it fails here with a message that names the
 * runtime, instead of a bare TypeError deep inside a boot.
 */

import Module, { type ModuleHooks, type RegisterHooksOptions } from 'node:module'

export class ModuleHooksUnavailableError extends Error {
  override readonly name = 'ModuleHooksUnavailableError'
}

/** The running Node, and the Electron around it when there is one, for a message. */
function runtimeName(): string {
  const electron = process.versions.electron
  return electron === undefined ? `Node ${process.versions.node}` : `Electron ${electron} (Node ${process.versions.node})`
}

/**
 * The public `module.registerHooks`, checked before a caller patches anything it would have to undo.
 * @throws {ModuleHooksUnavailableError} when this Node has none (it needs Node 22.15, 23.5 or newer).
 */
export function requireModuleHooks(): (options: RegisterHooksOptions) => ModuleHooks {
  // Read from the default export at call time, so a test can remove it and an older runtime reaches the message below.
  const register = (Module as { registerHooks?: (options: RegisterHooksOptions) => ModuleHooks }).registerHooks
  if (typeof register !== 'function') {
    throw new ModuleHooksUnavailableError(
      `DSH provider unavailable on ${runtimeName()}: profile packages load through module.registerHooks, which this runtime lacks `
      + '(Node 22.15, 23.5 or newer has it)',
    )
  }
  return register
}

/**
 * Register synchronous module hooks on Node's default loaders.
 * @throws {ModuleHooksUnavailableError} when this Node has no `module.registerHooks`.
 */
export function registerModuleHooks(options: RegisterHooksOptions): ModuleHooks {
  return requireModuleHooks()(options)
}

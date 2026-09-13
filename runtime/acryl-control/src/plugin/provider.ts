/**
 * The Cordis service every surface injects to inspect and steer plugins.
 *
 * The service publishes an existing {@link AcrPluginLifecycleController} on
 * `ctx.acrPluginLifecycle` for the fiber's lifetime. It takes the controller
 * rather than a host because publishing a capability and building the domain
 * object are different acts: a surface that also owns package-keyed
 * operations (Desktop's market bridge) needs the controller itself, and both
 * views must be the same object or their transitions stop sharing one queue.
 *
 * @module acryl-control/plugin/provider
 */

import { type Context, Service } from '@deepseek-ai/cordis'
import type { AcrPluginLifecycleController } from './controller.ts'
import type { PluginLifecycleHost } from './host.ts'
import type { PluginLifecycleReceipt, PluginLifecycleSnapshot } from './types.ts'

export type { PluginLifecycleHost }

/** The resolver-facing lifecycle API: list, enable or disable, reload. */
export interface AcrPluginLifecycle {
  snapshot(): PluginLifecycleSnapshot
  setEnabled(entryId: string, enabled: boolean): Promise<PluginLifecycleReceipt>
  reload(entryId?: string): Promise<PluginLifecycleReceipt>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    acrPluginLifecycle: AcrPluginLifecycle
  }
}

export class AcrPluginLifecycleService extends Service implements AcrPluginLifecycle {
  /**
   * The full controller, for a host that also owns package-keyed operations
   * (activating a just-installed bundle, a market's install/uninstall bridge).
   * Same instance the service delegates to, so both views never drift.
   */
  readonly controller: AcrPluginLifecycleController

  constructor(ctx: Context, controller: AcrPluginLifecycleController) {
    super(ctx, 'acrPluginLifecycle')
    this.controller = controller
  }

  snapshot(): PluginLifecycleSnapshot {
    return this.controller.snapshot()
  }

  setEnabled(entryId: string, enabled: boolean): Promise<PluginLifecycleReceipt> {
    return this.controller.setEnabled(entryId, enabled)
  }

  reload(entryId?: string): Promise<PluginLifecycleReceipt> {
    return this.controller.reload(entryId)
  }
}

export default AcrPluginLifecycleService

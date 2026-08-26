import { type Context, Service } from '@deepseek-ai/cordis'
import {
  AcrPluginLifecycleController,
  type AcrPluginLifecycleBootstrap,
  type PluginLifecycleReceipt,
  type PluginLifecycleSnapshot,
} from './controller.ts'

export type { AcrPluginLifecycleBootstrap, PluginLifecycleReceipt, PluginLifecycleSnapshot }

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
  private readonly controller: AcrPluginLifecycleController

  constructor(ctx: Context, bootstrap: AcrPluginLifecycleBootstrap) {
    super(ctx, 'acrPluginLifecycle')
    this.controller = new AcrPluginLifecycleController(ctx, bootstrap)
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

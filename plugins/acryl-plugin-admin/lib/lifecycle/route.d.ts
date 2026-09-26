/** Strict private loopback routes for plugin lifecycle inspection and mutation. */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { PluginLifecycleReceipt, PluginLifecycleSnapshot } from './contract.ts';
export interface PluginLifecycleRouteController {
    snapshot(): PluginLifecycleSnapshot;
    setEnabled(entryId: string, enabled: boolean): Promise<PluginLifecycleReceipt>;
    reload(entryId?: string): Promise<PluginLifecycleReceipt>;
}
/** Serve a current Host and Client-graph lifecycle snapshot. */
export declare function handlePluginLifecycleSnapshotRequest(req: IncomingMessage, res: ServerResponse, expectedOrigin: string, controller: PluginLifecycleRouteController, reportError?: (operation: string, cause: unknown) => void): Promise<void>;
export declare function handlePluginLifecycleEnableRequest(req: IncomingMessage, res: ServerResponse, expectedOrigin: string, controller: PluginLifecycleRouteController, reportError?: (operation: string, cause: unknown) => void): Promise<void>;
export declare function handlePluginLifecycleDisableRequest(req: IncomingMessage, res: ServerResponse, expectedOrigin: string, controller: PluginLifecycleRouteController, reportError?: (operation: string, cause: unknown) => void): Promise<void>;
/** Reload one managed entry or every mounted managed entry. */
export declare function handlePluginLifecycleReloadRequest(req: IncomingMessage, res: ServerResponse, expectedOrigin: string, controller: PluginLifecycleRouteController, reportError?: (operation: string, cause: unknown) => void): Promise<void>;

/** Strict private loopback route for the native Host Cordis architecture snapshot. */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { CordisPlaneSnapshot } from './contract.ts';
export interface PluginArchitectureRouteController {
    snapshot(): CordisPlaneSnapshot;
}
export declare function handlePluginArchitectureSnapshotRequest(req: IncomingMessage, res: ServerResponse, expectedOrigin: string, controller: PluginArchitectureRouteController, reportError?: (operation: string, cause: unknown) => void): Promise<void>;

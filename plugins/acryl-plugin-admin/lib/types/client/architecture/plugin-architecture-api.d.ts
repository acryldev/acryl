/** Client boundary joining separate native Host and renderer Cordis snapshots. */
import type { Context } from '@deepseek-ai/cordis';
import { type CordisPlane, type CordisPlaneSnapshot, type PluginArchitectureSnapshot } from '../../architecture/contract.ts';
type FetchLike = typeof globalThis.fetch;
export interface PluginArchitectureApi {
    read(): Promise<PluginArchitectureSnapshot>;
}
export declare function parseCordisPlaneSnapshot(value: unknown, expectedPlane: CordisPlane): CordisPlaneSnapshot;
/** Create a live two-plane inspector. Host is fetched; Client is projected locally. */
export declare function createPluginArchitectureApi(ctx: Context, fetcher?: FetchLike): PluginArchitectureApi;
export {};

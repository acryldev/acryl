/** Strict browser adapter for plugin lifecycle routes and Client Loader status. */
import type { FiberState } from '@deepseek-ai/cordis';
import type { PluginLifecycleBlendView, PluginLifecycleEntryView, PluginLifecycleFiberPhase, PluginLifecycleSnapshot } from '../../lifecycle/contract.ts';
export interface PluginLifecycleClientLoaderEntry {
    readonly options: {
        readonly name: string;
    };
    readonly fiber?: {
        readonly state: FiberState;
    };
}
export interface PluginLifecycleClientLoader {
    entries(): Iterable<PluginLifecycleClientLoaderEntry>;
}
export interface PluginLifecycleClientEntryView extends PluginLifecycleEntryView {
    readonly clientPhase: PluginLifecycleFiberPhase;
    readonly clientMounted: boolean;
}
export interface PluginLifecycleClientSnapshot {
    readonly entries: readonly PluginLifecycleClientEntryView[];
    readonly blend: PluginLifecycleBlendView | null;
}
export interface PluginLifecycleApi {
    read(): Promise<PluginLifecycleClientSnapshot>;
    enable(entryId: string): Promise<void>;
    disable(entryId: string): Promise<void>;
    reload(entryId?: string): Promise<void>;
}
type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export declare function parsePluginLifecycleSnapshot(value: unknown): PluginLifecycleSnapshot;
/** Create the lifecycle client with explicit fetch, Loader, and reload seams. */
export declare function createPluginLifecycleApi(loader: PluginLifecycleClientLoader, fetcher?: FetchLike, reloadPage?: () => void): PluginLifecycleApi;
export {};

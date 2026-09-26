/**
 * The renderer-facing view of the shared plugin lifecycle.
 *
 * The lifecycle itself (resolution, dependent cascade, transactions, rollback, Fiber restart, persistence)
 * is the one controller behind `ctx.acrPluginLifecycle` that every surface publishes. This adds only what
 * the Settings tab needs on top: whether each entry also has a browser face and whether that face is in the
 * page's boot graph, the Blend identity of the running composition when the surface has one, and the fact
 * that a mutation needs the page to reload to re-compose its client graph.
 */
import type { Context } from '@deepseek-ai/cordis';
import type { AcrPluginLifecycle, PluginLifecycleReceipt as SharedReceipt } from 'acryl-harness-runtime';
import type { PluginLifecycleReceipt, PluginLifecycleSnapshot } from './contract.ts';
import type { PluginLifecycleRouteController } from './route.ts';
/** The Blend a surface composed, when it has one (Desktop's launcher projects it; Web has none). */
export interface PluginLifecycleBlendSource {
    readonly origin: {
        readonly id: string;
        readonly kind: 'Blueprint' | 'Blend';
        readonly version: string;
        readonly digest: string;
    };
    readonly lockPath: string;
    readonly rows: readonly unknown[];
}
export declare class PluginLifecycleView implements PluginLifecycleRouteController {
    private readonly ctx;
    private readonly lifecycle;
    private readonly blend;
    private readonly clientFaces;
    private readonly resolvePackageJson;
    /**
     * @param ctx - the Host context, read for the client module graph and the base URL packages resolve from.
     * @param lifecycle - the surface's `ctx.acrPluginLifecycle` authority.
     * @param blend - reads the composed Blend, or `undefined` on a surface without one.
     */
    constructor(ctx: Context, lifecycle: AcrPluginLifecycle, blend?: () => PluginLifecycleBlendSource | undefined);
    /** Every non-group Host entry with its current client-graph membership. */
    snapshot(): PluginLifecycleSnapshot;
    /** Persist and apply one managed entry's enablement, dependents included. */
    setEnabled(entryId: string, enabled: boolean): Promise<PluginLifecycleReceipt>;
    /** Restart one entry, or every enabled entry the surface's lifecycle sweeps. */
    reload(entryId?: string): Promise<PluginLifecycleReceipt>;
    private blendView;
    private clientPackage;
    /** The Host fiber already restarted; the page must reload to re-compose its client graph. */
    receipt(receipt: SharedReceipt): PluginLifecycleReceipt;
}

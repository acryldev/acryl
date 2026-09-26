/**
 * Cordis Host plugin: the private routes behind Settings > Plugins > Lifecycle and Architecture, for every
 * surface. Nothing here is Desktop or Web specific.
 *
 * - The architecture route needs only the web server: it projects the live Cordis graph.
 * - The lifecycle routes are a dependency-gated child that mounts when a surface has published
 *   `ctx.acrPluginLifecycle` (both Desktop and Web do) and unmounts, without failing this plugin, when
 *   that service goes away.
 */
import type { Context } from '@deepseek-ai/cordis';
export declare const name = "acryl-plugin-admin";
export declare const inject: string[];
export declare function apply(ctx: Context): void;
export { PluginLifecycleView } from './lifecycle/view.ts';
export type { PluginLifecycleBlendSource } from './lifecycle/view.ts';
export type { PluginLifecycleBlendView, PluginLifecycleEntryView, PluginLifecycleFiberPhase, PluginLifecycleReceipt, PluginLifecycleSnapshot, } from './lifecycle/contract.ts';

/**
 * Cordis Client plugin: Settings > Plugins > Architecture and Lifecycle tabs, for every surface.
 *
 * It contributes two `settings.plugins.tab` entries and owns their dictionaries and styles, each inside one
 * effect. It talks to its Host half over the private same-origin routes and never assumes a surface.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
export declare const name = "acryl-plugin-admin-client";
/** `slots` for the tab contributions, `locale` for their dictionaries. */
export declare const inject: string[];
export declare function apply(ctx: ClientContext): void;
export { PluginArchitectureSettingsTab } from './architecture/PluginArchitectureSettingsTab.tsx';
export type { PluginArchitectureSettingsTabInjected, PluginArchitectureSettingsTabProps, } from './architecture/PluginArchitectureSettingsTab.tsx';
export { PluginLifecycleSettingsTab } from './lifecycle/PluginLifecycleSettingsTab.tsx';
export type { PluginLifecycleSettingsTabInjected, PluginLifecycleSettingsTabProps, } from './lifecycle/PluginLifecycleSettingsTab.tsx';
export { createPluginArchitectureApi, parseCordisPlaneSnapshot, } from './architecture/plugin-architecture-api.ts';
export type { PluginArchitectureApi } from './architecture/plugin-architecture-api.ts';
export { createPluginLifecycleApi, parsePluginLifecycleSnapshot, } from './lifecycle/plugin-lifecycle-api.ts';
export type { PluginLifecycleApi, PluginLifecycleClientEntryView, PluginLifecycleClientSnapshot, } from './lifecycle/plugin-lifecycle-api.ts';
export { applyPluginLifecycleSettings } from './lifecycle/plugin-lifecycle-settings.ts';

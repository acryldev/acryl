import type { ReactNode } from 'react';
import type { PluginArchitectureApi } from './plugin-architecture-api.ts';
import type { PluginLifecycleLocaleKey } from '../lifecycle/plugin-lifecycle-locales.ts';
export interface PluginArchitectureSettingsTabInjected {
    readonly api: PluginArchitectureApi;
}
export type PluginArchitectureSettingsTabProps = PluginArchitectureSettingsTabInjected & {
    readonly t: (key: PluginLifecycleLocaleKey) => string;
};
/** Read-only explorer over the two actual Cordis contexts. */
export declare function PluginArchitectureSettingsTab({ api, t }: PluginArchitectureSettingsTabProps): ReactNode;

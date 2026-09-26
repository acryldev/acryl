import { type ReactNode } from 'react';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { PluginLifecycleApi } from './plugin-lifecycle-api.ts';
export interface PluginLifecycleSettingsTabInjected {
    readonly api: PluginLifecycleApi;
}
export type PluginLifecycleSettingsTabProps = PropsRuntime<'settings.plugins.tab'> & PropsLocale<'acryl.pluginAdmin'> & InjectFace<PluginLifecycleSettingsTabInjected>;
export declare function PluginLifecycleSettingsTab({ api, t }: PluginLifecycleSettingsTabProps): ReactNode;

/** Lifecycle and Architecture tabs contribution for the Plugins Settings section. */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import { type PluginLifecycleLocaleKey } from './plugin-lifecycle-locales.ts';
export declare const PLUGIN_LIFECYCLE_LOCALE_NAMESPACE = "acryl.pluginAdmin";
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        'acryl.pluginAdmin': PluginLifecycleLocaleKey;
    }
}
/** Register the lifecycle page between configurable settings and read-only inventory. */
export declare function applyPluginLifecycleSettings(ctx: ClientContext): void;

import type { Context as ClientContext } from '@deepseek-ai/cordis';
import '@deepseek-ai/dsh-client-ui-renderer/client';
import type { ReactNode } from 'react';
import type { ShellEnvironment } from './environment.ts';
/** Optional wrappers a domain plugin's own call site supplies - see `AdvancedFrameInjected`. Neither key
 * is ever required: a Blend that needs no extra chrome around its main or details column passes nothing. */
export interface AdvancedShellHooks {
    readonly wrapMain?: (content: ReactNode) => ReactNode;
    readonly wrapRightbar?: (content: ReactNode) => ReactNode;
}
/**
 * Claim the three-column desktop/web app frame for this plugin's own UI: register `desktop.main` and
 * `desktop.sidebar` (falling back to the unchanged upstream chat and sidebar until something replaces
 * them), mount the layout service, theme presenter and chrome styles, and own the `root` slot that
 * composes everything into `AdvancedFrame`. Call once, from the plugin that is this Blend's main-surface
 * owner (the IDE's `plugins/acryl-workspace`, or a domain plugin like a GTD or accounting Blend) - never
 * from more than one plugin in the same program, since `root` is a single slot.
 * @param ctx - active browser Cordis context.
 * @param environment - validated mode and platform marker (`resolveShellEnvironment`).
 * @param hooks - optional column wrappers (a terminal dock, or anything else a caller wants beneath/beside
 * the main or details column); this package has no opinion on what they wrap.
 */
export declare function applyAdvancedShell(ctx: ClientContext, environment: ShellEnvironment, hooks?: AdvancedShellHooks): void;

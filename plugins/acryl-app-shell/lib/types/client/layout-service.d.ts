import type { Context as ClientContext } from '@deepseek-ai/cordis';
import type { DesktopLayoutState } from './layout-state.ts';
/**
 * Provide the advanced layout service for one plugin-fiber lifetime.
 * @param ctx - active browser Cordis context.
 * @param layout - desktop-owned layout implementation.
 * @returns disposer for the service registration.
 */
export declare function provideDesktopLayout(ctx: ClientContext, layout: DesktopLayoutState): () => void;

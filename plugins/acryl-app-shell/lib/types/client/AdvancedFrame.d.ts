import { type ReactNode } from 'react';
import type { PropsRenderSlots, PropsRuntime } from '@acryl/ui/frame';
import type { ShellPlatform } from './environment.ts';
import { DesktopLayoutState } from './layout-state.ts';
/** Private values assembled by the advanced-shell registration. */
export interface AdvancedFrameInjected {
    /** Desktop-owned panel state exposed through the standard layout service. */
    layout: DesktopLayoutState;
    /** Host platform controlling native title-bar spacing. */
    platform: ShellPlatform;
    /** Wraps the main column's rendered content (e.g. a terminal dock the IDE adds beneath it); the plain
     * content unchanged when absent. A domain plugin that needs no extra chrome around its main surface
     * never passes this - this package has no concept of what a "dock" is, only that a caller may want to
     * wrap the column. */
    wrapMain?: (content: ReactNode) => ReactNode;
    /** Wraps the right/details column's rendered content, the same way as `wrapMain`. */
    wrapRightbar?: (content: ReactNode) => ReactNode;
}
/** Full advanced root slot props. */
export type AdvancedFrameProps = PropsRuntime<'root'> & PropsRenderSlots<'desktop.main' | 'desktop.sidebar' | 'sidebar' | 'main' | 'rightbar' | 'shell.overlay' | 'shell.leading'> & AdvancedFrameInjected;
/** Desktop-owned transparent frame around the unchanged product surfaces. */
export declare function AdvancedFrame({ layout, platform, wrapMain, wrapRightbar, renderSlot }: AdvancedFrameProps): import("react").JSX.Element;

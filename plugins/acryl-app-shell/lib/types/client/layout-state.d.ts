/**
 * Desktop frame layout state and column math.
 *
 * This follows the upstream DSH `AppFrame` (`@deepseek-ai/dsh-client-ui-layout`), which the advanced
 * shell replaces: a right panel that docks beside the conversation when there is room and goes
 * fullscreen when there is not, reported back by the panel through `ctx.layout.openRightbar(track,
 * fullscreen)` and `closeRightbar()`. Diverging from that protocol leaves the right sidebar with no
 * way to open.
 */
import type { ILayout, MainPanelId, PanelInfo } from '@deepseek-ai/dsh-client-ui-layout/client';
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots';
export interface DesktopLayoutSnapshot {
    /** Sidebar width preference in px; 0 means collapsed to the rail. */
    sidebar: number;
    /** Right panel width preference in px; 0 means unset (it then defaults to 45% of the viewport). */
    details: number;
    narrow: boolean;
    narrowExpanded: boolean;
    /** The panel reports it is open. */
    detailsShown: boolean;
    /** The panel wants its own column (docked), rather than covering the window. */
    detailsTrack: boolean;
    detailsFullscreen: boolean;
}
export interface DesktopColumns {
    sidebar: number;
    center: number;
    details: number;
}
export declare const SIDEBAR_COLLAPSED = 56;
export declare const MACOS_SIDEBAR_COLLAPSED = 90;
export declare const SIDEBAR_DEFAULT = 280;
export declare const SIDEBAR_MIN = 264;
export declare const SIDEBAR_MAX = 420;
export declare const SIDEBAR_AUTO_COLLAPSE = 1024;
export declare const DETAILS_MIN = 300;
/** The right panel may take at most this share of the window. */
export declare const DETAILS_MAX_RATIO = 0.7;
/** First-open width of the right panel, as a share of the window. */
export declare const DETAILS_DEFAULT_RATIO = 0.45;
/** Width protected for the conversation while the right panel is docked. */
export declare const CENTER_MIN = 400;
/**
 * Solve the three column widths for one frame width.
 * @param viewport - available frame width in px.
 * @param sidebar - sidebar width preference in px (0 = collapsed to the rail).
 * @param details - requested right panel width in px (0 = no track).
 * @param collapsedWidth - rail width, which differs per platform.
 * @returns actual widths. The right track shrinks to fit or is removed; only without it may the
 * center fall below its minimum.
 */
export declare function computeDesktopColumns(viewport: number, sidebar: number, details: number, collapsedWidth?: number): DesktopColumns;
/** What the frame decided for one width and panel state. */
export interface FrameSolution {
    readonly narrow: boolean;
    /** The sidebar is showing only its rail. */
    readonly collapsed: boolean;
    /** The room the right panel would have if docked now. This is what the panel is told. */
    readonly normal: DesktopColumns;
    /** The columns the grid actually gets. */
    readonly columns: DesktopColumns;
    /** Props for the `rightbar` slot: it decides between docked, fullscreen and closed from these. */
    readonly rightbar: {
        readonly width: number;
        readonly viewportWidth: number;
        readonly canShow: boolean;
    };
}
/**
 * The frame's whole layout decision, as in upstream DSH: two solves, one for the room the panel
 * would have if docked (reported to it) and one for the columns actually laid out.
 */
export declare function solveFrame(viewport: number, panels: DesktopLayoutSnapshot, railWidth: number): FrameSolution;
/**
 * ACRYL's frame state. It is the layout service of the page in advanced mode, so it implements DSH 0.2's whole `ILayout`: besides the
 * panel transitions it reports which keyed `main` panel (settings, plugin manager, ...) is open (`panelInfo`/`selectPanel`) and hands
 * out navigation abort signals (`beginNavigation`), which upstream's sidebars and session views call.
 */
export declare class DesktopLayoutState implements ILayout {
    private snapshot;
    private readonly listeners;
    private viewport;
    private panel;
    private readonly panelListeners;
    private navigation;
    /** Which keyed `main` panel is open; `null` means the ACRYL main surface (the canvas, or the conversation). */
    readonly panelInfo: HostObservable<PanelInfo>;
    selectPanel(panelId: MainPanelId | null): void;
    /** Cancels the previous navigation and returns the signal of the new one. */
    beginNavigation(): AbortSignal;
    getSnapshot(): DesktopLayoutSnapshot;
    subscribe(listener: () => void): () => void;
    /** Report the frame width, which the default and the limits of the right panel depend on. */
    setViewport(width: number): void;
    toggleSidebar(): void;
    setNarrow(narrow: boolean): void;
    /**
     * The right panel reports it is open, and how it is presented. Called by the right sidebar
     * through `ctx.layout`; the frame then gives it a column (`track`) or lets it cover the window.
     */
    openRightbar(track: boolean, fullscreen: boolean): void;
    closeRightbar(): void;
    /** Compatibility name for {@link openRightbar} as a docked panel. */
    openDetails(): void;
    /** Compatibility name for {@link closeRightbar}. */
    closeDetails(): void;
    setSidebar(width: number): void;
    setDetails(width: number): void;
    private publish;
}

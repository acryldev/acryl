/**
 * Native window chrome the shell leaves room for, in CSS pixels. Only the Electron platforms have any;
 * on Web and Linux the frame reserves nothing. These are the same numbers Electron's main process uses to
 * size the title-bar overlay (`apps/acryl-desktop/src/shell/window-chrome.ts`), and a test compares the two
 * files so they cannot drift.
 */

/** Height reserved above the macOS sidebar content. */
export const MACOS_TITLEBAR_HEIGHT = 20

/** Height of the macOS native drag hit regions. */
export const MACOS_DRAG_REGION_HEIGHT = 32

/** Width reserved for the macOS traffic lights before the empty drag strip. */
export const MACOS_TRAFFIC_LIGHT_SAFE_WIDTH = 80

/** Windows title-bar overlay height. */
export const WINDOWS_TITLEBAR_HEIGHT = 32

/** Width reserved for the three native Windows caption controls. */
export const WINDOWS_CAPTION_CONTROLS_WIDTH = 138

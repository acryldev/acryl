/**
 * The desktop app's Settings menu item. An app that serves a `/settings` page gets a "Settings..." item that opens it in a window (Cmd+, on macOS, Ctrl+, elsewhere); an app without
 * the page gets nothing. Where the item goes is decided here, from the labels of the application menu Electron built, so it is tested without Electron.
 */

/** The part of an Electron menu item this file reads. */
export interface MenuNode {
  readonly label: string
  readonly role?: string | undefined
  readonly type?: string | undefined
  readonly submenu?: { readonly items: readonly MenuNode[] } | null | undefined
}

export interface Placement {
  /** Index of the top-level menu that gets the item. */
  readonly menu: number
  /** Index inside that menu to insert at. */
  readonly at: number
  /** Whether a separator goes after the item (so it sits in a group of its own). */
  readonly separatorAfter: boolean
}

/**
 * macOS puts Settings in the application menu, under About; elsewhere it is the first item of the File menu. Returns nothing when the menu has neither place (an app that
 * replaced Electron's menu with its own keeps its own).
 */
export function settingsPlacement(
  items: readonly MenuNode[],
  platform: NodeJS.Platform,
): Placement | undefined {
  if (platform === 'darwin') {
    const submenu = items[0]?.submenu?.items
    if (submenu === undefined || submenu === null) return undefined
    const about = submenu.findIndex(
      (item) => item.role === 'about' || /^about\b/iu.test(item.label),
    )
    // Under About and the separator after it; first when there is no About.
    const separator =
      about === -1
        ? -1
        : submenu.findIndex((item, index) => index > about && item.type === 'separator')
    return {
      menu: 0,
      at: separator === -1 ? (about === -1 ? 0 : about + 1) : separator + 1,
      separatorAfter: true,
    }
  }
  const file = items.findIndex((item) => /^&?file$/iu.test(item.label) || item.role === 'fileMenu')
  if (file === -1 || items[file]?.submenu == null) return undefined
  return { menu: file, at: 0, separatorAfter: true }
}

/** Whether a menu already has a Settings item (so a restart that builds the menu twice adds it once). */
export function hasSettings(items: readonly MenuNode[]): boolean {
  return items.some(
    (item) =>
      /^settings\b|^preferences\b/iu.test(item.label) ||
      (item.submenu?.items !== undefined && hasSettings(item.submenu.items)),
  )
}

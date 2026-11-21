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

/**
 * Windows and Linux have no application menu, so nothing there says which version runs (macOS has the About panel). Returns the index of the Help menu, where
 * "About <name>" goes last, or nothing on macOS, in a menu with no Help, or in one that already has an About item.
 */
export function aboutPlacement(
  items: readonly MenuNode[],
  platform: NodeJS.Platform,
): number | undefined {
  if (platform === 'darwin') return undefined
  const help = items.findIndex((item) => item.role === 'help' || /^&?help$/iu.test(item.label))
  if (help === -1 || items[help]?.submenu == null) return undefined
  const entries = items[help].submenu.items
  return entries.some((item) => item.role === 'about' || /^about\b/iu.test(item.label))
    ? undefined
    : help
}

/**
 * What the About dialog says: the product's version (a packed app's own; an app run from its folder has none, and Electron's is never shown as it),
 * the Blend's version and the ACRYL Blends framework's, then the runtime it runs on (what a bug report needs).
 */
export function aboutText(
  name: string,
  app: { readonly product?: string; readonly blend?: string; readonly framework?: string },
  versions: Readonly<Record<string, string | undefined>>,
): { readonly message: string; readonly detail: string } {
  const own = [
    ...(app.product === undefined ? [] : [`Version ${app.product}`]),
    ...(app.blend === undefined ? [] : [`Blend ${app.blend}`]),
    ...(app.framework === undefined ? [] : [`ACRYL Blends ${app.framework}`]),
  ]
  const runtime = (['electron', 'chrome', 'node'] as const)
    .filter((key) => versions[key] !== undefined)
    .map(
      (key) =>
        `${key === 'chrome' ? 'Chromium' : key === 'node' ? 'Node.js' : 'Electron'} ${versions[key]}`,
    )
  return { message: name, detail: [...own, ...runtime].join('\n') }
}

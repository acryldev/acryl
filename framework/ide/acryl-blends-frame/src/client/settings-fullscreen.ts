/**
 * Whether DSH's Settings window fills the browser window, and the browser's memory of it. The window itself is DSH's; the frame only marks the body
 * (`data-bf-settings-full`, which styles.ts and graph-styles.ts read) and keeps the choice, so the next time Settings opens it opens the same way.
 */

export const SETTINGS_FULL_ATTRIBUTE = 'data-bf-settings-full'
export const SETTINGS_FULL_KEY = 'acrylBlends.settingsFull'

type Store = Pick<Storage, 'getItem' | 'setItem'>

function browserStore(): Store | undefined {
  try {
    return window.localStorage
  } catch {
    // Storage blocked (private window, site data off): the choice is simply not remembered.
    return undefined
  }
}

/** The remembered choice; false when nothing is remembered or the storage cannot be read. */
export function readSettingsFull(store: Store | undefined = browserStore()): boolean {
  try {
    return store?.getItem(SETTINGS_FULL_KEY) === '1'
  } catch {
    return false
  }
}

export function writeSettingsFull(full: boolean, store: Store | undefined = browserStore()): void {
  try {
    store?.setItem(SETTINGS_FULL_KEY, full ? '1' : '0')
  } catch {
    // Not remembered; the window still changes size.
  }
}

/** Mark (or unmark) the body so the Settings window styles take effect. */
export function markSettingsFull(full: boolean, body: HTMLElement = document.body): void {
  if (full) body.setAttribute(SETTINGS_FULL_ATTRIBUTE, '')
  else body.removeAttribute(SETTINGS_FULL_ATTRIBUTE)
}

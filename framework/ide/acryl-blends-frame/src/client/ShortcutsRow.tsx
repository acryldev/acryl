/**
 * Settings > General's short list of shortcuts (docs/design/blends-frame-mockup.html: "General, with a short list of shortcuts"): the keys that are
 * set, read from DSH's shortcut service, and the frame's own Find a file. Changing a key is DSH's "Edit shortcuts" dialog; the IDE's full Shortcuts
 * section is not part of the frame.
 */

import { useSyncExternalStore } from 'react'
import type { ShortcutCatalogEntry, Shortcuts } from '@acryl/ui/frame'

export interface ShortcutsRowInjected {
  readonly shortcuts: Shortcuts
}

/** How many of the app's shortcuts the list shows. */
const SHOWN = 6

/** The frame's own key: Files with its search (`index.ts`, the quick-open effect). */
const FIND_A_FILE = { id: 'acryl-blends-frame.find-file', label: 'Find a file', keys: [navigator.platform.startsWith('Mac') ? '⌘' : 'Ctrl', 'P'] }

export function shortcutList(catalog: readonly ShortcutCatalogEntry[]): { readonly id: string; readonly label: string; readonly keys: readonly string[] }[] {
  return [FIND_A_FILE, ...catalog.filter(entry => entry.keys.length > 0 && entry.conflicts.length === 0).slice(0, SHOWN - 1)]
}

export function ShortcutsRow({ shortcuts }: ShortcutsRowInjected) {
  // DSH's store types arrive as unknown under NodeNext (acryl-shortcuts says the same); the snapshot is stated here.
  const catalog = useSyncExternalStore(shortcuts.catalog.subscribe, shortcuts.catalog.getSnapshot) as readonly ShortcutCatalogEntry[]
  return (
    <div className="acrylBlendsShortcuts">
      <div className="acrylBlendsShortcutsTitle">Shortcuts</div>
      <ul>
        {shortcutList(catalog).map(item => (
          <li key={item.id}>
            <span>{item.label}</span>
            <span className="acrylBlendsShortcutsKeys">{item.keys.map((key, index) => <kbd key={`${String(index)}${key}`}>{key}</kbd>)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

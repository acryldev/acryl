/** Styles for Settings > Shortcuts, installed for the plugin's lifetime. */

const CSS = `
.acrylShortcuts { display: grid; gap: 12px; min-width: 0; padding: 4px 0 28px; color: var(--dsw-alias-label-primary); font: 13px/1.5 ui-sans-serif, system-ui, sans-serif; }
.acrylShortcutsHead { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.acrylShortcutsTitle { margin: 0; font-size: 15px; font-weight: 600; }
.acrylShortcutsText { margin: 0; color: var(--dsw-alias-label-secondary, inherit); }
.acrylShortcutsSearch { box-sizing: border-box; width: 100%; padding: 7px 10px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: transparent; color: inherit; font: inherit; }
.acrylShortcutsSearch:focus { outline: none; border-color: #4d6bfe; }
.acrylShortcutsGroup { display: grid; gap: 6px; }
.acrylShortcutsGroupTitle { margin: 6px 0 0; color: var(--dsw-alias-label-secondary, inherit); font-size: 12px; font-weight: 600; }
.acrylShortcutsList { display: grid; margin: 0; padding: 0; list-style: none; border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; }
.acrylShortcutsRow { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; min-height: 40px; padding: 4px 8px 4px 12px; }
.acrylShortcutsRow + .acrylShortcutsRow { border-top: 1px solid var(--dsw-alias-border-l1); }
.acrylShortcutsName { flex: 1 1 200px; min-width: 0; }
.acrylShortcutsRow[data-modified] .acrylShortcutsName::after { content: ' (changed)'; color: var(--dsw-alias-label-secondary, inherit); font-size: 12px; }
.acrylShortcutsControls { display: flex; align-items: center; gap: 6px; margin-left: auto; }
.acrylShortcutsKeys { appearance: none; display: inline-flex; align-items: center; justify-content: flex-end; gap: 3px; box-sizing: border-box; min-width: 132px; min-height: 28px; padding: 2px 8px; border: 1px solid transparent; border-radius: 8px; background: transparent; color: inherit; cursor: pointer; font: inherit; font-size: 12px; }
button.acrylShortcutsKeys:hover { border-color: var(--dsw-alias-border-l1); }
.acrylShortcutsKeys[aria-pressed="true"] { border-color: #4d6bfe; background: color-mix(in srgb, #4d6bfe 16%, transparent); }
.acrylShortcutsKeys[data-fixed] { cursor: default; opacity: 0.8; }
.acrylShortcutsKeys kbd { display: inline-grid; place-items: center; min-width: 20px; height: 22px; padding: 0 5px; border-radius: 5px; background: var(--dsw-alias-fill-hover, rgb(127 127 127 / 14%)); font: 12px ui-sans-serif, system-ui, sans-serif; }
.acrylShortcutsNone { color: var(--dsw-alias-label-secondary, inherit); }
.acrylShortcutsAction { appearance: none; padding: 3px 9px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 7px; background: transparent; color: var(--dsw-alias-label-secondary, inherit); cursor: pointer; font: inherit; font-size: 12px; }
.acrylShortcutsAction:hover { border-color: #4d6bfe; color: var(--dsw-alias-label-primary); }
/* A row's Clear and Reset only while it is pointed at or focused, so the list reads as names and keys. */
.acrylShortcutsRow .acrylShortcutsAction { visibility: hidden; }
.acrylShortcutsRow:hover .acrylShortcutsAction, .acrylShortcutsRow:focus-within .acrylShortcutsAction { visibility: visible; }
.acrylShortcutsProblem { flex-basis: 100%; color: #f87171; font-size: 12px; }
`

/** @returns disposer, for one owning `ctx.effect`. */
export function installShortcutsStyles(): () => void {
  const style = document.createElement('style')
  style.id = 'acryl-shortcuts-styles'
  style.textContent = CSS
  document.head.appendChild(style)
  return () => { style.remove() }
}

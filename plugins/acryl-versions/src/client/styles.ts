/** Styles for the Versions section, installed for the plugin's lifetime. */

const STYLE_ID = 'acryl-versions-styles'

const CSS = `
.acrylVersionsSection { display: grid; gap: 10px; padding: 4px 0 24px; color: var(--dsw-alias-label-primary); }
.acrylVersionsHeading { margin: 0; font: 600 15px/1.3 ui-sans-serif, system-ui, sans-serif; }
.acrylVersionsMeta, .acrylVersionsEmpty, .acrylVersionsNote { margin: 0; font: 13px/1.5 ui-sans-serif, system-ui, sans-serif; color: var(--dsw-alias-label-secondary, inherit); }
.acrylVersionsMeta { display: flex; gap: 8px; flex-wrap: wrap; font-size: 12.5px; }
.acrylVersionsBranch { font-weight: 600; }
.acrylVersionsEmpty { opacity: 0.8; }
.acrylVersionsNote[data-error] { color: #f87171; }
.acrylVersionsSave { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.acrylVersionsInput { flex: 1 1 180px; min-width: 120px; padding: 6px 10px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: transparent; color: inherit; font: 13px/1.4 ui-sans-serif, system-ui, sans-serif; }
.acrylVersionsButton { padding: 6px 14px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: transparent; color: inherit; cursor: pointer; font: 13px/1.4 ui-sans-serif, system-ui, sans-serif; }
.acrylVersionsButton:hover:not(:disabled) { border-color: #4d6bfe; color: #4d6bfe; }
.acrylVersionsButton:disabled { opacity: 0.55; cursor: default; }
.acrylVersionsList { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
.acrylVersionsItem { display: grid; gap: 4px; padding: 8px 10px; border: 1px solid transparent; border-radius: 8px; }
.acrylVersionsItem:hover { border-color: var(--dsw-alias-border-l1); }
.acrylVersionsItem[data-current] { background: var(--dsw-alias-bg-l1, transparent); }
.acrylVersionsLine { display: flex; align-items: center; gap: 8px; min-width: 0; }
.acrylVersionsHash { flex: none; padding: 1px 5px; border-radius: 4px; background: var(--dsw-alias-bg-l2, transparent); font: 11.5px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
.acrylVersionsSubject { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 13px/1.5 ui-sans-serif, system-ui, sans-serif; }
.acrylVersionsDetail { font: 12px/1.4 ui-sans-serif, system-ui, sans-serif; color: var(--dsw-alias-label-secondary, inherit); }
.acrylVersionsCurrent { padding: 1px 6px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l1); font-size: 11px; }
.acrylVersionsRestore { margin-left: auto; padding: 3px 10px; font-size: 12px; }
`

/** @returns disposer, for one owning `ctx.effect`. */
export function installVersionsStyles(): () => void {
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
  return () => { style.remove() }
}

/** Styles for the Support settings section, installed for the plugin's lifetime. */

const STYLE_ID = 'acryl-support-styles'

const CSS = `
.dshSupportSection { display: grid; gap: 10px; padding: 4px 0 24px; color: var(--dsw-alias-label-primary); }
.dshSupportHeading { margin: 0; font: 600 15px/1.3 ui-sans-serif, system-ui, sans-serif; }
.dshSupportText, .dshSupportFine { margin: 0; font: 13px/1.5 ui-sans-serif, system-ui, sans-serif; color: var(--dsw-alias-label-secondary, inherit); }
.dshSupportFine { font-size: 12px; opacity: 0.8; }
.dshSupportActions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.dshSupportButton { padding: 6px 14px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: transparent; color: inherit; cursor: pointer; font: 13px/1.4 ui-sans-serif, system-ui, sans-serif; }
.dshSupportButton:hover:not(:disabled) { border-color: #4d6bfe; color: #4d6bfe; }
.dshSupportButton:disabled { opacity: 0.55; cursor: default; }
.dshSupportNote { font: 12.5px/1.4 ui-sans-serif, system-ui, sans-serif; }
.dshSupportNote[data-error] { color: #f87171; }
`

/** @returns disposer, for one owning `ctx.effect`. */
export function installSupportStyles(): () => void {
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
  return () => { style.remove() }
}

/** Styles for the account sign-in card, installed for the plugin's lifetime. */

const STYLE_ID = 'acryl-sign-in-styles'

const CSS = `
.acrylSignIn { display: grid; gap: 10px; margin-top: 20px; padding: 16px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 12px; color: var(--dsw-alias-label-primary); font: 13px/1.5 ui-sans-serif, system-ui, sans-serif; }
.acrylSignInHeading { margin: 0; font-size: 14px; font-weight: 600; }
.acrylSignInText { margin: 0; color: var(--dsw-alias-label-secondary, inherit); }
.acrylSignInRow { display: flex; align-items: center; gap: 12px; min-height: 36px; }
.acrylSignInName { display: grid; flex: 1; min-width: 0; }
.acrylSignInName strong { font-weight: 600; }
.acrylSignInName span { color: var(--dsw-alias-label-secondary, inherit); font-size: 12px; }
.acrylSignInState { color: #22a06b; font-size: 12px; white-space: nowrap; }
.acrylSignInButton { padding: 5px 12px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: transparent; color: inherit; cursor: pointer; font: inherit; white-space: nowrap; }
.acrylSignInButton:hover:not(:disabled) { border-color: #4d6bfe; color: #4d6bfe; }
.acrylSignInButton:disabled { opacity: 0.55; cursor: default; }
.acrylSignInButton[data-primary] { border-color: #4d6bfe; background: #4d6bfe; color: #fff; }
.acrylSignInButton[data-primary]:hover:not(:disabled) { color: #fff; opacity: 0.9; }
.acrylSignInSelect, .acrylSignInInput { flex: 1; min-width: 0; padding: 5px 8px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: transparent; color: inherit; font: inherit; }
.acrylSignInSelect option { color: initial; }
.acrylSignInFlow { display: grid; gap: 8px; margin: 2px 0 6px; padding: 12px; border-radius: 10px; background: var(--dsw-alias-fill-l1, rgba(127, 127, 127, 0.08)); }
.acrylSignInFlowTitle { margin: 0; font-weight: 600; }
.acrylSignInActions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.acrylSignInNote { font-size: 12.5px; color: var(--dsw-alias-label-secondary, inherit); }
.acrylSignInNote[data-error] { color: #f87171; }
.acrylSignInOptions { display: grid; gap: 6px; }
`

/** @returns disposer, for one owning `ctx.effect`. */
export function installSignInStyles(): () => void {
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
  return () => { style.remove() }
}

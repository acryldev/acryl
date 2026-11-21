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

.acrylConnectBackdrop { position: fixed; inset: 0; z-index: 2147483000; display: grid; place-items: center; padding: 16px; background: rgba(0, 0, 0, 0.45); }
.acrylConnect { display: grid; gap: 14px; width: min(760px, 100%); max-height: calc(100dvh - 32px); overflow-y: auto; padding: 24px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 16px; background: var(--dsw-alias-bg-base, #fff); color: var(--dsw-alias-label-primary); font: 14px/1.5 ui-sans-serif, system-ui, sans-serif; box-shadow: 0 24px 60px -20px rgba(0, 0, 0, 0.6); }
.acrylConnectTitle { margin: 0; font-size: 20px; line-height: 28px; font-weight: 500; }
.acrylConnectModels { min-width: 0; }
.acrylConnectFoot { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
.acrylConnectHint { color: var(--dsw-alias-label-secondary, inherit); font-size: 12.5px; }

.acrylTurnFailure { display: grid; grid-template-columns: 10px minmax(0, 1fr) auto; gap: 8px; align-items: start; padding: 2px 0; font-size: var(--dsh-content-font-size-secondary, 13px); line-height: calc(20px + var(--dsh-content-font-delta-secondary, 0px)); }
.acrylTurnFailureDot { width: 6px; height: 6px; margin: 7px 0 0 2px; border-radius: 50%; background: var(--dsw-alias-state-error-primary, #f87171); }
.acrylTurnFailureCopy { min-width: 0; overflow-wrap: anywhere; }
.acrylTurnFailureTitle { margin-right: 6px; color: var(--dsw-alias-state-error-primary, #f87171); font-weight: 600; }
.acrylTurnFailureText { color: var(--dsw-alias-label-secondary, inherit); }
.acrylTurnFailure a { color: var(--dsw-alias-label-link, #4d6bfe); text-decoration: underline; cursor: pointer; }
.acrylTurnFailureHint { margin: 4px 0 0; color: var(--dsw-alias-label-primary, inherit); }
.acrylTurnFailureDetails { margin-top: 4px; color: var(--dsw-alias-label-tertiary, inherit); }
.acrylTurnFailureDetails summary { width: fit-content; cursor: pointer; }
.acrylTurnFailureDetails code { display: block; margin-top: 4px; white-space: pre-wrap; font: var(--dsw-font-markdown-code-block-small, 12px ui-monospace, monospace); }
.acrylTurnFailureCode { color: var(--dsw-alias-label-tertiary, inherit); font: var(--dsw-font-markdown-code-block-small, 12px ui-monospace, monospace); }
`

/** @returns disposer, for one owning `ctx.effect`. */
export function installSignInStyles(): () => void {
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
  return () => { style.remove() }
}

/** Styles for the driving indicator, installed for the plugin's lifetime. */

const STYLE_ID = 'acryl-ui-control-styles'

const CSS = `
.acrylDrivingBar { position: fixed; left: 50%; bottom: 44px; transform: translateX(-50%); z-index: 2147483000; display: flex; align-items: center; gap: 10px; padding: 8px 12px 8px 14px; border: 1px solid #4d6bfe; border-radius: 999px; background: var(--dsw-alias-bg-base, #fff); color: var(--dsw-alias-fg, #111); box-shadow: 0 8px 28px rgb(0 0 0 / 30%); font: 13px/1.3 ui-sans-serif, system-ui, sans-serif; pointer-events: auto; }
.acrylDrivingBar[data-killed] { border-color: #f59e0b; }
.acrylDrivingDot { width: 8px; height: 8px; border-radius: 50%; background: #4d6bfe; animation: acrylDrivingPulse 1.2s ease-in-out infinite; }
.acrylDrivingBar button { appearance: none; padding: 3px 12px; border: 1px solid currentColor; border-radius: 999px; background: transparent; color: inherit; cursor: pointer; font: inherit; }
.acrylDrivingBar button:hover { background: rgb(127 127 127 / 15%); }
@keyframes acrylDrivingPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
@media (prefers-reduced-motion: reduce) { .acrylDrivingDot { animation: none; } }
`

/** @returns disposer, for one owning `ctx.effect`. */
export function installIndicatorStyles(): () => void {
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
  return () => { style.remove() }
}

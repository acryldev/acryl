/** Styles for the Agents settings section, installed for the plugin's lifetime. */

const STYLE_ID = 'acryl-workspace-agents-styles'

const CSS = `
.dshAgentsSection { display: grid; gap: 18px; padding: 4px 0 28px; color: var(--dsw-alias-label-primary); font: 13px/1.5 ui-sans-serif, system-ui, sans-serif; }
.dshAgentsHeading { margin: 0; font-size: 15px; font-weight: 600; }
.dshAgentsSubheading { margin: 0; font-size: 13px; font-weight: 600; }
.dshAgentsText, .dshAgentsHint { margin: 0; color: var(--dsw-alias-label-secondary, inherit); }
.dshAgentsHint { font-size: 12px; opacity: 0.85; }
.dshAgentsBlock { display: grid; gap: 8px; }
.dshAgentsInline { grid-template-columns: 1fr auto; align-items: center; gap: 16px; }
.dshAgentsChips { display: flex; flex-wrap: wrap; gap: 6px; }
.dshAgentsChip { appearance: none; display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: transparent; color: inherit; cursor: pointer; font: inherit; }
.dshAgentsChip:hover { border-color: #4d6bfe; }
.dshAgentsChip[aria-checked="true"] { border-color: #4d6bfe; background: color-mix(in srgb, #4d6bfe 14%, transparent); }
.dshAgentsSegmented { display: inline-flex; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; overflow: hidden; flex: none; }
.dshAgentsSegmented button { appearance: none; padding: 4px 10px; border: 0; background: transparent; color: var(--dsw-alias-label-secondary, inherit); cursor: pointer; font: inherit; font-size: 12px; }
.dshAgentsSegmented button + button { border-left: 1px solid var(--dsw-alias-border-l1); }
.dshAgentsSegmented button[aria-checked="true"] { background: color-mix(in srgb, #4d6bfe 20%, transparent); color: var(--dsw-alias-label-primary); }
.dshAgentsListHead { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.dshAgentsCount { margin-left: 6px; padding: 1px 7px; border-radius: 999px; background: var(--dsw-alias-fill-hover, rgb(127 127 127 / 14%)); font-size: 11px; font-weight: 500; }
.dshAgentsList { display: grid; margin: 0; padding: 0; list-style: none; border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; }
.dshAgentsRow { padding: 8px 12px; }
.dshAgentsRow + .dshAgentsRow { border-top: 1px solid var(--dsw-alias-border-l1); }
.dshAgentsRow[data-disabled] .dshAgentsRowName { opacity: 0.55; }
.dshAgentsList[data-available] .dshAgentsRowName { opacity: 0.75; }
.dshAgentsRowMain { display: flex; align-items: center; gap: 10px; min-width: 0; }
.dshAgentsRowName { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.dshAgentsRowLabel { font-weight: 600; }
.dshAgentsRowCommand { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-secondary, inherit); font: 11.5px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }
.dshAgentsBadge { margin-left: 8px; padding: 0 6px; border-radius: 4px; background: rgb(248 113 113 / 16%); color: #f87171; font-size: 10.5px; font-weight: 500; }
.dshAgentsDefault { flex: none; padding: 4px 10px; border-radius: 8px; background: color-mix(in srgb, #4d6bfe 20%, transparent); font-size: 12px; white-space: nowrap; }
.dshAgentsButton { appearance: none; flex: none; padding: 4px 10px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: transparent; color: inherit; cursor: pointer; font: inherit; font-size: 12px; white-space: nowrap; }
.dshAgentsButton:hover:not(:disabled) { border-color: #4d6bfe; }
.dshAgentsButton:disabled { opacity: 0.45; cursor: default; }
.dshAgentsButton[data-primary] { background: #4d6bfe; border-color: #4d6bfe; color: #fff; }
.dshAgentsButton[data-danger]:hover { border-color: #f87171; color: #f87171; }
.dshAgentsIconLink, .dshAgentsChevron { appearance: none; display: inline-grid; place-items: center; flex: none; width: 26px; height: 26px; border: 0; border-radius: 6px; background: transparent; color: var(--dsw-alias-label-secondary, inherit); cursor: pointer; text-decoration: none; font: inherit; }
.dshAgentsIconLink:hover, .dshAgentsChevron:hover { background: var(--dsw-alias-fill-hover, rgb(127 127 127 / 14%)); color: var(--dsw-alias-label-primary); }
.dshAgentsRowDetail, .dshAgentsAddForm { display: grid; gap: 8px; padding: 10px 0 4px 28px; }
.dshAgentsRowDetail label, .dshAgentsAddForm label { display: grid; gap: 3px; color: var(--dsw-alias-label-secondary, inherit); font-size: 12px; }
.dshAgentsRowDetail input, .dshAgentsAddForm input, .dshAgentsAddForm textarea { padding: 6px 8px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px; background: transparent; color: var(--dsw-alias-label-primary); font: 12.5px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }
.dshAgentsRowDetail input:focus, .dshAgentsAddForm input:focus, .dshAgentsAddForm textarea:focus { outline: none; border-color: #4d6bfe; }
.dshAgentsAdd summary { cursor: pointer; }
.dshAgentsAddForm { max-width: 440px; padding-left: 0; }
.dshAgentsBadgeRow { display: flex; align-items: flex-end; gap: 10px; }
.dshAgentsLetter { width: 44px; text-align: center; }
.dshAgentsColors { display: flex; flex-wrap: wrap; gap: 5px; padding-bottom: 4px; }
.dshAgentsColor { width: 16px; height: 16px; padding: 0; border: 2px solid transparent; border-radius: 50%; cursor: pointer; }
.dshAgentsColor[aria-checked="true"] { border-color: var(--dsw-alias-label-primary); }
.dshAgentsPreview { padding: 4px 6px; border-radius: 6px; background: var(--dsw-alias-fill-hover, rgb(127 127 127 / 10%)); overflow-wrap: anywhere; font-size: 12px; }
.dshAgentsPreview [data-muted] { color: var(--dsw-alias-label-secondary, inherit); }
.dshAgentsFormActions { display: flex; justify-content: flex-end; }
.dshAgentsError { color: #f87171; font-size: 12px; }
`

/** @returns disposer, for one owning `ctx.effect`. */
export function installAgentsStyles(): () => void {
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
  return () => { style.remove() }
}

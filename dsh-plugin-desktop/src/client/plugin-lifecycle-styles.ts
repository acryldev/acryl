/** Lifecycle-owned styles for the Desktop plugin lifecycle Settings tab. */

const STYLE_ID = 'dsh-plugin-lifecycle-styles'

const CSS = `
.dshPluginLifecycleSection {
  display: grid;
  gap: 16px;
  padding: 4px 0 24px;
  color: var(--dsw-alias-label-primary);
}

.dshPluginLifecycleToolbar,
.dshPluginLifecycleCatalogHeading,
.dshPluginLifecycleCardHeader,
.dshPluginLifecycleSummary,
.dshPluginLifecycleActions {
  display: flex;
  align-items: center;
}

.dshPluginLifecycleToolbar {
  justify-content: space-between;
  gap: 16px;
  padding: 12px 14px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-3);
}

.dshPluginLifecycleToolbar p {
  margin: 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
}

.dshPluginLifecycleSection button {
  min-height: 30px;
  padding: 6px 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 7px;
  color: inherit;
  background: var(--dsw-alias-bg-layer-1);
  cursor: pointer;
  font: inherit;
}

.dshPluginLifecycleSection button:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
}

.dshPluginLifecycleSection button:disabled {
  cursor: wait;
  opacity: 0.55;
}

.dshPluginLifecycleCatalog {
  display: grid;
  gap: 12px;
}

.dshPluginLifecycleSearch {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
}

.dshPluginLifecycleSearch input {
  width: 100%;
  min-height: 38px;
  border: 0;
  outline: 0;
  color: inherit;
  background: transparent;
  font: inherit;
}

.dshPluginLifecycleCatalogHeading {
  justify-content: space-between;
}

.dshPluginLifecycleCatalogHeading h3 {
  margin: 0;
  font-size: 14px;
}

.dshPluginLifecycleCatalogHeading span {
  color: var(--dsw-alias-label-tertiary);
  font-variant-numeric: tabular-nums;
}

.dshPluginLifecycleCards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.dshPluginLifecycleCard {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-3);
}

.dshPluginLifecycleCardHeader {
  width: 100%;
  min-height: 48px !important;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 8px 10px;
  border: 0 !important;
  border-radius: 0 !important;
  color: var(--dsw-alias-label-primary);
  text-align: left;
  background: transparent !important;
}

.dshPluginLifecycleCardHeader strong {
  flex: 1 1 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dshPluginLifecycleSummary {
  flex: 1 1 auto;
  width: 100%;
  gap: 8px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
}

.dshPluginLifecycleSummary span {
  padding: 3px 6px;
  border-radius: 999px;
  background: var(--dsw-alias-bg-layer-1);
}

.dshPluginLifecycleSummary span[data-mounted='true'] {
  color: var(--dsw-alias-state-success-primary);
  background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 10%, transparent);
}

.dshPluginLifecycleChevron {
  margin-left: auto;
  transition: transform 120ms ease;
}

.dshPluginLifecycleCardHeader[aria-expanded='true'] .dshPluginLifecycleChevron {
  transform: rotate(180deg);
}

.dshPluginLifecycleDetails {
  display: grid;
  gap: 12px;
  padding: 0 12px 14px;
  border-top: 1px solid var(--dsw-alias-border-l2);
}

.dshPluginLifecycleDetails code {
  overflow-wrap: anywhere;
  padding-top: 12px;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
}

.dshPluginLifecycleDetails dl {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
}

.dshPluginLifecycleDetails dl div {
  display: grid;
  gap: 3px;
}

.dshPluginLifecycleDetails dt {
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
}

.dshPluginLifecycleDetails dd {
  margin: 0;
  font-size: 12px;
}

.dshPluginLifecycleActions {
  flex-wrap: wrap;
  gap: 8px;
}

.dshPluginLifecycleDanger {
  border-color: var(--dsw-alias-state-error-primary) !important;
  color: var(--dsw-alias-state-error-primary) !important;
}

.dshPluginLifecycleProtected,
.dshPluginLifecycleStatus,
.dshPluginLifecycleFailure {
  margin: 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
}

.dshPluginLifecycleFailure {
  color: var(--dsw-alias-state-error-primary);
}

.dshPluginArchitectureSummary {
  margin: 0;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  line-height: 1.55;
}

.dshPluginArchitecturePlane {
  display: grid;
  gap: 10px;
  padding-top: 4px;
}

.dshPluginArchitecturePlane + .dshPluginArchitecturePlane {
  margin-top: 8px;
  padding-top: 20px;
  border-top: 1px solid var(--dsw-alias-border-l2);
}

.dshPluginArchitecturePlaneHeader {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
}

.dshPluginArchitecturePlaneHeader h3,
.dshPluginArchitecturePlaneHeader p {
  margin: 0;
}

.dshPluginArchitecturePlaneHeader h3 {
  font-size: 17px;
}

.dshPluginArchitecturePlaneHeader p {
  margin-top: 2px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
}

.dshPluginArchitectureStats {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
}

.dshPluginArchitectureStats span {
  padding: 3px 7px;
  border-radius: 999px;
  background: var(--dsw-alias-bg-layer-1);
}

.dshPluginArchitectureFiberList {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.dshPluginArchitectureFiber {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-3);
}

.dshPluginArchitectureFiber summary {
  list-style: none;
}

.dshPluginArchitectureFiber summary::-webkit-details-marker {
  display: none;
}

.dshPluginArchitectureFiberHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 52px;
  padding: 10px 12px;
  cursor: pointer;
}

.dshPluginArchitectureFiberHeader:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}

.dshPluginArchitectureFiberHeader > span:first-child {
  display: grid;
  min-width: 0;
}

.dshPluginArchitectureFiberHeader strong {
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dshPluginArchitectureFiberHeader small {
  color: var(--dsw-alias-label-tertiary);
  font-size: 10px;
}

.dshPluginArchitecturePhase {
  flex: none;
  padding: 3px 7px;
  border-radius: 999px;
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-layer-1);
  font-size: 10px;
}

.dshPluginArchitecturePhase[data-phase='active'] {
  color: var(--dsw-alias-state-success-primary);
  background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 10%, transparent);
}

.dshPluginArchitecturePhase[data-phase='failed'],
.dshPluginArchitectureChip[data-status='missing'] {
  color: var(--dsw-alias-state-error-primary);
}

.dshPluginArchitectureNativeDetails {
  display: grid;
  gap: 12px;
  padding: 12px;
  border-top: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-module-platform);
}

.dshPluginArchitectureNativeDetails section,
.dshPluginArchitectureNativeDetails h4,
.dshPluginArchitectureNativeDetails p {
  margin: 0;
}

.dshPluginArchitectureNativeDetails section {
  display: grid;
  gap: 6px;
}

.dshPluginArchitectureNativeDetails h4 {
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
}

.dshPluginArchitectureNativeDetails p {
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
}

.dshPluginArchitectureFiberMeta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
}

.dshPluginArchitectureFiberMeta div {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.dshPluginArchitectureFiberMeta dt {
  color: var(--dsw-alias-label-tertiary);
  font-size: 10px;
}

.dshPluginArchitectureFiberMeta dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
  font-size: 11px;
}

.dshPluginArchitectureChips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.dshPluginArchitectureChip {
  max-width: 100%;
  overflow-wrap: anywhere;
  padding: 3px 6px;
  border-radius: 5px;
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-layer-1);
  font-size: 10px;
}

.dshPluginArchitectureEffectTree {
  display: grid;
  gap: 4px;
  margin: 0;
  padding-left: 17px;
  color: var(--dsw-alias-label-secondary);
  font-size: 10px;
}

.dshPluginArchitectureEffectTree .dshPluginArchitectureEffectTree {
  margin-top: 4px;
}

@media (max-width: 900px) {
  .dshPluginLifecycleCards,
  .dshPluginArchitectureFiberList {
    grid-template-columns: 1fr;
  }

  .dshPluginLifecycleToolbar {
    align-items: flex-start;
    flex-direction: column;
  }
}

`

/** Install one scoped stylesheet; tolerate headless Client boot. */
export function installPluginLifecycleStyles(): () => void {
  if (typeof document === 'undefined') return () => {}
  const existing = document.getElementById(STYLE_ID)
  if (existing !== null) return () => {}
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
  return () => { style.remove() }
}

/**
 * The sidebar foot documents its actions as stacking above Settings, but the
 * upstream `.footerActions` container is a bare `display: flex` row. The first
 * occupant (the Plugin Market button) is full width, so every further action
 * (a user- or agent-built extension filling `sidebar.footer.action`) is laid out
 * past the sidebar edge and clipped. ACRYL stacks the seat vertically, which is
 * the documented behavior, without forking the pinned harness.
 *
 * Upstream class names are CSS-module hashes (`<hash>_footerActions`), so the
 * rule matches the stable local-name suffix.
 */
export const FOOTER_ACTIONS_LAYOUT_CSS = `
[class*="footerActions"] { flex-direction: column; align-items: stretch; }
[class*="collapsed"] [class*="footerActions"] { align-items: center; }
`

/** The parts of the DOM this needs, so it can be tested without a browser. */
export interface StyleDocument {
  head: { appendChild(node: StyleElement): unknown }
  createElement(tag: 'style'): StyleElement
}
export interface StyleElement {
  textContent: string | null
  dataset: Record<string, string | undefined>
  remove(): void
}

/**
 * Install the footer-actions layout rule.
 * @returns a disposer that removes the style element.
 */
export function installFooterActionsLayout(doc: StyleDocument | undefined): () => void {
  if (doc === undefined) return () => {}
  const style = doc.createElement('style')
  style.dataset['acrylBrand'] = 'footer-actions-layout'
  style.textContent = FOOTER_ACTIONS_LAYOUT_CSS
  doc.head.appendChild(style)
  return () => { style.remove() }
}

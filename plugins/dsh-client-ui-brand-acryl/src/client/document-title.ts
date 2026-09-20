/**
 * The DSH client projects its product title into `document.title` at runtime from a
 * locale string it owns (a single-occupant dictionary, so a plugin cannot replace
 * it), overwriting whatever the served index.html said. This keeps the ACRYL name in
 * the browser tab and desktop window title: it rewrites the upstream product name in
 * the title text whenever the client changes it.
 */
export const UPSTREAM_PRODUCT_TITLE = 'DeepSeek Harness'
export const ACRYL_PRODUCT_TITLE = 'ACRYL'

/** Replace every occurrence of the upstream product name with the ACRYL name. */
export function brandTitleText(text: string): string {
  return text.replaceAll(UPSTREAM_PRODUCT_TITLE, ACRYL_PRODUCT_TITLE)
}

/** The parts of the DOM this needs, so it can be tested without a browser. */
export interface TitleDocument {
  title: string
  head: unknown
}
export type TitleObserverConstructor = new (callback: () => void) => {
  observe(target: unknown, options: { childList: boolean; characterData: boolean; subtree: boolean }): void
  disconnect(): void
}

/**
 * Brand the current title and keep it branded.
 * @returns a disposer that stops observing (the title is left as last set).
 */
export function installDocumentTitleBrand(
  doc: TitleDocument | undefined,
  Observer: TitleObserverConstructor | undefined,
): () => void {
  if (doc === undefined || Observer === undefined) return () => {}
  const brand = (): void => {
    const next = brandTitleText(doc.title)
    if (next !== doc.title) doc.title = next
  }
  brand()
  const observer = new Observer(brand)
  observer.observe(doc.head, { childList: true, characterData: true, subtree: true })
  return () => { observer.disconnect() }
}

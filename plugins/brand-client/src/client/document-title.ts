/**
 * The DSH client projects its product title into `document.title` at runtime from a
 * locale string it owns (a single-occupant dictionary, so a plugin cannot replace
 * it), overwriting whatever the served index.html said. This keeps the ACRYL name in
 * the browser tab and desktop window title: it rewrites the upstream product name in
 * the title text whenever the client changes it. A page that names its app (`<meta name="application-name">`, the app's own name) gets that name there instead:
 * the tab of the app `shop` says `shop`.
 */
export const UPSTREAM_PRODUCT_TITLE = 'DeepSeek Harness'
export const ACRYL_PRODUCT_TITLE = 'ACRYL'

/** Replace every occurrence of the upstream product name with `product` (the ACRYL name unless the page names its app). */
export function brandTitleText(text: string, product: string = ACRYL_PRODUCT_TITLE): string {
  return text.replaceAll(UPSTREAM_PRODUCT_TITLE, product)
}

/** The app's name as the page states it, else the ACRYL name. */
export function pageProductTitle(doc: { querySelector?(selector: string): { getAttribute(name: string): string | null } | null } | undefined): string {
  const stated = doc?.querySelector?.('meta[name="application-name"]')?.getAttribute('content')?.trim()
  return stated === undefined || stated === '' ? ACRYL_PRODUCT_TITLE : stated
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
  product: string = ACRYL_PRODUCT_TITLE,
): () => void {
  if (doc === undefined || Observer === undefined) return () => {}
  const brand = (): void => {
    const next = brandTitleText(doc.title, product)
    if (next !== doc.title) doc.title = next
  }
  brand()
  const observer = new Observer(brand)
  observer.observe(doc.head, { childList: true, characterData: true, subtree: true })
  return () => { observer.disconnect() }
}

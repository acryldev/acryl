/**
 * ACRYL occupants for the DSH Web client's generic browser-brand slots - the
 * swappable counterpart to `@deepseek-ai/dsh-client-ui-brand-official`. Both
 * packages occupy the identical slot set (`sidebar.brand.mark`,
 * `sidebar.brand.name`, and - unlike the official package, which leaves it on
 * the animated-fish fallback - `conversation.hero.brand.mark`); a host swaps
 * brand identity by toggling which one is mounted through its Loader
 * composition, not by patching either package.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { AcrylBrandMark, AcrylBrandName, AcrylHeroBrandMark } from './Brand.tsx'
import { installFooterActionsLayout, type StyleDocument } from './footer-actions-layout.ts'
import { installDocumentTitleBrand, type TitleDocument, type TitleObserverConstructor } from './document-title.ts'

export { AcrylBrandMark, AcrylBrandName, AcrylHeroBrandMark } from './Brand.tsx'

/** Required service: the UI slot registry. */
export const inject = ['slots']

/**
 * Fill the sidebar and conversation-hero brand slots. Each `ctx.slots.inject()`
 * call waits on its slot's own declaration, so an occupant activates whether
 * this row mounts before or after the declaring package and withdraws when
 * the declaration collapses.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  // The browser tab and desktop window title: the client rewrites it at runtime, so keep the ACRYL name on it.
  ctx.effect(
    () => installDocumentTitleBrand(
      typeof document === 'undefined' ? undefined : document as unknown as TitleDocument,
      typeof MutationObserver === 'undefined' ? undefined : MutationObserver as unknown as TitleObserverConstructor,
    ),
    'ui-brand-acryl: document title',
  )
  ctx.effect(
    () => installFooterActionsLayout(typeof document === 'undefined' ? undefined : document as unknown as StyleDocument),
    'ui-brand-acryl: footer actions layout',
  )
  ctx.slots.inject('sidebar.brand.mark', () =>
    ctx.slots.register({ name: 'sidebar.brand.mark' }, AcrylBrandMark))
  ctx.slots.inject('sidebar.brand.name', () =>
    ctx.slots.register({ name: 'sidebar.brand.name' }, AcrylBrandName))
  ctx.slots.inject('conversation.hero.brand.mark', () =>
    ctx.slots.register({ name: 'conversation.hero.brand.mark' }, AcrylHeroBrandMark))
}

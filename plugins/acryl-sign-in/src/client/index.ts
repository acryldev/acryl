/**
 * Cordis Client plugin: the account sign-in card at the foot of Settings > Models, on every surface that hosts this
 * package. It owns its dictionaries and styles, each inside one effect, and talks to its Host half over the private
 * same-origin routes.
 */

import type {} from '@acryl/ui/frame'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { en, zh, type SignInLocaleKey } from './locales.ts'
import { ConnectChoice } from './ConnectChoice.tsx'
import { SignInCard, type SignInCardInjected } from './SignInCard.tsx'
import { SkipPreviewNotice } from './SkipPreviewNotice.tsx'
import { createSignInApi } from './sign-in-api.ts'
import { installSignInStyles } from './styles.ts'

export const SIGN_IN_LOCALE_NAMESPACE = 'acryl.sign-in'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'acryl.sign-in': SignInLocaleKey
  }
}

export const name = 'acryl-sign-in-client'
/** `slots` for the card, `locale` for its dictionary. */
export const inject = ['slots', 'locale']

/** Desktop hands an https page opened by the window to the system browser; Web opens a tab. */
function openExternal(url: string): void {
  const target = new URL(url)
  if (target.protocol !== 'https:' && target.protocol !== 'http:') return
  window.open(target.href, '_blank', 'noopener,noreferrer')
}

export function apply(ctx: ClientContext): void {
  const injected: SignInCardInjected = {
    api: createSignInApi(),
    openExternal,
    copy: text => navigator.clipboard.writeText(text),
    language: () => document.documentElement.lang || navigator.language || undefined,
  }
  ctx.effect(() => ctx.locale.register(SIGN_IN_LOCALE_NAMESPACE, { zh, en }), 'acryl-sign-in: dictionaries')
  ctx.effect(() => installSignInStyles(), 'acryl-sign-in: styles')
  ctx.slots.inject('settings.models.footer', () => ctx.slots.register({
    name: 'settings.models.footer',
    id: 'acryl-sign-in',
    order: 0,
    locale: SIGN_IN_LOCALE_NAMESPACE,
    inject: () => injected,
  }, SignInCard))
  // The first-run dialog asks this seat before its key box: DeepSeek key first, an account sign-in here, or Settings > Models.
  ctx.slots.inject('settings.models.sign-in', () => ctx.slots.register({
    name: 'settings.models.sign-in',
    locale: SIGN_IN_LOCALE_NAMESPACE,
    inject: () => injected,
  }, ConnectChoice))
  // The upstream preview notice is not ACRYL's: reusing its id replaces that entry with one that ends its step at once (it is registered by DeepSeek's
  // models plugin outside the desktop shell, so every browser window, including a generated app's, would show it).
  ctx.slots.inject('settings.onboarding', () => ctx.slots.register({
    name: 'settings.onboarding',
    id: 'welcome-notice',
    order: -100,
    inject: () => ({}),
  }, SkipPreviewNotice))
}

export { SignInCard } from './SignInCard.tsx'
export { createSignInApi } from './sign-in-api.ts'
export type { SignInApi } from './sign-in-api.ts'

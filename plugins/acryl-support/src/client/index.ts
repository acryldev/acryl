/**
 * Cordis Client plugin: the Support section of Settings, for every surface that hosts this package.
 * It owns its dictionaries and styles, each inside one effect, and talks to its Host half over the private
 * same-origin route.
 */

import type {} from '@acryl/ui/frame'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { en, zh, type SupportLocaleKey } from './locales.ts'
import { SupportSection } from './SupportSection.tsx'
import { createSupportApi } from './support-api.ts'
import { installSupportStyles } from './styles.ts'

export const SUPPORT_LOCALE_NAMESPACE = 'acryl.support'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'acryl.support': SupportLocaleKey
  }
}

export const name = 'acryl-support-client'
/** `slots` for the section, `locale` for its dictionary. */
export const inject = ['slots', 'locale']

export function apply(ctx: ClientContext): void {
  const api = createSupportApi()
  const t = ctx.locale.bind(SUPPORT_LOCALE_NAMESPACE)
  ctx.effect(() => ctx.locale.register(SUPPORT_LOCALE_NAMESPACE, { zh, en }), 'acryl-support: dictionaries')
  ctx.effect(() => installSupportStyles(), 'acryl-support: styles')
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'support',
    order: 90,
    label: () => t('nav'),
    locale: SUPPORT_LOCALE_NAMESPACE,
    inject: () => ({ api }),
  }, SupportSection))
}

export { SupportSection } from './SupportSection.tsx'
export { createSupportApi, fileNameFrom, saveDownload } from './support-api.ts'
export type { SupportApi } from './support-api.ts'

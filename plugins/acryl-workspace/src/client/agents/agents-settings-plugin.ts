/**
 * The Agents section of Settings, as a dependency-gated child plugin: it waits (PENDING, not failed) for
 * the settings shell and the locale service, and registers its dictionary, styles and section inside owned
 * effects so they unwind together.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { AgentsSection } from './AgentsSection.tsx'
import type { AgentsState } from './agents-state.ts'
import { en, zh, type AgentsLocaleKey } from './locales.ts'
import { installAgentsStyles } from './styles.ts'

export const AGENTS_LOCALE_NAMESPACE = 'acryl.workspace.agents'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'acryl.workspace.agents': AgentsLocaleKey
  }
}

/** @param agents - the shared agents state the section reads and changes. */
export function agentsSettingsPlugin(agents: AgentsState) {
  return {
    name: 'acryl-workspace-agents-settings',
    inject: ['slots', 'locale'],
    apply(ctx: ClientContext): void {
      const t = ctx.locale.bind(AGENTS_LOCALE_NAMESPACE)
      ctx.effect(() => ctx.locale.register(AGENTS_LOCALE_NAMESPACE, { zh, en }), 'acryl-workspace: agents dictionaries')
      ctx.effect(() => installAgentsStyles(), 'acryl-workspace: agents settings styles')
      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'agents',
        order: 40,
        label: () => t('nav'),
        locale: AGENTS_LOCALE_NAMESPACE,
        inject: () => ({ agents }),
      }, AgentsSection))
    },
  }
}

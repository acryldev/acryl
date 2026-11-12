/**
 * The frame types: what ACRYL's client plugins know about the page they are mounted in (slots, locale, settings, theme, layout, shortcuts, the chat's
 * session and workspace services), under ACRYL's own import path. Types only, so nothing here reaches a browser bundle. Every plugin imports these from
 * `@acryl/ui/frame` instead of naming the DeepSeek Harness client packages, so the day the frame is ACRYL's own this file is what changes.
 *
 * The first block carries Context and slot augmentations (`ctx.slots`, `ctx.locale`, `ctx.settingsScope`, the right-panel and theme services): a plugin that
 * imports `@acryl/ui/frame` gets them, as it did from the packages themselves.
 *
 * @module @acryl/ui/frame
 */

export type {} from '@deepseek-ai/dsh-client-locale/client'
export type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
export type {} from '@deepseek-ai/dsh-client-ui-settings/client'
export type {} from '@deepseek-ai/dsh-client-ui-settings-models/client'
export type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
export type {} from '@deepseek-ai/dsh-client-ui-theme/client'
// The `command/executed` event a client plugin hears when a command typed on this page was answered.
export type {} from '@deepseek-ai/dsh-client-ui-commands/client'

export type { HostObservable, InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
export type { ILayout, MainPanelId, PanelInfo } from '@deepseek-ai/dsh-client-ui-layout/client'
export type { ThemeSnapshot } from '@deepseek-ai/dsh-client-ui-theme/client'
export type { UseSessions } from '@deepseek-ai/dsh-client-ui-session/client'
export type { ShortcutBinding, ShortcutCatalogEntry, ShortcutCommandId, ShortcutFixedCatalogEntry, Shortcuts } from '@deepseek-ai/dsh-client-shortcuts/client'
import type { ISessions, SessionListState, SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
export type { ISessions, SessionListState, SessionReference }
export type { IWorkspaces } from '@deepseek-ai/dsh-api-workspace-controller/client'

/** Where a session's conversation is: `blank` before the first prompt (the start page, where no conversation is drawn), `engaging` once a prompt was sent, `active` after. */
export type ChatPhase = 'blank' | 'engaging' | 'active'

/** A chat session's id, as the chat's events and the sessions service carry it. */
export type ChatSessionId = Parameters<ISessions['scope']>[0]

/** The chat as ACRYL's client plugins see it, provided by `@acryl/ui` on Web and Desktop (`ctx.acrylChat`; inject `acrylChat`). */
export interface AcrylChat {
  /** The session's phase, or undefined when this page holds no scope for that session. */
  phase(sessionId: ChatSessionId): ChatPhase | undefined
  /** Show one line in the session's composer notice, the line under the composer that also shows a command it refused. False when this page holds no scope for it. */
  notice(sessionId: ChatSessionId, level: 'info' | 'error', text: string): boolean
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    acrylChat: AcrylChat
  }
}

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
export type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
export type {} from '@deepseek-ai/dsh-client-ui-theme/client'

export type { HostObservable, InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
export type { ILayout, MainPanelId, PanelInfo } from '@deepseek-ai/dsh-client-ui-layout/client'
export type { ThemeSnapshot } from '@deepseek-ai/dsh-client-ui-theme/client'
export type { UseSessions } from '@deepseek-ai/dsh-client-ui-session/client'
export type { ShortcutBinding, ShortcutCommandId } from '@deepseek-ai/dsh-client-shortcuts/client'
export type { ISessions, SessionListState, SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
export type { IWorkspaces } from '@deepseek-ai/dsh-api-workspace-controller/client'

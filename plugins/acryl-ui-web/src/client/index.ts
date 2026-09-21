/**
 * ACRYL UI library for the Web and Desktop client (spec 038-ui-component-library). A LIBRARY: it fills no slot itself; other client bundles `require('acryl-ui-web')` after
 * listing it in `dsh.client.inject`. The parts come from DSH's own source (see registry/manifest.yml for each one's origin) and read the app's `--dsw-alias-*` tokens; the two
 * colors DSH has no token for (accent, reasoning) are registered through the theme service with a light and a dark value, never through a stylesheet.
 * The client loader treats every module as a plugin, so a library exports an `apply` too.
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-theme'
import { ValueField, SecretField, type FieldProps } from './registry/fields/fields.tsx'
import { AppearanceCubes, type CubeOption } from './registry/AppearanceCubes/AppearanceCubes.tsx'
import type { SettingsRowProps } from './registry/SettingsRow/SettingsRow.tsx'
import { SelectPill, type SelectOption } from './registry/SelectPill/SelectPill.tsx'
import { Tabs, type TabItem } from './registry/Tabs/Tabs.tsx'
import { Card } from './registry/Card/Card.tsx'
import { EmptyState } from './registry/EmptyState/EmptyState.tsx'
import { SwitchField } from './registry/SwitchField/SwitchField.tsx'
import { Dialog } from './registry/Dialog/Dialog.tsx'
import { ToolCallCard, type ToolCallCardProps, type ToolCallLabels, type ToolCallState } from './registry/ToolCallCard/ToolCallCard.tsx'
import { SidebarRow, type SidebarRowProps } from './registry/SidebarRow/SidebarRow.tsx'
import { Stack } from './registry/Stack.tsx'
import { Field, Segmented, SelectField, SettingsRow } from './contract-adapters.tsx'
import { roles } from './roles.ts'
import { footerAction, headerAction, settingsSection, sidebarTab } from './slot-helpers.ts'

export { ToolCallCard, SidebarRow, ValueField, SecretField, AppearanceCubes, SettingsRow, SelectPill, Tabs, Card, EmptyState, SwitchField, Dialog, Stack, Field, Segmented, SelectField, roles, footerAction, headerAction, settingsSection, sidebarTab }
export type { ToolCallCardProps, ToolCallLabels, ToolCallState, SidebarRowProps, FieldProps, CubeOption, SettingsRowProps, SelectOption, TabItem }
// Straight re-exports of the app's primitives, so a consumer needs one import.
export { Button, Tag, Pill, Toast, Modal, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'

export const version = '0.3.0'

/** The two colors DSH has no token for, registered with the theme service (a light and a dark value each, as the service requires). */
const EXTRA_TOKENS = {
  '--acryl-accent': { light: '#4F46E5', dark: '#818CF8' },
  '--acryl-reasoning': { light: '#7C3AED', dark: '#A855F7' },
} as const

export const inject = ['theme']

/**
 * Register the extra tokens; removed with the plugin.
 * @param ctx - client plugin context.
 */
export function apply(ctx: Context): void {
  const theme = (ctx as Context & { theme?: { overrideTokens(source: string, tokens: typeof EXTRA_TOKENS): () => void } }).theme
  if (theme === undefined) return
  ctx.effect(() => theme.overrideTokens('acryl-ui-web', EXTRA_TOKENS), 'acryl-ui-web: extra theme tokens')
}

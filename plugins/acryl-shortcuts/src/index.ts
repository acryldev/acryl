/**
 * Host side of `acryl-shortcuts`: nothing to do. ACRYL's keyboard commands live in the client half (`./client`) and are registered on
 * DSH's own shortcut service, which also persists rebinding, so this package no longer keeps a settings namespace of its own.
 */

import type { Context } from '@deepseek-ai/cordis'

/** Stable Cordis plugin name. */
export const name = 'acryl-shortcuts'

/** The Host half mounts nothing; the row exists so the client bundle is composed. */
export function apply(_ctx: Context): void {}

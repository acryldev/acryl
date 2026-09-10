/** Persistent enablement overrides for Desktop-managed Loader entries. */

import { readFileSync } from 'node:fs'
import { chmod, lstat, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { assertDesktopProfileName } from './profile-manager.ts'
import type { DesktopBlendProjection } from './desktop-blend.ts'

const STATE_VERSION = 1
const STATE_FILE_MODE = 0o600
const STATE_DIRECTORY_MODE = 0o700
const MAX_STATE_BYTES = 64 * 1024
const MAX_PROFILES = 64
const MAX_OVERRIDES = 256

/** A well-formed runtime Loader entry id (`include:<row>` or a bare row id). */
const ENTRY_ID_PATTERN = /^(?:include:)?[a-z0-9](?:[a-z0-9._:@/-]{0,190}[a-z0-9])?$/iu

/** Runtime entry id -> the patch-local row id it disables during composition. */
export function entryPatchId(entryId: string): string {
  return entryId.startsWith('include:') ? entryId.slice('include:'.length) : entryId
}

/** Whether a persisted disabled-entry id is structurally a Loader entry id. */
export function isPluginLifecycleEntryId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 200 && ENTRY_ID_PATTERN.test(value)
}

/** Base-template bundles: never user-mutable. Every other profile bundle is. */
export const BASE_TEMPLATE_BUNDLE_NAMES: ReadonlySet<string> = new Set([
  '@deepseek-ai/dsh-base',
  '@deepseek-ai/dsh-web-app',
])

/** Legacy seed of always-mutable entries that are not user-added profile bundles. */
export interface ManagedPluginLifecycleEntry {
  /** Runtime Loader identity, including its owning Include path. */
  readonly entryId: string
  /** Patch-local identity used while composing the next generation. */
  readonly patchId: string
  /** Exact module specifier required at runtime. */
  readonly moduleName: string
  /** Whether this package contributes a browser plugin. */
  readonly clientPackage: string | null
}

/**
 * Entries that are user-mutable regardless of the profile bundle list: the
 * Development Canvas and the two brand-slot packages. Every other mutable
 * entry is derived at runtime from `dsh.profile.bundles` (see the controller).
 */
export const MANAGED_PLUGIN_LIFECYCLE_ENTRIES = Object.freeze({
  'include:desktop-development-canvas': Object.freeze({
    entryId: 'include:desktop-development-canvas',
    patchId: 'desktop-development-canvas',
    moduleName: 'acryl-development-canvas',
    clientPackage: 'acryl-development-canvas',
  }),
  // Brand swap pair: both occupy the identical sidebar/hero brand slot
  // contract (see profile.ts's DESKTOP_BRAND composition). `kind: 'single'`
  // slots tolerate more than one registrant (first by priority/registration
  // order renders, the rest are silently ignored - no throw), so enabling
  // both at once is safe but ambiguous; disable the current brand before
  // enabling the other for a clean swap.
  'include:ui-brand-official': Object.freeze({
    entryId: 'include:ui-brand-official',
    patchId: 'ui-brand-official',
    moduleName: '@deepseek-ai/dsh-client-ui-brand-official',
    clientPackage: '@deepseek-ai/dsh-client-ui-brand-official',
  }),
  'include:ui-acryl': Object.freeze({
    entryId: 'include:ui-acryl',
    patchId: 'ui-acryl',
    moduleName: 'dsh-client-ui-brand-acryl',
    clientPackage: 'dsh-client-ui-brand-acryl',
  }),
} satisfies Readonly<Record<string, ManagedPluginLifecycleEntry>>)

export type ManagedPluginLifecycleEntryId = keyof typeof MANAGED_PLUGIN_LIFECYCLE_ENTRIES

interface ProfileState {
  readonly profileName: string
  readonly disabledEntries: readonly string[]
}

interface PluginLifecycleStateV1 {
  readonly version: 1
  readonly profiles: readonly ProfileState[]
}

/** Persistence inputs: enough to read and write the override file. */
export interface PluginLifecycleStatePersistence {
  readonly profileName: string
  readonly statePath: string
}

/** Inputs needed by the live Host controller: persistence plus the profile dir. */
export interface PluginLifecycleStateBootstrap extends PluginLifecycleStatePersistence {
  /** Active profile directory - source of the user-mutable bundle list. */
  readonly profileDir: string
  /** BLEND projection for the selected Blend; its rows are user-mutable entries. */
  readonly blend?: DesktopBlendProjection
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Launcher-owned persistence values for managed Loader entry lifecycle. */
    desktopPluginLifecycleBootstrap: PluginLifecycleStateBootstrap
  }
}

function emptyState(): PluginLifecycleStateV1 {
  return { version: STATE_VERSION, profiles: [] }
}

function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function hasExactKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(record).sort(stableCompare)
  const expected = [...keys].sort(stableCompare)
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index])
}


function parseState(value: unknown): PluginLifecycleStateV1 {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('plugin lifecycle state root must be an object')
  }
  const root = value as Record<string, unknown>
  if (!hasExactKeys(root, ['version', 'profiles'])
    || root.version !== STATE_VERSION
    || !Array.isArray(root.profiles)) {
    throw new Error('plugin lifecycle state version or profiles list is invalid')
  }
  if (root.profiles.length > MAX_PROFILES) {
    throw new Error('plugin lifecycle state contains too many profiles')
  }
  const names = new Set<string>()
  const profiles: ProfileState[] = []
  for (const raw of root.profiles) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('plugin lifecycle profile state must be an object')
    }
    const profile = raw as Record<string, unknown>
    if (!hasExactKeys(profile, ['profileName', 'disabledEntries'])
      || typeof profile.profileName !== 'string') {
      throw new Error('plugin lifecycle profile name is invalid')
    }
    assertDesktopProfileName(profile.profileName)
    if (names.has(profile.profileName)) {
      throw new Error(`duplicate plugin lifecycle profile ${JSON.stringify(profile.profileName)}`)
    }
    names.add(profile.profileName)
    if (!Array.isArray(profile.disabledEntries)
      || profile.disabledEntries.length > MAX_OVERRIDES
      || profile.disabledEntries.some(entryId => typeof entryId !== 'string')) {
      throw new Error(`disabledEntries for profile ${JSON.stringify(profile.profileName)} is invalid`)
    }
    // Any structurally valid Loader entry id is kept - the mutable set is now
    // derived at runtime from the profile bundle list, not this file. A
    // malformed string, or one for an entry that no longer exists, is dropped
    // rather than treated as corruption: composition emits a disable patch by
    // id, and the Loader treats an unknown-id patch as a warning, not a fault.
    profiles.push({
      profileName: profile.profileName,
      disabledEntries: [...new Set((profile.disabledEntries as unknown[]).filter(isPluginLifecycleEntryId))]
        .sort(stableCompare),
    })
  }
  profiles.sort((left, right) => stableCompare(left.profileName, right.profileName))
  return { version: STATE_VERSION, profiles }
}

function readState(statePath: string): PluginLifecycleStateV1 {
  let source: string
  try {
    source = readFileSync(statePath, 'utf8')
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return emptyState()
    throw cause
  }
  if (Buffer.byteLength(source, 'utf8') > MAX_STATE_BYTES) {
    throw new Error('plugin lifecycle state is too large')
  }
  return parseState(JSON.parse(source) as unknown)
}

function renderState(state: PluginLifecycleStateV1): string {
  return `${JSON.stringify(state, null, 2)}\n`
}

/** Read disabled Loader entry ids for one profile. */
export function readDisabledPluginLifecycleEntries(
  bootstrap: PluginLifecycleStatePersistence,
): ReadonlySet<string> {
  assertDesktopProfileName(bootstrap.profileName)
  const profile = readState(bootstrap.statePath).profiles
    .find(candidate => candidate.profileName === bootstrap.profileName)
  return new Set(profile?.disabledEntries ?? [])
}

/**
 * User-added profile bundles from `dsh.profile.bundles`, minus the base
 * template. Each such package's inserted Loader row is user-mutable. A missing
 * or malformed manifest yields an empty set (nothing user-mutable by bundle).
 */
export function readUserMutableBundleNames(profileDir: string): ReadonlySet<string> {
  let manifest: unknown
  try {
    manifest = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8'))
  } catch {
    return new Set()
  }
  const bundles = (manifest as { dsh?: { profile?: { bundles?: unknown } } })?.dsh?.profile?.bundles
  if (!Array.isArray(bundles)) return new Set()
  return new Set(
    bundles.filter((name): name is string =>
      typeof name === 'string' && !BASE_TEMPLATE_BUNDLE_NAMES.has(name)),
  )
}

async function ensurePrivateStateDirectory(statePath: string): Promise<void> {
  const directory = dirname(statePath)
  await mkdir(directory, { recursive: true, mode: STATE_DIRECTORY_MODE })
  const stat = await lstat(directory)
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error('plugin lifecycle state directory is not private')
  }
  await chmod(directory, STATE_DIRECTORY_MODE)
}

/** Persist one desired entry enablement with locking and atomic replace. */
export async function setPluginLifecycleEntryEnabled(
  bootstrap: PluginLifecycleStatePersistence,
  entryId: string,
  enabled: boolean,
): Promise<void> {
  assertDesktopProfileName(bootstrap.profileName)
  if (!isPluginLifecycleEntryId(entryId)) throw new Error('plugin lifecycle entry id is malformed')
  await ensurePrivateStateDirectory(bootstrap.statePath)
  await withFileLock(bootstrap.statePath, async () => {
    const state = readState(bootstrap.statePath)
    const current = state.profiles.find(profile => profile.profileName === bootstrap.profileName)
    const disabled = new Set(current?.disabledEntries ?? [])
    if (enabled) disabled.delete(entryId)
    else disabled.add(entryId)
    const profiles = state.profiles.filter(profile => profile.profileName !== bootstrap.profileName)
    if (disabled.size > 0) {
      profiles.push({
        profileName: bootstrap.profileName,
        disabledEntries: [...disabled].sort(stableCompare),
      })
    }
    profiles.sort((left, right) => stableCompare(left.profileName, right.profileName))
    const next = parseState({ version: STATE_VERSION, profiles })
    const rendered = renderState(next)
    if (Buffer.byteLength(rendered, 'utf8') > MAX_STATE_BYTES) {
      throw new Error('plugin lifecycle state is too large')
    }
    await writeFileAtomic(bootstrap.statePath, rendered, {
      mode: STATE_FILE_MODE,
      dirMode: STATE_DIRECTORY_MODE,
    })
  })
}

/**
 * Convert persisted overrides into profile overlay rows. A disable patch
 * matches its target by id only - no `name`, so a row whose id and package
 * name differ (e.g. `dsh-editor` / `acryl-dsh-editor-plugin`) still disables,
 * and a stale id is a Loader warning rather than a skipped patch.
 */
export function pluginLifecyclePatches(
  bootstrap: PluginLifecycleStatePersistence,
): readonly { readonly id: string; readonly disabled: true }[] {
  return [...readDisabledPluginLifecycleEntries(bootstrap)]
    .map(entryId => ({ id: entryPatchId(entryId), disabled: true as const }))
}

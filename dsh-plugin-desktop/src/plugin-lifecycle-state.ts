/** Persistent enablement overrides for Desktop-managed Loader entries. */

import { readFileSync } from 'node:fs'
import { chmod, lstat, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { assertDesktopProfileName } from './profile-manager.ts'

const STATE_VERSION = 1
const STATE_FILE_MODE = 0o600
const STATE_DIRECTORY_MODE = 0o700
const MAX_STATE_BYTES = 64 * 1024
const MAX_PROFILES = 64
const MAX_OVERRIDES = 256

/** Stable Loader entry currently admitted to lifecycle mutation. */
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

/** Explicit mutation policy. Visibility does not imply mutability. */
export const MANAGED_PLUGIN_LIFECYCLE_ENTRIES = Object.freeze({
  'include:desktop-development-canvas': Object.freeze({
    entryId: 'include:desktop-development-canvas',
    patchId: 'desktop-development-canvas',
    moduleName: 'dsh-plugin-development-canvas',
    clientPackage: 'dsh-plugin-development-canvas',
  }),
} satisfies Readonly<Record<string, ManagedPluginLifecycleEntry>>)

export type ManagedPluginLifecycleEntryId = keyof typeof MANAGED_PLUGIN_LIFECYCLE_ENTRIES

interface ProfileState {
  readonly profileName: string
  readonly disabledEntries: readonly ManagedPluginLifecycleEntryId[]
}

interface PluginLifecycleStateV1 {
  readonly version: 1
  readonly profiles: readonly ProfileState[]
}

/** Inputs needed by startup composition and the live Host controller. */
export interface PluginLifecycleStateBootstrap {
  readonly profileName: string
  readonly statePath: string
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

function isManagedEntryId(value: unknown): value is ManagedPluginLifecycleEntryId {
  return typeof value === 'string'
    && Object.prototype.hasOwnProperty.call(MANAGED_PLUGIN_LIFECYCLE_ENTRIES, value)
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
      || profile.disabledEntries.some(entryId => !isManagedEntryId(entryId))) {
      throw new Error(`disabledEntries for profile ${JSON.stringify(profile.profileName)} is invalid`)
    }
    profiles.push({
      profileName: profile.profileName,
      disabledEntries: [...new Set(profile.disabledEntries as ManagedPluginLifecycleEntryId[])]
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

/** Read disabled managed entry ids for one profile. */
export function readDisabledPluginLifecycleEntries(
  bootstrap: PluginLifecycleStateBootstrap,
): ReadonlySet<ManagedPluginLifecycleEntryId> {
  assertDesktopProfileName(bootstrap.profileName)
  const profile = readState(bootstrap.statePath).profiles
    .find(candidate => candidate.profileName === bootstrap.profileName)
  return new Set(profile?.disabledEntries ?? [])
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

/** Persist one desired managed-entry enablement with locking and atomic replace. */
export async function setPluginLifecycleEntryEnabled(
  bootstrap: PluginLifecycleStateBootstrap,
  entryId: ManagedPluginLifecycleEntryId,
  enabled: boolean,
): Promise<void> {
  assertDesktopProfileName(bootstrap.profileName)
  if (!isManagedEntryId(entryId)) throw new Error('plugin lifecycle entry is not managed')
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

/** Convert persisted policy into final profile overlay rows. */
export function pluginLifecyclePatches(
  bootstrap: PluginLifecycleStateBootstrap,
): readonly { readonly id: string; readonly name: string; readonly disabled: true }[] {
  return [...readDisabledPluginLifecycleEntries(bootstrap)].map((entryId) => {
    const policy = MANAGED_PLUGIN_LIFECYCLE_ENTRIES[entryId]
    return { id: policy.patchId, name: policy.moduleName, disabled: true }
  })
}

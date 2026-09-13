/**
 * Read-only health of one profile's plugin layer (spec 034, FR-001).
 *
 * `acryl plugin doctor` prints this and the Web panel can render the same
 * report; the diagnosis itself is neither surface's code, because "why is my
 * plugin missing" has the same answers everywhere: the override file does not
 * parse, an override outlived the row it names, a bundle is installed but
 * composes nothing, or a bundle the profile lists cannot be resolved at all.
 *
 * Nothing here mutates: the caller passes the live snapshot it already has and
 * gets findings back.
 *
 * @module acryl-harness-runtime/plugin-doctor
 */

import type { PluginLifecycleSnapshot } from 'acryl-control'
import {
  entryPatchId,
  readDisabledPluginLifecycleEntries,
  readUserMutableBundleNames,
  type PluginLifecycleStatePersistence,
} from './plugin-lifecycle-state.ts'

export type PluginHealthSeverity = 'error' | 'warning'

export type PluginHealthCode =
  | 'state-unreadable'
  | 'stale-override'
  | 'unmanaged-override'
  | 'bundle-not-composed'
  | 'bundle-missing'

export interface PluginHealthFinding {
  /** `error` means the profile is broken; `warning` means it is surprising. */
  readonly severity: PluginHealthSeverity
  readonly code: PluginHealthCode
  readonly message: string
  /** The entry or package a finding is about, when it names one. */
  readonly entryId?: string
}

export interface PluginHealthReport {
  readonly profileName: string
  readonly profileDir: string
  readonly statePath: string
  /** Composed Loader rows in the snapshot, mutable and protected alike. */
  readonly pluginCount: number
  readonly findings: readonly PluginHealthFinding[]
}

export interface PluginHealthInput extends PluginLifecycleStatePersistence {
  readonly profileDir: string
  readonly snapshot: PluginLifecycleSnapshot
  /**
   * Resolves an installed package's manifest path, or throws when it is not
   * resolvable from this profile. Omitted when the caller has no resolution
   * base (the bundle is then only checked for a composed row).
   */
  readonly resolvePackageJson?: (packageName: string) => string
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/**
 * Diagnose one profile against its own snapshot and override file. Returns
 * findings in a stable order: state, then overrides, then bundles.
 */
export function diagnosePluginLifecycle(input: PluginHealthInput): PluginHealthReport {
  const findings: PluginHealthFinding[] = []
  let disabled: ReadonlySet<string> = new Set()
  try {
    disabled = readDisabledPluginLifecycleEntries(input)
  } catch (cause) {
    findings.push({
      severity: 'error',
      code: 'state-unreadable',
      message: `plugin override file ${input.statePath} could not be read: ${describe(cause)}`,
    })
  }

  const byEntryId = new Map(input.snapshot.entries.map(entry => [entry.entryId, entry]))
  const byPatchId = new Map(input.snapshot.entries.map(entry => [entryPatchId(entry.entryId), entry]))
  for (const overrideId of [...disabled].sort()) {
    const entry = byEntryId.get(overrideId) ?? byPatchId.get(entryPatchId(overrideId))
    if (entry === undefined) {
      findings.push({
        severity: 'warning',
        code: 'stale-override',
        entryId: overrideId,
        message: `${overrideId} is recorded as disabled, but this profile composes no such entry`,
      })
      continue
    }
    if (!entry.mutable) {
      findings.push({
        severity: 'warning',
        code: 'unmanaged-override',
        entryId: overrideId,
        message: `${overrideId} is disabled by the override file but is not a user-controlled plugin`,
      })
    }
  }

  const bundles = readUserMutableBundleNames(input.profileDir)
  const composesPackage = (packageName: string): boolean =>
    input.snapshot.entries.some(entry =>
      entry.moduleName === packageName || entry.moduleName.startsWith(`${packageName}/`))
  for (const bundle of [...bundles].sort()) {
    if (input.resolvePackageJson !== undefined) {
      try {
        input.resolvePackageJson(bundle)
      } catch (cause) {
        findings.push({
          severity: 'error',
          code: 'bundle-missing',
          entryId: bundle,
          message: `profile bundle ${bundle} is listed in dsh.profile.bundles but does not resolve from this profile: ${describe(cause)}`,
        })
        continue
      }
    }
    if (!composesPackage(bundle)) {
      findings.push({
        severity: 'warning',
        code: 'bundle-not-composed',
        entryId: bundle,
        message: `profile bundle ${bundle} is installed but composes no entry in this process; a restart applies a freshly installed bundle`,
      })
    }
  }

  return Object.freeze({
    profileName: input.profileName,
    profileDir: input.profileDir,
    statePath: input.statePath,
    pluginCount: input.snapshot.entries.length,
    findings: Object.freeze(findings),
  })
}

/**
 * Deterministic package selection between one surface's own installation and
 * one Profile - shared by every surface with a persistent, user-mutable
 * profile directory (Desktop's Market-installed plugins, or any surface's
 * own ACRYL-only packages a shipped DSH profile has no dependency path to).
 * Extracted verbatim from acryl-desktop's own package-overlay.ts (first
 * built and proven there); `binName` is the one parameter that varies per
 * caller, keeping every message and this module's own behavior otherwise
 * identical to what Desktop already shipped.
 */

import { findPackageJSON } from 'node:module'
import { readFileSync, statSync } from 'node:fs'
import { dirname } from 'node:path'
import { compare, valid } from 'semver'

const MAX_MANIFEST_BYTES = 1024 * 1024
const MAX_VERSION_LENGTH = 128

export type PackageOverlaySource = 'install' | 'profile'

export interface PackageOverlayCandidate {
  readonly packageName: string
  readonly packageDir: string
  readonly manifestPath: string
  readonly version?: string
  readonly source: PackageOverlaySource
}

export interface PackageOverlaySelection {
  readonly packageName: string
  readonly selected: PackageOverlayCandidate
  readonly install?: PackageOverlayCandidate
  readonly profile?: PackageOverlayCandidate
}

export interface PackageOverlayOptions {
  /** Diagnostic prefix on thrown errors - the calling surface's own bin name. */
  readonly binName: string
  /** File URL inside the exact calling surface's own installation dependency graph. */
  readonly installPackageUrl: string
  /** File URL for the active Profile package.json. */
  readonly profilePackageUrl: string
}

export class PackageOverlayNotFoundError extends Error {
  constructor(binName: string, packageName: string) {
    super(`${binName}: cannot resolve package ${JSON.stringify(packageName)} from the ${binName} installation or active Profile`)
    this.name = 'PackageOverlayNotFoundError'
  }
}

function missingPackage(cause: unknown): boolean {
  return (cause as NodeJS.ErrnoException | null)?.code === 'ERR_MODULE_NOT_FOUND'
}

function readCandidate(
  binName: string,
  packageName: string,
  packageUrl: string,
  source: PackageOverlaySource,
): PackageOverlayCandidate | undefined {
  let manifestPath: string | undefined
  try {
    manifestPath = findPackageJSON(packageName, packageUrl)
  } catch (cause) {
    if (missingPackage(cause)) return undefined
    throw cause
  }
  if (manifestPath === undefined) return undefined
  const size = statSync(manifestPath).size
  if (size > MAX_MANIFEST_BYTES) {
    throw new Error(`${binName}: ${source} package manifest is too large for ${packageName}`)
  }
  let manifest: unknown
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown
  } catch (cause) {
    throw new Error(
      `${binName}: cannot read ${source} package manifest for ${packageName}: ${cause instanceof Error ? cause.message : String(cause)}`,
    )
  }
  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)
    || (manifest as { name?: unknown }).name !== packageName) {
    throw new Error(`${binName}: ${source} package identity is invalid for ${packageName}`)
  }
  const version = (manifest as { version?: unknown }).version
  const comparableVersion = typeof version === 'string' && version.length > 0
    && version.length <= MAX_VERSION_LENGTH && valid(version) !== null
    ? version
    : undefined
  return {
    packageName,
    packageDir: dirname(manifestPath),
    manifestPath,
    source,
    ...(comparableVersion === undefined ? {} : { version: comparableVersion }),
  }
}

/** Extract an npm package root from one Loader bare specifier. */
export function packageNameFromSpecifier(specifier: string): string | undefined {
  if (specifier.length === 0 || specifier.startsWith('.') || specifier.startsWith('/')
    || specifier.startsWith('#') || URL.canParse(specifier)) return undefined
  const parts = specifier.split('/')
  if (specifier.startsWith('@')) {
    if (parts.length < 2 || parts[0]?.length === 0 || parts[1]?.length === 0) return undefined
    return `${parts[0]}/${parts[1]}`
  }
  return parts[0]?.length === 0 ? undefined : parts[0]
}

/** Find one package root using the installation/Profile overlay rule. */
export function findOverlayPackage(
  packageName: string,
  options: PackageOverlayOptions,
): PackageOverlaySelection | undefined {
  if (packageNameFromSpecifier(packageName) !== packageName) {
    throw new Error(`${options.binName}: package overlay requires one exact npm package name`)
  }
  const install = readCandidate(options.binName, packageName, options.installPackageUrl, 'install')
  let profile: PackageOverlayCandidate | undefined
  try {
    profile = readCandidate(options.binName, packageName, options.profilePackageUrl, 'profile')
  } catch (cause) {
    // A valid installation package is the stable fallback when a stale
    // Profile copy has unreadable identity/version metadata. Invalid
    // installation metadata still fails before this branch and is never
    // hidden by the Profile.
    if (install === undefined) throw cause
    return { packageName, selected: install, install }
  }
  if (install === undefined && profile === undefined) return
  const selected = install === undefined
    ? profile!
    : profile === undefined
      ? install
      // Equal SemVer precedence, including build-only differences, keeps the
      // installation copy as the deterministic tie-break. A missing or
      // non-SemVer version on either side is not comparable and also keeps
      // the installation copy.
      : profile.version !== undefined && install.version !== undefined
        && compare(profile.version, install.version) > 0 ? profile : install
  return {
    packageName,
    selected,
    ...(install === undefined ? {} : { install }),
    ...(profile === undefined ? {} : { profile }),
  }
}

/** Resolve one package root, failing when neither overlay side provides it. */
export function resolveOverlayPackage(
  packageName: string,
  options: PackageOverlayOptions,
): PackageOverlaySelection {
  const selection = findOverlayPackage(packageName, options)
  if (selection === undefined) throw new PackageOverlayNotFoundError(options.binName, packageName)
  return selection
}

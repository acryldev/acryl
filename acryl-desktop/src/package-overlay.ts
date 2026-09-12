/**
 * Deterministic package selection between the Desktop installation and one
 * Profile.
 *
 * Thin wrapper over `acryl-harness-runtime`'s shared `package-overlay.ts`
 * (extracted from this file's own original implementation, first built and
 * proven here) - `binName: 'acryl-desktop'` is curried in so every message
 * and this module's own public API (options with no `binName` field, a
 * single-argument `PackageOverlayNotFoundError`) stay exactly what this
 * package already shipped.
 */

import {
  PackageOverlayNotFoundError as SharedPackageOverlayNotFoundError,
  findOverlayPackage as sharedFindOverlayPackage,
  packageNameFromSpecifier,
  resolveOverlayPackage as sharedResolveOverlayPackage,
  type PackageOverlayCandidate,
  type PackageOverlayOptions as SharedPackageOverlayOptions,
  type PackageOverlaySelection,
  type PackageOverlaySource,
} from 'acryl-harness-runtime'

const BIN_NAME = 'acryl-desktop'

export { packageNameFromSpecifier }
export type { PackageOverlayCandidate, PackageOverlaySelection, PackageOverlaySource }

export type PackageOverlayOptions = Omit<SharedPackageOverlayOptions, 'binName'>

export class PackageOverlayNotFoundError extends SharedPackageOverlayNotFoundError {
  constructor(packageName: string) {
    super(BIN_NAME, packageName)
  }
}

/** Find one package root using the Desktop/Profile overlay rule. */
export function findOverlayPackage(
  packageName: string,
  options: PackageOverlayOptions,
): PackageOverlaySelection | undefined {
  return sharedFindOverlayPackage(packageName, { ...options, binName: BIN_NAME })
}

/** Resolve one package root, failing when neither overlay side provides it. */
export function resolveOverlayPackage(
  packageName: string,
  options: PackageOverlayOptions,
): PackageOverlaySelection {
  return sharedResolveOverlayPackage(packageName, { ...options, binName: BIN_NAME })
}

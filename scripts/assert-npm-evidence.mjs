const PACKAGE_AND_BYTE_REDUCTION = 0.2
const INSTALL_TIME_INCREASE = 0.1

/** Reject a candidate that regresses the terminal npm distribution budgets. */
export function assertNpmEvidence(baseline, candidate) {
  const failures = []
  if (candidate.canonicalInstalledPackageCount > baseline.canonicalInstalledPackageCount * (1 - PACKAGE_AND_BYTE_REDUCTION)) {
    failures.push(`package count ${candidate.canonicalInstalledPackageCount} exceeds ${baseline.canonicalInstalledPackageCount * (1 - PACKAGE_AND_BYTE_REDUCTION)}`)
  }
  if (candidate.installedBytes > baseline.installedBytes * (1 - PACKAGE_AND_BYTE_REDUCTION)) {
    failures.push(`installed bytes ${candidate.installedBytes} exceeds ${baseline.installedBytes * (1 - PACKAGE_AND_BYTE_REDUCTION)}`)
  }
  if (candidate.installWallTimeMs > baseline.installWallTimeMs * (1 + INSTALL_TIME_INCREASE)) {
    failures.push(`install time ${candidate.installWallTimeMs} exceeds ${baseline.installWallTimeMs * (1 + INSTALL_TIME_INCREASE)}`)
  }
  if (failures.length > 0) throw new Error(`npm install evidence budget failed: ${failures.join('; ')}`)
}

/**
 * The Host's own half of the online channel's per-instance secret (spec 041 TB30, TB03's threat model): a
 * random token written next to the instance's own run lock, `0o600`, readable only by the OS user that
 * started the app - the CLI's matching read side (TB31) lives in `acryl-harness-runtime`
 * (`instance/online-secret.ts`), not here: `acryl-harness-runtime` already depends on this package (for the
 * shared coding-capability declaration), so the reverse dependency this file would otherwise need would be a
 * real circular one, not just an inconvenient one. This file's own write/remove logic is intentionally a small,
 * stable duplicate of the same two operations there, not a second, drifting implementation of the read side.
 */

import { randomBytes } from 'node:crypto'
import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** Plain file name, next to the run lock in the instance's own home - must match `acryl-harness-runtime`'s own `ONLINE_SECRET_FILE_NAME`. */
export const ONLINE_SECRET_FILE_NAME = 'agent-control-secret'

export function onlineSecretPath(appHome: string): string {
  return join(appHome, ONLINE_SECRET_FILE_NAME)
}

/** Write a fresh secret for this run (a restart rotates it, TB03). @returns the secret, hex-encoded. */
export function writeOnlineSecret(appHome: string): string {
  const path = onlineSecretPath(appHome)
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const secret = randomBytes(24).toString('hex')
  writeFileSync(path, secret, { mode: 0o600 })
  chmodSync(path, 0o600)
  return secret
}

/** Remove this run's secret on shutdown; a caller can no longer authenticate to an instance that is gone. */
export function removeOnlineSecret(appHome: string): void {
  rmSync(onlineSecretPath(appHome), { force: true })
}

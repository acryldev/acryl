/**
 * The online channel's per-instance secret (spec 041 TB30, following TB03's threat model): a random token
 * written next to the instance's own run lock, readable only by the OS user that started the app (`0o600`,
 * the same directory mode the Registry and the offline lock already use). An external CLI operator on the
 * same machine, as the same OS user, can simply read it - no handshake, matching how Docker's own CLI trusts
 * a local socket it can open, and how Jupyter's own token file works. A different OS user is refused by
 * filesystem permissions alone; this adds no stronger boundary than that on purpose (TB03).
 *
 * Lives beside `offline-lock.ts` and `registry.ts` (not in `acryl-agent-control`) so both the Host plugin that
 * writes it and the CLI that reads it depend on the same shared package, neither on the other.
 *
 * @module acryl-harness-runtime/instance/online-secret
 */

import { randomBytes } from 'node:crypto'
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** Plain file name, next to the run lock in the instance's own home. */
export const ONLINE_SECRET_FILE_NAME = 'agent-control-secret'

export function onlineSecretPath(appHome: string): string {
  return join(appHome, ONLINE_SECRET_FILE_NAME)
}

/**
 * Write a fresh secret for this run. Tied to the process, not persisted across restarts (a crashed app's
 * secret is orphaned the same way its run lock is; a fresh start writes a fresh one - TB03's rotation note).
 * @returns the secret, hex-encoded.
 */
export function writeOnlineSecret(appHome: string): string {
  const path = onlineSecretPath(appHome)
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const secret = randomBytes(24).toString('hex')
  writeFileSync(path, secret, { mode: 0o600 })
  chmodSync(path, 0o600)
  return secret
}

/** Remove this run's secret; a caller can no longer authenticate to an instance that has shut down. */
export function removeOnlineSecret(appHome: string): void {
  rmSync(onlineSecretPath(appHome), { force: true })
}

/**
 * Read a running instance's secret (the CLI's own side, TB31): same OS user, so a plain read, no handshake.
 * @returns the secret, or undefined when the instance has no online channel (older version, or not yet started).
 */
export function readOnlineSecret(appHome: string): string | undefined {
  try {
    return readFileSync(onlineSecretPath(appHome), 'utf8').trim()
  } catch {
    return undefined
  }
}

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Io } from './io'

/**
 * `acrylblends pack`: the app in a folder as an installer for this machine's OS (a DMG, an NSIS installer or a Debian package), made with the published
 * packages, so a Blend's own repository releases its product without ACRYL's source. The packer is ACRYL's framework/scripts/pack-blank-mac.mjs, which
 * the published package carries in pack/ (scripts-pack.mjs copies it); in ACRYL's checkout the CLI runs it from there.
 */
export function pack(args: readonly string[], io: Io, file = 'pack-blank-mac.mjs'): number {
  const script = [
    new URL(`../pack/${file}`, import.meta.url),
    new URL(`../../../scripts/${file}`, import.meta.url),
  ]
    .map((url) => fileURLToPath(url))
    .find((file) => existsSync(file))
  if (script === undefined) {
    io.stderr.write(`error: this copy of @acryldev/blends carries no packer (pack/${file})\n`)
    return 1
  }
  return spawnSync(process.execPath, [script, ...args], { stdio: 'inherit' }).status ?? 1
}

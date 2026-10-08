/** Chooses the terminal backend for the running host: node-pty on Node, the libc FFI terminal on a verified Deno host. */

import { denoFfiPtySupported, spawnDenoFfiPty } from './deno-ffi-pty-spawn.ts'
import { spawnNodePty } from './node-pty-spawn.ts'
import type { WorkspacePtySpawn } from './service.ts'

export function selectPtySpawn(): WorkspacePtySpawn {
  return denoFfiPtySupported() ? spawnDenoFfiPty : spawnNodePty
}

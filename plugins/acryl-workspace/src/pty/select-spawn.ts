/** Chooses the terminal backend for the running host: node-pty on Node, `Bun.spawn({ terminal })` on Bun (macOS, Linux), a libc FFI terminal on a verified Deno host on macOS or Linux, ConPTY through kernel32 on Windows. */

import { bunTerminalSupported, spawnBunTerminal } from './bun-terminal-spawn.ts'
import { denoConptySupported, spawnDenoConpty } from './deno-conpty-spawn.ts'
import { denoFfiPtySupported, spawnDenoFfiPty } from './deno-ffi-pty-spawn.ts'
import { spawnNodePty } from './node-pty-spawn.ts'
import type { WorkspacePtySpawn } from './service.ts'

export function selectPtySpawn(): WorkspacePtySpawn {
  if (bunTerminalSupported()) return spawnBunTerminal
  if (denoFfiPtySupported()) return spawnDenoFfiPty
  if (denoConptySupported()) return spawnDenoConpty
  return spawnNodePty
}

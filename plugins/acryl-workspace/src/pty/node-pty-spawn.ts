/** The adapter that starts a real process behind a terminal with node-pty (a native module). */

import { createRequire } from 'node:module'
import type { WorkspacePtyProcess, WorkspacePtySpawn } from './service.ts'

const require = createRequire(import.meta.url)

// node-pty is loaded on first use, not when this file is imported: it loads its native addon the moment it is imported, and a host that never selects this adapter
// (Deno uses its own FFI terminal) must not pay for that. On Windows inside a `deno desktop` process loading ANY native Node-API addon ends the process with an
// uncatchable 0xC06D007F (specs/042 F13), so an eager import here would take the whole app down.
export const spawnNodePty: WorkspacePtySpawn = (command, args, options): WorkspacePtyProcess => {
  const { spawn: spawnPty } = require('node-pty') as typeof import('node-pty')
  return spawnPty(command, [...args], {
    cwd: options.cwd,
    env: options.env as Record<string, string>,
    name: options.name,
    cols: options.cols,
    rows: options.rows,
  })
}

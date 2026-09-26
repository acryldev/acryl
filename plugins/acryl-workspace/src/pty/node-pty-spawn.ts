/** The adapter that starts a real process behind a terminal with node-pty (a native module). */

import { spawn as spawnPty } from 'node-pty'
import type { WorkspacePtyProcess, WorkspacePtySpawn } from './service.ts'

export const spawnNodePty: WorkspacePtySpawn = (command, args, options): WorkspacePtyProcess =>
  spawnPty(command, [...args], {
    cwd: options.cwd,
    env: options.env as Record<string, string>,
    name: options.name,
    cols: options.cols,
    rows: options.rows,
  })

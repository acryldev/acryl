// A gate never writes into the person's own ~/.acryl. An app made by `acrylblends init` keeps its data in <ACRYL_HOME>/apps/<id>/data
// (plugins/instance/home.ts), so every gate that starts an app imports this first: the whole run, and every process it starts (they inherit
// process.env), gets a fresh ACRYL_HOME in the system temp folder, removed when the gate ends. A caller that set ACRYL_HOME keeps it.
//
//   import './lib/scratch-home.mjs'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

if (process.env.ACRYL_HOME === undefined || process.env.ACRYL_HOME === '') {
  const home = mkdtempSync(join(tmpdir(), 'acryl-home-'))
  process.env.ACRYL_HOME = home
  process.on('exit', () => {
    try {
      rmSync(home, { recursive: true, force: true })
    } catch {
      // A process still holding a file on Windows: the temp folder is the system's to clean.
    }
  })
}

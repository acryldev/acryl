/**
 * Every vitest worker runs with a HOME of its own, before any test module loads.
 *
 * A test that boots a real composition root (the engine host, `serveWeb`, the desktop Host) writes where the product writes: the running-app Registry
 * and its run lock under `~/.acryl-instances`, session logs under `~/.acryl*`, engine state under `~/.dsh`. Pointed at the developer's real home, that
 * is how a suite silently edits or breaks the installed app's data (spec 048 T011 found the registry the first time a test booted one of these for
 * real). This module is the structural fix: `scripts/real-home-guard.mjs` fails the gate if a real ACRYL home changes during `check`, and this setup
 * is why nothing reaches one in the first place.
 *
 * The folder is per worker process, so parallel test files do not contend for one home, and it is removed when the worker exits. A test that needs a
 * particular HOME (to read a fixture, or to exercise the non-isolated path) still sets its own afterwards; module-level code in the test file runs
 * after this file, so a `process.env.HOME = …` there wins. `ACRYL_TESTS_KEEP_REAL_HOME=1` opts a debugging session out of the isolation.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

if (process.env.ACRYL_TESTS_KEEP_REAL_HOME !== '1') {
  const home = mkdtempSync(join(tmpdir(), 'acryl-test-home-'))
  process.env.HOME = home
  // `os.homedir()` reads USERPROFILE on Windows; HOMEDRIVE/HOMEPATH stay as they are because nothing in the repo reads them.
  process.env.USERPROFILE = home
  // XDG_CONFIG_HOME and friends, when a caller exported them, would send tools back to the real home's configuration.
  for (const name of ['XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_STATE_HOME', 'XDG_CACHE_HOME']) delete process.env[name]
  process.on('exit', () => {
    try {
      rmSync(home, { recursive: true, force: true })
    } catch {
      // A worker killed mid-write leaves its folder in tmp; the OS cleans tmp.
    }
  })
}

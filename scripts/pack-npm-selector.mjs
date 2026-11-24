#!/usr/bin/env node
/**
 * Pack the `acryl` selector (distribution/acryl-npm-launcher) as an npm tarball. Publication is a separate, explicit step (`npm publish ./acryl-<version>.tgz`).
 *
 * The selector installs nothing with it: `npx acryl` fetches only the selector and the terminal Control Center bundled into `launcher.js`. The terminal agent's
 * runtime (`acryl-cli-<target>`, about 450 MB) is built and released by acryldev/acryl-terminal and installed into ~/.acryl/runtime the first time someone opens
 * the agent; `acrylRuntime` in the selector's package.json names the release of it to install.
 *
 * Usage: node scripts/pack-npm-selector.mjs <out-dir>        (`--print-manifest` prints the packed manifest instead)
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bundleLauncher } from '../distribution/acryl-npm-launcher/tui/bundle.mjs'
import { execShim } from './lib/portable-commands.mjs'
import { MINIMUM as MINIMUM_NODE } from '../distribution/acryl-npm-launcher/node-version.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const selectorSource = join(root, 'distribution', 'acryl-npm-launcher')
// The Add to Applications opener and the model key reader it imports are copied into ~/.acryl/shortcuts from beside launcher.js (os-launchers.js),
// and the one install of apps (app-install-cli.mjs and app-install.js) runs from there (managed.js INSTALL_CLI):
// they are the launcher package's own files, shipped as they are, never kept twice.
const fromLauncher = new Set(['shortcut-open.mjs', 'model-key.js', 'app-install.js', 'app-install-cli.mjs'])
const launcherSource = join(root, 'plugins', 'launcher')
const selectorPackage = JSON.parse(readFileSync(join(selectorSource, 'package.json'), 'utf8'))
// The launcher's own package.json lists what the selector ships; a second list here once left forward.js out of the tarball.
const selectorFiles = selectorPackage.files.filter(file => file !== 'package.json')
const LAUNCHER_BUNDLE = 'launcher.js'
if (!/^\d+\.\d+\.\d+$/u.test(selectorPackage.acrylRuntime ?? '')) throw new Error('pack-npm-selector: acrylRuntime (the acryl-terminal release the agent runtime comes from) is missing in distribution/acryl-npm-launcher/package.json')

function selectorManifest() {
  // The package's own manifest, without the scripts and the dev dependencies that only build it (the terminal Control Center is bundled into launcher.js).
  const { scripts: _scripts, devDependencies: _bundled, ...manifest } = selectorPackage
  return {
    ...manifest,
    private: false,
    files: selectorFiles,
    // The same minimum bin.js checks before anything loads (distribution/acryl-npm-launcher/node-version.js).
    engines: { node: `>=${MINIMUM_NODE}` },
  }
}

if (process.argv.includes('--print-manifest')) {
  console.log(JSON.stringify(selectorManifest()))
} else {
  const outDir = resolve(process.argv[2] ?? 'release-artifacts/npm')
  const staging = mkdtempSync(join(tmpdir(), 'acryl-npm-'))
  try {
    const selector = join(staging, 'acryl')
    mkdirSync(selector, { recursive: true })
    for (const file of selectorFiles) {
      // launcher.js is made, not kept: the terminal launcher (spec 050) bundled into one file with nothing to install.
      if (file === LAUNCHER_BUNDLE) { await bundleLauncher(join(selector, file)); continue }
      const source = join(fromLauncher.has(file) ? launcherSource : selectorSource, file)
      if (!existsSync(source)) throw new Error(`pack-npm-selector: the launcher lists ${file} in files but it is missing`)
      cpSync(source, join(selector, file))
    }
    writeFileSync(join(selector, 'package.json'), `${JSON.stringify(selectorManifest(), null, 2)}\n`)
    execShim('npm', ['pack', '--silent'], { cwd: selector, stdio: 'inherit' })
    const tarball = readdirSync(selector).find(name => name.endsWith('.tgz'))
    if (!tarball) throw new Error('pack-npm-selector: npm pack did not produce a tarball')
    mkdirSync(outDir, { recursive: true })
    cpSync(join(selector, tarball), join(outDir, tarball))
    console.log(`packed ${join(outDir, tarball)}; publication is intentionally not performed`)
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}

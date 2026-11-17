#!/usr/bin/env node
/**
 * The files of one release of the app, laid out the way `install.sh` and `install.ps1` read them, in one folder that is uploaded as it is (to a
 * GitHub release) or served as it is (a rehearsal over the local network):
 *
 *   ACRYL-Blends-arm64.dmg            from `pack-blank-mac.mjs`        (install.sh, macOS Apple Silicon)
 *   acryl-blends-linux-x64.tar.gz     from `pack-blank-engine.mjs`     (install.sh, Linux; one top folder, which the installer strips)
 *   acryl-blends-win32-x64.zip        from `pack-blank-engine.mjs`     (install.ps1; the files at the zip's root)
 *   SHA256SUMS                        one line per file above, `<hex>  <name>`: what the installers check before they install anything
 *   install.sh, install.ps1           copied beside them, so one folder is the whole release
 *
 *   node scripts/install/make-release-assets.mjs [--out dist/release]
 *
 * A file whose input is missing is left out and said so; the installer for that OS then reports the missing line in SHA256SUMS instead of installing.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const args = process.argv.slice(2)
const outAt = args.indexOf('--out')
const out = resolve(outAt === -1 ? join(root, 'dist', 'release') : (args[outAt + 1] ?? ''))
const say = (line) => console.log(`make-release-assets: ${line}`)

const run = (command, commandArgs, cwd) => {
  const result = spawnSync(command, commandArgs, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, COPYFILE_DISABLE: '1' },
  })
  if (result.status !== 0)
    throw new Error(`${command} ${commandArgs.join(' ')} failed: ${result.stderr}`)
}
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

const dmg = join(root, 'dist', 'blank-mac', 'ACRYL-Blends-Blank-mac-arm64.dmg')
const linux = join(root, 'dist', 'engine-linux-x64')
const windows = join(root, 'dist', 'engine-win32-x64')
const built = []

if (existsSync(dmg)) {
  copyFileSync(dmg, join(out, 'ACRYL-Blends-arm64.dmg'))
  built.push('ACRYL-Blends-arm64.dmg')
} else say(`no ${dmg}: the macOS file is left out`)

if (existsSync(linux)) {
  // One top folder, so `tar --strip-components=1` leaves the app's files in the folder the installer made.
  run(
    'tar',
    ['-czf', join(out, 'acryl-blends-linux-x64.tar.gz'), '-C', dirname(linux), 'engine-linux-x64'],
    root,
  )
  built.push('acryl-blends-linux-x64.tar.gz')
} else say(`no ${linux}: the Linux file is left out`)

if (existsSync(windows)) {
  run('zip', ['-q', '-r', '-X', join(out, 'acryl-blends-win32-x64.zip'), '.'], windows)
  built.push('acryl-blends-win32-x64.zip')
} else say(`no ${windows}: the Windows file is left out`)

writeFileSync(
  join(out, 'SHA256SUMS'),
  built.map((name) => `${sha256(join(out, name))}  ${name}\n`).join(''),
)
for (const script of ['install.sh', 'install.ps1'])
  copyFileSync(join(root, 'scripts', 'install', script), join(out, script))
say(`${out}: ${[...built, 'SHA256SUMS', 'install.sh', 'install.ps1'].join(', ')}`)

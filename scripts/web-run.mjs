// `pnpm web` / `pnpm acryl-web` launcher for the ACRYL browser surface.
//
// Like `tui-run.mjs`, this rebuilds `acryl-web` if its compiled entry is
// missing or stale (newer source under `acryl-web/src`), then execs the web
// bin with the user's remaining arguments. The web surface is a SEPARATE
// distribution from the terminal CLI (`acryl-tui`).
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const packageRoot = resolve(root, 'acryl-web')
const bin = resolve(packageRoot, 'lib/bin.js')
const src = resolve(packageRoot, 'src')

function newestSourceMtime(dir) {
  let newest = 0
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name)
      if (entry.isDirectory()) {
        walk(path)
      } else if (/\.(ts|tsx|mts)$/.test(entry.name)) {
        newest = Math.max(newest, statSync(path).mtimeMs)
      }
    }
  }
  walk(dir)
  return newest
}

function isStale() {
  if (!existsSync(bin)) return true
  return newestSourceMtime(src) > statSync(bin).mtimeMs
}

if (isStale()) {
  process.stderr.write('Building acryl-web (lib is missing or stale)…\n')
  const build = spawnSync('corepack', ['pnpm', '--filter', 'acryl-web', 'run', 'build'], {
    cwd: root,
    stdio: 'inherit',
  })
  if (build.status !== 0) {
    process.stderr.write('acryl-web: build failed; run `corepack pnpm --filter acryl-web run build` for details\n')
    process.exit(build.status ?? 1)
  }
}

const result = spawnSync(process.execPath, [bin, ...process.argv.slice(2)], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
})
process.exit(result.status ?? 0)

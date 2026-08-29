// `pnpm acryl` / `pnpm tui` launcher.
//
// Starts the ACRYL pi-tui terminal surface. The compiled entry lives at
// `acryl-tui/lib/bin.js`; a fresh checkout or a source edit leaves it either
// missing or stale, so this launcher rebuilds it first and then execs the real
// CLI with the user's remaining arguments. A stale rebuild is mtime-based: if
// the newest source file under `acryl-tui/src` is newer than `lib/bin.js`, we
// rebuild. This keeps `pnpm acryl` forgiving in a dev loop without forcing a
// full build on every launch.
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const packageRoot = resolve(root, 'acryl-tui')
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
  process.stderr.write('Building acryl-tui (lib is missing or stale)…\n')
  const build = spawnSync('corepack', ['pnpm', '--filter', 'acryl-tui', 'run', 'build'], {
    cwd: root,
    stdio: 'inherit',
  })
  if (build.status !== 0) {
    process.stderr.write('acryl: build failed; run `corepack pnpm --filter acryl-tui run build` for details\n')
    process.exit(build.status ?? 1)
  }
}

const result = spawnSync(process.execPath, [bin, ...process.argv.slice(2)], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
})
process.exit(result.status ?? 0)

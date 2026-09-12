// `pnpm acryl` / `pnpm tui` launcher.
//
// Starts the ACRYL pi-tui terminal surface. The compiled entry lives at
// `acryl-cli/lib/bin.js`; a fresh checkout or a source edit leaves it either
// missing or stale, so this launcher rebuilds it first and then execs the real
// CLI with the user's remaining arguments. A stale rebuild is mtime-based: if
// the newest source file under `acryl-cli/src`, or under the pre-built
// workspace dependencies it imports (`acryl-control`, `acryl-harness-runtime`
// - `pnpm --filter acryl-cli run build`'s own `prebuild` script rebuilds both,
// but only once this launcher actually decides to run that build), is newer
// than `lib/bin.js`, we rebuild. Without checking those dependencies too, an
// edit to e.g. `acryl-harness-runtime/src/engine-dsh.ts` alone would leave
// `isStale()` false (acryl-cli's own src is untouched) and this launcher
// would silently keep running a stale build of that shared engine code. This
// keeps `pnpm acryl` forgiving in a dev loop without forcing a full build on
// every launch.
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const packageRoot = resolve(here, '..')
const root = resolve(packageRoot, '..')
const bin = resolve(packageRoot, 'lib/bin.js')
const watchedSourceDirs = [
  resolve(packageRoot, 'src'),
  resolve(root, 'acryl-control/src'),
  resolve(root, 'acryl-harness-runtime/src'),
]

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
  const binMtime = statSync(bin).mtimeMs
  return watchedSourceDirs.some(dir => newestSourceMtime(dir) > binMtime)
}

if (isStale()) {
  process.stderr.write('Building acryl-cli (lib is missing or stale)…\n')
  const build = spawnSync('corepack', ['pnpm', '--filter', 'acryl-cli', 'run', 'build'], {
    cwd: root,
    stdio: 'inherit',
  })
  if (build.status !== 0) {
    process.stderr.write('acryl: build failed; run `corepack pnpm --filter acryl-cli run build` for details\n')
    process.exit(build.status ?? 1)
  }
}

const result = spawnSync(process.execPath, [bin, ...process.argv.slice(2)], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
})
process.exit(result.status ?? 0)

// Headless-safe release smoke checks for the ACRYL CLI/TUI entrypoint (R005).
// These run without a real TTY and must pass for any candidate artifact.
//   node scripts/release-smoke.mjs
// Checks:
//   - `acryl --version` -> the canonical version string
//   - `acryl tui --json` -> a structured direct-host status line (probe)
// Web/desktop health checks are added separately where those surfaces are
// wired (web startup/health, desktop startup) — they may require a display.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const packageRoot = fileURLToPath(new URL('..', import.meta.url)) // acryl-tui/
const bin = join(packageRoot, 'lib/bin.js')
const smokeHome = mkdtempSync(join(tmpdir(), 'acryl-release-smoke-'))

function run(args) {
  const result = spawnSync(process.execPath, [bin, ...args], {
    cwd: packageRoot,
    encoding: 'utf8',
    env: { ...process.env, DSH_HOME: smokeHome, NO_COLOR: '1' },
  })
  return { code: result.status, out: (result.stdout ?? '').trim(), err: (result.stderr ?? '').trim() }
}

let failures = 0

const version = run(['--version'])
if (version.code === 0 && /^\d+\.\d+\.\d+/.test(version.out)) {
  console.log(`ok --version -> ${version.out}`)
} else {
  failures += 1
  console.error(`FAIL --version: code=${version.code} out=${JSON.stringify(version.out)} err=${JSON.stringify(version.err)}`)
}

const probe = run(['tui', '--json'])
let probeOk = false
try {
  const parsed = JSON.parse(probe.out.replace(/^[^\n]*\n/, ''))
  probeOk = parsed.mode === 'direct' && typeof parsed.profile === 'string' && typeof parsed.generationId === 'string'
} catch {
  probeOk = false
}
if (probe.code === 0 && probeOk) {
  console.log(`ok tui --json -> ${probe.out.replace(/\n/g, ' ').slice(0, 90)}`)
} else {
  failures += 1
  console.error(`FAIL tui --json: code=${probe.code} out=${JSON.stringify(probe.out)} err=${JSON.stringify(probe.err)}`)
}

console.log(failures === 0 ? 'SMOKE PASS' : `SMOKE FAIL (${failures})`)
rmSync(smokeHome, { force: true, recursive: true })
process.exit(failures === 0 ? 0 : 1)

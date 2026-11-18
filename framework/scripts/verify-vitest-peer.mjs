#!/usr/bin/env node
// `acrylblends` does not put vitest in anyone's production install. It once declared vitest as an optional peer (for the conformance suites at `acrylblends/db/conformance` and
// `acrylblends/kv/conformance`); pnpm resolves an optional peer wherever the workspace has it, so `pnpm deploy --prod` pulled vitest, vite, rolldown, lightningcss and their native files
// (about 30 MB, and files of the wrong platform) into production closures.
//   node scripts/verify-vitest-peer.mjs
// From the packed tarball: (1) the package declares no vitest, as a dependency or a peer; (2) a project that depends on it and installs for production has no vitest in its closure; (3) a
// provider author's project, with vitest as its own dev dependency, still runs the kv conformance suite through `acrylblends/kv/conformance` under pnpm.
import './lib/scratch-home.mjs'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const log = (message) => console.log(`verify-vitest-peer: ${message}`)
const fail = (message) => {
  throw new Error(`verify-vitest-peer: ${message}`)
}
const isWindows = process.platform === 'win32'
const scratch = mkdtempSync(join(tmpdir(), 'vitest-peer-'))
// No colour: CI runners colour vitest's summary, and the gate reads it.
const env = {
  ...process.env,
  npm_config_loglevel: 'error',
  CI: '1',
  NO_COLOR: '1',
  FORCE_COLOR: '0',
}
const plain = (text) => text.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'gu'), '')
function run(command, args, cwd, allowFailure = false) {
  const r = spawnSync(command, args, {
    cwd,
    env,
    encoding: 'utf8',
    shell: isWindows && /^(pnpm|npm)$/u.test(command),
  })
  if (r.status !== 0 && !allowFailure)
    fail(`${command} ${args.join(' ')} failed in ${cwd}:\n${r.stdout}${r.stderr}`)
  return r.stdout
}

try {
  const packed = join(scratch, 'packed')
  mkdirSync(packed)
  // `--tarball <file>` checks a packed package that already exists (a published one, to see the gate fail on the peer it was written for).
  const given =
    process.argv.indexOf('--tarball') === -1
      ? undefined
      : resolve(process.argv[process.argv.indexOf('--tarball') + 1])
  if (given === undefined)
    run('pnpm', ['pack', '--pack-destination', packed], join(root, 'packages', 'cli'))
  const tarball =
    given ??
    join(
      packed,
      readdirSync(packed).find((name) => /^acrylblends-.*\.tgz$/u.test(name)) ?? fail('no tarball'),
    )

  // 1. The package declares none.
  const unpacked = join(scratch, 'unpacked')
  mkdirSync(unpacked)
  run('tar', ['-xzf', tarball, '-C', unpacked], scratch)
  const manifest = JSON.parse(readFileSync(join(unpacked, 'package', 'package.json'), 'utf8'))
  for (const field of [
    'dependencies',
    'peerDependencies',
    'peerDependenciesMeta',
    'optionalDependencies',
  ]) {
    if ('vitest' in (manifest[field] ?? {})) fail(`the package declares vitest in ${field}`)
  }
  const importing = run(
    'grep',
    [
      '-rlE',
      '^[[:space:]]*(import|export)[^;]*from [\'"]vitest[\'"]|import\\([\'"]vitest',
      join(unpacked, 'package', 'lib'),
    ],
    scratch,
    true,
  )
  if (importing.trim() !== '') fail(`files of the package import vitest:\n${importing}`)
  log(
    'the package declares no vitest (not a dependency, not a peer), and no file of it imports vitest',
  )

  // 2. A production install has none in its closure.
  const production = join(scratch, 'production')
  mkdirSync(production)
  writeFileSync(
    join(production, 'package.json'),
    JSON.stringify({
      name: 'closure',
      private: true,
      version: '0.0.0',
      dependencies: {
        acrylblends: `file:${tarball}`,
        '@deepseek-ai/cordis': '4.0.4',
        '@deepseek-ai/schemastery': '3.18.4',
      },
    }),
  )
  // vitest is in the workspace next to it, as in a monorepo: that is what made pnpm resolve the optional peer.
  mkdirSync(join(production, 'tools'))
  writeFileSync(
    join(production, 'tools', 'package.json'),
    JSON.stringify({
      name: 'tools',
      private: true,
      version: '0.0.0',
      devDependencies: { vitest: '4.1.11' },
    }),
  )
  writeFileSync(join(production, 'pnpm-workspace.yaml'), 'packages:\n  - "."\n  - tools\n')
  run('pnpm', ['install', '--prod', '--no-frozen-lockfile', '--ignore-scripts'], production)
  const store = join(production, 'node_modules', '.pnpm')
  const found = existsSync(store)
    ? readdirSync(store).filter((name) => /^(vitest|vite|rolldown|lightningcss)@/u.test(name))
    : []
  if (found.length > 0)
    fail(
      `a production install of a project that depends on acrylblends has ${found.join(', ')} in its closure`,
    )
  log(
    'a production install, with vitest in the workspace beside it, has no vitest, vite, rolldown or lightningcss in its closure',
  )

  // 3. A provider author's project still runs the conformance suite.
  const provider = join(scratch, 'provider')
  mkdirSync(join(provider, 'tests'), { recursive: true })
  writeFileSync(
    join(provider, 'package.json'),
    JSON.stringify({
      name: 'provider',
      private: true,
      version: '0.0.0',
      type: 'module',
      dependencies: { acrylblends: `file:${tarball}` },
      devDependencies: { vitest: '4.1.11' },
    }),
  )
  writeFileSync(
    join(provider, 'tests', 'kv.spec.ts'),
    `import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as vitest from 'vitest'
import { openKv } from 'acrylblends/kv/json'
import { describeKvConformance } from 'acrylblends/kv/conformance'

describeKvConformance('json file', async () => {
  const path = join(await mkdtemp(join(tmpdir(), 'kv-')), 'kv.json')
  const open = async () => {
    const opened = await openKv({ path })
    return { kv: opened.kv, close: opened.close, reopen: async () => { await opened.close(); return open() } }
  }
  return open()
}, vitest)
`,
  )
  writeFileSync(
    join(provider, 'tests', 'missing.spec.ts'),
    `import { expect, it } from 'vitest'
import { describeKvConformance } from 'acrylblends/kv/conformance'

it('says what to pass when the suite is not given vitest', () => {
  expect(() => describeKvConformance('x', async () => { throw new Error('unused') }, undefined as never)).toThrow(/third argument/)
})
`,
  )
  run('pnpm', ['install', '--no-frozen-lockfile', '--ignore-scripts'], provider)
  // The project's own vitest, by its path: under `pnpm run` the repository's node_modules/.bin comes first on the PATH, and `pnpm exec vitest` would start that one.
  const ran = plain(
    run(
      process.execPath,
      [join(provider, 'node_modules', 'vitest', 'vitest.mjs'), 'run'],
      provider,
    ),
  )
  if (!/Tests\s+\d+ passed/u.test(ran))
    fail(`the conformance suite did not run under pnpm:\n${ran}`)
  log(
    `a provider's project with its own vitest runs the kv conformance suite from acrylblends/kv/conformance (${/Tests\s+(\d+) passed/u.exec(ran)?.[1]} cases), and says what to pass when it is not given vitest`,
  )
  log('OK')
} finally {
  try {
    rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 })
  } catch (cause) {
    log(`could not remove ${scratch}: ${cause.message}`)
  }
}

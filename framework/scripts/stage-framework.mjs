#!/usr/bin/env node
// Stage the framework build as the root of the acrylblends package: packages/framework/lib becomes packages/cli/lib, and the exports map of packages/framework becomes the
// exports map of the acrylblends package (plus `./cli` and `./package.json`). The build of the framework package is the single source: lib/ is not committed, the exports map is
// (it is generated, and `--check` fails when it is out of date). Run after `pnpm -r run build`.
//
//   node scripts/stage-framework.mjs [--check]
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const framework = join(root, 'packages', 'framework')
const cli = join(root, 'packages', 'cli')
const check = process.argv.includes('--check')

const source = JSON.parse(readFileSync(join(framework, 'package.json'), 'utf8'))
const pkgFile = join(cli, 'package.json')
const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'))
const exportsMap = {
  ...source.exports,
  './cli': { types: './dist/index.d.ts', default: './dist/index.js' },
  './package.json': './package.json',
}

if (check) {
  if (
    JSON.stringify(pkg.exports) !== JSON.stringify(exportsMap) ||
    JSON.stringify(pkg.peerDependencies) !== JSON.stringify(source.peerDependencies)
  ) {
    console.error(
      'stage-framework: packages/cli/package.json "exports" is out of date; run node scripts/stage-framework.mjs',
    )
    process.exit(1)
  }
  console.log(
    `stage-framework: the exports map matches packages/framework (${Object.keys(source.exports).length} subpaths)`,
  )
  process.exit(0)
}

if (!existsSync(join(framework, 'lib', 'index.js')))
  throw new Error('packages/framework/lib is not built; run pnpm -r run build first')
rmSync(join(cli, 'lib'), { recursive: true, force: true })
cpSync(join(framework, 'lib'), join(cli, 'lib'), { recursive: true })
cpSync(join(framework, 'LICENSE'), join(cli, 'LICENSE'))
// The npm page of the package is the framework's own README.
cpSync(join(framework, 'README.md'), join(cli, 'README.md'))
pkg.main = './lib/index.js'
pkg.types = './lib/index.d.ts'
pkg.sideEffects = false
pkg.exports = exportsMap
// The Cordis forms and the conformance suites need these; every one is optional: a plain app never loads them.
pkg.peerDependencies = source.peerDependencies
pkg.peerDependenciesMeta = source.peerDependenciesMeta
if (!pkg.files.includes('lib'))
  pkg.files = [
    'bin',
    'dist',
    'lib',
    ...pkg.files.filter((f) => !['bin', 'dist', 'lib'].includes(f)),
  ]
writeFileSync(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`)
console.log(
  `stage-framework: packages/cli/lib from packages/framework/lib, ${Object.keys(source.exports).length} subpaths`,
)

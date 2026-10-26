#!/usr/bin/env node
/**
 * The PNPM filters that build every package the root `typecheck` and `test` chains run, with what each depends on: `--filter <name>...` per
 * package, printed on one line. A workflow that runs those chains builds with them first, so a package outside Desktop's dependency tree
 * (one the chains list but Desktop does not import) has its own and its dependencies' `lib/` before its typecheck and its tests.
 *
 *   corepack pnpm $(node scripts/root-chain-filters.mjs) --workspace-concurrency=1 run build
 */

import { readFileSync } from 'node:fs'

const { scripts } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const names = new Set()
for (const chain of [scripts.typecheck, scripts.test]) {
  for (const step of chain.split('&&')) {
    const match = /--filter (\S+)/u.exec(step)
    if (match?.[1] === undefined) throw new Error(`root-chain-filters: a root chain step names no package: ${step.trim()}`)
    names.add(match[1])
  }
}
process.stdout.write(`${[...names].map(name => `--filter ${name}...`).join(' ')}\n`)

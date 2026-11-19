#!/usr/bin/env node
// `acrylblends` is the short name for @acryldev/blends (spec 051 T038): run the scoped package's bin with the same argv.
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
const require = createRequire(import.meta.url)
const manifest = require.resolve('@acryldev/blends/package.json')
const bin = join(dirname(manifest), 'bin', 'acrylblends.js')
const result = spawnSync(process.execPath, [bin, ...process.argv.slice(2)], { stdio: 'inherit' })
process.exit(result.status ?? 1)

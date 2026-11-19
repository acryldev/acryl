#!/usr/bin/env node
// `npm create acrylblends` is the short name for `npm create @acryldev/blends` (spec 051 T038): run the scoped package's bin with the same argv.
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const manifest = require.resolve('@acryldev/create-blends/package.json')
const bin = join(dirname(manifest), 'bin', 'create-acrylblends.js')
const result = spawnSync(process.execPath, [bin, ...process.argv.slice(2)], { stdio: 'inherit' })
process.exit(result.status ?? 1)

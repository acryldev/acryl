#!/usr/bin/env node
/**
 * Run a command while holding the checkout's build lock (`scripts/lib/build-lock.mjs`):
 *
 *   node scripts/with-build-lock.mjs corepack pnpm run check
 *   node scripts/with-build-lock.mjs corepack pnpm --filter acryl-web run build
 *
 * Use it for a gate or any long build, so it never rewrites a package's output while a launcher (or another gate) is reading it. The exit code is the command's.
 */
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { acquireBuildLock } from './lib/build-lock.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const command = process.argv.slice(2)
if (command.length === 0) { process.stderr.write('usage: with-build-lock.mjs <command> [args...]\n'); process.exit(2) }

const release = await acquireBuildLock(root, command.join(' ').slice(0, 80))
const child = spawn(command[0], command.slice(1), { cwd: process.cwd(), stdio: 'inherit' })
const forward = signal => { child.kill(signal) }
process.on('SIGINT', () => { forward('SIGINT') })
process.on('SIGTERM', () => { forward('SIGTERM') })
child.on('exit', (code, signal) => { release(); process.exit(code ?? (signal === null ? 1 : 128)) })
child.on('error', error => { release(); process.stderr.write(`with-build-lock: ${error.message}\n`); process.exit(127) })

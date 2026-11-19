#!/usr/bin/env node
// Build every frame package frame/packages.json lists, with its workspace dependencies first. The framework's `build` builds only the frame
// packages it depends on (app-context, blends-frame, versions); since spec 051 the rest live in ACRYL's plugins/ and runtime/, so a fresh clone
// had no lib/ for seven of them: verify-frame-publish stopped at the first ("lib/ is missing") and every Framework CI job that boots the frame
// failed the same way. The framework's `build` ends with this, so every job, gate and release that builds the framework builds the whole frame.
import { spawnSync } from 'node:child_process'
import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { frameFolders } from './lib/frame-folders.mjs'

const framework = resolve(fileURLToPath(new URL('..', import.meta.url)))
const repo = resolve(framework, '..')
const filters = [...frameFolders(framework).values()].flatMap((folder) => [
  '--filter',
  `./${relative(repo, folder)}...`,
])
const result = spawnSync('pnpm', ['-r', ...filters, 'run', 'build'], {
  cwd: repo,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})
process.exit(result.status ?? 1)

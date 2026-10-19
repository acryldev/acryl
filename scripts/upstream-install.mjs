#!/usr/bin/env node
/**
 * Install the pinned DeepSeek Harness workspace. Its root postinstall (scripts/install-lefthook.mjs) sets up the upstream maintainers'
 * git hooks and refuses every submodule checkout, because git keeps a submodule's `core.worktree` in its common config ("cannot enable
 * extensions.worktreeConfig while core.worktree is in the common config"). The submodule is a pinned, read-only checkout here, so its
 * maintainer hooks are not wanted; the installer's only opt-out is CI=true, which is also how every CI run installs it.
 */
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const upstreamDir = resolve(fileURLToPath(new URL('..', import.meta.url)), 'deepseek-harness')
const result = spawnSync('corepack', ['pnpm', 'install', '--frozen-lockfile', ...process.argv.slice(2)], {
  cwd: upstreamDir,
  env: { ...process.env, CI: 'true' },
  stdio: 'inherit',
  shell: process.platform === 'win32',
})
if (result.error !== undefined) throw result.error
process.exitCode = result.status ?? 1

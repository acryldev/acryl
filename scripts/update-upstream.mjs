#!/usr/bin/env node
/** Update the pinned DeepSeek Harness checkout to its remote default branch. */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const upstreamDir = resolve(root, 'deepseek-harness')
const metadataPath = resolve(root, 'upstream.json')

function runGit(cwd, args, options = {}) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: options.inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0 && !options.allowFailure) {
    const detail = (result.stderr || result.stdout || '').trim()
    throw new Error('git ' + args.join(' ') + ' failed' + (detail ? ': ' + detail : ''))
  }
  return {
    ok: result.status === 0,
    stdout: typeof result.stdout === 'string' ? result.stdout.trim() : '',
  }
}

function assertParentPathsClean() {
  const changed = runGit(root, [
    'status',
    '--porcelain',
    '--',
    'deepseek-harness',
    'upstream.json',
  ]).stdout
  if (changed) {
    throw new Error(
      'Refusing to replace an existing upstream pin change:\n' + changed
      + '\nCommit, stash, or revert those paths before updating.',
    )
  }
}

function ensureCheckout() {
  if (existsSync(resolve(upstreamDir, 'package.json'))) return
  runGit(root, [
    'submodule',
    'update',
    '--init',
    '--recursive',
    '--',
    'deepseek-harness',
  ], { inherit: true })
}

function remoteDefaultBranch() {
  const output = runGit(upstreamDir, ['ls-remote', '--symref', 'origin', 'HEAD']).stdout
  const match = /^ref:\s+refs\/heads\/([^\s]+)\s+HEAD$/mu.exec(output)
  if (match === null) {
    throw new Error('Could not determine the DeepSeek Harness remote default branch.')
  }
  return match[1]
}

function updateMetadata(commit) {
  const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'))
  const upstreamPackage = JSON.parse(
    readFileSync(resolve(upstreamDir, 'package.json'), 'utf8'),
  )
  const next = {
    ...metadata,
    commit,
    sourceVersion: upstreamPackage.version,
  }
  const serialized = JSON.stringify(next, null, 2) + '\n'
  if (serialized !== readFileSync(metadataPath, 'utf8')) {
    writeFileSync(metadataPath, serialized, 'utf8')
  }
}

function main() {
  assertParentPathsClean()
  ensureCheckout()

  const dirty = runGit(upstreamDir, ['status', '--porcelain']).stdout
  if (dirty) {
    throw new Error(
      'Refusing to update a dirty deepseek-harness checkout:\n' + dirty,
    )
  }

  const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'))
  const origin = runGit(upstreamDir, ['remote', 'get-url', 'origin']).stdout
  if (origin !== metadata.repository) {
    throw new Error(
      'DeepSeek Harness origin differs from upstream.json: ' + origin,
    )
  }

  const branch = remoteDefaultBranch()
  const before = runGit(upstreamDir, ['rev-parse', 'HEAD']).stdout
  runGit(upstreamDir, [
    'fetch',
    '--prune',
    'origin',
    'refs/heads/' + branch + ':refs/remotes/origin/' + branch,
  ], { inherit: true })
  const target = runGit(upstreamDir, [
    'rev-parse',
    'refs/remotes/origin/' + branch,
  ]).stdout

  if (before !== target) {
    const fastForward = runGit(
      upstreamDir,
      ['merge-base', '--is-ancestor', before, target],
      { allowFailure: true },
    )
    if (!fastForward.ok) {
      throw new Error(
        'Remote history no longer descends from the current pin. '
        + 'Review the upstream history manually before changing the pin.',
      )
    }
    runGit(upstreamDir, ['switch', '--detach', target], { inherit: true })
  }

  runGit(upstreamDir, ['submodule', 'update', '--init', '--recursive'], {
    inherit: true,
  })
  updateMetadata(target)

  if (before === target) {
    process.stdout.write('DeepSeek Harness is already current at ' + target + '.\n')
  } else {
    process.stdout.write(
      'DeepSeek Harness updated from ' + before + ' to ' + target
      + ' (origin/' + branch + ').\n',
    )
  }
  process.stdout.write(
    'Review the changes, then stage deepseek-harness and upstream.json '
    + 'in a dedicated pin-update commit.\n',
  )
}

try {
  main()
} catch (cause) {
  process.stderr.write(
    (cause instanceof Error ? cause.stack || cause.message : String(cause)) + '\n',
  )
  process.exitCode = 1
}

#!/usr/bin/env node
/**
 * graft:deepscan — rebuild ACRYL's graft context graph with DeepSeek.
 *
 * `graft build --deep` does not complete against DeepSeek out of the box. Four
 * defects in graft 0.18.0 (`@nanonets/graft`) stop it at ~80% coverage; this
 * script re-applies the four fixes and then runs the pass, so a full rescan is
 * reproducible instead of re-derived.
 *
 *   ACRYL-LOCAL PATCH (graft-deepscan): sentinel this script writes into graft's
 *   own files. Patching is idempotent — a second run reports "already current".
 *
 * Why the patches exist (all verified against the real API, not guessed):
 *
 *   1. `reasoning_effort: "none"` up front. Every DeepSeek model on this account
 *      is thinking-mode and rejects a FORCED `tool_choice` with HTTP 400
 *      "Thinking mode does not support this tool_choice". Graft's JSON passes
 *      (concept synthesis, per-symbol crux) force a tool, so they fail while
 *      plain per-file summaries succeed. Graft already retries this exact error
 *      reactively; sending the flag up front skips the wasted round-trip.
 *   2. Id normalisation. For a `file`-kind target the model answers with the
 *      target line's decoration folded into the id — it returns
 *      `"<path> | file | L1-L70"` for target `"<path>"`. `enrich.js` matches
 *      results by EXACT id, so every such entry silently failed to apply and the
 *      file was reported "empty-parsed" although the summaries were perfect.
 *      This alone accounted for 171 of 175 failing files.
 *   3. Target chunking. `describeFile` sends every target in ONE response capped
 *      at `maxTokens: 8192`; generated bundles carrying 400+ symbols truncate
 *      (`finish_reason=length`) and the whole file is lost.
 *
 * Patches live in the globally installed package, so `graft upgrade` or a
 * reinstall reverts them — run this script again after either.
 *
 * Usage:
 *   corepack pnpm run graft:deepscan            # patch (if needed) + build
 *   corepack pnpm run graft:deepscan -- --check # verify setup only, no build
 *
 * Env:
 *   ACRYL_GRAFT_CONFIG  provider JSON (default ~/.secure-storage/llmproviders/deepseek/deepseek.json)
 *   GRAFT_BIN           graft executable, when it is not on PATH
 *
 * Extra arguments are forwarded to `graft build`.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const MARKER = 'ACRYL-LOCAL PATCH (graft-deepscan)'

/**
 * Per-patch sentinel. Idempotency is decided by this, not by comparing the
 * replacement text, so re-running after a hand-edit or an upstream shuffle
 * still recognises an applied patch.
 */
const marker = id => `${MARKER}:${id}`

/** Patch table. `find` must match the pristine graft source exactly once. */
export const GRAFT_PATCHES = Object.freeze([
  {
    id: 'reasoning-effort-none',
    file: 'dist/ai/llm/openai.js',
    why: 'DeepSeek thinking-mode models reject a forced tool_choice (HTTP 400)',
    find: `        else if (tools) {
            params.tools = tools;
        }
        const resp = await this.createChatCompletion(params);`,
    replace: `        else if (tools) {
            params.tools = tools;
        }
        // ${marker('reasoning-effort-none')}: DeepSeek thinking-mode models reject a forced
        // tool_choice ("Thinking mode does not support this tool_choice"), so
        // send reasoning_effort:'none' up front rather than waiting for
        // createChatCompletion's reactive retry to discover it.
        if (params.tool_choice !== undefined && params.reasoning_effort === undefined)
            params.reasoning_effort = "none";
        const resp = await this.createChatCompletion(params);`,
  },
  {
    id: 'crux-chunk-constant',
    file: 'dist/ai/crux.js',
    why: 'target cap for the chunking patch below',
    find: `/** Cap the file text sent per request so one huge file can't blow the context. */
const MAX_CODE_CHARS = 18_000;`,
    replace: `/** Cap the file text sent per request so one huge file can't blow the context. */
const MAX_CODE_CHARS = 18_000;
/** ${marker('crux-chunk-constant')}: max targets per crux request (see describeFile). */
const CRUX_TARGET_CHUNK = 60;`,
  },
  {
    id: 'crux-id-normalisation',
    file: 'dist/ai/crux.js',
    why: 'the model folds the target line into the id for file-kind targets',
    find: `        .filter((s) => typeof s.id === "string")
        .map((s) => ({
        id: s.id,`,
    replace: `        .filter((s) => typeof s.id === "string")
        .map((s) => ({
        // ${marker('crux-id-normalisation')}: the model echoes the target line's decoration back inside
        // the id for a file-kind target ("<path> | file | L1-L70"), and
        // enrich.js matches results by exact id. Graft ids are "<path>" or
        // "<path>#<symbol>" and never contain " | ".
        id: typeof s.id === "string" ? s.id.split(" | ")[0].trim() : s.id,`,
  },
  {
    id: 'crux-target-chunking',
    file: 'dist/ai/crux.js',
    why: 'one oversized response truncates and loses the whole file',
    find: `    async describeFile(input) {
        this.lastMiss = null;
        if (input.nodes.length === 0)
            return [];
        const res = await this.model.create({`,
    replace: `    async describeFile(input) {
        this.lastMiss = null;
        if (input.nodes.length === 0)
            return [];
        // ${marker('crux-target-chunking')}: every target must fit in ONE response (maxTokens below); a
        // generated bundle with 400+ symbols truncates and the whole file is
        // lost. collectFileCrux already merges the list and re-requests only
        // what is still missing.
        if (input.nodes.length > CRUX_TARGET_CHUNK) {
            const out = [];
            for (let i = 0; i < input.nodes.length; i += CRUX_TARGET_CHUNK) {
                out.push(...await this.describeFile({ ...input, nodes: input.nodes.slice(i, i + CRUX_TARGET_CHUNK) }));
            }
            return out;
        }
        const res = await this.model.create({`,
  },
])

/**
 * Apply one patch to `source`.
 *
 * - `applied`  — `find` matched once and was replaced
 * - `current`  — `replace` is already present (idempotent re-run)
 * - `drift`    — neither is present: the file changed underneath us
 * - `ambiguous`— `find` matched more than once
 */
export function applyPatch(source, patch) {
  if (source.includes(marker(patch.id))) return { status: 'current', text: source }
  const first = source.indexOf(patch.find)
  if (first === -1) return { status: 'drift', text: source }
  if (source.indexOf(patch.find, first + 1) !== -1) return { status: 'ambiguous', text: source }
  return { status: 'applied', text: source.replace(patch.find, patch.replace) }
}

/** Resolve the graft executable: `$GRAFT_BIN`, then PATH, then an nvm prefix. */
export function resolveGraftBinary(env = process.env) {
  if (env.GRAFT_BIN) return env.GRAFT_BIN
  const onPath = spawnSync('which', ['graft'], { encoding: 'utf8' })
  if (onPath.status === 0 && onPath.stdout.trim() !== '') return onPath.stdout.trim()
  const versions = join(homedir(), '.nvm', 'versions', 'node')
  if (existsSync(versions)) {
    for (const version of readdirSync(versions).sort().reverse()) {
      const candidate = join(versions, version, 'bin', 'graft')
      if (existsSync(candidate)) return candidate
    }
  }
  throw new Error('graft-deepscan: `graft` not found. Install it (npm i -g @nanonets/graft) or set GRAFT_BIN.')
}

/** The installed graft package root (the directory holding `dist/`). */
export function resolveGraftPackageRoot(env = process.env) {
  return dirname(dirname(realpathSync(resolveGraftBinary(env))))
}

function readProviderConfig(path) {
  const parsed = JSON.parse(readFileSync(path, 'utf8'))
  const graft = parsed.graft
  if (graft === undefined || typeof graft !== 'object') {
    throw new Error(`graft-deepscan: ${path} has no "graft" block (see docs/DEVELOPMENT-LOG.md).`)
  }
  const keyFrom = graft.api_key_from
  const apiKey = typeof keyFrom === 'string' ? parsed[keyFrom] : undefined
  if (typeof apiKey !== 'string' || apiKey.trim() === '') {
    throw new Error(`graft-deepscan: ${path} field "${String(keyFrom)}" must hold the provider API key.`)
  }
  const variables = graft.env
  if (variables === undefined || typeof variables !== 'object') {
    throw new Error(`graft-deepscan: ${path} "graft.env" must be an object of GRAFT_* variables.`)
  }
  return { env: { ...variables, GRAFT_API_KEY: apiKey }, model: String(variables.GRAFT_MODEL ?? '?') }
}

function patchGraftPackage(packageRoot, { check }) {
  const applied = []
  const current = []
  for (const patch of GRAFT_PATCHES) {
    const path = join(packageRoot, patch.file)
    const before = readFileSync(path, 'utf8')
    const result = applyPatch(before, patch)
    if (result.status === 'drift' || result.status === 'ambiguous') {
      throw new Error(
        `graft-deepscan: patch "${patch.id}" is ${result.status} in ${path}.\n` +
        `  The graft source changed (version bump?). Re-derive this patch, or delete it here if upstream fixed it.\n` +
        `  Reason it exists: ${patch.why}`,
      )
    }
    if (result.status === 'current') { current.push(patch.id); continue }
    if (!check) {
      writeFileSync(path, result.text)
      const syntax = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' })
      if (syntax.status !== 0) {
        writeFileSync(path, before)
        throw new Error(`graft-deepscan: patch "${patch.id}" broke ${path}, rolled back\n${syntax.stderr}`)
      }
    }
    applied.push(patch.id)
  }
  return { applied, current }
}

function main(argv) {
  const check = argv.includes('--check')
  const forwarded = argv.filter(argument => argument !== '--check')
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const configPath = process.env.ACRYL_GRAFT_CONFIG
    ?? join(homedir(), '.secure-storage', 'llmproviders', 'deepseek', 'deepseek.json')

  const binary = resolveGraftBinary()
  const packageRoot = resolveGraftPackageRoot()
  const version = spawnSync(binary, ['--version'], { encoding: 'utf8' }).stdout?.trim() ?? 'unknown'
  const { env, model } = readProviderConfig(configPath)
  const { applied, current } = patchGraftPackage(packageRoot, { check })

  process.stdout.write(
    `graft-deepscan: ${version} at ${packageRoot}\n` +
    `graft-deepscan: model ${model} via ${configPath}\n` +
    `graft-deepscan: patches ${check ? 'would-apply' : 'applied'}=${applied.length} already-current=${current.length}` +
    `${applied.length > 0 ? ` (${applied.join(', ')})` : ''}\n`,
  )
  if (check) {
    process.stdout.write('graft-deepscan: --check passed; nothing was written and no build was run.\n')
    return 0
  }

  const run = spawnSync(binary, ['build', '.', '--deep', ...forwarded], {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    stdio: 'inherit',
  })
  if (run.status !== 0) {
    process.stderr.write(
      'graft-deepscan: the deep pass did not complete. Nothing computed is lost — re-run this script to resume\n' +
      '  from cache. Pass --allow-partial to accept a degraded meaning tier and exit 0.\n',
    )
  }
  return run.status ?? 1
}

const invoked = process.argv[1] === undefined ? undefined : resolve(process.argv[1])
if (invoked === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2))
  } catch (cause) {
    process.stderr.write(`${cause instanceof Error ? cause.message : String(cause)}\n`)
    process.exitCode = 1
  }
}

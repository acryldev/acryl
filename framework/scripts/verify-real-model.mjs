#!/usr/bin/env node
/**
 * Opt-in: prove the agent builds a plugin with a REAL model, end to end. Not part of `pnpm run check` (it needs a key and the network).
 *
 *   ACRYLBLENDS_MODEL_URL=https://api.deepseek.com/v1 ACRYLBLENDS_MODEL=deepseek-flash ACRYLBLENDS_MODEL_KEY=... pnpm run verify:model
 *
 * Any OpenAI-compatible API works (a local Ollama needs no key, but small models may not call tools). Scaffolds a fresh agent app, starts
 * it in a throwaway home on a free port, asks for a plugin in plain words, and requires the route to answer. The key stays in the
 * environment: it is never printed or written to a file.
 */
import './lib/scratch-home.mjs'
import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const { ACRYLBLENDS_MODEL_URL: url, ACRYLBLENDS_MODEL: model } = process.env
if (!url || !model) {
  console.error(
    'set ACRYLBLENDS_MODEL_URL and ACRYLBLENDS_MODEL (and ACRYLBLENDS_MODEL_KEY for hosted APIs)',
  )
  process.exit(2)
}
const cli = resolve(import.meta.dirname, '..', 'packages', 'cli', 'bin', 'acrylblends.js')
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const scratch = mkdtempSync(join(tmpdir(), 'verify-model-'))
const app = join(scratch, 'app')
const fail = (message) => {
  throw new Error(`verify-real-model: ${message}`)
}
let child
try {
  execFileSync(process.execPath, [cli, 'init', app, '--agent', '--yes'], { stdio: 'ignore' })
  execFileSync(npm, ['install', '--no-audit', '--no-fund'], { cwd: app, stdio: 'ignore' })
  child = spawn(npm, ['start'], {
    cwd: app,
    env: { ...process.env, ACRYLBLENDS_HOME: join(scratch, 'home'), ACRYLBLENDS_PORT: '0' },
    detached: process.platform !== 'win32',
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const base = await new Promise((done, reject) => {
    let out = ''
    const timer = setTimeout(() => reject(new Error(`not listening:\n${out}`)), 60_000)
    for (const stream of [child.stdout, child.stderr]) {
      stream.on('data', (chunk) => {
        out += chunk
        const match = /listening on (http:\/\/\S+)/.exec(out)
        if (match) {
          clearTimeout(timer)
          done(match[1])
        }
      })
    }
  })
  const started = Date.now()
  const response = await fetch(`${base}/ask`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      question:
        'Build a plugin named clock that adds a GET /time route returning JSON {"time": <the current ISO time>}. Install it and tell me when it is live.',
    }),
    signal: AbortSignal.timeout(240_000),
  })
  const answer = await response.json()
  if (answer.error) fail(`the agent failed: ${String(answer.error).slice(0, 300)}`)
  const tools = (answer.trace ?? []).map((call) => call.tool)
  const installed = (answer.trace ?? []).find((call) => call.tool === 'install_plugin')
  if (installed?.result?.state !== 'active')
    fail(`install_plugin did not end active: ${JSON.stringify(installed ?? tools)}`)
  const time = await (await fetch(`${base}/time`)).json()
  if (Number.isNaN(Date.parse(time.time))) fail(`GET /time answered ${JSON.stringify(time)}`)
  console.log(
    `verify-real-model: OK - ${model} built and installed "clock" in ${((Date.now() - started) / 1000).toFixed(1)} s (${tools.join(' > ')}); GET /time answered`,
  )
} finally {
  if (child) {
    const stopped = new Promise((done) => child.once('exit', done))
    if (process.platform === 'win32') child.kill('SIGINT')
    else process.kill(-child.pid, 'SIGINT')
    await Promise.race([stopped, new Promise((done) => setTimeout(done, 10_000))])
  }
  rmSync(scratch, { recursive: true, force: true })
}

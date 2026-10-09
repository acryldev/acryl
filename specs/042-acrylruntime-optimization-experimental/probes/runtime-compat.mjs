// Small Node vs Bun compatibility probes for spec 042. Run with: node <this file> and bun <this file>.
// Read-only apart from a temp dir; starts no servers and touches no ACRYL home.
import { createRequire } from 'node:module'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '../../..')
// globalThis.Deno must be checked before process.versions.node: Deno's own Node-compat shim also
// sets process.versions.node, so checking that first mislabels every Deno run as "node".
const rt = typeof Deno !== 'undefined' ? `deno ${Deno.version.deno}` : typeof Bun !== 'undefined' ? `bun ${Bun.version}` : `node ${process.versions.node}`
const out = (name, result) => console.log(`${rt.padEnd(14)} | ${name.padEnd(46)} | ${result}`)

// P1: node-pty must deliver data and exit events (ACRYL terminal adapter: plugins/acryl-workspace/src/pty/node-pty-spawn.ts)
async function probePty() {
  try {
    const req = createRequire(resolve(repo, 'plugins/acryl-workspace/package.json'))
    const pty = req('node-pty')
    const events = []
    const p = pty.spawn('/bin/sh', ['-c', 'echo hello-from-pty'], { name: 'xterm', cols: 80, rows: 24, env: process.env })
    p.onData(d => events.push('data'))
    p.onExit(() => events.push('exit'))
    await new Promise(r => setTimeout(r, 3000))
    out('P1 node-pty data+exit events', events.includes('data') && events.includes('exit') ? 'OK' : `FAIL (events: ${JSON.stringify(events)})`)
  } catch (e) { out('P1 node-pty data+exit events', `FAIL (${e.message.split('\n')[0]})`) }
}

// P2: node:sqlite is imported by deepseek-harness session-query-sqlite
async function probeSqlite() {
  try { await import('node:sqlite'); out('P2 node:sqlite available', 'OK') }
  catch (e) { out('P2 node:sqlite available', `FAIL (${e.message.split('\n')[0]})`) }
}

// P3: which re-import mechanism returns freshly evaluated code (needed for reloading edited plugins)
async function probeReimport() {
  const dir = mkdtempSync(join(tmpdir(), 'probe042-'))
  const file = join(dir, 'plug.mjs')
  writeFileSync(file, 'globalThis.__evals = (globalThis.__evals || 0) + 1\nexport const value = globalThis.__evals\n')
  const variants = [
    ['file URL + ?v=i', i => pathToFileURL(file).href + '?v=' + i, null],
    ['bare path + ?v=i', i => file + '?v=' + i, null],
    ['same URL + delete require.cache[path]', () => pathToFileURL(file).href, () => { delete createRequire(import.meta.url).cache[file] }],
  ]
  for (const [label, spec, evict] of variants) {
    globalThis.__evals = 0
    let fresh = 0
    for (let i = 0; i < 50; i++) {
      if (evict) evict()
      const m = await import(spec(i))
      if (m.value === i + 1) fresh++
    }
    out(`P3 re-import: ${label}`, `${fresh}/50 re-evaluated`)
  }
}

// P4: Cordis plugin apply/dispose churn, with the Cordis version ACRYL ships
async function probeCordis() {
  try {
    const req = createRequire(resolve(repo, 'runtime/acryl-harness-runtime/package.json'))
    const { Context } = await import(pathToFileURL(req.resolve('@deepseek-ai/cordis')).href)
    const ctx = new Context()
    let applied = 0
    let disposed = 0
    const plugin = c => { applied++; c.effect(() => () => { disposed++ }) }
    for (let i = 0; i < 500; i++) {
      const fiber = ctx.plugin(plugin)
      await new Promise(r => setTimeout(r, 0))
      await fiber.dispose()
    }
    out('P4 Cordis apply/dispose x500', applied === 500 && disposed === 500 ? 'OK' : `FAIL (applied ${applied}, disposed ${disposed})`)
  } catch (e) { out('P4 Cordis apply/dispose x500', `FAIL (${e.message.split('\n')[0]})`) }
}

await probePty()
await probeSqlite()
await probeReimport()
await probeCordis()
process.exit(0)

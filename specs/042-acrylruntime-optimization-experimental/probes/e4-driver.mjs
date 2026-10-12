// E4: boot the real ACRYL web host directly under Bun and print the whole error chain.
// Run: ACRYL_HOME=<temp dir> ACRYL_WEB_PORT=<spare port> bun --preload ./e4-preload.ts ./e4-driver.mjs
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const { serveWeb } = await import(pathToFileURL(resolve(repo, 'apps/acryl-web/lib/index.js')).href)
const dump = (e, depth = 0, seen = new Set()) => {
  if (!e || seen.has(e) || depth > 8) return
  seen.add(e)
  console.error('  '.repeat(depth) + (e.name ?? 'Error') + ': ' + String(e.message ?? e).split('\n')[0].slice(0, 300))
  for (const x of e.errors ?? []) dump(x, depth + 1, seen)
  if (e.cause) dump(e.cause, depth + 1, seen)
}
try { const r = await serveWeb({ waitForSignal: false }); console.log('BOOTED', JSON.stringify(r).replace(/token=[^"]+/, 'token=<redacted>')); process.exit(0) }
catch (e) { dump(e); process.exit(1) }

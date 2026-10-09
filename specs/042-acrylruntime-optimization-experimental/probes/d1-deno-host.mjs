// D1: run the real ACRYL web host in serving mode under Deno and report what actually listens.
//
// Run from the repository root, with throwaway homes and a spare port (never the real ones, never 3080):
//   T=$(mktemp -d); mkdir -p $T/home $T/acryl
//   HOME=$T/home ACRYL_HOME=$T/acryl ACRYL_WEB_PORT=<spare> \
//     deno run -A --node-modules-dir=manual specs/042-acrylruntime-optimization-experimental/probes/d1-deno-host.mjs
//
// It boots, waits up to 60 s for the profile's web server, requests the spare port, prints the result and exits
// (the process exit stops the host). A printed URL alone is not evidence: 3080 is serveWeb's fallback when no web server started.
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const port = Number(process.env.ACRYL_WEB_PORT)
if (!process.env.ACRYL_HOME || !Number.isInteger(port) || port === 3080) {
  console.error('set ACRYL_HOME to a throwaway folder and ACRYL_WEB_PORT to a spare port (not 3080)')
  process.exit(2)
}
const entry = process.env.PAYLOAD ? resolve(process.env.PAYLOAD, 'lib/index.js') : resolve(repo, 'apps/acryl-web/lib/index.js') // PAYLOAD: boot a packaged payload (d6-payload.mjs) instead of the repo build
const { serveWeb } = await import(pathToFileURL(entry).href)

const dump = (error, depth = 0, seen = new Set()) => {
  if (!error || seen.has(error) || depth > 8) return
  seen.add(error)
  console.error('  '.repeat(depth) + (error.name ?? 'Error') + ': ' + String(error.message ?? error).split('\n')[0].slice(0, 300))
  for (const inner of error.errors ?? []) dump(inner, depth + 1, seen)
  if (error.cause) dump(error.cause, depth + 1, seen)
}

// Serving mode waits for a signal, so it is started and not awaited; its failure, if any, is printed.
serveWeb({}).catch((error) => {
  dump(error)
  process.exit(1)
})

let status = 'no answer'
for (let attempt = 0; attempt < 60; attempt++) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/`, { redirect: 'manual' })
    status = String(response.status)
    await response.body?.cancel()
    break
  } catch {
    await new Promise((done) => setTimeout(done, 1000))
  }
}
// Baseline under Node at 0d075c8 (node --expose-internals): 404. Pass means the host listens and answers like Node.
console.log(`GET http://127.0.0.1:${port}/ -> ${status} (Node baseline: 404)`)
process.exit(status === '404' ? 0 : 1)

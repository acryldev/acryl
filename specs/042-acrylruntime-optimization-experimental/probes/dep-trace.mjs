// 042 dependency-cut probe, part 3: which files a real session loads. Preload it into a Node process:
//   DEP_TRACE_OUT=/tmp/loaded.json node --import specs/042-.../probes/dep-trace.mjs apps/acryl-web/lib/bin.js --no-open --port 3299
// It records every module Node resolves or loads (import and require, through `module.registerHooks`) and every native addon (`process.dlopen`), and flushes
// the list to DEP_TRACE_OUT every two seconds and at exit. It changes nothing about how modules load. Run it only with an isolated HOME and ACRYL_HOME.
import { registerHooks } from 'node:module'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const out = process.env.DEP_TRACE_OUT
if (out === undefined || out === '') throw new Error('dep-trace: set DEP_TRACE_OUT to the file to write')
const files = new Set()
const record = url => { if (typeof url === 'string' && url.startsWith('file:')) files.add(fileURLToPath(url)) }

registerHooks({
  resolve(specifier, context, nextResolve) { const result = nextResolve(specifier, context); record(result.url); return result },
  load(url, context, nextLoad) { record(url); return nextLoad(url, context) },
})
const dlopen = process.dlopen
process.dlopen = function tracedDlopen(module, filename, ...rest) { files.add(filename); return dlopen.call(this, module, filename, ...rest) }

const flush = () => { try { writeFileSync(out, `${JSON.stringify([...files].sort(), null, 0)}\n`) } catch { /* the process is going away */ } }
setInterval(flush, 2000).unref()
process.on('exit', flush)

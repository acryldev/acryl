// T301 spike: run the sandbox probes with a given node-like binary as the child (the packaged ACRYL binary, run as Node, or system node).
//   mkdir -p /tmp/spike/ext /tmp/spike/secret; cp plugins/sandbox/runner.mjs /tmp/spike/; put an index.ts exporting run(input) in /tmp/spike/ext
//   (see findings) and a file in /tmp/spike/secret/key.txt; copy this file to /tmp/spike; then:  node /tmp/spike/spike.mjs <binary>
// It passes ELECTRON_RUN_AS_NODE=1 to the child, which the Electron binary needs to behave as Node. Never start it with an empty env.
import { spawn } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const bin = process.argv[2]
const here = realpathSync(dirname(new URL(import.meta.url).pathname))
const entry = join(here, 'ext', 'index.ts')
const secret = join(here, 'secret', 'key.txt')
const MARK = '\n@@aimbrace-result@@'
function run(input, { timeoutMs = 8000, env } = {}) {
  return new Promise((done) => {
    const child = spawn(
      bin,
      [
        '--permission',
        `--allow-fs-read=${join(here, 'runner.mjs')}`,
        `--allow-fs-read=${join(here, 'ext')}`,
        '--disallow-code-generation-from-strings',
        '--max-old-space-size=128',
        join(here, 'runner.mjs'),
        pathToFileURL(entry).href,
      ],
      { env, cwd: join(here, 'ext'), stdio: ['pipe', 'pipe', 'pipe'] },
    )
    let out = '',
      err = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      done({ timeout: true })
    }, timeoutMs)
    child.stdout.on('data', (c) => (out += c))
    child.stderr.on('data', (c) => (err += c))
    child.on('close', (code) => {
      clearTimeout(timer)
      const at = out.lastIndexOf(MARK)
      done(
        at === -1
          ? { code, noResult: true, err: err.slice(0, 160), out: out.slice(0, 80) }
          : JSON.parse(out.slice(at + MARK.length)),
      )
    })
    child.stdin.end(JSON.stringify({ input }))
  })
}
const asNode = { ELECTRON_RUN_AS_NODE: '1' }
const show = (label, r) => console.log(label.padEnd(22), JSON.stringify(r).slice(0, 170))
show('add (typescript)', await run({ what: 'add' }, { env: asNode }))
show('read outside folder', await run({ what: 'read', path: secret }, { env: asNode }))
show('exec a process', await run({ what: 'exec' }, { env: asNode }))
show('env inside', await run({ what: 'env' }, { env: asNode }))
show('loop -> timeout', await run({ what: 'loop' }, { env: asNode, timeoutMs: 700 }))

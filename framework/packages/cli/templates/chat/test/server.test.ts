import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

/** Throwaway homes and databases live inside the project (`.acrylblends/` is ignored by git), because a sandboxed agent may not write to the system temp folder. */
const scratch = join(fileURLToPath(new URL('..', import.meta.url)), '.acrylblends', 'test')
mkdirSync(scratch, { recursive: true })

/** A sandbox may forbid listening on a port (Codex's workspace-write does); the tests that start the real server are skipped there, and every other test runs in process. */
/**
 * Whether this environment forbids listening at all: only a sandbox's refusal (EPERM/EACCES) means the real-server test must skip. A loaded
 * machine can fail a bind transiently, so that is retried briefly; any other outcome lets the real test run, where a host that truly cannot
 * listen fails loudly instead of hiding behind a skip.
 */
const canListen = await new Promise<boolean>((done) => {
  let attempts = 0
  const probeOnce = (): void => {
    attempts += 1
    const probe = createServer()
    probe.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EPERM' || error.code === 'EACCES') done(false)
      else if (attempts < 3) setTimeout(probeOnce, 100)
      else done(true)
    })
    probe.listen(0, '127.0.0.1', () => probe.close(() => done(true)))
  }
  probeOnce()
})
const skip = canListen ? false : 'this environment does not allow listening on a port'
if (!canListen)
  console.log(
    `skipped: the tests that start the real server (${skip}); every other test ran in process`,
  )

/** Start `src/main.ts` the way `npm start` does, on a port the system chooses, and read the address it prints. */
async function start(env: Record<string, string> = {}) {
  const child = spawn(
    process.execPath,
    ['--import', './plugins/acryl-node-server/src/register.ts', 'src/main.ts'],
    {
      env: {
        ...process.env,
        PORT: '0',
        ACRYL_DOOR: 'off',
        ACRYLBLENDS_HOME: mkdtempSync(join(scratch, 'chat-home-')),
        CHAT_DB: join(mkdtempSync(join(scratch, 'chat-')), 'chat.sqlite'),
        ...env,
      },
      stdio: ['ignore', 'pipe', 'inherit'],
    },
  )
  let out = ''
  const address = await new Promise<string>((resolve, reject) => {
    child.once('exit', (code) =>
      reject(new Error(`the server exited with ${code} before it listened`)),
    )
    child.stdout.on('data', (chunk) => {
      out += chunk
      const match = /listening on (http:\/\/\S+)/.exec(out)
      if (match?.[1]) resolve(match[1])
    })
  })
  return { child, address }
}

test('the server listens on 127.0.0.1 unless HOST says otherwise', { skip }, async () => {
  const { child, address } = await start()
  try {
    assert.match(address, /^http:\/\/127\.0\.0\.1:\d+$/)
  } finally {
    child.kill('SIGTERM')
    await once(child, 'exit')
  }
})

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  test(`${signal} stops the server cleanly and frees the port`, { skip }, async () => {
    const { child, address } = await start()
    assert.equal((await fetch(`${address}/`)).status, 200)
    const started = Date.now()
    child.kill(signal)
    const [code] = await once(child, 'exit')
    assert.equal(code, 0)
    assert.ok(Date.now() - started < 5000, 'the server took too long to stop')
    await assert.rejects(fetch(address), 'the port should be free')
  })
}

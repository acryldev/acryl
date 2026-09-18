#!/usr/bin/env node
/** Read-only, local CDP capture. Run before launching Desktop with port 9229. */
import { appendFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const output = resolve(process.argv[2] ?? '/tmp/acryl-reload-diagnostics.jsonl')
mkdirSync(resolve(output, '..'), { recursive: true })
const sockets = new Set()
const targets = new Set()
let stopped = false
const write = (event, data = {}) => appendFileSync(output, `${JSON.stringify({ at: new Date().toISOString(), event, ...data })}\n`, { mode: 0o600 })
// Never retain URL credentials, queries (launch tokens), or fragments.
function localPath(value) {
  try {
    const url = new URL(value)
    return ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ? url.pathname : '[external]'
  } catch { return '[unknown]' }
}
function attach(target) {
  const socket = new WebSocket(target.webSocketDebuggerUrl)
  sockets.add(socket)
  const pending = new Map()
  const requests = new Map()
  let sequence = 0
  const send = (method, params = {}) => {
    const id = ++sequence
    socket.send(JSON.stringify({ id, method, params }))
    return new Promise(resolveReply => {
      const timeout = setTimeout(() => { pending.delete(id); resolveReply(undefined) }, 3000)
      pending.set(id, result => { clearTimeout(timeout); resolveReply(result) })
    })
  }
  socket.addEventListener('open', async () => {
    write('attached', { target: target.id })
    await send('Network.enable', { maxTotalBufferSize: 0, maxResourceBufferSize: 0 })
    await send('Runtime.enable')
    await send('Page.enable')
  })
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(String(data))
    if (message.id) {
      pending.get(message.id)?.(message.result)
      pending.delete(message.id)
      return
    }
    const p = message.params ?? {}
    const base = { target: target.id }
    if (message.method === 'Network.requestWillBeSent') {
      const path = localPath(p.request.url)
      if (path === '[external]') return
      if (requests.size >= 2000) requests.delete(requests.keys().next().value)
      requests.set(p.requestId, path)
      write('request', { ...base, id: p.requestId, path, type: p.type, method: p.request.method, time: p.timestamp })
    } else if (message.method === 'Network.responseReceived' && requests.has(p.requestId)) {
      write('response', { ...base, id: p.requestId, path: requests.get(p.requestId), status: p.response.status, mime: p.response.mimeType, time: p.timestamp })
    } else if (message.method === 'Network.loadingFailed') {
      write('request-failed', { ...base, id: p.requestId, path: requests.get(p.requestId), canceled: p.canceled, error: p.errorText, time: p.timestamp })
      requests.delete(p.requestId)
    } else if (message.method === 'Network.loadingFinished') {
      if (requests.has(p.requestId)) write('request-finished', { ...base, id: p.requestId, path: requests.get(p.requestId), bytes: p.encodedDataLength, time: p.timestamp })
      requests.delete(p.requestId)
    } else if (message.method === 'Runtime.exceptionThrown') {
      const details = p.exceptionDetails
      const description = details.exception?.description ?? details.text ?? ''
      write('exception', { ...base,
        rootSlotMissing: description.includes("before any 'root' registration"),
        exceptionClass: details.exception?.className,
        frames: (details.stackTrace?.callFrames ?? []).map(frame => ({ function: frame.functionName, path: localPath(frame.url), line: frame.lineNumber, column: frame.columnNumber })),
      })
    } else if (['Page.frameNavigated', 'Page.loadEventFired', 'Page.domContentEventFired', 'Runtime.executionContextsCleared', 'Inspector.targetCrashed'].includes(message.method)) {
      write(message.method, { ...base, path: p.frame ? localPath(p.frame.url) : undefined, time: p.timestamp })
    }
  })
  let sampling = false
  let previous
  const timer = setInterval(async () => {
    if (sampling || socket.readyState !== WebSocket.OPEN) return
    sampling = true
    try {
      const result = await send('Runtime.evaluate', {
        expression: `JSON.stringify({ready:document.readyState,root:!!document.querySelector('[data-slot="root"]'),rootError:!!document.querySelector('[data-slot-error="root"]'),mode:document.body?.dataset.dshDesktopMode??null})`,
        returnByValue: true,
      })
      const value = result?.result?.value
      if (typeof value === 'string' && value !== previous) {
        previous = value
        write('dom-state', { target: target.id, ...JSON.parse(value) })
      }
    } finally { sampling = false }
  }, 500)
  socket.addEventListener('error', () => write('debugger-connection-error', { target: target.id }))
  socket.addEventListener('close', () => {
    clearInterval(timer)
    for (const finish of pending.values()) finish(undefined)
    pending.clear()
    sockets.delete(socket)
    targets.delete(target.id)
    write('detached', { target: target.id })
  })
}
write('collector-start')
console.log(`Waiting for Desktop on 127.0.0.1:9229. Metadata capture: ${output}`)
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  stopped = true
  for (const socket of sockets) socket.close()
  write('collector-stop')
})
while (!stopped) {
  try {
    const response = await fetch('http://127.0.0.1:9229/json/list', { signal: AbortSignal.timeout(1000) })
    for (const target of await response.json()) {
      if (target.type !== 'page' || localPath(target.url) === '[external]' || !target.webSocketDebuggerUrl || targets.has(target.id)) continue
      targets.add(target.id)
      attach(target)
    }
  } catch { /* Desktop may not have started yet, or may be restarting. */ }
  await new Promise(resolveWait => setTimeout(resolveWait, 500))
}

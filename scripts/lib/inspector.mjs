/**
 * One connection to an ACRYL page through Chromium's inspector protocol: the Desktop window of `live-run.mjs desktop --inspect <port>`,
 * or a browser started with `--remote-debugging-port` on a Web run. Used by `scripts/inspect-page.mjs` (one command) and
 * `scripts/check-features.mjs` (the feature check run after a DSH upgrade).
 */

const KEY_CODES = { '.': ['Period', 190], ',': ['Comma', 188], '/': ['Slash', 191] }
const MODIFIER_BITS = { alt: 1, ctrl: 2, meta: 4, shift: 8 }

/**
 * @param {number} port - the inspector port.
 * @returns the page connection: `evaluate`, `click`, `press`, `screenshot`, `close`.
 */
export async function connectInspector(port) {
  const targets = await (await fetch(`http://127.0.0.1:${String(port)}/json`)).json()
  const page = targets.find(target => target.type === 'page' && /^http:\/\/127\.0\.0\.1:\d+\//u.test(target.url))
  if (page === undefined) throw new Error(`no ACRYL page on inspector port ${String(port)}`)
  const socket = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
  let nextId = 0
  const waiting = new Map()
  socket.onmessage = (message) => { const data = JSON.parse(message.data); if (data.id !== undefined) { waiting.get(data.id)?.(data); waiting.delete(data.id) } }
  const send = (method, params = {}) => new Promise((resolve) => { const id = ++nextId; waiting.set(id, resolve); socket.send(JSON.stringify({ id, method, params })) })
  return {
    /** Evaluate an expression in the page, awaited; throws the page's exception. */
    async evaluate(expression) {
      const reply = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
      if (reply.result?.exceptionDetails !== undefined) throw new Error(reply.result.exceptionDetails.exception?.description ?? reply.result.exceptionDetails.text)
      return reply.result?.result?.value
    },
    /** A real mouse click at CSS pixels (a user gesture, unlike element.click()). */
    async click(x, y) {
      for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 })
    },
    /** A real key press; `modifiers` from meta, shift, alt, ctrl. */
    async press(key, modifiers = []) {
      const bits = modifiers.reduce((sum, name) => sum + (MODIFIER_BITS[name] ?? 0), 0)
      const [code, keyCode] = KEY_CODES[key] ?? (key.length === 1 ? [`Key${key.toUpperCase()}`, key.toUpperCase().charCodeAt(0)] : [key, 0])
      for (const type of ['rawKeyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key, code, modifiers: bits, windowsVirtualKeyCode: keyCode })
    },
    /** @returns PNG bytes of the page. */
    async screenshot() {
      const shot = await send('Page.captureScreenshot', { format: 'png' })
      return Buffer.from(shot.result.data, 'base64')
    },
    close() { socket.close() },
  }
}

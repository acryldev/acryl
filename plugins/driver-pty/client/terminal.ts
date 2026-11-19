// The terminal tab of the agent panel: xterm.js in the page, a real terminal on the server (the `driver-pty` plugin). Output arrives as server-sent events with ids (fetch
// reads the stream, so the panel's token header can be sent; a dropped stream is reopened from the last id), keystrokes go up as POSTs batched per animation frame.
import { FitAddon } from './vendor/addon-fit.mjs'
import { Terminal } from './vendor/xterm.mjs'
import css from './vendor/xterm-css.mjs'

let PREFIX = '/api/driver-pty'
const REMEMBERED = 'driver-pty-session'

export interface TerminalView {
  /** Ends the view (not the session): the server keeps the terminal for a re-attach. */
  detach(): void
  /** Stops the session on the server. */
  stop(): Promise<void>
}

interface Options {
  /** Where the terminal goes: a node inside the panel's shadow root. */
  container: HTMLElement
  /** The panel's session token. */
  token: string
  /** The terminal driver's name (`pty:claude`). */
  driver: string
  /** The URL prefix the driver's endpoints live under (`/api/driver-pty`, or the app's mount followed by it). */
  prefix: string
  /** Called with a line of status for the panel to show (`The terminal ended (exit 0).`). */
  status(text: string): void
  /** A plugin was installed or removed while the terminal was open. */
  onChange(change: { extension: string; action: string }): void
}

interface Frame {
  event: string
  id?: string
  data: string
}

async function* frames(response: Response): AsyncGenerator<Frame> {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) return
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/gu, '\n')
    for (let end = buffer.indexOf('\n\n'); end !== -1; end = buffer.indexOf('\n\n')) {
      const block = buffer.slice(0, end)
      buffer = buffer.slice(end + 2)
      const frame: Frame = { event: 'message', data: '' }
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) frame.event = line.slice(6).trim()
        else if (line.startsWith('id:')) frame.id = line.slice(3).trim()
        else if (line.startsWith('data:')) frame.data += line.slice(5).trimStart()
      }
      yield frame
    }
  }
}

export async function openTerminal(options: Options): Promise<TerminalView> {
  const { container, token, driver, status, onChange } = options
  PREFIX = options.prefix
  const headers = { 'content-type': 'application/json', 'x-agent-panel-token': token }
  const call = (path: string, body: unknown = {}): Promise<Response> =>
    fetch(`${PREFIX}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })

  const style = document.createElement('style')
  style.textContent = `${css}\n.xterm { height: 100%; padding: 4px }`
  container.append(style)
  const host = document.createElement('div')
  host.style.cssText = 'width:100%;height:100%'
  container.append(host)
  const term = new Terminal({ cursorBlink: true, fontSize: 13, convertEol: false })
  const fit = new FitAddon()
  term.loadAddon(fit)
  term.open(host)
  fit.fit()

  // A terminal the page opened earlier is re-attached (a reload keeps the session on the server); otherwise a new one starts.
  let id: string | undefined
  try {
    const remembered = JSON.parse(sessionStorage.getItem(REMEMBERED) ?? 'null') as {
      id: string
      driver: string
    } | null
    if (remembered?.driver === driver) id = remembered.id
  } catch {
    // No storage: always a new terminal.
  }
  let ended = false
  let lastId = 0
  const abort = new AbortController()

  const start = async (): Promise<boolean> => {
    const reply = await call('/sessions', { driver, cols: term.cols, rows: term.rows })
    const body = (await reply.json().catch(() => ({}))) as { id?: string; error?: string }
    if (!reply.ok || !body.id) {
      status(body.error ?? `The terminal could not start (${reply.status}).`)
      return false
    }
    id = body.id
    lastId = 0
    try {
      sessionStorage.setItem(REMEMBERED, JSON.stringify({ id, driver }))
    } catch {
      // Not remembered.
    }
    return true
  }

  /** Reads the output until the session ends; a dropped stream is opened again from the last id. */
  const attach = async (): Promise<void> => {
    let failures = 0
    while (!ended && !abort.signal.aborted && id) {
      try {
        const response = await fetch(`${PREFIX}/${id}/output`, {
          headers: { ...headers, ...(lastId > 0 ? { 'last-event-id': String(lastId) } : {}) },
          signal: abort.signal,
        })
        if (response.status === 404 && lastId === 0) {
          // The remembered terminal is gone: start a new one.
          sessionStorage.removeItem(REMEMBERED)
          if (!(await start())) return
          continue
        }
        if (!response.ok) throw new Error(String(response.status))
        failures = 0
        for await (const frame of frames(response)) {
          if (frame.event === 'reset') term.reset()
          else if (frame.event === 'change')
            onChange(JSON.parse(frame.data) as { extension: string; action: string })
          else if (frame.event === 'data') {
            if (frame.id) lastId = Number(frame.id)
            term.write(JSON.parse(frame.data) as string)
          } else if (frame.event === 'exit') {
            ended = true
            const code = (JSON.parse(frame.data) as { code: number | null }).code
            status(
              code === null ? 'The terminal was closed.' : `The terminal ended (exit ${code}).`,
            )
            sessionStorage.removeItem(REMEMBERED)
          }
        }
      } catch {
        if (abort.signal.aborted) return
        if (++failures > 5) {
          status('The connection to the terminal was lost.')
          return
        }
        await new Promise((resolve) => setTimeout(resolve, 500 * failures))
      }
    }
  }

  // Keystrokes: one request per animation frame, in order.
  let pending = ''
  let scheduled = false
  let sending: Promise<unknown> = Promise.resolve()
  term.onData((data) => {
    pending += data
    if (scheduled) return
    scheduled = true
    requestAnimationFrame(() => {
      scheduled = false
      const batch = pending
      pending = ''
      if (id && !ended && batch !== '')
        sending = sending.then(() => call(`/${id}/input`, { data: batch }))
    })
  })
  const resize = new ResizeObserver(() => {
    fit.fit()
    if (id && !ended) void call(`/${id}/resize`, { cols: term.cols, rows: term.rows })
  })
  resize.observe(container)

  if (!id && !(await start())) return { detach() {}, stop: async () => {} }
  void attach()
  term.focus()
  return {
    detach() {
      abort.abort()
      resize.disconnect()
      term.dispose()
      container.replaceChildren()
    },
    async stop() {
      if (id) await call(`/${id}/stop`)
    },
  }
}

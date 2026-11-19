// The panel in the page: a button at the corner opens a side panel (a shadow root, so the app's CSS cannot touch it and it cannot touch the app's). It asks the app's
// agent through POST <prefix>/ask, shows the answer as it arrives, and reloads the page after a run that installed or removed a plugin. `panel.js` calls
// `start` with the prefix the app is served under (the root of its own server, or `/app` when the ACRYL frame hosts it).
import { describePageStep, describeTool } from './describe.ts'
import { createPickGeneration } from './driver-pick.ts'
import { FRAME_MODE_EVENT, frameViewOf, panelVariant, panelVisible } from './frame.ts'
import { renderMarkdown } from './markdown.ts'

let PREFIX = '/api/agent-panel'
/** Where the composer's draft is kept across a page reload or a remount. */
const DRAFT_KEY = 'agent-panel-draft'
/** Set when a visitor closed the Assistant, so it stays closed on the next page. */
const ASSISTANT_CLOSED_KEY = 'agent-panel-assistant-closed'
/** What the Assistant tells a visitor first: what it can do, and that it cannot change the app. */
export const ASSISTANT_NOTE =
  'The assistant can use the app for you: open pages, filter, fill in forms. It cannot change the app.'

/**
 * Why a submit does not send: nothing typed, or a run still going. The panel says it in its log instead of returning silently - a Send that does nothing and
 * says nothing reads as a broken button, and one was observed doing exactly that in the frame gate (empty log, enabled Send, no run).
 */
export type SendRefusal = 'empty' | 'busy'
export function sendRefusal(message: string, following: boolean): SendRefusal | undefined {
  if (message.trim() === '') return 'empty'
  if (following) return 'busy'
  return undefined
}

/**
 * Whether the page may be replaced to show a change a run made. Asked at the moment of reloading, not earlier: text in the composer or the focus in it
 * belongs to the person, and a run still going must not lose its page either.
 */
export function reloadDecision(state: {
  readonly value: string
  readonly focused: boolean
  readonly following: boolean
}): boolean {
  return state.value.trim() === '' && !state.focused && !state.following
}

/** Where the last panel-initiated reload is recorded, for the page after it and for a gate looking at a failure. */
export const RELOAD_MARKER = 'agent-panel-reload'

/** Replace the page, saying why first: a warning the page's own error report and the frame gate both see, and a marker the reloaded page keeps. */
function reloadPage(reason: string): void {
  try {
    sessionStorage.setItem(RELOAD_MARKER, JSON.stringify({ reason, at: Date.now() }))
  } catch {
    // No storage: the warning below still names it.
  }
  console.warn(`agent-panel: reloading the page (${reason})`)
  location.reload()
}

interface Session {
  token: string
  /** The production Assistant: the app's own agent drives the page for a visitor. */
  assistant?: boolean
  /** The app's production environment names the Assistant (ACRYL_ASSISTANT=on); the frame's Preview shows it even though the frame host runs in development. */
  assistantInProduction?: boolean
  drivers: Array<{
    name: string
    kind: 'chat' | 'terminal'
    /** A terminal driver says where its view module is and which prefix its endpoints live under (the driver's own plugin serves both). */
    view?: { module: string; prefix: string }
  }>
}
interface PanelEvent {
  event: string
  data: Record<string, unknown>
}

/** The events of a server-sent stream, as they arrive. */
async function* events(response: Response): AsyncGenerator<PanelEvent> {
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
      let event = 'message'
      let data = ''
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) data += line.slice(5).trim()
      }
      if (data !== '') yield { event, data: JSON.parse(data) as Record<string, unknown> }
    }
  }
}

/** What a run is read from: its events, and a way to end the run. A socket and a stream give the same events. */
interface RunSource {
  readonly events: AsyncIterable<PanelEvent>
}

/** The door's id for this page, when the door is in it: sent with a question so the agent's calls (which name no window) drive this page and not another open one. */
function doorPage(): { page?: string } {
  const published = (window as unknown as Record<symbol, { windowId?: unknown } | undefined>)[
    Symbol.for('acryl.door.page')
  ]
  return typeof published?.windowId === 'string' ? { page: published.windowId } : {}
}

/** A WebSocket is not one of the browser's six connections per host, so the panel's Stop and a run still work when two windows stream their own state. */
let socketBroken = false
let activeSocket: WebSocket | undefined

/** The server did not accept the token: it is not the one this page was given (the app restarted since, which `node --watch` does at every change of a file). */
class Refused extends Error {}

/**
 * Open the run socket and send the token and the first action. Resolves once the server has accepted the token (its `accepted` frame), with the socket and its events: the
 * frames of the run as panel events, until the socket closes. One set of handlers serves the socket for its whole life, so a frame is never handed to a handler that was
 * replaced. Rejects with `Refused` when the token is not accepted, and with another error when the page cannot upgrade (a proxy, a server without `ws`): the caller falls back
 * to the stream.
 */
function openSocket(
  token: string,
  action: Record<string, unknown>,
): Promise<{ socket: WebSocket; events: AsyncGenerator<PanelEvent> }> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(
      `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${PREFIX}/run/ws`,
    )
    const queue: PanelEvent[] = []
    let wake: (() => void) | undefined
    let closed = false
    let accepted = false
    const timer = setTimeout(() => {
      socket.close()
      reject(new Error('the socket was not accepted in time'))
    }, 4000)
    socket.onopen = () => {
      socket.send(JSON.stringify({ t: 'hello', token }))
      socket.send(JSON.stringify(action))
    }
    socket.onmessage = (message) => {
      try {
        const frame = JSON.parse(String(message.data)) as { e?: unknown; d?: unknown }
        if (frame.e === 'accepted' && !accepted) {
          accepted = true
          clearTimeout(timer)
          resolve({ socket, events: read() })
        } else if (typeof frame.e === 'string')
          queue.push({ event: frame.e, data: (frame.d ?? {}) as Record<string, unknown> })
      } catch {
        // Not a frame of ours.
      }
      wake?.()
    }
    socket.onclose = (event) => {
      clearTimeout(timer)
      closed = true
      if (!accepted)
        reject(
          event.code === 4401
            ? new Refused('the token was not accepted')
            : new Error('the socket closed before it was accepted'),
        )
      wake?.()
    }
    socket.onerror = () => {
      clearTimeout(timer)
      if (!accepted) reject(new Error('the server refused the upgrade'))
    }
    async function* read(): AsyncGenerator<PanelEvent> {
      for (;;) {
        const next = queue.shift()
        if (next !== undefined) {
          yield next
          continue
        }
        if (closed) return
        await new Promise<void>((done) => {
          wake = done
        })
      }
    }
  })
}

const css = `
:host { all: initial }
* { box-sizing: border-box; font: 14px system-ui, sans-serif }
button.open { position: fixed; right: 16px; bottom: 16px; z-index: 2147483000; border: 0; border-radius: 24px; padding: 10px 16px; background: #1f2937; color: #fff; cursor: pointer; box-shadow: 0 2px 8px #0004 }
section { position: fixed; top: 0; right: 0; bottom: 0; width: min(380px, 100vw); z-index: 2147483001; display: none; flex-direction: column; background: #fff; color: #111827; border-left: 1px solid #d1d5db; box-shadow: -2px 0 12px #0003 }
section.shown { display: flex }
header { display: flex; gap: 8px; align-items: center; padding: 8px 12px; border-bottom: 1px solid #e5e7eb }
header strong { flex: 1 }
#term { flex: 1; min-height: 0; background: #000 }
#term[hidden], form[hidden], #log[hidden] { display: none }
#log { flex: 1; overflow: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px }
.msg { white-space: pre-wrap; padding: 8px 10px; border-radius: 8px; background: #f3f4f6 }
.me { background: #dbeafe; align-self: flex-end }
.tool { font: 12px ui-monospace, monospace; color: #4b5563; background: none; padding: 0 }
.err { background: #fee2e2 }
.msg.md { white-space: normal; overflow-wrap: anywhere }
.md > :first-child { margin-top: 0 } .md > :last-child { margin-bottom: 0 }
.md p, .md ul, .md ol, .md pre, .md blockquote { margin: 0 0 8px }
.md h3, .md h4, .md h5, .md h6 { margin: 10px 0 4px; font-weight: 600 } .md h3 { font-size: 16px } .md h4, .md h5, .md h6 { font-size: 14px }
.md ul, .md ol { padding-left: 20px } .md li { margin: 2px 0 }
.md code { font: 12px ui-monospace, monospace; background: #e5e7eb; padding: 1px 4px; border-radius: 4px }
.md pre { overflow: auto; background: #111827; color: #f9fafb; padding: 8px 10px; border-radius: 6px }
.md pre code { background: none; padding: 0; color: inherit; white-space: pre }
.md blockquote { border-left: 3px solid #d1d5db; padding-left: 10px; color: #4b5563 }
.md a { color: #1d4ed8 }
.working { font: 12px ui-monospace, monospace; color: #6b7280; padding: 0 }
form { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; border-top: 1px solid #e5e7eb }
textarea { width: 100%; min-height: 64px; resize: vertical; padding: 8px; border: 1px solid #d1d5db; border-radius: 6px }
.row { display: flex; gap: 8px; align-items: center }
.row button, header button { padding: 6px 12px; border: 1px solid #d1d5db; border-radius: 6px; background: #fff; cursor: pointer }
.row button.send { background: #1f2937; color: #fff; border-color: #1f2937 }
.row button:disabled { opacity: 0.45; cursor: not-allowed }
.notice, .steps, .tab { display: none }
/* The Assistant (production): docked on the right in the app's dark surface, one tab, a note, the conversation and one line to ask. */
:host([data-assistant]) section { width: min(330px, 100vw); background: #18181b; color: #e4e4e7; border-left: 1px solid #27272a; box-shadow: none }
:host([data-assistant]) header { padding: 0 12px; border-bottom: 1px solid #27272a; min-height: 38px }
:host([data-assistant]) header select, :host([data-assistant]) header strong { display: none }
:host([data-assistant]) .tab { display: block; flex: 1; align-self: stretch }
:host([data-assistant]) .tab span { display: inline-block; height: 100%; padding: 10px 6px 8px; font-size: 12.5px; font-weight: 600; color: #fafafa; border-bottom: 2px solid #5468ff }
:host([data-assistant]) header button.close { border: 0; background: none; color: #a1a1aa; font-size: 18px; padding: 2px 6px }
:host([data-assistant]) .notice { display: block; margin: 8px 10px 0; padding: 7px 9px; border-radius: 6px; background: #15291e; color: #a7f3c0; font-size: 12px; line-height: 1.5 }
:host([data-assistant]) #log { padding: 10px; gap: 10px }
:host([data-assistant]) .msg { background: #232326; color: #e4e4e7; border-radius: 8px; padding: 9px 11px; line-height: 1.45; max-width: 92% }
:host([data-assistant]) .me { background: #23264f; color: #eef0ff; align-self: flex-end }
:host([data-assistant]) .err { background: #3b1d1d; color: #fecaca }
:host([data-assistant]) .tool, :host([data-assistant]) .working { background: none; color: #a1a1aa; padding: 0 2px }
:host([data-assistant]) .steps { display: block; margin-top: 6px; font: 11.5px ui-monospace, monospace; color: #a1a1aa; white-space: normal }
:host([data-assistant]) .steps:empty { display: none }
:host([data-assistant]) .md code { background: #2e2e33; color: #e4e4e7 }
:host([data-assistant]) form { border-top: 0; padding: 10px }
:host([data-assistant]) textarea { min-height: 0; height: 38px; resize: none; background: #18181b; color: #e4e4e7; border: 1px solid #3f3f46; border-radius: 8px; padding: 9px 11px; font-size: 13px }
:host([data-assistant]) textarea:focus { outline: none; border-color: #5468ff }
:host([data-assistant]) .row { display: none }
:host([data-assistant][data-following]) .row { display: flex; justify-content: flex-end }
:host([data-assistant]) .row .send { display: none }
:host([data-assistant]) .row button { background: none; color: #e4e4e7; border-color: #3f3f46 }
:host([data-assistant]) button.open { background: #18181b; color: #fafafa; border: 1px solid #3f3f46 }
`

/** Start the panel against the app served at `prefix` (`/api/agent-panel` at the root, `/app/api/agent-panel` in the frame). */
export async function start(prefix: string = '/api/agent-panel'): Promise<void> {
  PREFIX = prefix
  // A panel that is mounted again replaces the previous one: one live host, and the readiness mark then belongs to the instance being wired now. A
  // duplicated or reused host once let a submit reach a form that no live instance was listening to (the frame gate's empty-log failure, 2026-11-02).
  // The previous instance's run socket goes with it, so its watch ends instead of writing into a detached log.
  activeSocket?.close()
  activeSocket = undefined
  document.getElementById('agent-panel')?.remove()
  const reply = await fetch(`${PREFIX}/session`)
  if (!reply.ok) return
  let session = (await reply.json()) as Session

  // The frame's Build is the builder's screen, and its Preview shows the app as production would: the panel takes the Assistant's variant only where
  // production has it, and it is hidden everywhere the canvas should be the app alone. A direct page (no frame) is unchanged.
  const frame = frameViewOf()
  const assistant = panelVariant(session, frame)
  const host = document.createElement('div')
  host.id = 'agent-panel'
  if (assistant) host.dataset.assistant = ''
  const shadow = host.attachShadow({ mode: 'open' })
  shadow.innerHTML = `<style>${css}</style>
    <button class="open" type="button">${assistant ? 'Assistant' : 'Ask the agent'}</button>
    <section aria-label="${assistant ? 'Assistant' : 'Agent panel'}">
      <header><strong>Agent</strong><div class="tab"><span>Assistant</span></div><select aria-label="Agent">${session.drivers
        .map((d) => `<option>${d.name}</option>`)
        .join(
          '',
        )}</select><button class="termstop" type="button" hidden>Stop terminal</button><button class="close" type="button" aria-label="Close">×</button></header>
      <p class="notice">${ASSISTANT_NOTE}</p>
      <div id="log" role="log"></div>
      <div id="term" hidden></div>
      <form><textarea aria-label="Message" placeholder="${assistant ? 'Ask the assistant…' : 'What should the app do?'}"${assistant ? ' rows="1"' : ''}></textarea>
        <div class="row"><button class="send" type="submit">Send</button><button class="stop" type="button" disabled>Stop</button></div></form>
    </section>`
  const $ = <T extends Element>(selector: string): T => shadow.querySelector<T>(selector)!
  const panel = $<HTMLElement>('section')
  const log = $<HTMLElement>('#log')
  const input = $<HTMLTextAreaElement>('textarea')
  // The composer survives the page being replaced (a run that changes files reloads the page, and a mount replaces this panel): the draft is kept
  // beside the page, restored into this textarea before the form is wired, and cleared when a submit sends it.
  try {
    input.value = sessionStorage.getItem(DRAFT_KEY) ?? ''
  } catch {
    // No storage: the draft lives as long as this document.
  }
  input.addEventListener('input', () => {
    try {
      sessionStorage.setItem(DRAFT_KEY, input.value)
    } catch {
      // No storage: the draft lives as long as this document.
    }
  })
  const send = $<HTMLButtonElement>('.send')
  const stop = $<HTMLButtonElement>('.stop')
  const driver = $<HTMLSelectElement>('select')
  const term = $<HTMLElement>('#term')
  const termStop = $<HTMLButtonElement>('.termstop')
  termStop.addEventListener('click', () => void terminal?.stop())
  const form = $<HTMLFormElement>('form')
  document.body.append(host)
  const applyFrame = (): void => {
    host.style.display = panelVisible(frame, assistant) ? '' : 'none'
  }
  window.addEventListener(FRAME_MODE_EVENT, applyFrame)
  applyFrame()
  const kindOf = (name: string): 'chat' | 'terminal' =>
    session.drivers.find((d) => d.name === name)?.kind ?? 'chat'
  let terminal: { detach(): void; stop(): Promise<void> } | undefined
  // A pick can land while an earlier pick's terminal is still loading (the page also restores a remembered terminal at
  // start). Only the latest pick may apply its result; a stale terminal must never replace the form the person chose.
  const picks = createPickGeneration()
  // A terminal driver swaps the chat for the driver's own terminal (loaded from the plugin that provides it, only when asked for).
  const choose = async (): Promise<void> => {
    const generation = picks.begin()
    const name = driver.value
    terminal?.detach()
    terminal = undefined
    const isTerminal = kindOf(name) === 'terminal'
    log.hidden = isTerminal
    form.hidden = isTerminal
    term.hidden = !isTerminal
    termStop.hidden = !isTerminal
    if (!isTerminal) return
    const selected = session.drivers.find((entry) => entry.name === name)
    if (selected?.view === undefined) {
      line('This terminal driver does not provide its view.', 'err')
      return
    }
    try {
      const url = selected.view.module
      const { openTerminal } = (await import(url)) as {
        openTerminal(options: {
          container: HTMLElement
          token: string
          driver: string
          prefix: string
          status(text: string): void
          onChange(change: { extension: string; action: string }): void
        }): Promise<{ detach(): void; stop(): Promise<void> }>
      }
      await refreshSession()
      const opened = await openTerminal({
        container: term,
        token: session.token,
        driver: name,
        prefix: selected.view.prefix,
        status: (text) => line(text, 'tool'),
        onChange: (change) => {
          line(`plugin ${change.extension}: ${change.action}`, 'tool')
          line('Reloading the page to show it.', 'tool')
          setTimeout(() => location.reload(), 900)
        },
      })
      if (!picks.isCurrent(generation)) {
        opened.detach()
        return
      }
      terminal = opened
    } catch (error) {
      if (!picks.isCurrent(generation)) return
      line(
        `The terminal could not open: ${error instanceof Error ? error.message : String(error)}`,
        'err',
      )
      log.hidden = false
    }
  }
  driver.addEventListener('change', () => void choose())
  // The panel sits beside the page, not over it: while it is open the page is narrower by the panel's width, so its header and right-hand columns stay in view. (An element of the page
  // that is positioned fixed to the window is not part of that layout and can still lie under the panel.)
  const root = document.documentElement
  const docked = ['margin-right'] as const
  const saved = new Map<string, [string, string]>()
  const dock = (open: boolean): void => {
    if (open) {
      for (const property of docked)
        saved.set(property, [
          root.style.getPropertyValue(property),
          root.style.getPropertyPriority(property),
        ])
      // The panel's own width (the Assistant's is narrower than the builder's), so the page meets its edge with no gap.
      root.style.setProperty(
        'margin-right',
        `${String(Math.ceil(panel.getBoundingClientRect().width))}px`,
        'important',
      )
    } else {
      for (const property of docked) {
        const [value, priority] = saved.get(property) ?? ['', '']
        if (value === '') root.style.removeProperty(property)
        else root.style.setProperty(property, value, priority)
      }
      saved.clear()
    }
  }
  const show = (open: boolean, focus = true): void => {
    const was = panel.classList.contains('shown')
    panel.classList.toggle('shown', open)
    $<HTMLButtonElement>('button.open').hidden = open && assistant
    if (open !== was) dock(open)
    if (open && focus) input.focus()
    // Other corner buttons of the page (the feedback button) stand clear of the panel.
    window.dispatchEvent(new Event('agent-panel:layout'))
  }
  const remember = (closed: boolean): void => {
    try {
      if (closed) sessionStorage.setItem(ASSISTANT_CLOSED_KEY, '1')
      else sessionStorage.removeItem(ASSISTANT_CLOSED_KEY)
    } catch {
      // No storage: the Assistant opens again on the next page.
    }
  }
  $('button.open').addEventListener('click', () => {
    show(true)
    if (assistant) remember(false)
  })
  $('button.close').addEventListener('click', () => {
    show(false)
    if (assistant) remember(true)
  })
  // Enter asks (Shift+Enter is a new line): the Assistant has one line to ask in and no Send button.
  if (assistant)
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault()
        form.requestSubmit()
      }
    })
  const line = (text: string, kind = ''): HTMLElement => {
    const el = document.createElement('div')
    el.className = `msg ${kind}`
    el.textContent = text
    log.append(el)
    log.scrollTop = log.scrollHeight
    return el
  }

  // A run belongs to the app, not to this page: it goes on when the page reloads (the door reloads it after a plugin change, an agent may move it to another page) and the page that
  // loads next follows it again. Only Stop cancels it.
  const headers = { 'content-type': 'application/json', 'x-agent-panel-token': session.token }
  /**
   * The token belongs to one start of the app: `node --watch` restarts it at every change of a file, and a page left open across that restart holds a token the new server
   * does not know. Ask for the session again; the caller tries once more with what it gets.
   */
  const refreshSession = async (): Promise<void> => {
    const reply = await fetch(`${PREFIX}/session`)
    if (!reply.ok) return
    session = (await reply.json()) as Session
    headers['x-agent-panel-token'] = session.token
  }
  let following = false
  const stopRun = (): void => {
    // On the run's socket when there is one: a request would wait behind the browser's six connections per host.
    if (activeSocket?.readyState === WebSocket.OPEN)
      activeSocket.send(JSON.stringify({ t: 'stop' }))
    else void fetch(`${PREFIX}/stop`, { method: 'POST', headers })
  }
  stop.addEventListener('click', stopRun)
  // The door's "Agent is driving" bar has a Stop too (the same page): it ends this run.
  window.addEventListener('acryl:stop-run', stopRun)
  const REFUSED = Symbol('refused')
  /** A run over the socket when the server upgrades, else over the stream, with one console warning saying why. `REFUSED` when the server does not know the token. */
  const tryOpenRun = async (
    action: { t: 'ask'; message: string; driver: string; page?: string } | { t: 'follow' },
  ): Promise<RunSource | { error: string } | undefined | typeof REFUSED> => {
    if (!socketBroken && typeof WebSocket !== 'undefined') {
      try {
        const { socket, events: frames } = await openSocket(session.token, action)
        activeSocket = socket
        socket.addEventListener('close', () => {
          if (activeSocket === socket) activeSocket = undefined
        })
        return { events: frames }
      } catch (cause) {
        if (cause instanceof Refused) return REFUSED
        socketBroken = true
        console.warn(
          `agent-panel: the run could not open a WebSocket (${cause instanceof Error ? cause.message : String(cause)}); using server-sent events, which count against the browser's six connections per host`,
        )
      }
    }
    if (action.t === 'ask') {
      const response = await fetch(`${PREFIX}/ask`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ message: action.message, driver: action.driver, page: action.page }),
      })
      if (response.status === 403) return REFUSED
      if (!response.ok)
        return {
          error:
            ((await response.json().catch(() => ({}))) as { error?: string }).error ??
            `The panel answered ${response.status}.`,
        }
      return { events: events(response) }
    }
    const latest = await fetch(`${PREFIX}/run`, { headers })
    if (latest.status === 403) return REFUSED
    return latest.ok && (latest.headers.get('content-type') ?? '').includes('text/event-stream')
      ? { events: events(latest) }
      : undefined
  }
  /** `tryOpenRun`, and when the token was refused, a new session and one more try without the person seeing anything; a second refusal is shown. */
  const openRun = async (
    action: { t: 'ask'; message: string; driver: string; page?: string } | { t: 'follow' },
  ): Promise<RunSource | { error: string } | undefined> => {
    const first = await tryOpenRun(action)
    if (first !== REFUSED) return first
    await refreshSession()
    const second = await tryOpenRun(action)
    return second === REFUSED
      ? { error: 'the panel was not accepted (reload the page and try again)' }
      : second
  }
  /**
   * Show one run, as its events come, until it ends. `own` is true for a run this page just started (its question is on screen); a run found on load is shown from its question, and
   * a run that had already ended before the page loaded is only shown, never reloads the page.
   */
  const watch = async (source: RunSource, own: boolean): Promise<void> => {
    let live = true
    let changed = false
    // Every run the server finishes ends with `done` or `error`; a stream that stops without either lost its server, and the run with it.
    let finished = false
    let answer: HTMLElement | undefined
    let answered = ''
    // The Assistant's steps on the page, shown under its answer in one line, as the person reads what it did.
    const steps: string[] = []
    const stepsLine = document.createElement('div')
    stepsLine.className = 'steps'
    // A coding agent started headless says little until it is done, so the panel says it is working, and for how long (from when the run began, not from when this page loaded).
    let started = Date.now()
    let working: HTMLElement | undefined
    let timer: ReturnType<typeof setInterval> | undefined
    const tick = (): void => {
      if (working === undefined) return
      const seconds = Math.max(0, Math.floor((Date.now() - started) / 1000))
      working.textContent = `Working... ${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, '0')}`
      log.append(working)
    }
    // The panel is busy once there is a run to show. A page that just loaded asks the server for the latest run first, and "there is none" must not make a message typed in that moment
    // wait or vanish, so a run that is only being looked for does not count (it begins at its first event).
    const begin = (): void => {
      if (working !== undefined) return
      following = true
      host.dataset.following = '1'
      send.disabled = true
      stop.disabled = false
      working = line('', 'working')
      tick()
      timer = setInterval(tick, 1000)
    }
    if (own) begin()
    try {
      for await (const { event, data } of source.events) {
        if (event === 'idle') continue
        begin()
        if (event === 'run') {
          if (typeof data.startedAt === 'number') started = data.startedAt
          tick()
          live = data.ended !== true
          if (!own) {
            if (typeof data.message === 'string') line(data.message, 'me')
            if (typeof data.driver === 'string' && kindOf(data.driver) === 'chat')
              driver.value = data.driver
            const recent =
              data.ended !== true ||
              (typeof data.endedAt === 'number' && Date.now() - data.endedAt < 120_000)
            if (recent) show(true)
          }
        } else if (event === 'text') {
          answer ??= line('', 'md')
          answered += String(data.text ?? '')
          answer.replaceChildren(renderMarkdown(answered, document))
          if (assistant) {
            stepsLine.textContent = steps.join(' · ')
            answer.append(stepsLine)
          }
          log.scrollTop = log.scrollHeight
        } else if (event === 'tool') {
          if (assistant) {
            const step = describePageStep(data)
            if (step !== undefined) steps.push(step)
            continue
          }
          const described = describeTool(data)
          if (described !== undefined) line(described, 'tool')
        } else if (event === 'change') {
          changed = true
          line(`plugin ${String(data.extension)}: ${String(data.action)}`, 'tool')
        } else if (event === 'error') {
          finished = true
          line(String(data.message ?? 'The run failed.'), 'err')
        } else if (event === 'done') {
          finished = true
          changed = changed || data.changed === true
        }
      }
      if (live && working !== undefined && !finished)
        line(
          'The app stopped while the agent was working, and the run ended with it (`npm run dev` restarts the app when a file it runs changes). Ask again to go on.',
          'err',
        )
    } catch (error) {
      line(`The request failed: ${error instanceof Error ? error.message : String(error)}`, 'err')
    } finally {
      if (timer !== undefined) clearInterval(timer)
      if (working !== undefined) {
        working.remove()
        following = false
        delete host.dataset.following
        send.disabled = false
        stop.disabled = true
      }
    }
    // A plugin was installed or removed while this page watched: the new feature is served by the running app, so the page only needs to be loaded again.
    // The panel lives inside the app's own page (it cannot refresh the frame's canvas from here), so the page reload is the app's refresh - but the decision
    // to reload is made at the moment of reloading, never on a check made a second earlier: a person (or the frame gate) can start typing in between, and a
    // reload then replaces the page under their text (the frame gate's empty-composer dump, 2026-11-02).
    if (live && changed) {
      line('Reloading the page to show it.', 'tool')
      setTimeout(() => {
        if (
          reloadDecision({
            value: input.value,
            focused: host.shadowRoot?.activeElement === input,
            following,
          })
        )
          reloadPage('a plugin changed')
      }, 900)
    }
  }
  form.addEventListener('submit', async (submitted) => {
    submitted.preventDefault()
    const refusal = sendRefusal(input.value, following)
    if (refusal !== undefined) {
      line(
        refusal === 'empty' ? 'Type a message first.' : 'A run is already going; stop it first.',
        'err',
      )
      return
    }
    const message = input.value.trim()
    input.value = ''
    try {
      sessionStorage.removeItem(DRAFT_KEY)
    } catch {
      // No storage.
    }
    // The message is sent: the composer is empty and the person is not typing, so it gives the focus back. A run that installs a plugin reloads the page
    // afterwards, and that reload must not be refused for a focus nobody is using.
    input.blur()
    line(message, 'me')
    try {
      const run = await openRun({ t: 'ask', message, driver: driver.value, ...doorPage() })
      if (run === undefined) return
      if ('error' in run) {
        line(run.error, 'err')
        return
      }
      await watch(run, true)
    } catch (error) {
      line(`The request failed: ${error instanceof Error ? error.message : String(error)}`, 'err')
    }
  })
  // The Assistant is open beside the page unless the visitor closed it.
  if (assistant) {
    let closed = false
    try {
      closed = sessionStorage.getItem(ASSISTANT_CLOSED_KEY) === '1'
    } catch {
      // No storage: open.
    }
    show(!closed, false)
  }
  // The form is wired: a script (the frame gate included) waits for this instead of guessing that the panel can be submitted, and a panel that never got
  // this far says so by the mark's absence - together with the visible guards above, no submit can vanish without a trace.
  host.dataset.ready = '1'
  // The latest run, if there is one: shown again after a reload (its question, its events), and followed if it is still going. The server records a run
  // before it answers the ask that started it (startRun sets the current run, then follow answers), so a page that asks after that answer always finds
  // it - no client poll is needed. A run the app server itself restarted away (a file change the run made) no longer exists for that server to show.
  try {
    const latest = await openRun({ t: 'follow' })
    if (latest !== undefined && !('error' in latest)) void watch(latest, false)
  } catch {
    // No run to show.
  }
  // A terminal that was open before a reload is still running on the server: show it again.
  try {
    const remembered = JSON.parse(sessionStorage.getItem('driver-pty-session') ?? 'null') as {
      driver?: string
    } | null
    if (remembered?.driver && kindOf(remembered.driver) === 'terminal') {
      driver.value = remembered.driver
      show(true)
      void choose()
    }
  } catch {
    // No storage: nothing to show again.
  }
}

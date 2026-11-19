/**
 * The browser module served at `/api/state/client.js`, kept as text so it travels with the plugin wherever the plugin goes (copied into an app as source, or bundled): there is
 * no file to find at run time and no compiler needed to serve it. `String.raw` keeps every backslash as written, so what is below is the module exactly as the browser gets it.
 * The code has no imports and uses no backtick or dollar-brace of its own.
 *
 *   import { watch } from '/api/state/client.js'
 *   const stop = watch('tasks.count', (value) => { badge.textContent = String(value) })
 *
 * One WebSocket for the whole page carries every key; a WebSocket is not one of the browser's six connections per host, so a page that watches ten keys, in as many windows,
 * leaves every one of them free for requests. Where the WebSocket cannot open (no `ws` package on the server, a proxy that does not upgrade), each key is followed by its
 * event stream instead, with one console warning.
 */
export const CLIENT_SOURCE = String.raw`// acryl-state: watch(key, onValue, onError?) follows a state key over one WebSocket for the page.
const HEARTBEAT_SILENCE_MS = 45000
const RETRY_MIN_MS = 250
const RETRY_MAX_MS = 10000

const here = import.meta.url
const watchers = new Map()
const latest = new Map()
const streams = new Map()
const complained = new Set()
let socket
let timer
let watchdog
let attempts = 0
let opened = false
let following = 'socket'
let suspended = false
let warnedStream = false

const socketUrl = () => {
  const url = new URL('ws', here)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.href
}
const streamUrl = (key) => new URL(encodeURIComponent(key) + '/events?json=1', here).href

const deliver = (key, text) => {
  if (latest.get(key) === text) return
  latest.set(key, text)
  let value
  try {
    value = JSON.parse(text)
  } catch {
    return
  }
  for (const watcher of [...(watchers.get(key) ?? [])]) {
    try {
      watcher.onValue(value)
    } catch (cause) {
      console.error('acryl-state: a watcher of ' + key + ' threw', cause)
    }
  }
}

const fail = (key, message) => {
  const set = watchers.get(key)
  if (set === undefined) return
  let told = false
  for (const watcher of [...set]) {
    if (watcher.onError === undefined) continue
    told = true
    try {
      watcher.onError(new Error(message))
    } catch (cause) {
      console.error('acryl-state: an error handler of ' + key + ' threw', cause)
    }
  }
  if (!told && !complained.has(key)) {
    complained.add(key)
    console.warn('acryl-state: ' + key + ': ' + message)
  }
}

const send = (frame) => {
  if (socket !== undefined && socket.readyState === 1) socket.send(JSON.stringify(frame))
}

const arm = () => {
  clearTimeout(watchdog)
  watchdog = setTimeout(() => lost(socket), HEARTBEAT_SILENCE_MS)
}

const closeSocket = () => {
  clearTimeout(watchdog)
  const current = socket
  socket = undefined
  if (current === undefined) return
  current.onopen = current.onmessage = current.onerror = current.onclose = null
  try {
    current.close(1000, 'page left')
  } catch {
    // Already closed.
  }
}

const closeStreams = () => {
  for (const source of streams.values()) source.close()
  streams.clear()
}

const openStream = (key) => {
  if (streams.has(key) || typeof EventSource === 'undefined') return
  const source = new EventSource(streamUrl(key))
  streams.set(key, source)
  source.addEventListener('value', (event) => deliver(key, event.data))
  source.onerror = () => {
    // A network error is retried by the browser itself; a refusal (the key does not exist) ends the stream for good.
    if (source.readyState === 2) {
      streams.delete(key)
      fail(key, 'the event stream was refused (no such state?)')
    }
  }
}

const fallBack = () => {
  following = 'stream'
  if (!warnedStream) {
    warnedStream = true
    console.warn('acryl-state: the WebSocket did not open, so each key is followed by its own event stream (each holds one of the browser\'s six connections to this host)')
  }
  for (const key of watchers.keys()) openStream(key)
}

// A socket that closes, errors or goes quiet: before it ever opened this is a server without WebSockets, so the streams take over; after, the server went away and the page tries again.
const lost = (which) => {
  if (which !== socket) return
  closeSocket()
  if (watchers.size === 0 || suspended) return
  if (!opened) {
    fallBack()
    return
  }
  const delay = Math.min(RETRY_MIN_MS * 2 ** attempts, RETRY_MAX_MS)
  attempts += 1
  clearTimeout(timer)
  timer = setTimeout(connect, delay)
}

const connect = () => {
  clearTimeout(timer)
  if (socket !== undefined || watchers.size === 0 || suspended || following !== 'socket') return
  let made
  try {
    made = new WebSocket(socketUrl())
  } catch {
    fallBack()
    return
  }
  socket = made
  made.onopen = () => {
    opened = true
    attempts = 0
    arm()
    for (const key of watchers.keys()) send({ t: 'sub', key })
  }
  made.onmessage = (event) => {
    if (made !== socket) return
    arm()
    let frame
    try {
      frame = JSON.parse(event.data)
    } catch {
      return
    }
    if (frame === null || typeof frame !== 'object' || typeof frame.key !== 'string') return
    if (typeof frame.error === 'string') fail(frame.key, frame.error)
    else deliver(frame.key, JSON.stringify(frame.value))
  }
  made.onerror = () => lost(made)
  made.onclose = () => lost(made)
}

const start = () => {
  if (watchers.size === 0) return
  if (following === 'stream') for (const key of watchers.keys()) openStream(key)
  else connect()
}

if (typeof addEventListener === 'function') {
  // A page in the back/forward cache keeps its connections open for as long as it is kept; let them go when the page is hidden for good, and open them again when it comes back.
  addEventListener('pagehide', () => {
    suspended = true
    clearTimeout(timer)
    closeSocket()
    closeStreams()
  })
  addEventListener('pageshow', () => {
    if (!suspended) return
    suspended = false
    start()
  })
}

// Follow the state key: onValue gets the value now and after every change, as the JSON value the server holds (a string stays a string). onError, when given, is told of a key that
// does not exist; without it the page console gets one warning. Returns the function that stops watching.
export function watch(key, onValue, onError) {
  if (typeof key !== 'string' || key === '') throw new TypeError('watch(key, onValue): the key is a state key like "tasks.count"')
  if (typeof onValue !== 'function') throw new TypeError('watch(key, onValue): onValue is a function')
  const watcher = { onValue, onError }
  let set = watchers.get(key)
  const first = set === undefined
  if (first) {
    set = new Set()
    watchers.set(key, set)
  }
  set.add(watcher)
  complained.delete(key)
  if (!first && latest.has(key)) {
    const text = latest.get(key)
    queueMicrotask(() => {
      if (!set.has(watcher)) return
      try {
        onValue(JSON.parse(text))
      } catch (cause) {
        console.error('acryl-state: a watcher of ' + key + ' threw', cause)
      }
    })
  }
  if (first && !suspended) {
    if (following === 'stream') openStream(key)
    else if (socket === undefined) connect()
    else send({ t: 'sub', key })
  }
  let stopped = false
  return () => {
    if (stopped) return
    stopped = true
    set.delete(watcher)
    if (set.size > 0) return
    watchers.delete(key)
    latest.delete(key)
    complained.delete(key)
    streams.get(key)?.close()
    streams.delete(key)
    send({ t: 'unsub', key })
    if (watchers.size === 0) {
      clearTimeout(timer)
      closeSocket()
    }
  }
}
`

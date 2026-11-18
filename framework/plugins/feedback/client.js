// The Feedback button on every page of the app (./index.ts serves this file and calls start with the routes' prefix). Plain browser code, no build:
// the button and its popover live in a shadow root, so the app's styles and these never touch. Pressing Feedback turns the picker on: the element
// under the pointer is outlined, a click pins it (the click does nothing else), and "Nothing specific" sends a note about the whole page.

const STYLE = `
:host { all: initial; }
* { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
.button { position: fixed; right: 16px; bottom: 16px; z-index: 2147483646; border: 0; border-radius: 99px; padding: 8px 14px; background: #1d1c1a; color: #fff; font-size: 12.5px; cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,.18); }
.button[aria-expanded="true"] { background: #c2410c; }
.pop { position: fixed; right: 16px; bottom: 58px; z-index: 2147483646; width: 320px; max-width: calc(100vw - 32px); background: #fff; color: #1d1c1a; border: 1px solid #e3dfd5; border-radius: 10px; padding: 10px 12px; box-shadow: 0 10px 30px rgba(0,0,0,.18); font-size: 12.5px; }
.pop[hidden] { display: none; }
b { font-weight: 600; }
.options { display: flex; gap: 6px; margin: 6px 0 2px; flex-wrap: wrap; }
.option { font-size: 11px; border: 1px solid #e3dfd5; border-radius: 99px; padding: 2px 9px; color: #77736b; background: transparent; cursor: pointer; text-align: left; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.option[aria-pressed="true"] { border-color: #e0a43a; background: #fdf3e2; color: #1d1c1a; }
textarea { display: block; width: 100%; min-height: 64px; resize: vertical; border: 1px solid #e3dfd5; border-radius: 6px; padding: 6px 8px; margin: 6px 0; color: #1d1c1a; font-size: 12.5px; }
textarea:focus { outline: none; border-color: #c2410c; }
.row { display: flex; justify-content: space-between; align-items: center; gap: 10px; color: #77736b; font-size: 11px; }
.send { border: 0; border-radius: 6px; padding: 4px 11px; background: #c2410c; color: #fff; font-size: 12px; cursor: pointer; flex: none; }
.send:disabled { opacity: .5; cursor: default; }
.note[data-error] { color: #b42318; }
.outline { position: fixed; z-index: 2147483645; pointer-events: none; border: 2px dashed #e0a43a; border-radius: 6px; display: none; }
.outline[data-picked] { display: block; }
.outline span { position: absolute; right: 6px; top: -11px; background: #e0a43a; color: #1d1c1a; font-size: 10.5px; font-weight: 600; padding: 1px 7px; border-radius: 4px; white-space: nowrap; }
.pins { position: fixed; inset: 0; pointer-events: none; z-index: 2147483644; }
.pin { position: absolute; width: 22px; height: 22px; border-radius: 50% 50% 50% 0; background: #e0a43a; color: #1d1c1a; font-size: 11px; font-weight: 700; display: grid; place-items: center; transform: rotate(-45deg); box-shadow: 0 1px 3px rgba(0,0,0,.25); }
.pin span { transform: rotate(45deg); }
.shotRow[hidden] { display: none; }
.shot { display: flex; align-items: center; gap: 6px; margin: 6px 0 0; color: #4b4b52; font-size: 12px; cursor: pointer; }
.shot input { width: auto; margin: 0; accent-color: #c2410c; }
.shotHint { margin: 2px 0 0; color: #8a867c; font-size: 11px; }
`

/** A short name for an element: what it says it is, else the words it shows, else its tag. */
export function elementLabel(element) {
  const named =
    element.getAttribute('aria-label') ||
    element.getAttribute('title') ||
    element.getAttribute('alt')
  if (named) return clip(named)
  // A heading names its section; bold text inside does not (a card's bold person name is not the card), so it falls to the first text.
  const heading = element.querySelector('h1, h2, h3, h4, h5, h6')
  const text = (heading?.textContent || firstText(element) || '').replace(/\s+/g, ' ').trim()
  return text === '' ? element.tagName.toLowerCase() : `"${clip(text)}"`
}

/** The first piece of text an element shows, in document order. */
function firstText(node) {
  for (const child of node.childNodes) {
    if (child.nodeType === 3 && (child.textContent || '').trim() !== '') return child.textContent
    if (child.nodeType === 1) {
      const tag = child.tagName.toLowerCase()
      if (tag === 'script' || tag === 'style') continue
      const found = firstText(child)
      if (found !== undefined) return found
    }
  }
  return undefined
}

function clip(text) {
  return text.length > 36 ? `${text.slice(0, 34).trimEnd()}…` : text
}

/** A CSS selector that finds the element again: up from it to the nearest id, each step its tag and place among its siblings. */
export function elementSelector(element) {
  const parts = []
  for (
    let node = element;
    node && node.nodeType === 1 && parts.length < 8;
    node = node.parentElement
  ) {
    if (node.id) {
      parts.unshift(`#${cssEscape(node.id)}`)
      break
    }
    const tag = node.tagName.toLowerCase()
    if (tag === 'body' || tag === 'html') {
      parts.unshift(tag)
      break
    }
    const same = node.parentElement
      ? [...node.parentElement.children].filter((child) => child.tagName === node.tagName)
      : []
    parts.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(node) + 1})` : tag)
  }
  return parts.join(' > ')
}

function cssEscape(value) {
  return typeof globalThis.CSS?.escape === 'function'
    ? globalThis.CSS.escape(value)
    : value.replace(/[^A-Za-z0-9_-]/g, '\\$&')
}

// The ACRYL frame's view (ide/acryl-blends-frame/src/client/frame-view.ts): the frame's canvas hides the app's own build-time controls in Build and
// shows what production shows in Preview. A page opened directly has no frame parent and keeps its own behavior.
const FRAME_VIEW = Symbol.for('acryl.frame.view')
const FRAME_MODE_EVENT = 'acryl:frame-mode'

/** The frame's view handle, or undefined when this page is the top window or its parent is cross-origin. */
export function frameViewOf(win) {
  try {
    if (win.parent === win) return undefined
    return win.parent[FRAME_VIEW]
  } catch {
    return undefined
  }
}

/** The size a screenshot is stored at: the whole view, downscaled to `maxSide`. */
export function shotSize(width, height, maxSide = 1280) {
  const scale = Math.min(1, maxSide / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/** A screenshot is re-encoded below this size; the Host refuses more than 512 KB decoded. */
export const SHOT_MAX_BYTES = 400 * 1024

/**
 * Whether this browser can capture the current tab. Chromium's getDisplayMedia takes `preferCurrentTab`; Firefox and Safari ignore it and would offer
 * the whole screen, which is not what a visitor sending feedback means, so the form does not offer the option there at all.
 */
export function canCaptureTab(userAgent, hasDisplayCapture) {
  if (hasDisplayCapture !== true) return false
  if (/Android|iPhone|iPad|iPod/u.test(userAgent)) return false
  return /Chrome\/|Chromium\/|Edg\/|OPR\//u.test(userAgent)
}

// biome-ignore lint/correctness/noUnusedVariables: ./index.ts serves this file with a call to start appended
function start(prefix) {
  if (document.querySelector('acryl-feedback')) return
  const host = document.createElement('acryl-feedback')
  const root = host.attachShadow({ mode: 'open' })
  root.innerHTML = `<style>${STYLE}</style>
<div class="outline"><span></span></div>
<div class="pins"></div>
<div class="pop" role="dialog" aria-label="Your feedback" hidden>
  <b>Your feedback</b>
  <div class="options">
    <button type="button" class="option" data-choice="element" aria-pressed="true">⌖ Click the element you mean</button>
    <button type="button" class="option" data-choice="page" aria-pressed="false">Nothing specific</button>
  </div>
  <textarea aria-label="Your note" placeholder="What happened, or what would help?" maxlength="2000"></textarea>
  <div class="shotRow">
    <label class="shot"><input type="checkbox" class="shotBox" checked> Attach a screenshot of this page</label>
    <p class="shotHint">Your browser will ask to share this tab.</p>
  </div>
  <div class="row"><span class="note">Pressing Feedback turns the picker on; click anything, or choose "Nothing specific".</span><button type="button" class="send" disabled>Send</button></div>
</div>
<button type="button" class="button" aria-expanded="false">Feedback</button>`
  document.body.appendChild(host)

  const button = root.querySelector('.button')
  const pop = root.querySelector('.pop')
  const outline = root.querySelector('.outline')
  const outlineLabel = outline.querySelector('span')
  const pinsLayer = root.querySelector('.pins')
  /** The numbered pins for this page: a note already on an element shows a badge there, as the mockup's production does. */
  let pins = []
  const placePins = () => {
    pinsLayer.replaceChildren()
    for (const pin of pins) {
      const target = document.querySelector(pin.selector)
      if (target === null || target.getClientRects().length === 0) continue
      const box = target.getBoundingClientRect()
      const badge = document.createElement('span')
      badge.className = 'pin'
      badge.style.left = `${box.right - 11}px`
      badge.style.top = `${box.top - 9}px`
      const number = document.createElement('span')
      number.textContent = String(pin.number)
      badge.append(number)
      pinsLayer.append(badge)
    }
  }
  const readPins = async () => {
    try {
      const response = await fetch(
        `${prefix}/pins?page=${encodeURIComponent(location.pathname + location.search)}`,
        {
          headers: { Accept: 'application/json' },
        },
      )
      if (!response.ok) return
      const body = await response.json()
      pins = Array.isArray(body?.pins)
        ? body.pins.filter(
            (pin) =>
              pin !== null &&
              typeof pin === 'object' &&
              typeof pin.selector === 'string' &&
              Number.isInteger(pin.number),
          )
        : []
      placePins()
    } catch {
      // No pins this time; the next read tries again.
    }
  }
  const onElement = root.querySelector('[data-choice="element"]')
  const nothing = root.querySelector('[data-choice="page"]')
  const text = root.querySelector('textarea')
  const send = root.querySelector('.send')
  const note = root.querySelector('.note')
  const hint = note.textContent

  /** @type {{ open: boolean, picking: boolean, picked: Element | null, choice: 'element' | 'page' }} */
  const state = { open: false, picking: false, picked: null, choice: 'element', attach: true }
  const canShot = canCaptureTab(
    navigator.userAgent,
    typeof navigator.mediaDevices?.getDisplayMedia === 'function',
  )
  const shotRow = root.querySelector('.shotRow')
  const shotBox = root.querySelector('.shotBox')
  if (!canShot) {
    shotRow.hidden = true
    state.attach = false
  }
  shotBox.addEventListener('change', () => {
    state.attach = shotBox.checked
  })

  const place = (element, label) => {
    if (!element) {
      outline.removeAttribute('data-picked')
      return
    }
    const box = element.getBoundingClientRect()
    Object.assign(outline.style, {
      left: `${box.left - 3}px`,
      top: `${box.top - 3}px`,
      width: `${box.width + 6}px`,
      height: `${box.height + 6}px`,
    })
    outlineLabel.textContent = label
    outline.setAttribute('data-picked', '')
  }
  const render = () => {
    button.setAttribute('aria-expanded', String(state.open))
    pop.hidden = !state.open
    onElement.setAttribute('aria-pressed', String(state.choice === 'element'))
    nothing.setAttribute('aria-pressed', String(state.choice === 'page'))
    onElement.textContent = state.picked
      ? `⌖ On this element: ${elementLabel(state.picked)}`
      : '⌖ Click the element you mean'
    send.disabled = text.value.trim() === '' || (state.choice === 'element' && !state.picked)
    if (state.open && state.choice === 'element' && state.picked)
      place(state.picked, `Picked: ${elementLabel(state.picked)}`)
    else if (!state.picking) place(null)
  }
  const ours = (event) => event.composedPath().includes(host)
  const onMove = (event) => {
    if (!state.picking || ours(event)) return
    const target = event.target instanceof Element ? event.target : null
    if (target) place(target, elementLabel(target))
  }
  const onClick = (event) => {
    if (!state.picking || ours(event)) return
    event.preventDefault()
    event.stopPropagation()
    if (!(event.target instanceof Element)) return
    state.picked = event.target
    state.picking = false
    state.choice = 'element'
    render()
    text.focus()
  }
  const onKey = (event) => {
    if (event.key === 'Escape' && state.open) close()
  }
  const reposition = () => {
    if (state.open) render()
  }
  const open = () => {
    state.open = true
    state.picking = true
    state.picked = null
    state.choice = 'element'
    note.textContent = hint
    note.removeAttribute('data-error')
    render()
  }
  const close = () => {
    state.open = false
    state.picking = false
    state.picked = null
    render()
  }

  /**
   * The tab as the person sees it, with the picker's outline on the page, as a WebP (PNG where WebP is unavailable). The Feedback button and the
   * note form are hidden for the picture, so it shows the app and the outline, not the form. A refused picker or a browser without screen capture
   * sends the note without an image.
   */
  const takeShot = async () => {
    if (!canShot) return undefined
    let stream
    try {
      // Called from the Send click itself: the browser opens its picker only inside a gesture.
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: { max: 1920 }, height: { max: 1080 } },
        preferCurrentTab: true,
        audio: false,
      })
    } catch {
      return undefined
    }
    const popHidden = pop.hidden
    const buttonDisplay = button.style.display
    try {
      const video = document.createElement('video')
      video.srcObject = stream
      video.muted = true
      await video.play()
      if (video.readyState < 2)
        await new Promise((resolve) =>
          video.addEventListener('loadeddata', resolve, { once: true }),
        )
      // Hide the form after the picker closed; the outline the picker drew stays on the page and in the picture.
      pop.hidden = true
      button.style.display = 'none'
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      // A tab capture delivers frames a little late: wait for frames made after the hide, so the picture shows the app, not the form.
      await new Promise((resolve) => {
        const done = () => resolve()
        const timer = setTimeout(done, 600)
        if (typeof video.requestVideoFrameCallback !== 'function') return
        let frames = 0
        const step = () => {
          frames += 1
          if (frames >= 3) {
            clearTimeout(timer)
            done()
            return
          }
          video.requestVideoFrameCallback(step)
        }
        video.requestVideoFrameCallback(step)
      })
      let maxSide = 1280
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const size = shotSize(video.videoWidth || 1, video.videoHeight || 1, maxSide)
        const canvas = document.createElement('canvas')
        canvas.width = size.width
        canvas.height = size.height
        const context = canvas.getContext('2d')
        if (context === null) return undefined
        context.drawImage(video, 0, 0, size.width, size.height)
        let blob = await new Promise((resolve) =>
          canvas.toBlob(resolve, 'image/webp', attempt === 0 ? 0.82 : 0.7),
        )
        if (blob === null)
          blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
        if (blob === null) return undefined
        if (blob.size <= SHOT_MAX_BYTES) {
          const data = await new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result)
            reader.onerror = () => reject(reader.error)
            reader.readAsDataURL(blob)
          })
          return { data, width: size.width, height: size.height }
        }
        maxSide = Math.max(640, Math.round(maxSide * 0.72))
      }
      return undefined
    } catch {
      return undefined
    } finally {
      pop.hidden = popHidden
      button.style.display = buttonDisplay
      for (const track of stream.getTracks()) track.stop()
    }
  }

  button.addEventListener('click', () => {
    if (state.open) close()
    else open()
  })
  onElement.addEventListener('click', () => {
    state.choice = 'element'
    state.picking = true
    state.picked = null
    render()
  })
  nothing.addEventListener('click', () => {
    state.choice = 'page'
    state.picking = false
    state.picked = null
    render()
    text.focus()
  })
  text.addEventListener('input', render)
  send.addEventListener('click', async () => {
    send.disabled = true
    const element =
      state.choice === 'element' && state.picked
        ? { selector: elementSelector(state.picked), label: elementLabel(state.picked) }
        : undefined
    // The screenshot is taken here, inside the click, only when the person left the option on; a refused capture still sends the note.
    const screenshot = state.attach ? await takeShot() : undefined
    try {
      const response = await fetch(`${prefix}/notes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: text.value,
          page: location.pathname + location.search,
          ...(element ? { element } : {}),
          ...(screenshot ? { screenshot } : {}),
        }),
      })
      if (!response.ok)
        throw new Error(
          (await response.json().catch(() => ({}))).error || `sending failed (${response.status})`,
        )
      text.value = ''
      close()
      button.textContent = 'Thanks, sent'
      setTimeout(() => {
        button.textContent = 'Feedback'
      }, 2500)
    } catch (error) {
      note.textContent = error instanceof Error ? error.message : 'sending failed'
      note.setAttribute('data-error', '')
      render()
    }
  })
  // The frame's Build is the builder's screen: the users' Feedback button is not part of it. Preview shows what production shows, and the app runs
  // feedback in production, so the button returns there. A direct page (no frame) is unchanged.
  const frame = frameViewOf(window)
  const applyFrame = () => {
    const visible = frame === undefined || frame.mode !== 'build'
    host.style.display = visible ? '' : 'none'
    if (!visible && state.open) close()
    if (visible) void readPins()
  }
  window.addEventListener(FRAME_MODE_EVENT, applyFrame)
  applyFrame()
  // agent-panel sits in the same corner: its button in development, the Assistant docked on the right in production. Stand to the left of whichever shows.
  const besideOthers = () => {
    const shadow = document.getElementById('agent-panel')?.shadowRoot
    const shown = (element) =>
      element && getComputedStyle(element).display !== 'none'
        ? element.getBoundingClientRect()
        : null
    const box =
      shown(shadow?.querySelector('section.shown')) ?? shown(shadow?.querySelector('button.open'))
    const right = box && box.width > 0 ? `${Math.round(window.innerWidth - box.left + 8)}px` : ''
    button.style.right = right
    pop.style.right = right
  }
  for (const delay of [0, 500, 2000]) setTimeout(besideOthers, delay)
  window.addEventListener('agent-panel:layout', besideOthers)
  window.addEventListener('resize', besideOthers)
  document.addEventListener('mousemove', onMove, true)
  document.addEventListener('click', onClick, true)
  document.addEventListener('keydown', onKey, true)
  window.addEventListener('scroll', reposition, true)
  window.addEventListener('resize', reposition)
  // The builder's Build screen has no user feedback in it, so the pins are read again when the frame's view comes back.
  window.setInterval(() => {
    if (host.style.display !== 'none') void readPins()
  }, 15_000)
  window.addEventListener('scroll', placePins, true)
  window.addEventListener('resize', placePins)
}

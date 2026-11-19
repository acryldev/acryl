import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { InspectorToggle } from './inspector-toggle.ts'

/**
 * Where an element's own styling was authored: the plugin package that shipped the CSS Module,
 * and the file within it. Read from the real `data-plugin`/`data-plugin-css` attributes DSH's CSS
 * Modules step stamps on every injected `<style>` tag - not guessed, not a static lookup table.
 */
export interface MountAnchorComponent {
  readonly plugin: string
  readonly file: string
  /** How many ancestor steps up from the precisely-clicked element this match was found at (0 = the element itself). */
  readonly depth: number
}

/** The precise element under the cursor, identified well enough to describe in words. */
export interface MountAnchorTarget {
  readonly tag: string
  readonly id: string | null
  readonly className: string | null
  readonly ariaLabel: string | null
  readonly title: string | null
  readonly textPreview: string | null
}

/** One resolved click: the Cordis slot it landed in, the precise element, and its owning file, if resolvable. */
export interface MountAnchor {
  readonly slot: string
  readonly target: MountAnchorTarget
  /** A CSS selector for the element, from the nearest ancestor with an id (or the page body) down. */
  readonly selector: string
  readonly component: MountAnchorComponent | null
  readonly url: string
  readonly timestamp: string
}

/**
 * The true element under (x, y), independent of `pointer-events`. `document.elementFromPoint`
 * (singular) respects `pointer-events: none` and skips such elements, which is exactly how most
 * icon glyphs are built (so clicks fall through to the button around them) - meaning it routinely
 * returns a much coarser ancestor than what's visually under the cursor. `elementsFromPoint`
 * (plural) returns the full geometric hit-stack regardless of `pointer-events`, and its first
 * entry is the true, precise, topmost element - found this way after a real report that clicking
 * a specific icon/button kept resolving to its containing scroll panel instead.
 */
function preciseElementAt(x: number, y: number): Element | null {
  const stack = document.elementsFromPoint(x, y)
  return stack[0] ?? null
}

/** Walk up from `element` to the nearest ancestor carrying `data-acryl-slot`, returning that slot's name. */
function nearestSlot(element: Element): string | null {
  let node: Element | null = element
  while (node !== null) {
    const slot = node.getAttribute('data-acryl-slot')
    if (slot !== null) return slot
    node = node.parentElement
  }
  return null
}

/** An id or class a selector can name as it is; anything else is quoted in an attribute selector. */
const PLAIN_NAME = /^[A-Za-z_][\w-]*$/u
const quoted = (value: string): string => `"${value.replace(/["\\]/gu, match => `\\${match}`)}"`

/**
 * A CSS selector that finds `element` again: from the nearest ancestor with an id, or from `body`, each step the tag, its first class and its
 * position among same-tag siblings when there are several. Bounded to 8 steps so it stays readable when pasted into a chat.
 */
export function selectorFor(element: Element): string {
  const steps: string[] = []
  let node: Element | null = element
  while (node !== null && node.tagName !== 'BODY' && node.tagName !== 'HTML' && steps.length < 8) {
    if (node.id !== '') { steps.unshift(PLAIN_NAME.test(node.id) ? `#${node.id}` : `[id=${quoted(node.id)}]`); break }
    const tag = node.tagName.toLowerCase()
    const first = [...node.classList][0]
    const parent: Element | null = node.parentElement
    const same = parent === null ? [] : [...parent.children].filter(child => child.tagName === node?.tagName)
    const position = same.length > 1 ? `:nth-of-type(${String(same.indexOf(node) + 1)})` : ''
    const kind = first === undefined ? '' : PLAIN_NAME.test(first) ? `.${first}` : `[class~=${quoted(first)}]`
    steps.unshift(`${tag}${kind}${position}`)
    node = parent
  }
  return steps.join(' > ')
}

/** A short, human-scannable description of exactly which element this is. */
function describeTarget(element: Element): MountAnchorTarget {
  // The text a person sees: `textContent` would also include the CSS of any `<style>` inside the element.
  const text = (element instanceof HTMLElement ? element.innerText : element.textContent ?? '').trim().replace(/\s+/gu, ' ')
  return {
    tag: element.tagName.toLowerCase(),
    id: element.id === '' ? null : element.id,
    className: element.className === '' || typeof element.className !== 'string' ? null : element.className,
    ariaLabel: element.getAttribute('aria-label'),
    title: element.getAttribute('title'),
    textPreview: text === '' ? null : text.length > 60 ? `${text.slice(0, 60)}…` : text,
  }
}

/**
 * Which plugin-owned CSS Module file actually styles `element` or its nearest ancestor that has
 * one. A precisely-clicked leaf (an `<svg>`, a bare icon `<path>`, a plain wrapping `<span>`) very
 * often carries no class of its own - real component styling usually lands one or two levels up,
 * on the actual button/row element. Walking up (bounded, so an unrelated ancestor far outside the
 * clicked widget is never credited) finds the real owner instead of reporting "no source resolved"
 * for every leaf node.
 */
function resolveComponent(element: Element): MountAnchorComponent | null {
  const styleTags = [...document.querySelectorAll('style[data-plugin-css]')]
  const sheets = styleTags
    .map(tag => ({ tag, sheet: [...document.styleSheets].find(candidate => candidate.ownerNode === tag) }))
    .filter((entry): entry is { tag: Element, sheet: CSSStyleSheet } => entry.sheet !== undefined)

  let node: Element | null = element
  let depth = 0
  const MAX_DEPTH = 6 // past this, an ancestor's styling isn't really "this widget's" anymore
  while (node !== null && depth <= MAX_DEPTH) {
    const classes = [...node.classList]
    if (classes.length > 0) {
      for (const { tag, sheet } of sheets) {
        let rules: CSSRuleList
        try {
          rules = sheet.cssRules
        } catch {
          continue // cross-origin sheet; DSH's own injected tags never are, but stay defensive
        }
        for (const rule of rules) {
          if (!(rule instanceof CSSStyleRule)) continue
          if (classes.some(cls => rule.selectorText.includes(`.${cls}`))) {
            return { plugin: tag.getAttribute('data-plugin') ?? '', file: tag.getAttribute('data-plugin-css') ?? '', depth }
          }
        }
      }
    }
    node = node.parentElement
    depth += 1
  }
  return null
}

interface HoverState {
  readonly rect: DOMRect
  /** The Cordis slot the element is in, when it is inside one. */
  readonly slot: string | null
  readonly tag: string
}

export interface MountAnchorInspectorProps {
  /** On/off state, flipped by the registered toggle shortcut (and by Escape or a click inside the overlay). */
  readonly toggle: InspectorToggle
}

/**
 * Visual mount-anchor inspector (spec 040-agentic-multiplexer-ade's own prerequisite, spec
 * 039-visual-mount-anchors Scope A). Its toggle combo defaults to Cmd+Shift+. but is a real,
 * user-reassignable shortcut (Settings > Shortcuts), run by DSH's shortcut service, so a reassignment
 * takes effect without a reload; the command palette starts it too. Point mode hovers outline the
 * precise element under the cursor (not its whole containing panel), a click resolves the full
 * anchor (slot + precise target + selector + owning source file) and copies it to the clipboard as
 * JSON, to paste into a chat with an agent. Escape, or clicking, exits point mode.
 */
export function MountAnchorInspector({ toggle }: MountAnchorInspectorProps) {
  const active = useSyncExternalStore(toggle.subscribe, toggle.get)
  const setActive = useCallback((next: boolean) => { toggle.set(next) }, [toggle])
  const [hover, setHover] = useState<HoverState | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const activeRef = useRef(active)
  activeRef.current = active

  useEffect(() => {
    // The toggle combo itself is a DSH shortcut command (see `index.ts`), so users rebind it in Settings > Shortcuts;
    // only leaving the mode with Escape is handled here.
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && toggle.get()) setActive(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => { window.removeEventListener('keydown', onKeyDown) }
  }, [toggle, setActive])

  useEffect(() => {
    if (!active) { setHover(null); return }
    // Global cursor only - never a hit-testing veil. A `position: fixed` overlay element sitting
    // on top of the page would itself be what elementsFromPoint's first entry is for every
    // hover/click below it, resolving every anchor to "unresolved" regardless of what's actually
    // there. Found exactly this way: a real click in the real app resolved to `unresolved` until
    // this was fixed.
    const previousCursor = document.body.style.cursor
    document.body.style.cursor = 'crosshair'

    const onMove = (event: MouseEvent): void => {
      const element = preciseElementAt(event.clientX, event.clientY)
      if (element === null) { setHover(null); return }
      // Outline the precise hovered element itself, not the whole slot container it sits in; every element can be picked, inside a slot
      // or not (Settings, menus and dialogs are not inside one).
      setHover({ rect: element.getBoundingClientRect(), slot: nearestSlot(element), tag: element.tagName.toLowerCase() })
    }

    // The page must not act on the press that picks an element: menus and buttons that open on pointer down would otherwise fire.
    const swallow = (event: Event): void => { event.preventDefault(); event.stopPropagation() }

    const onClick = (event: MouseEvent): void => {
      event.preventDefault()
      event.stopPropagation()
      const element = preciseElementAt(event.clientX, event.clientY)
      if (element === null) { setActive(false); return }
      const slot = nearestSlot(element)
      const component = resolveComponent(element)
      const anchor: MountAnchor = {
        slot: slot ?? 'unresolved',
        target: describeTarget(element),
        selector: selectorFor(element),
        component,
        url: window.location.href,
        timestamp: new Date().toISOString(),
      }
      const json = JSON.stringify(anchor, null, 2)
      const label = anchor.target.ariaLabel ?? anchor.target.title ?? anchor.target.textPreview ?? `<${anchor.target.tag}>`
      const where = `${label} - ${anchor.slot}${component !== null ? ` · ${component.file}` : ' · no source resolved'}`
      const show = (text: string): void => { setToast(text); setTimeout(() => { setToast(null) }, 5000) }
      const copying = navigator.clipboard?.writeText(json) ?? Promise.reject(new Error('no clipboard'))
      copying.then(() => { show(`${where} - copied, paste it into the chat`) }, () => { show(`${where} - could not copy to the clipboard`) })
      setActive(false)
    }

    document.addEventListener('mousemove', onMove, true)
    document.addEventListener('pointerdown', swallow, true)
    document.addEventListener('mousedown', swallow, true)
    document.addEventListener('click', onClick, true)
    return () => {
      document.removeEventListener('mousemove', onMove, true)
      document.removeEventListener('pointerdown', swallow, true)
      document.removeEventListener('mousedown', swallow, true)
      document.removeEventListener('click', onClick, true)
      document.body.style.cursor = previousCursor
    }
  }, [active])

  if (!active && toast === null) return null

  return (
    <>
      {active && (
        // Purely decorative: `pointerEvents: 'none'` keeps this out of hit-testing entirely, so
        // it can never be what elementsFromPoint returns for a hover/click underneath it.
        <div
          data-acryl-mount-anchor-veil
          style={{ position: 'fixed', inset: 0, zIndex: 999998, pointerEvents: 'none' }}
        />
      )}
      {hover !== null && (
        <div
          style={{
            position: 'fixed',
            zIndex: 999999,
            pointerEvents: 'none',
            left: hover.rect.left,
            top: hover.rect.top,
            width: hover.rect.width,
            height: hover.rect.height,
            outline: '2px solid #5b7fff',
            outlineOffset: -2,
            transition: 'left 60ms, top 60ms, width 60ms, height 60ms',
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: -22,
              left: 0,
              background: '#5b7fff',
              color: '#fff',
              font: '11px ui-monospace, monospace',
              padding: '2px 6px',
              borderRadius: 4,
              whiteSpace: 'nowrap',
            }}
          >
            {hover.slot === null ? `<${hover.tag}>` : `<${hover.tag}> · ${hover.slot}`}
          </span>
        </div>
      )}
      {toast !== null && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 999999,
            background: '#111',
            color: '#fff',
            padding: '8px 14px',
            borderRadius: 8,
            font: '12px ui-monospace, monospace',
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
            maxWidth: '80vw',
            textAlign: 'center',
          }}
        >
          {toast}
        </div>
      )}
    </>
  )
}

import { useEffect, useRef, useState } from 'react'

/**
 * Where a clicked element's own styling was authored: the plugin package
 * that shipped the CSS Module, and the file within it. Read from the real
 * `data-plugin`/`data-plugin-css` attributes DSH's CSS Modules step stamps
 * on every injected `<style>` tag - not guessed, not a static lookup table.
 */
export interface MountAnchorComponent {
  readonly plugin: string
  readonly file: string
}

/** One resolved click: the Cordis slot it landed in, plus the file that rendered it, if resolvable. */
export interface MountAnchor {
  readonly slot: string
  readonly component: MountAnchorComponent | null
  readonly className: string | null
  readonly url: string
  readonly timestamp: string
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

/**
 * Resolve which plugin-owned CSS Module file actually styles `element`, by matching its own
 * hashed class names against the rules in every `<style data-plugin-css>` tag DSH's CSS Modules
 * step has injected. A match is unambiguous: class names are per-file-hashed, so any rule that
 * mentions one of this element's classes was authored in that exact file.
 */
function resolveComponent(element: Element): MountAnchorComponent | null {
  const classes = [...element.classList]
  if (classes.length === 0) return null
  const styleTags = [...document.querySelectorAll('style[data-plugin-css]')]
  for (const tag of styleTags) {
    const sheet = [...document.styleSheets].find(candidate => candidate.ownerNode === tag)
    if (sheet === undefined) continue
    let rules: CSSRuleList
    try {
      rules = sheet.cssRules
    } catch {
      continue // cross-origin sheet; DSH's own injected tags never are, but stay defensive
    }
    for (const rule of rules) {
      if (!(rule instanceof CSSStyleRule)) continue
      if (classes.some(cls => rule.selectorText.includes(`.${cls}`))) {
        return {
          plugin: tag.getAttribute('data-plugin') ?? '',
          file: tag.getAttribute('data-plugin-css') ?? '',
        }
      }
    }
  }
  return null
}

interface HoverState {
  readonly rect: DOMRect
  readonly slot: string
}

/**
 * Visual mount-anchor inspector (spec 040-agentic-multiplexer-ade's own prerequisite, spec
 * 039-visual-mount-anchors Scope A). Cmd+Shift+. toggles point mode: hover highlights the
 * nearest `data-acryl-slot` boundary under the cursor, a click resolves the full anchor (slot +
 * source file) and copies it to the clipboard as JSON. Escape, or clicking, exits point mode.
 */
export function MountAnchorInspector() {
  const [active, setActive] = useState(false)
  const [hover, setHover] = useState<HoverState | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const activeRef = useRef(active)
  activeRef.current = active

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === '.' && event.metaKey && event.shiftKey) {
        event.preventDefault()
        setActive(current => !current)
      } else if (event.key === 'Escape' && activeRef.current) {
        setActive(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => { window.removeEventListener('keydown', onKeyDown) }
  }, [])

  useEffect(() => {
    if (!active) { setHover(null); return }
    // Global cursor only - never a hit-testing veil. A `position: fixed` overlay element sitting
    // on top of the page would itself be what `elementFromPoint` returns for every hover/click
    // below it, resolving every anchor to "unresolved" regardless of what's actually there. Found
    // exactly this way: a real click in the real app resolved to `unresolved` until this was fixed.
    const previousCursor = document.body.style.cursor
    document.body.style.cursor = 'crosshair'

    const onMove = (event: MouseEvent): void => {
      const element = document.elementFromPoint(event.clientX, event.clientY)
      if (element === null) { setHover(null); return }
      const slot = nearestSlot(element)
      if (slot === null) { setHover(null); return }
      const slotElement = element.closest(`[data-acryl-slot="${slot}"]`)
      const rect = (slotElement ?? element).getBoundingClientRect()
      setHover({ rect, slot })
    }

    const onClick = (event: MouseEvent): void => {
      event.preventDefault()
      event.stopPropagation()
      const element = document.elementFromPoint(event.clientX, event.clientY)
      if (element === null) { setActive(false); return }
      const slot = nearestSlot(element)
      const component = resolveComponent(element)
      const anchor: MountAnchor = {
        slot: slot ?? 'unresolved',
        component,
        className: element.className === '' ? null : element.className,
        url: window.location.href,
        timestamp: new Date().toISOString(),
      }
      const json = JSON.stringify(anchor, null, 2)
      void navigator.clipboard?.writeText(json).catch(() => {})
      setToast(`${anchor.slot}${component !== null ? ` · ${component.file}` : ' · no source resolved'} — copied`)
      setActive(false)
      setTimeout(() => { setToast(null) }, 4000)
    }

    document.addEventListener('mousemove', onMove, true)
    document.addEventListener('click', onClick, true)
    return () => {
      document.removeEventListener('mousemove', onMove, true)
      document.removeEventListener('click', onClick, true)
      document.body.style.cursor = previousCursor
    }
  }, [active])

  if (!active && toast === null) return null

  return (
    <>
      {active && (
        // Purely decorative: `pointerEvents: 'none'` keeps this out of hit-testing entirely, so
        // it can never be what `elementFromPoint` returns for a hover/click underneath it.
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
            {hover.slot}
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
          }}
        >
          {toast}
        </div>
      )}
    </>
  )
}

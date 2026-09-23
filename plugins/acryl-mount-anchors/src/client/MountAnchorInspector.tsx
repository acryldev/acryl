import { useEffect, useRef, useState } from 'react'
// Type-only: cross-plugin collaboration goes through `ctx.shortcuts` (cordis DI) at runtime, never
// a value import - a sibling plugin's built client bundle is a factory-wrapped module with no
// statically analyzable named exports for this package's own bundler to inline.
import type { ShortcutsRegistry } from 'acryl-shortcuts/client'

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

/** A short, human-scannable description of exactly which element this is. */
function describeTarget(element: Element): MountAnchorTarget {
  const text = element.textContent?.trim() ?? ''
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
  readonly slot: string
  readonly tag: string
}

export interface MountAnchorInspectorProps {
  /** Live shortcuts registry (`ctx.shortcuts`, via DI - never imported as a value). */
  readonly shortcuts: ShortcutsRegistry
  /** This inspector's own registered action id, to read its (possibly reassigned) combo. */
  readonly actionId: string
}

/**
 * Visual mount-anchor inspector (spec 040-agentic-multiplexer-ade's own prerequisite, spec
 * 039-visual-mount-anchors Scope A). Its toggle combo defaults to Cmd+Shift+. but is a real,
 * user-reassignable shortcut (Settings > Shortcuts, spec 039's own follow-up) - read live from
 * `shortcuts` rather than hardcoded, so a reassignment takes effect without a reload. Point mode
 * hovers outline the precise element under the cursor (not its whole containing panel), a click
 * resolves the full anchor (slot + precise target + owning source file) and copies it to the
 * clipboard as JSON. Escape, or clicking, exits point mode.
 */
export function MountAnchorInspector({ shortcuts, actionId }: MountAnchorInspectorProps) {
  const [active, setActive] = useState(false)
  const [hover, setHover] = useState<HoverState | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const activeRef = useRef(active)
  activeRef.current = active

  useEffect(() => {
    // `shortcuts.matches` reads the live combo on every call, so a reassignment from the Shortcuts
    // settings page takes effect immediately with no re-subscription needed here.
    const onKeyDown = (event: KeyboardEvent): void => {
      if (shortcuts.matches(actionId, event)) {
        event.preventDefault()
        setActive(current => !current)
      } else if (event.key === 'Escape' && activeRef.current) {
        setActive(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => { window.removeEventListener('keydown', onKeyDown) }
  }, [shortcuts, actionId])

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
      const slot = nearestSlot(element)
      if (slot === null) { setHover(null); return }
      // Outline the precise hovered element itself, not the whole slot container it sits in -
      // the slot name is still shown as a label, but the box should hug the actual widget.
      setHover({ rect: element.getBoundingClientRect(), slot, tag: element.tagName.toLowerCase() })
    }

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
        component,
        url: window.location.href,
        timestamp: new Date().toISOString(),
      }
      const json = JSON.stringify(anchor, null, 2)
      void navigator.clipboard?.writeText(json).catch(() => {})
      const label = anchor.target.ariaLabel ?? anchor.target.title ?? anchor.target.textPreview ?? `<${anchor.target.tag}>`
      setToast(`${label} — ${anchor.slot}${component !== null ? ` · ${component.file}` : ' · no source resolved'} — copied`)
      setActive(false)
      setTimeout(() => { setToast(null) }, 5000)
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
            {`<${hover.tag}> · ${hover.slot}`}
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

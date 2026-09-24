/**
 * Marquee — a scrolling/horizontal-sliding container for overflowing text.
 * Self-contained; no cross-item imports. Uses CSS animation with overflow
 * detection. Built on ACRYL's --dsw-alias-* tokens. See manifest.yml.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import css from './Marquee.module.css'

export interface MarqueeProps {
  /** Content to scroll. */
  children: ReactNode
  /** Whether the animation is paused (e.g. on hover). */
  paused?: boolean
  /** Animation duration in seconds. */
  duration?: number
  /** Extra class name. */
  className?: string
}

/**
 * A horizontally scrolling content container. Only activates the animation
 * when the content overflows its container width.
 */
export function Marquee({ children, paused = false, duration = 20, className }: MarqueeProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLSpanElement>(null)
  const [shouldScroll, setShouldScroll] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    const content = contentRef.current
    if (!container || !content) return
    const check = () => { setShouldScroll(content.scrollWidth > container.clientWidth) }
    check()
    const ro = new ResizeObserver(check)
    ro.observe(container)
    return () => { ro.disconnect() }
  }, [children])

  return (
    <div ref={containerRef} className={clsx(css.marquee, className)}>
      <div
        className={clsx(css.track, shouldScroll && css['track--scrolling'], paused && css['track--paused'])}
        style={shouldScroll ? { animationDuration: `${duration}s` } : undefined}
      >
        <span ref={contentRef} className={css.content}>{children}</span>
        {shouldScroll && <span className={css.content} aria-hidden>{children}</span>}
      </div>
    </div>
  )
}

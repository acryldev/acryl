/**
 * AvatarGroup - overlapping stack of avatars with an overflow count.
 *
 * Inspired by shadcnblocks avatar-stack patterns and shadcn/ui's AvatarGroup.
 * Fully self-contained: renders small circular avatars directly without
 * importing from the Avatar component (self-containment per ingest gate).
 * See manifest.yml.
 */
import { useState } from 'react'
import clsx from 'clsx'
import type { ReactNode } from 'react'
import css from './AvatarGroup.module.css'

export interface AvatarGroupItem {
  src?: string
  alt?: string
  fallback: ReactNode
}

export interface AvatarGroupProps {
  /** Avatars to display, from left (front) to right (back). */
  items: AvatarGroupItem[]
  /** Max number of avatars to show before the overflow count. */
  max?: number
  /** Size of each avatar. */
  size?: 'sm' | 'default' | 'lg'
  /** Extra class name. */
  className?: string
}

/**
 * Render a row of overlapping avatars with an overflow count badge.
 */
export function AvatarGroup({ items, max, size = 'default', className }: AvatarGroupProps) {
  const visible = max !== undefined ? items.slice(0, max) : items
  const overflow = max !== undefined ? items.length - max : 0

  return (
    <div className={clsx(css.group, className)} role="group" aria-label="Avatar group">
      {visible.map((item, i) => (
        <div key={i} className={css.item} style={{ zIndex: visible.length - i }}>
          <AvatarCircle src={item.src} alt={item.alt} fallback={item.fallback} size={size} />
        </div>
      ))}
      {overflow > 0 && (
        <div className={css.item}>
          <div className={clsx(css.count, css[`size--${size}`])}>
            +{overflow}
          </div>
        </div>
      )}
    </div>
  )
}

/** A single circular avatar — local copy to avoid cross-item imports. */
function AvatarCircle({ src, alt, fallback, size }: { src: string | undefined; alt: string | undefined; fallback: ReactNode; size: 'sm' | 'default' | 'lg' }) {
  const [failed, setFailed] = useState(false)
  const showImage = src !== undefined && !failed

  return (
    <div className={clsx(css.circle, css[`size--${size}`])}>
      {showImage && (
        <img
          className={css.image}
          src={src}
          alt={alt ?? ''}
          onError={() => { setFailed(true) }}
        />
      )}
      {!showImage && <span className={css.fallback}>{fallback}</span>}
    </div>
  )
}

/**
 * Ported from shadcn/ui's Avatar (https://ui.shadcn.com/docs/components/avatar, MIT licence, registry item `avatar`, style new-york-v4, fetched 2026-09-22).
 * The Radix `Avatar.Root`/`Image`/`Fallback` primitives it wraps are dropped - the image-load-failure fallback they provide is reproduced with a plain
 * `onError` state instead. `AvatarBadge`, `AvatarGroup` and `AvatarGroupCount` are not ported (composition-only additions with no behavior of their own;
 * build them from `Stack` and this component if needed). See manifest.yml.
 */
import { useState } from 'react'
import clsx from 'clsx'
import type { ReactNode } from 'react'
import css from './Avatar.module.css'

export type AvatarSize = 'sm' | 'default' | 'lg'

export interface AvatarProps {
  src?: string
  alt?: string
  /** Shown when `src` is absent, or the image fails to load (initials, an icon, and so on). */
  fallback: ReactNode
  size?: AvatarSize
  className?: string
}

/**
 * Render an avatar: the image when it loads, the fallback otherwise.
 * @param props - image source, fallback content, size and an extra class.
 * @returns the element.
 */
export function Avatar({ src, alt = '', fallback, size = 'default', className }: AvatarProps) {
  const [failed, setFailed] = useState(false)
  const showImage = src !== undefined && !failed
  return (
    <span className={clsx(css.avatar, css[size], className)}>
      {showImage
        ? <img src={src} alt={alt} className={css.image} onError={() => { setFailed(true) }} />
        : <span className={css.fallback}>{fallback}</span>}
    </span>
  )
}

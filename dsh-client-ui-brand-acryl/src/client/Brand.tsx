import type { HeroBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import {
  ACRYL_LOGO_BLACK_DATA_URL,
  ACRYL_LOGO_WHITE_DATA_URL,
} from './acryl-logo-data.ts'

/** Shared mark markup: two theme-swapped images inside a fixed square, optionally under a host class. */
function AcrylMark({ size, className }: { size: number; className?: string | undefined }) {
  return (
    <span
      aria-hidden="true"
      className={className === undefined ? 'acrylBrandMark' : `acrylBrandMark ${className}`}
      style={{ width: size, height: size }}
    >
      <img className="acrylBrandMarkLight" src={ACRYL_LOGO_BLACK_DATA_URL} alt="" />
      <img className="acrylBrandMarkDark" src={ACRYL_LOGO_WHITE_DATA_URL} alt="" />
      <style>{`
        .acrylBrandMark { display: inline-grid; flex: none; place-items: center; }
        .acrylBrandMark > img { grid-area: 1 / 1; width: 100%; height: 100%; object-fit: contain; }
        .acrylBrandMarkDark { display: none; }
        body[data-ds-dark-theme] .acrylBrandMarkLight { display: none; }
        body[data-ds-dark-theme] .acrylBrandMarkDark { display: block; }
      `}</style>
    </span>
  )
}

/** Render the ACRYL mark for the sidebar's brand-mark slot (expanded and collapsed rail). */
export function AcrylBrandMark({ size }: SidebarBrandMarkOwnerProps) {
  return <AcrylMark size={size} />
}

/** Render the ACRYL product name beside the sidebar mark. */
export function AcrylBrandName() {
  return <span>ACRYL</span>
}

/**
 * Render the ACRYL mark for the conversation-hero slot, preserving the host
 * class the hero passes for its hover-swim geometry (`css.fish` upstream).
 */
export function AcrylHeroBrandMark({ size, className }: HeroBrandMarkOwnerProps) {
  return <AcrylMark size={size} className={className} />
}

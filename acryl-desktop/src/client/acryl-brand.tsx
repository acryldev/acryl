import type { Context as ClientContext } from '@deepseek-ai/cordis'
import {
  ACRYL_LOGO_BLACK_DATA_URL,
  ACRYL_LOGO_WHITE_DATA_URL,
} from './acryl-logo-data.ts'

/** Geometry supplied by the upstream sidebar brand-mark slot. */
export interface AcrylBrandMarkProps {
  /** Requested square edge in pixels. */
  size: number
}

/** Empty owner share for the upstream sidebar brand-name slot. */
export interface AcrylBrandNameProps {
  /** Marker field: the occupant owns its content and width. */
  children?: never
}

/** Geometry and host class supplied by the upstream conversation-hero brand-mark slot. */
export interface AcrylHeroBrandMarkProps {
  /** Requested square edge in pixels. */
  size: number
  /** Host class preserving the hero's mark geometry (hover-swim sizing, position). */
  className?: string | undefined
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** Brand mark rendered in both the expanded sidebar and collapsed rail. */
    'sidebar.brand.mark': { kind: 'single'; scope: 'root'; owner: AcrylBrandMarkProps }
    /** Product name rendered beside the expanded mark. */
    'sidebar.brand.name': { kind: 'single'; scope: 'root'; owner: AcrylBrandNameProps }
  }
}

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

/** Render the supplied transparent ACRYL mark for the active DSH theme (sidebar slot). */
export function AcrylBrandMark({ size }: AcrylBrandMarkProps) {
  return <AcrylMark size={size} />
}

/** Render the ACRYL mark for the conversation-hero slot, preserving its host class. */
export function AcrylHeroBrandMark({ size, className }: AcrylHeroBrandMarkProps) {
  return <AcrylMark size={size} className={className} />
}

/** Render the ACRYL product name beside the mark. */
export function AcrylBrandName() {
  return <span>ACRYL</span>
}

/** Replace the upstream sidebar and hero brand through their public contribution slots. */
export function applyAcrylBrand(ctx: ClientContext): void {
  // Register at a negative priority so the ACRYL brand shadows the upstream
  // DeepSeek brand (sidecar also contributes sidebar.brand.mark at priority 0);
  // 'lowest renders' per the slot contract.
  ctx.slots.inject('sidebar.brand.mark', () => ctx.slots.register({
    name: 'sidebar.brand.mark',
    priority: -1000,
  }, AcrylBrandMark))
  ctx.slots.inject('sidebar.brand.name', () => ctx.slots.register({
    name: 'sidebar.brand.name',
    priority: -1000,
  }, AcrylBrandName))
  // dsh-client-ui-conversation declares this slot specifically so a deployment
  // with its own identity can replace the animated fish in the empty-session
  // hero (dsh-client-ui-brand-official's own README documents this as the
  // sanctioned override point - it deliberately leaves the hero on its
  // fallback for every build profile). The hero's fallback renders the fish
  // at 34px with its own `css.fish` host class (hover-swim geometry); pass
  // both through unchanged so ACRYL's mark sits in the identical box.
  ctx.slots.inject('conversation.hero.brand.mark', () => ctx.slots.register({
    name: 'conversation.hero.brand.mark',
    priority: -1000,
  }, AcrylHeroBrandMark))
}

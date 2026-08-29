import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
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

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** Brand mark rendered in both the expanded sidebar and collapsed rail. */
    'sidebar.brand.mark': { kind: 'single'; scope: 'root'; owner: AcrylBrandMarkProps }
    /** Product name rendered beside the expanded mark. */
    'sidebar.brand.name': { kind: 'single'; scope: 'root'; owner: AcrylBrandNameProps }
  }
}

/** Render the supplied transparent ACRYL mark for the active DSH theme. */
export function AcrylBrandMark({ size }: AcrylBrandMarkProps) {
  return (
    <span
      aria-hidden="true"
      className="acrylBrandMark"
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

/** Render the ACRYL product name beside the mark. */
export function AcrylBrandName() {
  return <span>ACRYL</span>
}

/** Replace the upstream sidebar brand through its public contribution slots. */
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
}

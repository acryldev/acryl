import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'

/** Geometry supplied by the upstream sidebar brand-mark slot. */
export interface AcrBrandMarkProps {
  /** Requested square edge in pixels. */
  size: number
}

/** Empty owner share for the upstream sidebar brand-name slot. */
export interface AcrBrandNameProps {
  /** Marker field: the occupant owns its content and width. */
  children?: never
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** Brand mark rendered in both the expanded sidebar and collapsed rail. */
    'sidebar.brand.mark': { kind: 'single'; scope: 'root'; owner: AcrBrandMarkProps }
    /** Product name rendered beside the expanded mark. */
    'sidebar.brand.name': { kind: 'single'; scope: 'root'; owner: AcrBrandNameProps }
  }
}

/** Render the ACR mark supplied by assets/acr-logo.svg. */
export function AcrBrandMark({ size }: AcrBrandMarkProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 1072 976"
      preserveAspectRatio="xMidYMid meet"
      role="img"
    >
      <g transform="translate(0 976) scale(.1 -.1)" fill="currentColor">
        <path d="M5494 8389l-599-432-120-86-120-87-268-193-267-194v-851l1-851-898-1-898-2-286-1-286-1-102-76-101-75v-9h2280v3280h-17l-599-431zM4127 3903l-7-6V600h15l245 178 245 179 565 409 565 410 62 45 61 44 116 84 116 84v1707h2358l105 79 105 79-11 12H4133l-6-7z" />
      </g>
    </svg>
  )
}

/** Render the ACR product name beside the mark. */
export function AcrBrandName() {
  return <span>ACR</span>
}

/** Replace the upstream sidebar brand through its public contribution slots. */
export function applyAcrBrand(ctx: ClientContext): void {
  ctx.slots.inject('sidebar.brand.mark', () => ctx.slots.register({
    name: 'sidebar.brand.mark',
  }, AcrBrandMark))
  ctx.slots.inject('sidebar.brand.name', () => ctx.slots.register({
    name: 'sidebar.brand.name',
  }, AcrBrandName))
}

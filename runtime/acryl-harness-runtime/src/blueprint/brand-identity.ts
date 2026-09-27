/**
 * BrandIdentity: the value object a Blueprint carries so anyone who builds on ACRYL can ship it under their own name
 * (a private, closed-source product or an internal tool). Pure: no I/O, no framework types. Every invariant is
 * enforced at construction, so a Blueprint can never hold a brand the client cannot render.
 *
 * @module acryl-harness-runtime/blueprint/brand-identity
 */

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/u
const MAX_NAME = 40
const MAX_TAGLINE = 120
const MAX_FONT_FAMILY = 200
const MAX_MARK = 3

export interface BrandIdentity {
  /** Product name shown in the sidebar, the tab or window title and the agent's own identity line. */
  readonly name: string
  readonly tagline?: string
  /** Accent color as `#rrggbb`; `accentDark` is the dark-mode variant (defaults to `accent`). */
  readonly accent?: string
  readonly accentDark?: string
  /** A CSS font-family list. */
  readonly fontFamily?: string
  /** One to three characters drawn as the logo mark when no image is supplied (defaults to the name's first letter). */
  readonly mark?: string
}

export class InvalidBrandIdentityError extends Error {
  constructor(detail: string) {
    super(`Invalid brand identity: ${detail}`)
    this.name = 'InvalidBrandIdentityError'
  }
}

function optionalText(record: Record<string, unknown>, key: string, max: number): string | undefined {
  const value = record[key]
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.trim() === '' || value.length > max) {
    throw new InvalidBrandIdentityError(`"${key}" must be a non-empty string of at most ${String(max)} characters`)
  }
  return value.trim()
}

function optionalColor(record: Record<string, unknown>, key: string): string | undefined {
  const value = optionalText(record, key, 7)
  if (value !== undefined && !HEX_COLOR.test(value)) throw new InvalidBrandIdentityError(`"${key}" must be a #rrggbb color`)
  return value
}

/** Validate untrusted input (a YAML row config, an environment value) into a BrandIdentity. */
export function brandIdentity(input: unknown): BrandIdentity {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) throw new InvalidBrandIdentityError('expected an object')
  const record = input as Record<string, unknown>
  const name = optionalText(record, 'name', MAX_NAME)
  if (name === undefined) throw new InvalidBrandIdentityError('"name" is required')
  const tagline = optionalText(record, 'tagline', MAX_TAGLINE)
  const accent = optionalColor(record, 'accent')
  const accentDark = optionalColor(record, 'accentDark')
  const fontFamily = optionalText(record, 'fontFamily', MAX_FONT_FAMILY)
  const mark = optionalText(record, 'mark', MAX_MARK)
  return {
    name,
    ...(tagline === undefined ? {} : { tagline }),
    ...(accent === undefined ? {} : { accent }),
    ...(accentDark === undefined ? {} : { accentDark }),
    ...(fontFamily === undefined ? {} : { fontFamily }),
    ...(mark === undefined ? {} : { mark }),
  }
}

/** The agent's opening identity line under this brand (what the system prompt says the agent is). */
export function identityLine(brand: BrandIdentity): string {
  // Domain-neutral on purpose: the app may be a music editor, an accounting tool or an IDE. It is the user's product, so it is named, not ACRYL.
  return `You are the assistant inside ${brand.name}. You help its users with what they ask, and you can extend ${brand.name} itself from the inside: when asked, you build, change and remove its plugins (tools, screens, commands) while it runs, and you can read files, run commands and write code to do so.`
}

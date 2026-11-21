// What an app says about itself that saving must respect: its visibility (private unless it says public) and its license. Read from the app's blend.yaml.
import { parse, parseDocument } from 'yaml'

export type Visibility = 'private' | 'public'

export interface AppIdentity {
  readonly id?: string
  readonly name?: string
  readonly visibility: Visibility
  readonly license?: string
  /** What the app is, in a sentence: what a store lists it with. */
  readonly description?: string
  /** The word its starter placed it by (`gaming`, `finance`); see placement.ts suggestPlacement. */
  readonly category?: string
  readonly version?: string
}

export function readAppIdentity(manifestText: string): AppIdentity {
  const document = parse(manifestText) as { metadata?: Record<string, unknown> } | null
  const metadata = document?.metadata ?? {}
  return {
    ...(typeof metadata.id === 'string' ? { id: metadata.id } : {}),
    ...(typeof metadata.name === 'string' ? { name: metadata.name } : {}),
    // Anything but an explicit `public` is private: a missing or mistyped value must never make work public.
    visibility: metadata.visibility === 'public' ? 'public' : 'private',
    ...(typeof metadata.license === 'string' ? { license: metadata.license } : {}),
    ...(typeof metadata.description === 'string' && metadata.description.trim() !== '' ? { description: metadata.description } : {}),
    ...(typeof metadata.category === 'string' ? { category: metadata.category } : {}),
    ...(typeof metadata.version === 'string' ? { version: metadata.version } : {}),
  }
}

/**
 * The manifest with `metadata.visibility` set to a person's choice. Edited as a YAML document, so its comments, order and style (block or flow)
 * stay as they were; a manifest that cannot be read is refused rather than rewritten.
 */
export function withVisibility(manifestText: string, visibility: Visibility): string {
  return withMetadata(manifestText, 'visibility', visibility)
}

/** The manifest with `metadata.license` set (an SPDX id such as MIT), kept as a YAML document as {@link withVisibility} does. */
export function withLicense(manifestText: string, license: string): string {
  return withMetadata(manifestText, 'license', license)
}

/** The manifest with `metadata.id` set, kept as a YAML document as {@link withVisibility} does. */
export function withId(manifestText: string, id: string): string {
  return withMetadata(manifestText, 'id', id)
}

/** The manifest with `metadata.version` set (a share's next release), kept as a YAML document as {@link withVisibility} does. */
export function withVersion(manifestText: string, version: string): string {
  return withMetadata(manifestText, 'version', version)
}

function withMetadata(manifestText: string, key: string, value: string): string {
  const document = parseDocument(manifestText)
  if (document.errors.length > 0) throw new Error(`blend.yaml could not be read: ${document.errors[0]?.message ?? 'invalid YAML'}`)
  document.setIn(['metadata', key], value)
  return String(document)
}

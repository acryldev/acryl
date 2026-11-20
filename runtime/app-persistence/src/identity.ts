// What an app says about itself that saving must respect: its visibility (private unless it says public) and its license. Read from the app's blend.yaml.
import { parse, parseDocument } from 'yaml'

export type Visibility = 'private' | 'public'

export interface AppIdentity {
  readonly id?: string
  readonly name?: string
  readonly visibility: Visibility
  readonly license?: string
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
  }
}

/**
 * The manifest with `metadata.visibility` set to a person's choice. Edited as a YAML document, so its comments, order and style (block or flow)
 * stay as they were; a manifest that cannot be read is refused rather than rewritten.
 */
export function withVisibility(manifestText: string, visibility: Visibility): string {
  const document = parseDocument(manifestText)
  if (document.errors.length > 0) throw new Error(`blend.yaml could not be read: ${document.errors[0]?.message ?? 'invalid YAML'}`)
  document.setIn(['metadata', 'visibility'], visibility)
  return String(document)
}

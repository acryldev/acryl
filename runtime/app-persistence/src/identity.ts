// What an app says about itself that saving must respect: its visibility (private unless it says public) and its license. Read from the app's blend.yaml.
import { parse } from 'yaml'

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

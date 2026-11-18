/**
 * Settings > Models, rendered inside the first-run popup. The Settings window renders the section registered under `settings.section` id `models`
 * (the DeepSeek models plugin); this renders that same registered component with the face it registered (`inject`) and the one store hook the slot
 * renderer would bind (`useSnapshot` over `hooks.snapshot`), so the popup shows the same cards, the same writes and the same copy as Settings. A
 * slot cannot be rendered by a plugin that did not declare it, so the section is read from the ledger (`ctx.slots.entries`, what the shell reads too).
 * Its footer seat is filled with the account sign-in card; its per-provider extras seat stays empty here (Settings itself has them).
 */
import { useSyncExternalStore } from 'react'
import type { ComponentType, ReactNode } from 'react'

/** The registered section as the ledger stores it. */
export interface RegisteredSection {
  readonly component: unknown
  readonly inject?: ((...args: never[]) => Record<string, unknown>) | undefined
}

interface SnapshotStore {
  getSnapshot(): unknown
  subscribe(listener: () => void): () => void
}

type SectionProps = Record<string, unknown> & { renderSlot: (name: string) => ReactNode }

export interface ModelsPaneProps {
  /** The ledger entry for `settings.section` id `models`; absent when the models plugin is not composed. */
  readonly section: RegisteredSection | undefined
  /** What fills the section's footer seat (the account sign-in card). */
  readonly footer: ReactNode
}

export function ModelsPane({ section, footer }: ModelsPaneProps): ReactNode {
  if (section?.inject === undefined) return null
  const { hooks, ...face } = section.inject()
  const store = (hooks as { snapshot?: SnapshotStore } | undefined)?.snapshot
  if (store === undefined) return null
  const Section = section.component as ComponentType<SectionProps>
  // The renderer's binding of `hooks.snapshot`: `useSnapshot(select)` reads the store through useSyncExternalStore.
  const useSnapshot = (select: (value: unknown) => unknown): unknown => select(useSyncExternalStore(store.subscribe, store.getSnapshot))
  return <Section {...face} useSnapshot={useSnapshot} renderSlot={name => (name === 'settings.models.footer' ? footer : null)} />
}

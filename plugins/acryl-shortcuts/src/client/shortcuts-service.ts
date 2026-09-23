// Type-only: the settings scope this registry is handed; the value import stays in `client/index.ts`
// (cross-plugin collaboration goes through the service, never a value import - client bundle purity gate).
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
import { matchesCombo } from './combo.ts'
// The single source of truth for the namespace string: the Host half registers its schema under
// this exact name (`../shortcuts-settings.ts`), so the client scope must bind the same constant
// rather than a second, independently-spelled literal that could drift out of sync. Imported from
// the dedicated no-deps file, not `../shortcuts-settings.ts` itself, so the client bundle never
// pulls in schemastery (a Host-only concern) just to read a string.
export { SHORTCUTS_SETTINGS_NAMESPACE } from '../shortcuts-namespace.ts'

/** One registered action: a stable id, a human label, and the combo it uses until reassigned. */
export interface ShortcutAction {
  readonly id: string
  readonly label: string
  readonly defaultCombo: string
}

/**
 * Shared registry of user-assignable keyboard shortcuts. A plugin registers its action once
 * (a stable id, a label, a default combo) and reads back the LIVE combo - the user's override if
 * one exists, the default otherwise - through {@link getCombo} or {@link subscribe}. Assignments
 * persist through the real settings transport (`ctx.settingsScope`), the same seam every other
 * ACRYL/DSH preference uses, not a bespoke file format.
 */
export class ShortcutsRegistry {
  private readonly actions = new Map<string, ShortcutAction>()

  /**
   * @param scope - the bound settings scope this registry reads overrides from and writes to.
   */
  constructor(private readonly scope: SettingsScope<Record<string, string>>) {}

  /** Register (or re-register, idempotently) one action. Call from the owning plugin's `apply`. */
  register(action: ShortcutAction): void {
    this.actions.set(action.id, action)
  }

  /** Every currently-registered action, for the Shortcuts settings page to list. */
  list(): readonly ShortcutAction[] {
    return [...this.actions.values()]
  }

  /** The live combo for `id`: the user's saved override if one exists, else the registered default. */
  getCombo(id: string): string {
    const saved = this.scope.getSnapshot().value?.[id]
    return saved ?? this.actions.get(id)?.defaultCombo ?? ''
  }

  /** Save a new combo for `id`. Persists through the real settings transport. */
  setCombo(id: string, combo: string): Promise<void> {
    return this.scope.set(id, combo)
  }

  /** Reset `id` back to its registered default by clearing the saved override. */
  resetCombo(id: string): Promise<void> {
    return this.scope.unset(id)
  }

  /**
   * Reset every registered action back to its default in one go - the safety net for a user who
   * reassigned combos into an unworkable state and just wants the defaults back, without hunting
   * down each row's own Reset button one at a time.
   */
  async resetAll(): Promise<void> {
    await Promise.all([...this.actions.keys()].map(id => this.resetCombo(id)))
  }

  /** Observe combo changes (a save from this tab or, once the settings mirror updates, another). */
  subscribe(listener: () => void): () => void {
    return this.scope.subscribe(listener)
  }

  /**
   * Whether a real keydown event is `id`'s live combo. Exposed on the registry itself - not a
   * standalone exported function - so a consumer never needs a value import of this package's own
   * bundle (only the type-only `ctx.shortcuts` augmentation, resolved through cordis DI at
   * runtime; a built client bundle's factory-wrapped output has no statically analyzable named
   * exports for another package's bundler to inline).
   */
  matches(id: string, event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>): boolean {
    return matchesCombo(event, this.getCombo(id))
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    shortcuts: ShortcutsRegistry
  }
}

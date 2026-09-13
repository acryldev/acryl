/**
 * Auto-retry for the pinned `ui-renderer` boot-order race: `RootOutlet`
 * (`deepseek-harness/packages/client/ui-renderer/src/client/scoped-slots.tsx`)
 * throws `SlotAssemblyError("renderSlot('root') before any 'root' registration
 * (boot order)")` when React renders the shell before any plugin has
 * registered the 'root' slot. The assertion itself is deliberate pinned
 * behavior and stays untouched; this only shortens the user-visible failure
 * (a white screen) when the race is transient, which live testing confirmed
 * it usually is.
 *
 * The retry script is injected as a `head`-placed classic script via
 * `webserver/index-inject`, ahead of every module script (module scripts are
 * deferred by spec; a head classic script runs first, during parsing) so the
 * listener is armed before the module graph that can throw this error even
 * starts evaluating.
 */

import type { IndexInjection } from '@deepseek-ai/dsh-host-webserver'

/**
 * Session-scoped guard key: cleared when the tab closes, so a genuinely
 * persistent boot-order failure (not a transient race) reaches the normal
 * "Failed to load plugins" / crash face on the second attempt instead of
 * looping reloads forever.
 */
const RETRY_GUARD_KEY = '__acryl_root_slot_retry__'

/**
 * Inline classic script: listens for the uncaught `SlotAssemblyError` this
 * specific message identifies (both as a synchronous window 'error' event,
 * for the throw during the initial synchronous render, and as an
 * 'unhandledrejection', in case a future renderer version defers the throw),
 * and reloads the page exactly once per tab session.
 */
export const DESKTOP_ROOT_SLOT_RETRY_SCRIPT = `(() => {
  const guardKey = ${JSON.stringify(RETRY_GUARD_KEY)};
  const marker = "renderSlot('root') before any 'root' registration (boot order)";
  const isBootOrderRace = (value) => typeof value === 'string' && value.includes(marker);
  const retryOnce = () => {
    let alreadyRetried = false;
    try { alreadyRetried = sessionStorage.getItem(guardKey) === '1'; } catch { /* private/blocked storage: treat as not yet retried */ }
    if (alreadyRetried) return false;
    try { sessionStorage.setItem(guardKey, '1'); } catch { /* best-effort guard; a failed write still allows one reload */ }
    location.reload();
    return true;
  };
  window.addEventListener('error', (event) => {
    if (isBootOrderRace(event.error && event.error.message)) retryOnce();
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    if (isBootOrderRace(reason && reason.message)) retryOnce();
  });
})();`

/** Structured row consumed by the served index renderer. */
export function desktopRootSlotRecoveryInjections(): readonly IndexInjection[] {
  return [
    { kind: 'script', placement: 'head', text: DESKTOP_ROOT_SLOT_RETRY_SCRIPT },
  ]
}

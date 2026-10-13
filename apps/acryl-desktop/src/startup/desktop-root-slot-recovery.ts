/**
 * Reload for a page that lost its 'root' slot: `RootOutlet`
 * (`deepseek-harness/packages/client/ui-renderer/src/client/scoped-slots.tsx`)
 * throws `SlotAssemblyError("renderSlot('root') before any 'root' registration
 * (boot order)")` whenever React renders the shell while no plugin holds
 * 'root', and nothing above it catches the throw, so the window goes white.
 * That happens in two ways: the boot-order race (React renders before the
 * owner registers), and at any later time when the owner's plugin
 * (`acryl-workspace`, through `applyAdvancedShell`) is replaced: a hot reload
 * of its rebuilt bundle, or of any provider it injects, drops 'root' before
 * the new copy registers it again (reproduced 2026-10-13 on an isolated
 * Desktop by reloading `acryl-workspace` through the page's entry controller).
 * The assertion itself is pinned upstream behavior and stays untouched; this
 * reloads the page, which rebuilds the shell from the current bundles.
 *
 * The retry script is injected as a `head`-placed classic script via
 * `webserver/index-inject`, ahead of every module script (module scripts are
 * deferred by spec; a head classic script runs first, during parsing) so the
 * listener is armed before the module graph that can throw this error even
 * starts evaluating.
 */

import type { IndexInjection } from '@deepseek-ai/dsh-host-webserver'

/** Session-scoped key holding the time of the last reload this script made. */
const RETRY_GUARD_KEY = '__acryl_root_slot_retry_at__'

/**
 * A reload is made only when the last one is older than this, so a failure
 * that returns right after a reload (a persistent boot failure, not a
 * transient one) stops at the normal crash face instead of looping, while a
 * window that loses its root hours later (a rebuild under a running app) is
 * reloaded again.
 */
export const ROOT_SLOT_RETRY_INTERVAL_MS = 60_000

/**
 * Inline classic script: listens for the uncaught `SlotAssemblyError` this
 * specific message identifies (both as a synchronous window 'error' event,
 * for the throw during a render, and as an 'unhandledrejection', in case a
 * future renderer version defers the throw), and reloads the page unless it
 * already did within `ROOT_SLOT_RETRY_INTERVAL_MS`.
 */
export const DESKTOP_ROOT_SLOT_RETRY_SCRIPT = `(() => {
  const guardKey = ${JSON.stringify(RETRY_GUARD_KEY)};
  const marker = "renderSlot('root') before any 'root' registration (boot order)";
  const isBootOrderRace = (value) => typeof value === 'string' && value.includes(marker);
  const interval = ${String(ROOT_SLOT_RETRY_INTERVAL_MS)};
  const retryOnce = () => {
    const now = Date.now();
    let last = NaN;
    try { last = Number(sessionStorage.getItem(guardKey)); } catch { /* private/blocked storage: treat as not yet retried */ }
    if (Number.isFinite(last) && last > 0 && now - last < interval) return false;
    try { sessionStorage.setItem(guardKey, String(now)); } catch { /* best-effort guard; a failed write still allows the reload */ }
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

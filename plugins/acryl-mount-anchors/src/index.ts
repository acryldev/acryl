/**
 * Host side of the mount-anchor inspector. There is nothing for the Host to own: resolution
 * (walking `data-acryl-slot` ancestors, matching hashed classes against `data-plugin-css` tags)
 * is pure client-side DOM inspection, with no PTY, no routes, no server state. This plugin exists
 * only so the Loader row has a real Host module to activate/dispose, matching every other
 * package's shape - the client-only work lives entirely in `./client`.
 */

/** Stable Cordis plugin name. */
export const name = 'acryl-mount-anchors'

/** No Host-side resources to acquire. */
export function apply(): void {}

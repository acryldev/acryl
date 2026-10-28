/**
 * Host side of the start-page command reply. There is nothing for the Host to own: the reply arrives in the browser with the command's own
 * acknowledgment, so the work lives entirely in `./client`. This plugin exists so the Loader row has a real Host module to activate and dispose.
 */

/** Stable Cordis plugin name. */
export const name = 'acryl-command-reply'

/** No Host-side resources to acquire. */
export function apply(): void {}

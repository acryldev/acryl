/**
 * ACRYL browser-brand plugin, node half. The empty apply gives the Loader a
 * host-side row while the browser half ships through `exports["./client"]`,
 * mirroring `@deepseek-ai/dsh-client-ui-brand-official`'s own node/client
 * split.
 */

/** Host plugin body - this package contributes browser presentation only. */
export function apply(): void {}

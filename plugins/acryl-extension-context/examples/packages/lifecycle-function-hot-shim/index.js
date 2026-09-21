// Example: lifecycle-function.hot-shim
// Type:     lifecycle-function
// Surfaces: tui web desktop
// LEGACY:   acryl_install_plugin now reloads host code automatically (docs/delivery/local-live.md); write this shim only if you bypass the installer.
// Teaches:  make HOST code hot-updatable. Node caches module resolution, so re-installing a changed plugin
//           keeps running the OLD host code (measured). This shim never changes: each time the plugin mounts
//           it re-imports impl.js with a unique query string, which bypasses the cache. Put ALL real logic
//           in impl.js and keep this file exactly as it is. (Browser client.js needs no shim: it is re-read
//           from disk on page reload.)
// Expect:   v1 -> edit impl.js -> acryl_install_plugin again -> the NEW behaviour is live with no restart.
// Docs:     delivery.local-live
// Pattern:  measured on the real engine, spec 037 research
export const name = 'acryl-example-hot-shim'

export async function apply(ctx, config) {
  const impl = await import(new URL('./impl.js', import.meta.url).href + '?t=' + Date.now() + Math.random())
  return impl.apply(ctx, config)
}

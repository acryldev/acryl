/**
 * The products as Blend apps (spec 051 T013, D5): Control Center and ACRYL ADE live in apps/ with their history, but they are Blends, not workspace
 * packages. Each installs the framework's published packages with npm, exactly as a person's Blend does, runs on the framework's own instance plugin
 * outside ACRYL's runtime, and carries the library plugins acrylblends copies into every Blend (plugins/library.lock.json) until those are packages
 * (spec 051 T011). One list, read by scripts/verify-layout.mjs (not workspace packages, not in the source ratchets) and the bulkhead test
 * (runtime/acryl-harness-runtime/tests/bulkhead.spec.ts: not ACRYL runtime code). A folder is a Blend app only by being named here, never by a marker it grows.
 */
export const BLEND_APPS = ['apps/acryl-control-center', 'apps/acryl-ade']

/** Whether a repository-relative path (forward slashes) is a Blend app or inside one. */
export const inBlendApp = (path) => BLEND_APPS.some((app) => path === app || path.startsWith(`${app}/`))

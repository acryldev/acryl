/** Minimal browser-worker alias required by browser-only client dependencies in Node tests. */
if (globalThis.self === undefined) {
  Object.defineProperty(globalThis, 'self', {
    configurable: true,
    value: globalThis,
    writable: true,
  })
}

if (globalThis.self === undefined) {
  Object.defineProperty(globalThis, 'self', {
    configurable: true,
    value: globalThis,
    writable: true,
  })
}

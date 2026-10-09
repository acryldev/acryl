'use strict'
// Stands in for the real `node-addon-require-builtin`, which reaches into Node's private module loader through a native addon. Under Deno that addon cannot work
// (it needs V8 internals Deno does not expose), and on Windows inside a `deno desktop` process merely loading ANY native Node-API addon ends the process with an
// uncatchable 0xC06D007F. Its callers (the Cordis Loader, dsh-app-boot) already treat a throw as "no Node internals here" and take their documented fallback, so this
// throws the same way without loading anything native.
exports.requireBuiltin = function requireBuiltin(id) {
  throw new Error(`node-addon-require-builtin unsupported: this AcrylDeno build never loads native Node-internals addons (asked for ${JSON.stringify(id)})`)
}

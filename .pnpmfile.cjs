// Stopgap until acrylblends 1.1: acrylblends docs/plans/framework-1-1-tickets.md, "vitest out of acrylblends' production closure (P1)".
// acrylblends 1.0 declares vitest as an optional peer for its conformance suites (acrylblends/db/conformance, acrylblends/kv/conformance).
// pnpm resolves an optional peer whenever the workspace has it, so `pnpm deploy --prod` copied vitest, vite, rolldown, lightningcss and
// fsevents into the shipped CLI and Web runtimes: about 30 MB more per install, and a macOS Web archive the release refuses for its foreign
// fsevents native. Dropping the peer keeps them out; the two conformance specs still find the workspace's vitest through pnpm's hoisted
// virtual store. scripts/production-closure.test.mjs fails if they come back.
module.exports = {
  hooks: {
    readPackage(manifest) {
      if (manifest.name === 'acrylblends' && manifest.peerDependencies?.vitest !== undefined) {
        delete manifest.peerDependencies.vitest
        if (manifest.peerDependenciesMeta !== undefined) delete manifest.peerDependenciesMeta.vitest
      }
      return manifest
    },
  },
}

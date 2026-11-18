#!/usr/bin/env node
// A Node too old to run the package is told so in plain words, before anything is loaded that would fail on it.
const [major, minor] = process.versions.node.split('.').map(Number)
if (major < 22 || (major === 22 && minor < 19)) {
  console.error(
    `Node 22.19+ needed, you have ${process.versions.node}: install it from https://nodejs.org or with nvm (nvm install 22).`,
  )
  process.exit(1)
}
const { runCreate } = await import('../dist/index.js')

process.exitCode = await runCreate(process.argv.slice(2))

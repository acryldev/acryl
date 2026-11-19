// Refuses a Node that is too old to run this app, before the command that would fail on it. Plain CommonJS so that any Node can read it.
const [major, minor] = process.versions.node.split('.').map(Number)
if (major < 22 || (major === 22 && minor < 19)) {
  console.error(
    `Node 22.19+ needed, you have ${process.versions.node}: install it from https://nodejs.org or with nvm (nvm install 22), then run this again.`,
  )
  process.exit(1)
}

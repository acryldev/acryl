// Which Node versions acryl runs on, as package.json's engines says (>=22.19.0). Loaded by bin.js before anything else, so it keeps to
// syntax every Node since 12 parses: an older Node must reach the message below instead of failing on newer syntax elsewhere.

export var MINIMUM = '22.19.0'

/** Whether a `process.versions.node` string is new enough. */
export function supportedNode(version) {
  var parts = String(version).split('.').map(Number)
  var wanted = MINIMUM.split('.').map(Number)
  for (var i = 0; i < 3; i++) {
    var have = parts[i] || 0
    if (have !== wanted[i]) return have > wanted[i]
  }
  return true
}

/** What a person on an older Node reads: what is wrong, and the one thing to do. */
export function unsupportedMessage(version) {
  return 'acryl needs Node.js ' + MINIMUM + ' or later; this is Node.js ' + version + '.\n' +
    'Install the current LTS from https://nodejs.org (or with nvm: nvm install --lts), then run the command again.\n'
}

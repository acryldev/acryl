#!/usr/bin/env node
// The entry every Node runs. It checks the Node version before the selector (cli.js) loads, because the selector and the launcher use syntax
// an older Node cannot parse and would fail with a message nobody can act on (Node 18: "Invalid regular expression flags"). Keep this file
// to syntax every Node since 12 parses.
import { supportedNode, unsupportedMessage } from './node-version.js'

if (!supportedNode(process.versions.node)) {
  process.stderr.write(unsupportedMessage(process.versions.node))
  process.exitCode = 1
} else {
  import('./cli.js').catch(function (cause) {
    process.stderr.write('acryl: ' + (cause && cause.message ? cause.message : String(cause)) + '\n')
    process.exitCode = 1
  })
}

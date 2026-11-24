// `node app-install-cli.mjs --home <ACRYL home> [-- <npm arguments>]`, run in the app's folder: installApp (app-install.js) as one command, so
// `acryl` and Control Center run the same install the way they run any command (its output is npm's, plus one `acryl:` line about the Program).
import { installApp, runNpm } from './app-install.js'

const argv = process.argv.slice(2)
const home = argv[argv.indexOf('--home') + 1]
const dash = argv.indexOf('--')
if (!argv.includes('--home') || home === undefined || home === '--') {
  console.error('usage: node app-install-cli.mjs --home <ACRYL home> [-- <npm arguments>]')
  process.exit(2)
}

const { code } = await installApp({
  folder: process.cwd(), home, npm: runNpm, say: line => console.log(`acryl: ${line}`), ...(dash === -1 ? {} : { npmArgs: argv.slice(dash + 1) }),
})
process.exitCode = code

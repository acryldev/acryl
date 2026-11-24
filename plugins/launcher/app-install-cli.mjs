// `node app-install-cli.mjs --home <ACRYL home> [-- <npm arguments>]`, run in the app's folder: installApp (app-install.js) as one command, so
// `acryl` and Control Center run the same install the way they run any command (its output is npm's, plus one `acryl:` line about the Program).
import { spawn } from 'node:child_process'
import { installApp, npmCommand } from './app-install.js'

const argv = process.argv.slice(2)
const home = argv[argv.indexOf('--home') + 1]
const dash = argv.indexOf('--')
if (!argv.includes('--home') || home === undefined || home === '--') {
  console.error('usage: node app-install-cli.mjs --home <ACRYL home> [-- <npm arguments>]')
  process.exit(2)
}

const npm = (args, cwd) => new Promise((done) => {
  const command = npmCommand({ env: process.env, platform: process.platform, execPath: process.execPath }, args)
  const child = spawn(command.command, command.args, { cwd, stdio: 'inherit', shell: command.shell === true })
  child.once('error', (cause) => { console.error(`acryl: ${cause.message}`); done(1) })
  child.once('exit', code => done(code ?? 1))
})

const { code } = await installApp({
  folder: process.cwd(), home, npm, say: line => console.log(`acryl: ${line}`), ...(dash === -1 ? {} : { npmArgs: argv.slice(dash + 1) }),
})
process.exitCode = code

#!/usr/bin/env node
// Open the terminal face from source (`pnpm launcher tui`): the same screen `acryl --tui` shows, in the home and apps folder named by
// ACRYL_LAUNCHER_HOME and ACRYL_LAUNCHER_APPS (never ~/.acryl). It prints what was chosen and does not run it.
import { mkdirSync } from 'node:fs'
import { runLauncher } from '../run.js'

const home = process.env.ACRYL_LAUNCHER_HOME
const appsFolder = process.env.ACRYL_LAUNCHER_APPS
if (!home || !appsFolder) {
  console.error('set ACRYL_LAUNCHER_HOME and ACRYL_LAUNCHER_APPS (pnpm launcher tui does)')
  process.exit(2)
}
if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error('the terminal screen needs a terminal')
  process.exit(2)
}
mkdirSync(home, { recursive: true })
const chosen = await runLauncher({ home, appsFolder })
console.log(chosen === undefined ? 'left without choosing' : `would run: ${chosen.line}`)

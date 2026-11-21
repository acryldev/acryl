#!/usr/bin/env node
// Open the terminal Control Center from source (`pnpm launcher tui`): the same screen `acryl --tui` shows, in the home named by ACRYL_LAUNCHER_HOME (never
// ~/.acryl; new apps are suggested beside it). It imports @acryldev/launcher-desktop/node, so build that package first. It prints what was handed back
// and does not run it.
import { mkdirSync } from 'node:fs'
import { runLauncher } from '../run.js'

const home = process.env.ACRYL_LAUNCHER_HOME
if (!home) {
  console.error('set ACRYL_LAUNCHER_HOME (pnpm launcher tui does)')
  process.exit(2)
}
if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error('the terminal screen needs a terminal')
  process.exit(2)
}
mkdirSync(home, { recursive: true })
const chosen = await runLauncher({ home })
console.log(chosen === undefined ? 'left without choosing' : `would run: ${chosen.line}`)

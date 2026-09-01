#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { runtimeLauncher } from './runtime.js'

const args = process.argv.slice(2)
if (args[0] === 'web') {
  console.error('acryl web is not installed yet. This selector release cannot acquire a matching Web runtime.')
  process.exitCode = 1
} else {
  try {
    const child = spawn(runtimeLauncher(), args, { stdio: 'inherit' })
    child.once('error', cause => {
      console.error(`acryl: ${cause.message}`)
      process.exitCode = 1
    })
    child.once('exit', code => { process.exitCode = code ?? 1 })
  } catch (cause) {
    console.error(`acryl: ${cause instanceof Error ? cause.message : String(cause)}`)
    process.exitCode = 1
  }
}

// Start `npm start` (or any command) in its own process group, and stop it with everything it started. Signalling npm alone does not reach node on Linux (/bin/sh does not pass
// the signal on), which leaves the app running with its port and its door held. Windows has no process groups.
import { spawn } from 'node:child_process'

export const startGroup = (command, args, options) =>
  spawn(command, args, { ...options, detached: process.platform !== 'win32' })

/** Signal the whole group, then wait for the leader to exit (at most `ms`), then make sure nothing is left. */
export async function stopGroup(child, signal = 'SIGTERM', ms = 10_000) {
  const send = (name) => {
    try {
      if (process.platform === 'win32') child.kill(name)
      else process.kill(-child.pid, name)
    } catch {}
  }
  const exited =
    child.exitCode !== null || child.signalCode !== null
      ? Promise.resolve()
      : new Promise((done) => child.once('exit', done))
  send(signal)
  await Promise.race([exited, new Promise((done) => setTimeout(done, ms))])
  send('SIGKILL')
}

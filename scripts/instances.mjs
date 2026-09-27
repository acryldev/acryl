#!/usr/bin/env node
/**
 *   node scripts/instances.mjs ps              every managed app, and every app running anywhere (alias: list)
 *   node scripts/instances.mjs stop <id>       ask a running app to shut down
 *   node scripts/instances.mjs path <name>     where a managed app keeps its data
 *   node scripts/instances.mjs rm <name>       delete a stopped managed app and everything it kept (like docker rm)
 *
 * Create an app with `acryl new <folder>`; start it with `<folder>/bin/acryl web|desktop|cli`. Docker's words: image = Blueprint/Blend, container = app.
 */
import { InstanceError, isMainModule, listInstances, managedApp, removeInstance, stopInstance } from './lib/instances.mjs'

export function run(argv, out = text => process.stdout.write(text)) {
  const [command = 'ps', name] = argv
  if (command === 'list' || command === 'ps') {
    const all = listInstances()
    if (all.length === 0) out('no apps yet (create one with: acryl new <folder>)\n')
    for (const app of all) out(`${app.id.padEnd(24)} ${app.running ? `running  pid ${app.pid}  ${app.surface ?? ''}${app.port ? `  port ${app.port}` : ''}  ${app.home}` : 'stopped'}\n`)
    return 0
  }
  if (name === undefined) throw new InstanceError(`usage: instances.mjs ${command} <name>`)
  if (command === 'stop') { out(stopInstance(name) ? `asked ${name} to stop\n` : `${name} is not running\n`); return 0 }
  if (command === 'path') { out(`${managedApp(name).home}\n`); return 0 }
  if (command === 'rm') { out(`removed ${removeInstance(name)}\n`); return 0 }
  throw new InstanceError(`unknown command ${JSON.stringify(command)}; use ps, stop, path or rm`)
}

if (isMainModule(import.meta.url)) {
  try {
    process.exitCode = run(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(`instances: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 2
  }
}

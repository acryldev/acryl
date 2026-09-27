#!/usr/bin/env node
/**
 *   node scripts/instances.mjs list           every instance, and what is running
 *   node scripts/instances.mjs stop <name>    ask a running instance to shut down
 *   node scripts/instances.mjs path <name>    where an instance keeps its data (delete that folder to reset it)
 */
import { fileURLToPath } from 'node:url'
import { InstanceError, listInstances, resolveInstance, stopInstance } from './lib/instances.mjs'

export function run(argv, out = text => process.stdout.write(text)) {
  const [command = 'list', name] = argv
  if (command === 'list') {
    const all = listInstances()
    if (all.length === 0) out('no instances yet (start one with: node scripts/blank.mjs web --instance <name>)\n')
    for (const instance of all) out(`${instance.name.padEnd(20)} ${instance.running ? `running  pid ${instance.pid}  ${instance.surface ?? ''}  ${instance.blueprint ?? ''}${instance.port ? `  port ${instance.port}` : ''}` : 'stopped'}\n`)
    return 0
  }
  if (command === 'stop') {
    if (name === undefined) throw new InstanceError('usage: instances.mjs stop <name>')
    out(stopInstance(name) ? `asked ${name} to stop\n` : `${name} is not running\n`)
    return 0
  }
  if (command === 'path') {
    if (name === undefined) throw new InstanceError('usage: instances.mjs path <name>')
    out(`${resolveInstance(name).root}\n`)
    return 0
  }
  throw new InstanceError(`unknown command ${JSON.stringify(command)}; use list, stop or path`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = run(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(`instances: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 2
  }
}

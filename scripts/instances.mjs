#!/usr/bin/env node
/**
 *   node scripts/instances.mjs ps             every managed instance, and what is running (alias: list)
 *   node scripts/instances.mjs stop <name>    ask a running instance to shut down
 *   node scripts/instances.mjs path <name>    where an instance keeps its data
 *   node scripts/instances.mjs rm <name>      delete a stopped managed instance and everything it kept (like docker rm)
 *
 * Create one with `node scripts/init-instance.mjs <folder>`; start it with `<folder>/run.sh web|desktop|cli`. Docker's words: image = Blueprint/Blend, container = instance.
 */
import { fileURLToPath } from 'node:url'
import { InstanceError, isMainModule, listInstances, removeInstance, resolveInstance, stopInstance } from './lib/instances.mjs'

export function run(argv, out = text => process.stdout.write(text)) {
  const [command = 'list', name] = argv
  if (command === 'list' || command === 'ps') {
    const all = listInstances()
    if (all.length === 0) out('no instances yet (start one with: node scripts/blank.mjs web --instance <name>)\n')
    for (const instance of all) out(`${instance.id.padEnd(20)} ${instance.running ? `running  pid ${instance.pid}  ${instance.surface ?? ''}  ${instance.blueprint ? String(instance.blueprint).split('/').at(-1) : ''}${instance.port ? `  port ${instance.port}` : ''}  ${instance.root}` : 'stopped'}\n`)
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
  if (command === 'rm') {
    if (name === undefined) throw new InstanceError('usage: instances.mjs rm <name>')
    out(`removed ${removeInstance(name)}\n`)
    return 0
  }
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

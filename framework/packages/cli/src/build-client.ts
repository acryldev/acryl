import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { relative, resolve } from 'node:path'
import { UsageError } from './init'
import type { Io } from './io'

/** Parse `build-client [root] [outDir]`. */
export function parseBuildClientOptions(argv: readonly string[]): { root: string; outDir: string } {
  const args = argv.filter((a) => !a.startsWith('-'))
  if (args.length !== argv.length)
    throw new UsageError('build-client takes [root] [outDir] and no options')
  if (args.length > 2)
    throw new UsageError('build-client takes at most two arguments: [root] [outDir]')
  return { root: args[0] ?? 'src/client', outDir: args[1] ?? 'dist/client' }
}

/**
 * Compile the app's client modules once (`buildClientModules` of the framework), for a production install that has no compiler at run time.
 * The framework is the one installed in the app (so the compiled files match the server that serves them), else this package's own.
 */
export async function buildClient(
  options: { root: string; outDir: string },
  io: Io,
): Promise<number> {
  const root = resolve(io.cwd, options.root)
  if (!existsSync(root)) {
    io.stderr.write(
      `error: ${root} does not exist; the client modules live in src/client by default\n`,
    )
    return 1
  }
  const outDir = resolve(io.cwd, options.outDir)
  const here = createRequire(resolve(io.cwd, 'package.json'))
  let specifier = 'acrylblends/node-server'
  try {
    here.resolve(specifier)
  } catch {
    specifier = new URL('../lib/node-server.js', import.meta.url).href
  }
  const mod = (await import(
    specifier.startsWith('file:') ? specifier : here.resolve(specifier)
  )) as typeof import('../lib/node-server')
  const written = mod.buildClientModules({ root, outDir })
  for (const file of written) io.stdout.write(`${relative(io.cwd, resolve(outDir, file))}\n`)
  io.stdout.write(`built ${written.length} files in ${relative(io.cwd, outDir) || '.'}\n`)
  return 0
}

/**
 * `acryl-web` command-line entry: boot the ACRYL browser surface and serve.
 *
 * @module acryl-web/bin
 * @example
 *   acryl-web                     # serve on 127.0.0.1:<port> (from the web profile)
 *   acryl-web --json              # boot, print the URL, dispose (readiness probe)
 *   acryl-web --help              # usage
 */

import { serveWeb } from './serve.ts'

function usage(): string {
  return [
    'ACRYL web - browser surface',
    '',
    'Usage: acryl-web [options]',
    '',
    'Options:',
    '  -h, --help     Show this help',
    '  --json         Boot, print the URL (JSON), dispose (readiness probe)',
    '',
  ].join('\n')
}

async function main(argv: readonly string[]): Promise<void> {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(`${usage()}\n`)
    return
  }
  const json = argv.includes('--json')
  const result = await serveWeb({ waitForSignal: !json })
  if (json) process.stdout.write(`${JSON.stringify({ url: result.url })}\n`)
}

main(process.argv.slice(2)).catch(cause => {
  console.error(cause instanceof Error ? cause.message : String(cause))
  process.exitCode = 1
})

import { add, listPlugins, parseAddOptions } from './add'
import { buildClient, parseBuildClientOptions } from './build-client'
import { checkDeps, parseCheckDepsOptions } from './check-deps'
import { openFrame } from './frame-url'
import { init, parseInitOptions, UsageError } from './init'
import { type Io, processIo } from './io'
import { kvImport, parseKvOptions } from './kv-import'
import { runPreflight } from './preflight'
import { TEMPLATE_SUMMARY, TEMPLATES } from './templates'
import { parseUpdateOptions, update } from './update'
import { parseUpgradeOptions, upgrade } from './upgrade'
import { VERSION } from './version'

export { VERSION }

export const HELP = `acrylblends ${VERSION} - scaffold Cordis apps

Usage:
  acrylblends init [dir] [options]       Create a Cordis app in an empty or new directory
  acrylblends add <plugin...> [--dir d] [--suite]  Copy library plugins (and what they require) into an app;
                                      a folder path brings an external plugin into its plugins/;
                                      --suite also copies the port's conformance suite and vitest (add kv --suite)
  acrylblends upgrade [plugin...] [--dir d] [--dry-run] [--force] [--diff]
                                      Bring the library plugins an app carries (the router, the server, the door, ...) up to this
                                      version: untouched files are replaced, an edited file stops it (diff shown) unless --force
  acrylblends upgrade --desktop-packages [--dir d] [--dry-run]
                                      Move the app's copies of the desktop shell and the instance to the @acryldev packages, once
  acrylblends update [--dir d] [--check] Bring the newer release of the Blend this app was made from (blend.yaml) into it from the
                                      registry, keeping your changes (a git merge); --check only says whether there is one
  acrylblends plugins                    List the plugin library
  acrylblends open [dir]           Print the address of the frame running this app (the URL npm run dev printed),
                                      for a page that has to be opened again after its session ended
  acrylblends preflight                  Check this machine for the workshop: Node, npm, git, a coding agent, a free port
                                      (and on Windows PowerShell and long paths); one line per check, PASS or the fix
  acrylblends build-client [root] [out]  Compile the client modules once for production (src/client to dist/client)
  acrylblends kv import <kv.json> <db>   Move a JSON-file kv store into the kv table of a SQLite database [--overwrite] [--table t] [--migrations dir]
  acrylblends check-deps [dir]           Fail when app code imports a database driver or opener outside the file named in
                                      package.json "acryl": { "opener": "src/db.ts" } (a port is imported, a provider is not)

Options for init:
  --template <name>      one of the templates below (asked when not given); --agent means --template agent,
                         --no-agent means --template blank
  --name <name>          the project name (default: the directory name)
  --bare                 a plain app, without the ACRYL frame (the frame, its chat and agents and npm run desktop, are the default)
  --desktop              the frame and the desktop shell (the default; kept for older scripts)
  --install              run npm install after copying
  -y, --yes              ask nothing; use defaults (the blank template, no install)

  -h, --help             show this help
  -v, --version          show the version

Templates (the same list as npm create @acryldev/blends):
${TEMPLATES.map((name) => `  ${name.padEnd(7)} ${TEMPLATE_SUMMARY[name]}`).join('\n')}
`

/**
 * Run the CLI and return the exit code: 0 done, 1 failed or refused, 2 a usage error. Never calls `process.exit`.
 */
export async function runCli(argv: readonly string[], io: Io = processIo()): Promise<number> {
  const [command, ...args] = argv
  try {
    if (command === undefined || command === 'help' || command === '-h' || command === '--help') {
      io.stdout.write(HELP)
      return command === undefined ? 2 : 0
    }
    if (command === 'version' || command === '-v' || command === '--version') {
      io.stdout.write(`${VERSION}\n`)
      return 0
    }
    if (command === 'init') return await init(parseInitOptions(args), io)
    if (command === 'add') return await add(parseAddOptions(args), io)
    if (command === 'upgrade') return await upgrade(parseUpgradeOptions(args), io)
    if (command === 'update') return await update(parseUpdateOptions(args), io)
    if (command === 'build-client') return await buildClient(parseBuildClientOptions(args), io)
    if (command === 'kv') return await kvImport(parseKv(args), io)
    if (command === 'check-deps') return checkDeps(parseCheckDeps(args), io)
    if (command === 'plugins') return listPlugins(io)
    if (command === 'open') return await openFrame(args, io)
    if (command === 'preflight') return await runPreflight(io)
    throw new UsageError(`unknown command "${command}"`)
  } catch (error) {
    if (error instanceof UsageError) {
      io.stderr.write(`error: ${error.message}\n\n${HELP}`)
      return 2
    }
    io.stderr.write(`error: ${error instanceof Error ? error.message : String(error)}\n`)
    return 1
  }
}

function parseCheckDeps(args: readonly string[]) {
  try {
    return parseCheckDepsOptions(args)
  } catch (error) {
    throw new UsageError((error as Error).message)
  }
}

function parseKv(args: readonly string[]) {
  return parseKvOptions(args)
}

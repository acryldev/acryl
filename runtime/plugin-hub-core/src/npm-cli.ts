// npm through the user's own `npm` and its configuration (`.npmrc`: logins, scoped registries). Nothing here reads or stores a token; a missing
// npm or login is reported with what to do.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ToolError } from './github-cli.js'
import type { NpmPublishPort } from './npm-publish.js'
import type { RegistryPort } from './pull.js'

const shell = process.platform === 'win32'

function npm(args: readonly string[], cwd?: string): { readonly status: number; readonly stdout: string; readonly stderr: string } {
  // On Windows npm is a .cmd file, which Node runs only through a shell; the arguments here are ours, never user text.
  const result = spawnSync('npm', [...args], { cwd, encoding: 'utf8', shell, env: { ...process.env, npm_config_yes: 'true', npm_config_update_notifier: 'false' }, maxBuffer: 64 * 1024 * 1024 })
  if (result.error !== undefined) throw new ToolError('npm is not available here: install Node.js (https://nodejs.org), which includes npm, and sign in with: npm login')
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

function signInHint(registry: string | undefined): string {
  return `sign in with: npm login${registry === undefined ? '' : ` --registry ${registry}`}`
}

function failure(what: string, stderr: string, registry?: string): ToolError {
  const last = stderr.trim().split('\n').filter(line => !/^npm (notice|warn)/iu.test(line)).at(-1) ?? ''
  return new ToolError(`npm ${what} failed: ${last}${/E401|E403|ENEEDAUTH|need auth|unauthorized|login/iu.test(stderr) ? ` (${signInHint(registry)})` : ''}`)
}

export function npmCli(): NpmPublishPort {
  return {
    hasVersion(name, version, registry) {
      const result = npm(['view', `${name}@${version}`, 'version', '--registry', registry])
      if (result.status === 0) return result.stdout.trim() !== ''
      if (/E404|404 Not Found|is not in this registry/iu.test(result.stderr)) return false
      throw failure('view', result.stderr, registry)
    },
    publish(tarballPath, registry, access) {
      const result = npm(['publish', tarballPath, '--registry', registry, '--access', access, '--ignore-scripts'])
      if (result.status !== 0) throw failure('publish', result.stderr, registry)
    },
  }
}

/**
 * A registry read through the user's npm, for a private registry or scope an anonymous request cannot see: `npm view` for the version and
 * integrity, `npm pack` for the bytes. `registry` overrides the user's configuration; without it npm's own (scoped) configuration decides.
 */
export function npmRegistryViaCli(registry?: string): RegistryPort {
  const flags = registry === undefined ? [] : ['--registry', registry]
  return {
    async resolve(name, version) {
      const result = npm(['view', version === undefined ? name : `${name}@${version}`, 'version', 'dist.tarball', 'dist.integrity', '--json', ...flags])
      if (result.status !== 0) {
        if (/E404|is not in this registry/iu.test(result.stderr)) return undefined
        throw failure('view', result.stderr, registry)
      }
      const parsed = JSON.parse(result.stdout || 'null') as Record<string, unknown> | Record<string, unknown>[] | null
      const view = Array.isArray(parsed) ? parsed.at(-1) : parsed
      if (view === null || view === undefined || typeof view['version'] !== 'string' || typeof view['dist.tarball'] !== 'string') return undefined
      return { version: view['version'], tarball: `npm:${name}@${view['version']}`, ...(typeof view['dist.integrity'] === 'string' ? { integrity: view['dist.integrity'] } : {}) }
    },
    async download(spec) {
      const work = mkdtempSync(join(tmpdir(), 'plugin-hub-npm-pack-'))
      try {
        const result = npm(['pack', spec.replace(/^npm:/u, ''), '--pack-destination', work, '--ignore-scripts', ...flags], work)
        if (result.status !== 0) throw failure('pack', result.stderr, registry)
        const file = readdirSync(work).find(entry => entry.endsWith('.tgz'))
        if (file === undefined) throw new ToolError(`npm pack ${spec} wrote no tarball`)
        return new Uint8Array(readFileSync(join(work, file)))
      } finally {
        rmSync(work, { recursive: true, force: true })
      }
    },
  }
}

/** Resolve from the first registry port that knows the package (anonymous https, then the user's npm), and download through that one. */
export function firstRegistryPort(...ports: readonly RegistryPort[]): RegistryPort {
  const answered = new Map<string, RegistryPort>()
  return {
    async resolve(name, version) {
      let lastError: unknown
      for (const port of ports) {
        try {
          const found = await port.resolve(name, version)
          if (found !== undefined) { answered.set(found.tarball, port); return found }
        } catch (cause) { lastError = cause }
      }
      if (lastError !== undefined) throw lastError
      return undefined
    },
    download: async url => (answered.get(url) ?? ports[0]!).download(url),
  }
}

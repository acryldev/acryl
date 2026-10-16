// Which spec DSH's installer gets inside ACRYL (spec 044 D7 option B): a git address becomes that GitHub repository's latest release, pulled into
// the plugin store and checked first; anything else is handed on unchanged. Kept apart from manager.js so it is testable without DSH.
const SCP = /^git@([^:]+):([^/]+)\/([^/#]+?)(?:\.git)?(#.*)?$/u
const SHORTHAND = /^(github|gitlab|bitbucket|gist):([^/]+)\/([^/#]+?)(?:\.git)?(#.*)?$/iu
const URL_FORM = /^(?:git\+)?(?:https?|git|ssh):\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/([^/]+)\/([^/#]+?)(?:\.git)?\/?(#.*)?$/iu
const SHORTHAND_HOSTS = { github: 'github.com', gitlab: 'gitlab.com', bitbucket: 'bitbucket.org', gist: 'gist.github.com' }

/**
 * The repository a git address names, the way pnpm reads DSH's box: `github:o/r`, `git@host:o/r.git`, `git+https://host/o/r.git`,
 * `https://host/o/r` (a repository address, not a .tgz). Undefined for a name, a folder or a tarball.
 */
export function gitAddress(spec) {
  const raw = String(spec ?? '').trim()
  if (/\.(?:tgz|tar\.gz)(?:#.*)?$/iu.test(raw)) return undefined
  const short = SHORTHAND.exec(raw)
  if (short !== null) return { host: SHORTHAND_HOSTS[short[1].toLowerCase()], owner: short[2], repo: short[3], ...(short[4] ? { ref: short[4].slice(1) } : {}) }
  const scp = SCP.exec(raw)
  if (scp !== null) return { host: scp[1].toLowerCase(), owner: scp[2], repo: scp[3], ...(scp[4] ? { ref: scp[4].slice(1) } : {}) }
  const url = URL_FORM.exec(raw)
  if (url !== null) return { host: url[1].toLowerCase(), owner: url[2], repo: url[3], ...(url[4] ? { ref: url[4].slice(1) } : {}) }
  return undefined
}

/**
 * What DSH's installer should get for a spec: the spec itself, or for a git address the stored release tarball; or why it is refused.
 * @returns `{ spec }` to hand on, or `{ refused: reason }`.
 */
export async function releaseSpec(spec, hub) {
  const address = gitAddress(spec)
  if (address === undefined) return { spec }
  if (address.host !== 'github.com') return { refused: `ACRYL installs released versions, and finds them on GitHub; ${address.host} is not supported yet. Pull its .tgz file or URL instead.` }
  if (address.ref !== undefined) return { refused: `#${address.ref} is a branch or commit, not a release. Leave it out for the latest release, or use github:${address.owner}/${address.repo}@<version> with /plugin pull.` }
  let pulled
  try { pulled = await hub.pull(`github:${address.owner}/${address.repo}`, { install: false }) } catch (cause) {
    return { refused: String(cause?.message ?? cause) }
  }
  if (pulled.status === 'missing-services') return { refused: `${pulled.name} ${pulled.version} needs ${pulled.missing.join(', ')}, which this app does not provide.` }
  return { spec: pulled.path, pulled }
}

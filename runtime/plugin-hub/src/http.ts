// The ports over plain HTTPS, for public sources: GitHub's release API and the npm registry. Private repositories and registries use the
// user's own tools (`gh`, the npm config) through other adapters; this one never sends a token.
import type { RegistryPort, ReleaseInfo, ReleasePort } from './pull.js'

export type Fetch = (url: string, init?: { readonly headers?: Record<string, string>; readonly signal?: AbortSignal }) => Promise<{ readonly ok: boolean; readonly status: number; json(): Promise<unknown>; arrayBuffer(): Promise<ArrayBuffer> }>

const MAX_DOWNLOAD_BYTES = 64 * 1024 * 1024
const TIMEOUT_MS = 30_000
const USER_AGENT = 'acryl-plugin-hub'

async function downloadBytes(fetchImpl: Fetch, url: string): Promise<Uint8Array> {
  if (!url.startsWith('https://')) throw new Error(`refusing a non-https download: ${url}`)
  const response = await fetchImpl(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/octet-stream' }, signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!response.ok) throw new Error(`${url} answered ${response.status}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.length > MAX_DOWNLOAD_BYTES) throw new Error(`${url} is larger than ${MAX_DOWNLOAD_BYTES} bytes`)
  return bytes
}

/** GitHub releases of public repositories, through api.github.com. */
export function githubReleasesOverHttps(fetchImpl: Fetch = fetch as unknown as Fetch, api = 'https://api.github.com'): ReleasePort {
  return {
    async release(owner, repo, tag) {
      const path = tag === undefined ? 'releases/latest' : `releases/tags/${encodeURIComponent(tag)}`
      const response = await fetchImpl(`${api}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${path}`, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(TIMEOUT_MS) })
      if (response.status === 404) return undefined
      if (!response.ok) throw new Error(`GitHub answered ${response.status} for ${owner}/${repo}`)
      const body = await response.json() as { tag_name?: unknown; assets?: unknown }
      if (typeof body.tag_name !== 'string' || !Array.isArray(body.assets)) throw new Error(`GitHub returned an unexpected release for ${owner}/${repo}`)
      const assets = body.assets.flatMap((asset: { name?: unknown; browser_download_url?: unknown }) =>
        typeof asset.name === 'string' && typeof asset.browser_download_url === 'string' ? [{ name: asset.name, url: asset.browser_download_url }] : [])
      return { tag: body.tag_name, assets } satisfies ReleaseInfo
    },
    download: url => downloadBytes(fetchImpl, url),
  }
}

/** The public npm registry (or another registry URL). */
export function npmRegistryOverHttps(fetchImpl: Fetch = fetch as unknown as Fetch, registry = 'https://registry.npmjs.org'): RegistryPort {
  return {
    async resolve(name, version) {
      const response = await fetchImpl(`${registry.replace(/\/$/u, '')}/${name.replace('/', '%2F')}`, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) })
      if (response.status === 404) return undefined
      if (!response.ok) throw new Error(`the registry answered ${response.status} for ${name}`)
      const body = await response.json() as { 'dist-tags'?: Record<string, string>; versions?: Record<string, { dist?: { tarball?: string; integrity?: string } }> }
      const chosen = version ?? body['dist-tags']?.['latest']
      const dist = chosen === undefined ? undefined : body.versions?.[chosen]?.dist
      if (chosen === undefined || typeof dist?.tarball !== 'string') return undefined
      return { version: chosen, tarball: dist.tarball, ...(typeof dist.integrity === 'string' ? { integrity: dist.integrity } : {}) }
    },
    download: url => downloadBytes(fetchImpl, url),
  }
}

/** A plain https download, for a tarball-URL source. */
export function httpsDownload(fetchImpl: Fetch = fetch as unknown as Fetch): (url: string) => Promise<Uint8Array> {
  return url => downloadBytes(fetchImpl, url)
}

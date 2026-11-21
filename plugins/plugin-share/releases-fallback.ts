/**
 * Where a `github:` pull reads releases: GitHub's public API with no login (a public plugin needs none) and, when GitHub refuses that anonymous request
 * for its limit (60 an hour for everyone behind one address: a workshop room, an office), the person's own `gh` login, which has a limit of its own.
 * A person without `gh` gets the first answer, GitHub's own.
 */
import {
  githubReleasesOverHttps,
  githubReleasesViaGh,
  type ReleasePort,
} from '@acryldev/plugin-hub-core'

/** What the anonymous port says when GitHub limits or refuses it. */
export const LIMITED = /GitHub answered (?:403|429)/u

export function releasesWithLoginFallback(
  anonymous: ReleasePort = githubReleasesOverHttps(),
  signedIn: () => ReleasePort = githubReleasesViaGh,
): ReleasePort {
  const viaLogin = new Set<string>()
  return {
    async release(owner, repo, tag) {
      try {
        return await anonymous.release(owner, repo, tag)
      } catch (cause) {
        if (!LIMITED.test(cause instanceof Error ? cause.message : String(cause))) throw cause
        try {
          const found = await signedIn().release(owner, repo, tag)
          for (const asset of found?.assets ?? []) viaLogin.add(asset.url)
          return found
        } catch {
          throw cause
        }
      }
    },
    download: (url) => (viaLogin.has(url) ? signedIn().download(url) : anonymous.download(url)),
  }
}

/**
 * The address after the launch token is spent. The token admits the page once (exchanged for the browser's cookie
 * before the client runs); left in the address bar it stays in history and can admit the page again after the cookie
 * is gone. Only the token is dropped: the path, every other query field and the hash are what the person sees.
 */

/** @returns the address to replace the current one with, or undefined when there is no token to remove. */
export function stripLaunchToken(href: string): string | undefined {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return undefined
  }
  if (!url.searchParams.has('token')) return undefined
  url.searchParams.delete('token')
  return `${url.pathname}${url.search}${url.hash}`
}

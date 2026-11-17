/**
 * Where a host serves the app's pages under a prefix (the ACRYL frame's canvas, `/app`): the meta the door puts on each page, and where an app path
 * lands under that prefix. Empty at the root, which is the app's own server.
 */

/**
 * The one thing this file needs from a page's document. Spelled without DOM types so the Host imports `underAppBase` from here too, instead of keeping
 * a second copy of the join; a real Document satisfies it.
 */
interface MetaHost {
  querySelector(selectors: string): { getAttribute(name: string): string | null } | null
}

/** The app base a page carries (`<meta name="acryl-app-base">`, the host's prefix for the app); '' at the root. */
export function appBaseOf(document: MetaHost): string {
  const content = document.querySelector('meta[name="acryl-app-base"]')?.getAttribute('content')?.trim() ?? ''
  return content.startsWith('/') && content !== '/' ? content.replace(/\/+$/u, '') : ''
}

/**
 * `path` (an app path, optionally with a query) under `base`: '/board' under '/app' is '/app/board'; the app's root is the base itself, so '/' is
 * '/app' (its mount) and not '/app/'; without a base, the path as written.
 */
export function underAppBase(base: string, path: string): string {
  if (base === '') return path
  const at = path.search(/[?#]/u)
  const route = at === -1 ? path : path.slice(0, at)
  const rest = at === -1 ? '' : path.slice(at)
  if (route === base || route.startsWith(`${base}/`)) return path
  if (route === '/' || route === '') return `${base}${rest}`
  return `${base}${route.startsWith('/') ? '' : '/'}${route}${rest}`
}

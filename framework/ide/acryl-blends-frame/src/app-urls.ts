/**
 * An app's own URLs seen from the frame's root (development host only). The app's pages answer under the canvas prefix (`/app`), but a page written the
 * way the docs teach carries root-relative links, form actions, image sources and fetch paths. A request the frame's root did not answer, made from a
 * page under the prefix, belongs to the app: a navigation is sent back under the prefix (method and body kept), and a sub-resource is served there
 * without leaving it. Production serves the app at the root and has none of this.
 */

/** Whether `pathname` is the app base or below it. */
export function underAppBase(appBase: string, pathname: string): boolean {
  return pathname === appBase || pathname.startsWith(`${appBase}/`)
}

/** The path of a same-origin Referer header; undefined when it is missing or not an absolute URL. */
export function refererPath(referer: string | null): string | undefined {
  if (referer === null || referer === '') return undefined
  try {
    return new URL(referer).pathname
  } catch {
    return undefined
  }
}

/**
 * The same path and query under the app base. The app's root is the base itself (`/app`, where its rows mount `/`), so `/` maps to the base and not to
 * `/app/`, which the app's strict router answers with its 404 page.
 */
function appUrlUnderBase(appBase: string, url: URL): string {
  return `${url.pathname === '/' ? appBase : `${appBase}${url.pathname}`}${url.search}`
}

/** Whether the request was made from a page under the app base, for a path the base does not already hold. */
function fromAppPage(appBase: string, url: URL, headers: Headers): boolean {
  const referer = refererPath(headers.get('referer'))
  return referer !== undefined && underAppBase(appBase, referer) && !underAppBase(appBase, url.pathname)
}

/**
 * Where an app page's navigation that reached the frame's root goes: the same path and query under the app base. Only a browser navigation
 * (`Sec-Fetch-Mode: navigate`) from a page under the app base counts; the frame's own page load has no such referer.
 */
export function appNavigationTarget(appBase: string, url: URL, headers: Headers): string | undefined {
  if ((headers.get('sec-fetch-mode') ?? '').toLowerCase() !== 'navigate') return undefined
  return fromAppPage(appBase, url, headers) ? appUrlUnderBase(appBase, url) : undefined
}

/** Where a sub-resource, form response or fetch from an app page that reached the frame's root is served: the same path and query under the app base. */
export function appFallbackTarget(appBase: string, url: URL, headers: Headers): string | undefined {
  return fromAppPage(appBase, url, headers) ? appUrlUnderBase(appBase, url) : undefined
}

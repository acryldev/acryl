/** Small response utilities shared by the middleware. Not exported from the package. */

/**
 * Set headers on a response a handler already built. Responses made with `new Response` are mutable; ones from `fetch` or `Response.redirect` are
 * not, so on a failed write the response is rebuilt around the same body.
 */
export function setHeaders(response: Response, headers: Record<string, string>): Response {
  try {
    for (const [name, value] of Object.entries(headers)) response.headers.set(name, value)
    return response
  } catch {
    const merged = new Headers(response.headers)
    for (const [name, value] of Object.entries(headers)) merged.set(name, value)
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers: merged })
  }
}

export function appendVary(response: Response, value: string): Response {
  const current = response.headers.get('vary')
  const present = current?.split(',').map(part => part.trim().toLowerCase()) ?? []
  if (present.includes('*') || present.includes(value.toLowerCase())) return response
  return setHeaders(response, { vary: current === null || current === '' ? value : `${current}, ${value}` })
}

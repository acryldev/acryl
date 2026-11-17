/**
 * The sentence the first screen carries. The desktop door's frame probe imports this same value, so the page's text and the probe's expectation can never
 * drift apart again (the probe outlived the JSON root it was written for by one template change).
 */
export const FIRST_PAGE_MARKER = 'This is the page the ACRYL frame opens first'

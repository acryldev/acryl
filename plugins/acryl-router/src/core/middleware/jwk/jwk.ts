/**
 * @module
 * JWK Auth Middleware for App.
 */

import type { Context } from '../../context.ts'
import { getCookie, getSignedCookie } from '../../helper/cookie/index.ts'
import { HTTPException } from '../../http-exception.ts'
import type { MiddlewareHandler } from '../../types.ts'
import type { CookiePrefixOptions } from '../../utils/cookie.ts'
import { Jwt } from '../../utils/jwt/index.ts'
import '../../context.ts'
import type { AsymmetricAlgorithm } from '../../utils/jwt/jwa.ts'
import type { AppJsonWebKey } from '../../utils/jwt/jws.ts'
import type { VerifyOptions } from '../../utils/jwt/jwt.ts'

/**
 * JWK Auth Middleware for App.
 *
 *
 * @param {object} options - The options for the JWK middleware.
 * @param {AppJsonWebKey[] | ((ctx: Context) => Promise<AppJsonWebKey[]> | AppJsonWebKey[])} [options.keys] - The public keys used for JWK verification, or a function that returns them.
 * @param {string | ((ctx: Context) => Promise<string> | string)} [options.jwks_uri] - If set to a URI string or a function that returns a URI string, attempt to fetch JWKs from it. The response must be a JSON object containing a `keys` array, which will be merged with the `keys` option.
 * @param {boolean} [options.allow_anon] - If set to `true`, the middleware allows requests without a token to proceed without authentication.
 * @param {string} [options.cookie] - If set, the middleware attempts to retrieve the token from a cookie with these options (optionally signed) only if no token is found in the header.
 * @param {string} [options.headerName='Authorization'] - The name of the header to look for the JWT token. Default is 'Authorization'.
 * @param {string} [options.realm] - The protection space described by the `realm` parameter of the returned `WWW-Authenticate` challenge header. Defaults to the request URL.
 * @param {AsymmetricAlgorithm[]} options.alg - An array of allowed asymmetric algorithms for JWT verification. Only tokens signed with these algorithms will be accepted.
 * @param {RequestInit} [init] - Optional init options for the `fetch` request when retrieving JWKS from a URI.
 * @param {VerifyOptions} [options.verification] - Additional options for JWK payload verification.
 * @returns {MiddlewareHandler} The middleware handler function.
 *
 * @example
 * ```ts
 * const app = new App()
 *
 * app.use("/auth/*", jwk({
 *   jwks_uri: (c) => `https://${c.env.authServer}/.well-known/jwks.json`,
 *   headerName: 'x-custom-auth-header', // Optional, default is 'Authorization'
 * }))
 *
 * app.get('/auth/page', (c) => {
 *   return c.text('You are authorized')
 * })
 * ```
 */

export const jwk = (
  options: {
    keys?: AppJsonWebKey[] | ((ctx: Context) => Promise<AppJsonWebKey[]> | AppJsonWebKey[])
    jwks_uri?: string | ((ctx: Context) => Promise<string> | string)
    allow_anon?: boolean
    cookie?:
      | string
      | { key: string; secret?: string | BufferSource; prefixOptions?: CookiePrefixOptions }

    headerName?: string

    alg: AsymmetricAlgorithm[]

    realm?: string

    verification?: VerifyOptions
  },
  init?: RequestInit
): MiddlewareHandler => {
  const verifyOpts = options.verification || {}

  if (!options || !(options.keys || options.jwks_uri)) {
    throw new Error('JWK auth middleware requires options for either "keys" or "jwks_uri" or both')
  }

  if (!crypto.subtle || !crypto.subtle.importKey) {
    throw new Error('`crypto.subtle.importKey` is undefined. JWK auth middleware requires it.')
  }

  return async function jwk(ctx, next) {
    const headerName = options.headerName || 'Authorization'

    const credentials = ctx.req.raw.headers.get(headerName)
    let token
    if (credentials) {
      const parts = credentials.split(/\s+/)
      if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
        const errDescription = 'invalid credentials structure'
        throw new HTTPException(401, {
          message: errDescription,
          res: unauthorizedResponse({
            ctx,
            error: 'invalid_request',
            errDescription,
            realm: options.realm,
          }),
        })
      } else {
        token = parts[1]
      }
    } else if (options.cookie) {
      if (typeof options.cookie == 'string') {
        token = getCookie(ctx, options.cookie)
      } else if (options.cookie.secret) {
        if (options.cookie.prefixOptions) {
          token = await getSignedCookie(
            ctx,
            options.cookie.secret,
            options.cookie.key,
            options.cookie.prefixOptions
          )
        } else {
          token = await getSignedCookie(ctx, options.cookie.secret, options.cookie.key)
        }
      } else {
        if (options.cookie.prefixOptions) {
          token = getCookie(ctx, options.cookie.key, options.cookie.prefixOptions)
        } else {
          token = getCookie(ctx, options.cookie.key)
        }
      }
    }

    if (!token) {
      if (options.allow_anon) {
        return next()
      }
      const errDescription = 'no authorization included in request'
      throw new HTTPException(401, {
        message: errDescription,
        res: unauthorizedResponse({
          ctx,
          error: 'invalid_request',
          errDescription,
          realm: options.realm,
        }),
      })
    }

    let payload
    let cause
    try {
      const keys = typeof options.keys === 'function' ? await options.keys(ctx) : options.keys
      const jwks_uri =
        typeof options.jwks_uri === 'function' ? await options.jwks_uri(ctx) : options.jwks_uri
      payload = await Jwt.verifyWithJwks(
        token,
        { keys, jwks_uri, verification: verifyOpts, allowedAlgorithms: options.alg },
        init
      )
    } catch (e) {
      cause = e
    }

    if (!payload) {
      if (cause instanceof Error && cause.constructor === Error) {
        throw cause
      }
      throw new HTTPException(401, {
        message: 'Unauthorized',
        res: unauthorizedResponse({
          ctx,
          error: 'invalid_token',
          statusText: 'Unauthorized',
          errDescription: 'token verification failure',
          realm: options.realm,
        }),
        cause,
      })
    }

    ctx.set('jwtPayload', payload)

    await next()
  }
}

function unauthorizedResponse(opts: {
  ctx: Context
  error: string
  errDescription: string
  statusText?: string
  realm?: string
}) {
  // `realm` and `error_description` end up inside a quoted-string, so any `"`
  // they contain has to be escaped or the header is cut short. Same handling as
  // the bearer-auth middleware.
  const realm = (opts.realm ?? opts.ctx.req.url).replace(/"/g, '\\"')
  const errDescription = opts.errDescription.replace(/"/g, '\\"')

  return new Response('Unauthorized', {
    status: 401,
    statusText: opts.statusText,
    headers: {
      'WWW-Authenticate': `Bearer realm="${realm}",error="${opts.error}",error_description="${errDescription}"`,
    },
  })
}

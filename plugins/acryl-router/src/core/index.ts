/**
 * @module
 *
 * App - Web Framework built on Web Standards
 *
 * @example
 * ```ts
 * import { App } from 'acryl-router'
 * const app = new App()
 *
 * app.get('/', (c) => c.text('App!'))
 *
 * export default app
 * ```
 */

import { App } from './app.ts'

/**
 * Types for environment variables, error handlers, handlers, middleware handlers, and more.
 */
export type {
  Env,
  ErrorHandler,
  Handler,
  MiddlewareHandler,
  Next,
  NotFoundResponse,
  NotFoundHandler,
  ValidationTargets,
  Input,
  Schema,
  ToSchema,
  TypedResponse,
} from './types.ts'
/**
 * Types for context, context variable map, context renderer, and execution context.
 */
export { Context } from './context.ts'
export type { ContextVariableMap, ContextRenderer, ExecutionContext } from './context.ts'
/**
 * Type for AppRequest.
 */
export type { AppRequest } from './request.ts'
/**
 * Types for inferring request and response types and client request options.
 */
export type { InferRequestType, InferResponseType, ClientRequestOptions } from './client/index.ts'

/**
 * App framework for building web applications.
 */
export { App }

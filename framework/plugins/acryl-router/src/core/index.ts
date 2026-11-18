/**
 * @module
 *
 * Acryl - Web Framework built on Web Standards
 *
 * @example
 * ```ts
 * import { Acryl } from 'acrylblends'
 * const app = new Acryl()
 *
 * app.get('/', (c) => c.text('Acryl!'))
 *
 * export default app
 * ```
 */

import { Acryl } from './app.ts'

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
 * Type for AcrylRequest.
 */
export type { AcrylRequest } from './request.ts'
/**
 * Types for inferring request and response types and client request options.
 */
export type { InferRequestType, InferResponseType, ClientRequestOptions } from './client/index.ts'

/**
 * Acryl framework for building web applications.
 */
export { Acryl }

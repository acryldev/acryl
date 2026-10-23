/**
 * @module
 * The HTTP Client for App.
 */

export { hc } from './client.ts'
export { parseResponse, DetailedError } from './utils.ts'
export type {
  InferResponseType,
  InferRequestType,
  Fetch,
  ClientRequestOptions,
  ClientRequest,
  ClientResponse,
  ApplyGlobalResponse,
  PickResponseByStatusCode,
} from './types.ts'

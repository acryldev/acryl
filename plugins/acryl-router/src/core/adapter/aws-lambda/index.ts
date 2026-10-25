/**
 * @module
 * AWS Lambda Adapter for Acryl.
 */

export { handle, streamHandle, defaultIsContentTypeBinary } from './handler.ts'
export { getConnInfo } from './conninfo.ts'
export type { APIGatewayProxyResult, LambdaEvent } from './handler.ts'
export type {
  ApiGatewayRequestContext,
  ApiGatewayRequestContextV2,
  ALBRequestContext,
  LambdaContext,
} from './types.ts'

import type { RequestIdVariables } from './request-id.ts'
export type { RequestIdVariables }
export { requestId } from './request-id.ts'

declare module '../../context.ts' {
  interface ContextVariableMap extends RequestIdVariables {}
}

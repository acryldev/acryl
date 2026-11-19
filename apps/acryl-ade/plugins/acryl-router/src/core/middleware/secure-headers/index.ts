export type { ContentSecurityPolicyOptionHandler } from './secure-headers.ts'
export { NONCE, secureHeaders } from './secure-headers.ts'
import type { SecureHeadersVariables } from './secure-headers.ts'
export type { SecureHeadersVariables }

declare module '../../context.ts' {
  interface ContextVariableMap extends SecureHeadersVariables {}
}

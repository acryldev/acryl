import type { JwtVariables } from './jwt.ts'
export type { JwtVariables }
export { jwt, verifyWithJwks, verify, decode, sign } from './jwt.ts'
export { AlgorithmTypes } from '../../utils/jwt/jwa.ts'
import type {} from '../../index.ts'

declare module '../../context.ts' {
  interface ContextVariableMap extends JwtVariables<unknown> {}
}

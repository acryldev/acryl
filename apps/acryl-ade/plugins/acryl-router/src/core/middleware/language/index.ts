import type { LanguageVariables, DetectorOptions, DetectorType, CacheType } from './language.ts'
export type { LanguageVariables, DetectorOptions, DetectorType, CacheType }
export {
  languageDetector,
  detectFromCookie,
  detectFromHeader,
  detectFromPath,
  detectFromQuery,
} from './language.ts'
declare module '../../context.ts' {
  interface ContextVariableMap extends LanguageVariables {}
}

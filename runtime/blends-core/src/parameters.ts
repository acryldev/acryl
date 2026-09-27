// Parameter-token handling (D11). The token grammar and the config walk live
// here in exactly one place: validation detects references, resolution
// substitutes values, and both must agree on where tokens are recognized.
import { joinField, joinIndex } from './diagnostics.js'

export const PARAMETER_TOKEN = /\{\{parameters\.([A-Za-z0-9_-]+)\}\}/g

const WHOLE_TOKEN = /^\{\{parameters\.([A-Za-z0-9_-]+)\}\}$/

export type ParameterValues = Record<string, string | number | boolean>

// Depth-first walk over a row config value, visiting every string with its
// document path. Tokens are recognized in config string values only (D11),
// nested maps and arrays included; `!!js` markers are objects and pass
// through untouched.
export function walkConfigStrings(
  config: Record<string, unknown>,
  basePath: string,
  visit: (value: string, path: string) => void,
): void {
  const walk = (value: unknown, path: string): void => {
    if (typeof value === 'string') {
      visit(value, path)
      return
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, joinIndex(path, index)))
      return
    }
    if (value !== null && typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) walk(item, joinField(path, key))
    }
  }
  for (const [key, value] of Object.entries(config)) walk(value, joinField(basePath, key))
}

// Returns config with every parameter token replaced. A scalar that is
// exactly one token becomes the parameter's typed value; tokens embedded in
// longer strings render as strings (D11). Unknown names cannot occur after
// validation, but leaving the token text beats inventing a value.
export function substituteConfig(
  config: Record<string, unknown>,
  values: ParameterValues,
): Record<string, unknown> {
  const next: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(config)) next[key] = substituteValue(value, values)
  return next
}

function substituteValue(value: unknown, values: ParameterValues): unknown {
  if (typeof value === 'string') return substituteString(value, values)
  if (Array.isArray(value)) return value.map((item) => substituteValue(item, values))
  if (value !== null && typeof value === 'object') {
    return substituteConfig(value as Record<string, unknown>, values)
  }
  return value
}

function substituteString(text: string, values: ParameterValues): unknown {
  const whole = WHOLE_TOKEN.exec(text)
  if (whole !== null) {
    const name = whole[1] ?? ''
    return Object.hasOwn(values, name) ? values[name] : text
  }
  return text.replace(PARAMETER_TOKEN, (token, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : token,
  )
}

import type { TimingVariables } from './timing.ts'

export type { TimingVariables }
export { timing, setMetric, startTime, endTime, wrapTime } from './timing.ts'

declare module '../../context.ts' {
  interface ContextVariableMap extends TimingVariables {}
}

/**
 * Which driver pick a finished terminal open may apply to. `choose()` can be in flight when the person picks
 * another driver (the panel also restores a remembered terminal at start), and only the latest pick may win: a
 * stale terminal must not replace the form the person chose.
 */
export interface PickGeneration {
  /** Start a pick and return the token its result is settled with. */
  begin(): number
  /** True only while `generation` is still the latest pick. */
  isCurrent(generation: number): boolean
}

export function createPickGeneration(): PickGeneration {
  let generation = 0
  return {
    begin: () => {
      generation += 1
      return generation
    },
    isCurrent: (candidate) => candidate === generation,
  }
}

// One walk through one journey. A face asks for the current state, draws it, and hands back what the person chose or typed; the session checks
// it, moves on, and ends in `ready` with the command to run. The states are a small closed set (Clean Code, the view-state rule of this repo):
//
//   { kind: 'step', step, index, total, options?, initial?, error?, empty? }   a question; `options` for a choice, `initial` for a text
//   { kind: 'ready', command, line }                                         every answer given: what will run, and the line that does the same
//
// The session never runs anything: running belongs to the place that owns processes (the `acryl` selector in a terminal).
import { commandLine, journey } from './journeys.js'

/**
 * @param {string} journeyId one of JOURNEYS
 * @param {{ exists(path: string): boolean, listApps(): Promise<object[]> | object[], listBlends(): Promise<object[]> | object[],
 *           listPlugins(app: string): Promise<object[]> | object[] }} context where the lists come from (node-context.js, or a fake)
 */
export function createSession(journeyId, context) {
  const { steps, command, title } = journey(journeyId)
  const answers = {}
  let state

  async function enter(index, error) {
    if (index >= steps.length) {
      const next = command({ ...answers })
      state = Object.freeze({ kind: 'ready', title, command: next, line: commandLine(next) })
      return state
    }
    const step = steps[index]
    const base = { kind: 'step', title, step, index, total: steps.length, ...(error ? { error } : {}) }
    if (step.kind === 'choose') {
      const options = await step.options(context, { ...answers })
      state = Object.freeze({ ...base, options, ...(options.length === 0 ? { empty: step.empty ?? 'Nothing to choose from.' } : {}) })
    } else {
      const initial = answers[step.id] ?? step.initial?.({ ...answers }) ?? ''
      state = Object.freeze({ ...base, initial })
    }
    return state
  }

  return {
    id: journeyId,
    get state() { return state },
    get answers() { return Object.freeze({ ...answers }) },
    /** The first state. */
    begin: () => enter(0),
    /** Answer the current step: a choice's `value`, or a text. A wrong answer stays on the step with `error` set. */
    async answer(value) {
      if (state?.kind !== 'step') throw new Error('acryl-launcher: answer() needs a step to answer')
      const { step, index } = state
      if (step.kind === 'choose' && !state.options.some(option => option.value === value)) return enter(index, 'Choose one of the list.')
      const given = step.kind === 'text' ? String(value).trim() : value
      const problem = step.check?.(given, context, { ...answers })
      if (problem) return enter(index, problem)
      answers[step.id] = given
      return enter(index + 1)
    },
    /** One step back; undefined when already at the first step (the face goes back to the list of journeys). */
    async back() {
      const index = state?.kind === 'ready' ? steps.length - 1 : (state?.index ?? 0) - 1
      if (index < 0) return undefined
      return enter(index)
    },
  }
}

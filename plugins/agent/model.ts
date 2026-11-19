import type { Context } from '@deepseek-ai/cordis'

/** One model step: final text, or a tool to call with its input. `reasoning` is a thinking model's reasoning for the call; it must be given back on the next step, so the run keeps it. */
export type Step =
  | { readonly text: string; readonly tool?: undefined }
  | { readonly tool: string; readonly input: unknown; readonly reasoning?: string }

/** What a model sees at each step of a run. */
export interface ModelInput {
  readonly question: string
  /** 0 for the first step of a run. */
  readonly step: number
  /** The previous tool's result, if the previous step called one. */
  readonly toolResult?: unknown
  /** Every tool call of this run so far, in order: a real model rebuilds the conversation from it. */
  readonly trace?: ReadonlyArray<{
    readonly tool: string
    readonly input: unknown
    readonly result?: unknown
    readonly error?: string
    readonly reasoning?: string
  }>
  /** The tools the model may call. */
  readonly tools?: ReadonlyArray<{
    readonly name: string
    readonly description: string
    /** The JSON Schema of the tool's input, when it has one. */
    readonly parameters?: Readonly<Record<string, unknown>>
  }>
  /** Aborts when the run is cancelled: a provider that can stop its request passes this on. */
  readonly signal?: AbortSignal
}

/** What the agent needs from a model. Replace this plugin with a real provider when you have one. */
export interface Model {
  complete(input: ModelInput): Promise<Step>
}

/** A rule of the scripted model: a step for the input, or `undefined` when it does not apply. */
export type Rule = (input: ModelInput) => Step | undefined

/** The deterministic model. Other plugins teach it rules for their commands, so whole flows are tested without a network. */
export interface ScriptedModel extends Model {
  /** Add a rule, tried before the built-in ones. Returns the function that removes it. */
  teach(rule: Rule): () => void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    model: Model
  }
}

const builtIn: Rule[] = [
  ({ toolResult, step }) => {
    if (step === 0) return undefined
    // A failed call comes back as `{ error }`: say what failed, not "[object Object]".
    const failed = typeof toolResult === 'object' && toolResult !== null && 'error' in toolResult
    return {
      text: failed
        ? `That did not work: ${String(toolResult.error)}.`
        : `The answer is ${String(toolResult)}.`,
    }
  },
  ({ question }) => {
    const sum = /^add\s+(-?\d+)\s+(-?\d+)$/.exec(question.trim())
    return sum ? { tool: 'add', input: [Number(sum[1]), Number(sum[2])] } : undefined
  },
]

/** A deterministic model: no keys, no network, the same answer every time. */
export function model(ctx: Context) {
  const taught: Rule[] = []
  ctx.provide('model', {
    teach(rule) {
      taught.push(rule)
      return () => void taught.splice(taught.indexOf(rule), 1)
    },
    complete(input) {
      for (const rule of [...taught, ...builtIn]) {
        const step = rule(input)
        if (step) return Promise.resolve(step)
      }
      return Promise.resolve({ text: `You said: ${input.question}` })
    },
  } satisfies ScriptedModel)
}

/** The scripted model, when the app runs one (a real provider has no `teach`). */
export function scripted(model: Model | undefined): ScriptedModel | undefined {
  return model && typeof (model as Partial<ScriptedModel>).teach === 'function'
    ? (model as ScriptedModel)
    : undefined
}

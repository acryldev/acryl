/**
 * The door in the built-in chat: each verb registered in the app's `tools` registry (the one the chat's agent reads), as
 * `door_<verb>`. A tool answers the verb's text, what an agent reads in a terminal; a failed verb throws with its code, as the operator
 * client prints it.
 */

import { UiControlError } from '../page/protocol.ts'
import { DoorError, type Door, type DshToolsPort, type ToolsPort } from './door.ts'
import { chatToolName, VERB_SPECS, VERBS, type Verb } from './verbs.ts'

/** Register the verbs (default: every one). @returns the function that removes them all; it also aborts the calls still running. */
export function registerChatTools(tools: ToolsPort, door: Door, verbs: readonly Verb[] = VERBS): () => void {
  const running = new AbortController()
  const removers: Array<() => void> = []
  const removeAll = (): void => {
    running.abort()
    for (const remove of removers.splice(0).reverse()) remove()
  }
  try {
    for (const verb of verbs) {
      removers.push(tools.register(chatToolName(verb), {
        description: VERB_SPECS[verb].description,
        // The model is told which fields the verb takes (an `act` needs its `op`), the same schema MCP lists.
        parameters: VERB_SPECS[verb].arguments as unknown as Readonly<Record<string, unknown>>,
        // The run's own signal and page come with the call: its look and act go to the page the run was asked from.
        run: async (input: unknown, options?: { signal?: AbortSignal; page?: string }) => {
          const signal = options?.signal === undefined ? running.signal : AbortSignal.any([running.signal, options.signal])
          try {
            return (await door.run(verb, input ?? {}, signal, options?.page === undefined ? {} : { page: options.page })).text
          } catch (cause) {
            if (cause instanceof DoorError || cause instanceof UiControlError) throw new Error(`${cause.code}: ${cause.message}`, { cause })
            throw cause
          }
        },
      }))
    }
  } catch (cause) {
    // A name already taken: leave nothing half registered.
    removeAll()
    throw cause
  }
  return removeAll
}

/** Register the verbs in DSH's registry as `door_<verb>`, each answering the verb's text. @returns the function that removes them all. */
export function registerDshChatTools(tools: DshToolsPort, door: Door, verbs: readonly Verb[] = VERBS): () => void {
  const running = new AbortController()
  const removers: Array<() => void> = []
  const removeAll = (): void => {
    running.abort()
    for (const remove of removers.splice(0).reverse()) remove()
  }
  try {
    for (const verb of verbs) {
      removers.push(tools.register({
        name: chatToolName(verb),
        description: VERB_SPECS[verb].description,
        parameters: VERB_SPECS[verb].arguments as unknown as Readonly<Record<string, unknown>>,
        output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
        execute: async (args, exec) => {
          const signal = exec.signal === undefined ? running.signal : AbortSignal.any([running.signal, exec.signal])
          try {
            return (await door.run(verb, (args ?? {}) as Record<string, unknown>, signal)).text
          } catch (cause) {
            if (cause instanceof DoorError || cause instanceof UiControlError) throw new Error(`${cause.code}: ${cause.message}`, { cause })
            throw cause
          }
        },
      }))
    }
  } catch (cause) {
    removeAll()
    throw cause
  }
  return removeAll
}

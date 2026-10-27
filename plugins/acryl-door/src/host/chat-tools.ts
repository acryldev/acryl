/**
 * The door in the built-in chat: each verb registered in the app's `tools` registry (the one the chat's agent reads), as
 * `door_<verb>`. A tool answers the verb's text, what an agent reads in a terminal; a failed verb throws with its code, as the operator
 * client prints it.
 */

import { UiControlError } from '../page/protocol.ts'
import { DoorError, type Door, type ToolsPort } from './door.ts'
import { chatToolName, VERB_SPECS, VERBS } from './verbs.ts'

/** Register every verb. @returns the function that removes them all; it also aborts the calls still running. */
export function registerChatTools(tools: ToolsPort, door: Door): () => void {
  const running = new AbortController()
  const removers: Array<() => void> = []
  const removeAll = (): void => {
    running.abort()
    for (const remove of removers.splice(0).reverse()) remove()
  }
  try {
    for (const verb of VERBS) {
      removers.push(tools.register(chatToolName(verb), {
        description: VERB_SPECS[verb].description,
        run: async (input: unknown) => {
          try {
            return (await door.run(verb, input ?? {}, running.signal)).text
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

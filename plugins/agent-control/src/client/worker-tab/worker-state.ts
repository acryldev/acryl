/** What a worker tab saves with the workspace: which worker, where it works, and what was said. Plain data, never a secret. */

export interface WorkerMessage {
  readonly role: 'you' | 'agent' | 'note'
  readonly text: string
}

export interface WorkerTabState {
  readonly cwd: string
  readonly workerId: string | undefined
  readonly messages: readonly WorkerMessage[]
}

export const EMPTY_WORKER_STATE: WorkerTabState = Object.freeze({ cwd: '', workerId: undefined, messages: [] })

const MAX_MESSAGES = 200

/** Reads saved state; anything that does not look right is a fresh tab, not an error. */
export function parseWorkerState(saved: string | undefined): WorkerTabState {
  if (saved === undefined || saved === '') return EMPTY_WORKER_STATE
  try {
    const value: unknown = JSON.parse(saved)
    if (typeof value !== 'object' || value === null) return EMPTY_WORKER_STATE
    const record = value as Record<string, unknown>
    const messages = Array.isArray(record.messages)
      ? record.messages.flatMap((entry): WorkerMessage[] => {
          if (typeof entry !== 'object' || entry === null) return []
          const message = entry as Record<string, unknown>
          return (message.role === 'you' || message.role === 'agent' || message.role === 'note') && typeof message.text === 'string' ? [{ role: message.role, text: message.text }] : []
        })
      : []
    return {
      cwd: typeof record.cwd === 'string' ? record.cwd : '',
      workerId: typeof record.workerId === 'string' ? record.workerId : undefined,
      messages: messages.slice(-MAX_MESSAGES),
    }
  } catch {
    return EMPTY_WORKER_STATE
  }
}

export function serializeWorkerState(state: WorkerTabState): string {
  return JSON.stringify({ cwd: state.cwd, workerId: state.workerId, messages: state.messages.slice(-MAX_MESSAGES) })
}

export function folderName(cwd: string): string {
  return cwd.replace(/[\\/]+$/u, '').split(/[\\/]/u).pop() ?? cwd
}

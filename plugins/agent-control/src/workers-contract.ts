/**
 * The wire contract for agent workers: bring-your-own agents (Claude Code today) driven through the same Host as the page. One POST
 * endpoint, one closed set of operations, a typed answer. Shared by the Host route, the page and `acryl control worker`.
 */

export const WORKERS_PATH = '/api/acryl-agent-control/workers'

export const WORKER_PROVIDERS = ['claude'] as const
export type WorkerProvider = (typeof WORKER_PROVIDERS)[number]

export type WorkerRequest =
  | { readonly op: 'list' }
  | { readonly op: 'attach'; readonly provider: WorkerProvider; readonly cwd: string; readonly workerId?: string; readonly resume?: string }
  | { readonly op: 'send'; readonly workerId: string; readonly text: string }
  | { readonly op: 'cancel'; readonly workerId: string }
  | { readonly op: 'stop'; readonly workerId: string }

export type WorkerResponse =
  | { readonly ok: true; readonly result: unknown }
  | { readonly ok: false; readonly code: string; readonly message: string }

const WORKER_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u
const MAX_TEXT = 100_000

export class WorkerRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WorkerRequestError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function only(record: Record<string, unknown>, allowed: readonly string[]): void {
  const extra = Object.keys(record).find(key => key !== 'op' && !allowed.includes(key))
  if (extra !== undefined) throw new WorkerRequestError(`unknown field "${extra}"`)
}

function workerId(record: Record<string, unknown>): string {
  const id = record.workerId
  if (typeof id !== 'string' || !WORKER_ID.test(id)) throw new WorkerRequestError('workerId must be 1 to 64 letters, digits, dots, dashes or underscores')
  return id
}

/** @throws WorkerRequestError naming what is wrong; nothing is guessed or coerced. */
export function parseWorkerRequest(value: unknown): WorkerRequest {
  if (!isRecord(value) || typeof value.op !== 'string') throw new WorkerRequestError('the request must be an object with an op')
  switch (value.op) {
    case 'list':
      only(value, [])
      return { op: 'list' }
    case 'attach': {
      only(value, ['provider', 'cwd', 'workerId', 'resume'])
      if (!(WORKER_PROVIDERS as readonly unknown[]).includes(value.provider)) throw new WorkerRequestError(`provider must be one of ${WORKER_PROVIDERS.join(', ')}`)
      if (typeof value.cwd !== 'string' || value.cwd === '') throw new WorkerRequestError('cwd must be the absolute path of a folder')
      if (value.resume !== undefined && (typeof value.resume !== 'string' || value.resume === '')) throw new WorkerRequestError('resume must be a session id')
      return {
        op: 'attach',
        provider: value.provider as WorkerProvider,
        cwd: value.cwd,
        ...(value.workerId === undefined ? {} : { workerId: workerId(value) }),
        ...(value.resume === undefined ? {} : { resume: value.resume as string }),
      }
    }
    case 'send':
      only(value, ['workerId', 'text'])
      if (typeof value.text !== 'string' || value.text.trim() === '' || value.text.length > MAX_TEXT) throw new WorkerRequestError(`text must be 1 to ${String(MAX_TEXT)} characters`)
      return { op: 'send', workerId: workerId(value), text: value.text }
    case 'cancel':
    case 'stop':
      only(value, ['workerId'])
      return { op: value.op, workerId: workerId(value) }
    default:
      throw new WorkerRequestError(`unknown op "${value.op}"`)
  }
}

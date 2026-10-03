/**
 * `acryl control`: the terminal surface of the online channel (spec 041 TB31). No host boot here - this talks
 * to an already-running app instance over the channel TB30 wired into `acryl-agent-control`, the same way
 * `acryl doctor`/`acryl repair` work offline: reading files a real process already wrote, not starting one.
 *
 * @module acryl-cli/host/control-command
 */

import { UiControlError, type UiRequest, type UiResult, type WorkerRequest, type WorkerResponse } from 'acryl-agent-control'
import type { RunningApp } from 'acryl-harness-runtime'
import { callOnlineChannel, callWorkers, discoverInstances, pickInstance, OnlineChannelError } from './online-client.ts'
import type { AcrylControlInvocation } from '../cli/grammar.ts'

export type ControlCommandResult =
  | { readonly kind: 'list'; readonly instances: readonly RunningApp[] }
  | { readonly kind: 'result'; readonly app: string; readonly result: UiResult }
  | { readonly kind: 'refused'; readonly app: string; readonly code: string; readonly message: string }
  | { readonly kind: 'worker'; readonly app: string; readonly response: WorkerResponse }

/** Builds the {@link UiRequest} an `acryl control` invocation names; throws a plain, CLI-worded Error on a bad combination. */
export function buildRequest(invocation: AcrylControlInvocation): UiRequest {
  switch (invocation.action) {
    case 'list': throw new Error('list has no request; call runControlCommand directly')
    case 'worker': throw new Error('a worker operation has its own request; use buildWorkerRequest')
    case 'snapshot':
      return { op: 'snapshot', ...(invocation.cursor === undefined ? {} : { cursor: invocation.cursor }), ...(invocation.maxNodes === undefined ? {} : { maxNodes: invocation.maxNodes }) }
    case 'click':
      if (invocation.ref === undefined) throw new Error('acryl control click needs --ref')
      return { op: 'click', ref: invocation.ref }
    case 'type':
      if (invocation.ref === undefined) throw new Error('acryl control type needs --ref')
      if (invocation.text === undefined) throw new Error('acryl control type needs --text')
      return { op: 'type', ref: invocation.ref, text: invocation.text, ...(invocation.submit === undefined ? {} : { submit: invocation.submit }), ...(invocation.noClear === true ? { clear: false } : {}) }
    case 'select':
      if (invocation.ref === undefined) throw new Error('acryl control select needs --ref')
      if (invocation.option === undefined) throw new Error('acryl control select needs --option')
      return { op: 'select', ref: invocation.ref, option: invocation.option }
    case 'press':
      if (invocation.key === undefined) throw new Error('acryl control press needs --key')
      return { op: 'press', key: invocation.key, ...(invocation.ref === undefined ? {} : { ref: invocation.ref }) }
    case 'scroll':
      if (invocation.direction === undefined) throw new Error('acryl control scroll needs --direction')
      return { op: 'scroll', direction: invocation.direction, ...(invocation.ref === undefined ? {} : { ref: invocation.ref }), ...(invocation.amount === undefined ? {} : { amount: invocation.amount }) }
    case 'wait':
      return {
        op: 'wait',
        ...(invocation.text === undefined ? {} : { text: invocation.text }),
        ...(invocation.role === undefined ? {} : { role: invocation.role }),
        ...(invocation.name === undefined ? {} : { name: invocation.name }),
        ...(invocation.gone === undefined ? {} : { gone: invocation.gone }),
        ...(invocation.timeoutMs === undefined ? {} : { timeoutMs: invocation.timeoutMs }),
      }
  }
}

/** Builds the {@link WorkerRequest} an `acryl control worker <op>` invocation names; throws a plain, CLI-worded Error on a bad combination. */
export function buildWorkerRequest(invocation: AcrylControlInvocation): WorkerRequest {
  const need = (value: string | undefined, flag: string): string => {
    if (value === undefined) throw new Error(`acryl control worker ${String(invocation.workerOp)} needs ${flag}`)
    return value
  }
  switch (invocation.workerOp) {
    case 'list': return { op: 'list' }
    case 'attach': {
      if (invocation.provider !== undefined && invocation.provider !== 'claude') throw new Error('--provider must be claude (the only worker provider so far)')
      return { op: 'attach', provider: 'claude', cwd: need(invocation.cwd, '--cwd'), ...(invocation.worker === undefined ? {} : { workerId: invocation.worker }), ...(invocation.resume === undefined ? {} : { resume: invocation.resume }) }
    }
    case 'send': return { op: 'send', workerId: need(invocation.worker, '--worker'), text: need(invocation.text, '--text') }
    case 'cancel': return { op: 'cancel', workerId: need(invocation.worker, '--worker') }
    case 'stop': return { op: 'stop', workerId: need(invocation.worker, '--worker') }
    case undefined: throw new Error('acryl control worker needs an operation')
  }
}

export async function runControlCommand(invocation: AcrylControlInvocation, deps: { discover: typeof discoverInstances; call: typeof callOnlineChannel; callWorkers?: typeof callWorkers } = { discover: discoverInstances, call: callOnlineChannel, callWorkers }): Promise<ControlCommandResult> {
  if (invocation.action === 'list') return { kind: 'list', instances: deps.discover() }
  const instance = pickInstance(invocation.app, deps.discover())
  if (invocation.action === 'worker') {
    const response = await (deps.callWorkers ?? callWorkers)(instance, buildWorkerRequest(invocation))
    return { kind: 'worker', app: instance.id, response }
  }
  const request = buildRequest(invocation)
  try {
    const result = await deps.call(instance, request)
    return { kind: 'result', app: instance.id, result }
  } catch (cause) {
    if (cause instanceof UiControlError) return { kind: 'refused', app: instance.id, code: cause.code, message: cause.message }
    if (cause instanceof OnlineChannelError) throw cause
    throw cause
  }
}

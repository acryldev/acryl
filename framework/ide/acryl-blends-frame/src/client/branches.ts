/**
 * The left panel's branch calls to the Host - a new branch ("New"), and moving to an existing one - and what a click on a branch row means.
 * A switch never throws the person's work away: with unsaved files the panel asks first and offers a save point.
 */

import { FRAME_BRANCHES_NEW_PATH, FRAME_BRANCHES_SWITCH_PATH, type FrameBranch } from '../contract.ts'

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export interface BranchesApi {
  /** Rejects with the Host's reason (a taken name, a name git refuses). */
  create(name: string): Promise<void>
  /** Move the app's folder to an existing local branch. Rejects with the Host's reason (git's own line). */
  switchTo(name: string): Promise<void>
}

/** What a click on a branch row does. */
export type BranchClick = 'toggle' | 'switch' | 'ask'

/**
 * The current branch opens or closes what is running on it; another branch is switched to, and with unsaved files the person is asked first
 * (save a point, or cancel). Only a state that says zero unsaved files switches at once: a state that could not count them asks.
 */
export function branchClick(branch: FrameBranch, unsaved: number | undefined): BranchClick {
  if (branch.current) return 'toggle'
  return unsaved === 0 ? 'switch' : 'ask'
}

/** The version's subject when a switch saves the person's work first. */
export function saveBeforeSwitchMessage(name: string): string {
  return `Save before switching to ${name}`
}

export function createBranchesApi(fetcher: FetchLike = (input, init) => fetch(input, init)): BranchesApi {
  const post = async (path: string, name: string, failure: string): Promise<void> => {
    const response = await fetcher(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (response.ok) return
    const body = (await response.json().catch(() => ({}))) as { error?: unknown }
    throw new Error(typeof body.error === 'string' ? body.error : `${failure} (HTTP ${String(response.status)})`)
  }
  return {
    create: name => post(FRAME_BRANCHES_NEW_PATH, name, 'the branch could not be made'),
    switchTo: name => post(FRAME_BRANCHES_SWITCH_PATH, name, 'the branch could not be switched to'),
  }
}

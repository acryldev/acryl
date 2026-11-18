/** The composer attachment seam: a note's screenshot becomes a real DSH draft attachment. */

import { describe, expect, it, vi } from 'vitest'
import { attachDraft } from '../src/client/chat-draft.ts'

type FrameContext = Parameters<typeof attachDraft>[0]

function fakeContext(conversation: unknown): FrameContext {
  const scope = { get: (name: string) => name === 'conversation' ? conversation : undefined }
  return {
    get: (name: string) => name === 'sessions' ? { scope: () => scope } : undefined,
  } as unknown as FrameContext
}

describe('attachDraft', () => {
  it('registers one file through DSH intake and adds its id to the composer', () => {
    const file = new File(['x'], 'shot.webp', { type: 'image/webp' })
    const createDrafts = vi.fn(() => [{ id: 'draft-1' }])
    const addAttachments = vi.fn(() => true)
    const conversation = { createDrafts, input: { for: () => ({ addAttachments }) } }
    expect(attachDraft(fakeContext(conversation), 'session-1', file)).toBe(true)
    expect(createDrafts).toHaveBeenCalledWith('session-1', [file])
    expect(addAttachments).toHaveBeenCalledWith(['draft-1'])
  })

  it('answers false without an intake or a composer', () => {
    expect(attachDraft(fakeContext(undefined), 's', new File(['x'], 'a.webp', { type: 'image/webp' }))).toBe(false)
    expect(attachDraft(fakeContext({}), 's', new File(['x'], 'a.webp', { type: 'image/webp' }))).toBe(false)
  })
})

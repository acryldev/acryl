// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ModelConnect } from '../../src/client/models/ModelConnect.tsx'
import {
  DEFAULT_MODEL_KEY_REF,
  ModelConnectControl,
  type ModelCredentialsPort,
  type ModelLlmPort,
} from '../../src/client/models/model-connect.ts'

afterEach(() => { cleanup() })

function control(set = vi.fn<ModelCredentialsPort['set']>(async () => ({ ok: true }))): ModelConnectControl {
  return new ModelConnectControl({
    getCredentials: () => ({
      describe: vi.fn<ModelCredentialsPort['describe']>(async (refs) => ({
        ok: true,
        value: Object.fromEntries(refs.map(ref => [ref, { configured: false }])),
      })),
      set,
    }),
    getLlm: () => ({
      listProviders: vi.fn<ModelLlmPort['listProviders']>(async () => ({ ok: true, value: [{ id: 'deepseek-official', name: 'DeepSeek' }] })),
      listConfigurableProviders: vi.fn<ModelLlmPort['listConfigurableProviders']>(async () => ({ ok: true, value: [{ provider: 'deepseek-official' }] })),
    }),
  })
}

describe('ModelConnect', () => {
  it('takes a key and leaves once the Host stored it', async () => {
    const set = vi.fn<ModelCredentialsPort['set']>(async () => ({ ok: true }))
    const subject = control(set)
    await subject.refresh()
    render(<ModelConnect control={subject} />)
    const input = screen.getByLabelText('API key')
    fireEvent.change(input, { target: { value: 'sk-test-123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
    await waitFor(() => { expect(set).toHaveBeenCalledWith(DEFAULT_MODEL_KEY_REF, 'sk-test-123') })
    await waitFor(() => { expect(screen.queryByLabelText('API key')).toBeNull() })
  })

  it('renders nothing while the Host has a model, and can be dismissed', async () => {
    const configured = new ModelConnectControl({
      getCredentials: () => ({
        describe: vi.fn<ModelCredentialsPort['describe']>(async () => ({ ok: true, value: { [DEFAULT_MODEL_KEY_REF]: { configured: true } } })),
        set: vi.fn<ModelCredentialsPort['set']>(async () => ({ ok: true })),
      }),
      getLlm: () => ({
        listProviders: vi.fn<ModelLlmPort['listProviders']>(async () => ({ ok: true, value: [{ id: 'deepseek-official', name: 'DeepSeek' }] })),
        listConfigurableProviders: vi.fn<ModelLlmPort['listConfigurableProviders']>(async () => ({ ok: true, value: [] })),
      }),
    })
    await configured.refresh()
    render(<ModelConnect control={configured} />)
    expect(screen.queryByLabelText('API key')).toBeNull()

    const subject = control()
    await subject.refresh()
    render(<ModelConnect control={subject} />)
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
    await waitFor(() => { expect(screen.queryByLabelText('API key')).toBeNull() })
  })
})

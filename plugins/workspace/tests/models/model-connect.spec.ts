import { describe, expect, it, vi, type Mock } from 'vitest'
import {
  DEFAULT_MODEL_KEY_REF,
  MODEL_CONNECT_DISMISSED_KEY,
  ModelConnectControl,
  deriveModelKeyRef,
  type ModelCredentialsPort,
  type ModelLlmPort,
  type ModelSessionPort,
} from '../../src/client/models/model-connect.ts'

interface FakeCredentials {
  readonly state: { configured: boolean }
  describe: Mock<ModelCredentialsPort['describe']>
  set: Mock<ModelCredentialsPort['set']>
}

function credentials(configured = false): FakeCredentials {
  const state = { configured }
  return {
    state,
    describe: vi.fn<ModelCredentialsPort['describe']>(async (refs) => ({
      ok: true,
      value: Object.fromEntries(refs.map(ref => [ref, { configured: state.configured && ref === DEFAULT_MODEL_KEY_REF }])),
    })),
    set: vi.fn<ModelCredentialsPort['set']>(async () => ({ ok: true })),
  }
}

function llm(providers: { id: string; name: string }[] = [{ id: 'deepseek-official', name: 'DeepSeek' }]) {
  return {
    listProviders: vi.fn<ModelLlmPort['listProviders']>(async () => ({ ok: true, value: providers })),
    listConfigurableProviders: vi.fn<ModelLlmPort['listConfigurableProviders']>(async () => ({
      ok: true,
      value: [{ provider: 'deepseek-official' }, { provider: 'my-gateway' }],
    })),
  }
}

function session(groups: { id: string; models: unknown[] }[] = []) {
  return {
    modelCatalog: vi.fn<ModelSessionPort['modelCatalog']>(async () => ({ ok: true, value: { groups } })),
  }
}

function storage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
  }
}

function control(options: {
  credentials?: FakeCredentials
  llm?: ReturnType<typeof llm>
  session?: ReturnType<typeof session>
  store?: ReturnType<typeof storage>
  openSettings?: () => void
} = {}) {
  const credentialFace = options.credentials
  const llmFace = options.llm
  const sessionFace = options.session
  return new ModelConnectControl({
    getCredentials: () => credentialFace,
    getLlm: () => llmFace,
    getSession: () => sessionFace,
    storage: options.store,
    openSettings: options.openSettings,
  })
}

describe('ModelConnectControl', () => {
  it('asks for a key when no credential is configured, checking the official ref and every provider it could own', async () => {
    const face = credentials()
    const models = llm()
    const subject = control({ credentials: face, llm: models })
    await subject.refresh()
    expect(subject.getSnapshot()).toEqual({ status: 'needs-key', busy: false, error: null })
    expect(face.describe).toHaveBeenCalledWith([DEFAULT_MODEL_KEY_REF, 'DEEPSEEK_OFFICIAL_API_KEY', 'MY_GATEWAY_API_KEY'])
  })

  it('stays out of the way once the official credential is configured', async () => {
    const subject = control({ credentials: credentials(true), llm: llm() })
    await subject.refresh()
    expect(subject.getSnapshot()).toEqual({ status: 'ready' })
  })

  it('stays out of the way when the Models page account join says the signed-in account is usable', async () => {
    const face = credentials()
    const catalog = session([{ id: 'deepseek-account', models: [{ id: 'deepseek-v4' }] }])
    const subject = control({ credentials: face, llm: llm([{ id: 'deepseek-account', name: 'DeepSeek account' }]), session: catalog })
    await subject.refresh()
    expect(subject.getSnapshot()).toEqual({ status: 'ready' })
    expect(catalog.modelCatalog).toHaveBeenCalledTimes(1)
    expect(face.describe).not.toHaveBeenCalled()
  })

  it('still asks for a key when the account route is registered but its catalog group has no live model', async () => {
    const face = credentials()
    const subject = control({
      credentials: face,
      llm: llm([{ id: 'deepseek-account', name: 'DeepSeek account' }]),
      session: session([]),
    })
    await subject.refresh()
    expect(subject.getSnapshot()).toEqual({ status: 'needs-key', busy: false, error: null })
    expect(face.describe).toHaveBeenCalled()
  })

  it('is unavailable when the Host offers no credentials or model service', async () => {
    const subject = control({ llm: llm() })
    await subject.refresh()
    expect(subject.getSnapshot()).toEqual({ status: 'unavailable' })
  })

  it('is unavailable when the Host registers no provider, after retrying while it comes up', async () => {
    vi.useFakeTimers()
    try {
      const subject = control({ credentials: credentials(), llm: llm([]) })
      await subject.refresh()
      expect(subject.getSnapshot()).toEqual({ status: 'checking' })
      await vi.advanceTimersByTimeAsync(11_000)
      expect(subject.getSnapshot()).toEqual({ status: 'unavailable' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps retrying while the providers are still registering, then asks for a key', async () => {
    vi.useFakeTimers()
    try {
      const models = llm([])
      const subject = control({ credentials: credentials(), llm: models })
      await subject.refresh()
      expect(subject.getSnapshot()).toEqual({ status: 'checking' })
      models.listProviders.mockResolvedValue({ ok: true, value: [{ id: 'deepseek-official', name: 'DeepSeek' }] })
      await vi.advanceTimersByTimeAsync(600)
      expect(subject.getSnapshot()).toEqual({ status: 'needs-key', busy: false, error: null })
    } finally {
      vi.useRealTimers()
    }
  })

  it('stores the pasted key under the official reference, trimmed, and then leaves', async () => {
    const face = credentials()
    const subject = control({ credentials: face, llm: llm() })
    await subject.refresh()
    await subject.connect('  sk-test-123  ')
    expect(face.set).toHaveBeenCalledWith(DEFAULT_MODEL_KEY_REF, 'sk-test-123')
    expect(subject.getSnapshot()).toEqual({ status: 'ready' })
  })

  it('refuses an empty key without calling the Host', async () => {
    const face = credentials()
    const subject = control({ credentials: face, llm: llm() })
    await subject.refresh()
    await subject.connect('   ')
    expect(face.set).not.toHaveBeenCalled()
    expect(subject.getSnapshot()).toEqual({ status: 'needs-key', busy: false, error: 'Paste an API key first.' })
  })

  it("shows the Host's own refusal and keeps the field for a retry", async () => {
    const face = credentials()
    face.set.mockResolvedValueOnce({ ok: false, error: { message: 'credential store is read-only' } })
    const subject = control({ credentials: face, llm: llm() })
    await subject.refresh()
    await subject.connect('sk-test-123')
    expect(subject.getSnapshot()).toEqual({ status: 'needs-key', busy: false, error: 'credential store is read-only' })
  })

  it('Not now is remembered, so the step does not return on the next page', async () => {
    const store = storage()
    const subject = control({ credentials: credentials(), llm: llm(), store })
    await subject.refresh()
    subject.dismiss()
    expect(subject.getSnapshot()).toEqual({ status: 'dismissed' })
    expect(store.getItem(MODEL_CONNECT_DISMISSED_KEY)).toBe('1')
    const again = control({ credentials: credentials(), llm: llm(), store })
    await again.refresh()
    expect(again.getSnapshot()).toEqual({ status: 'dismissed' })
  })

  it('a refresh after the key is stored elsewhere hides the card', async () => {
    const face = credentials()
    const subject = control({ credentials: face, llm: llm() })
    await subject.refresh()
    expect(subject.getSnapshot().status).toBe('needs-key')
    face.state.configured = true
    await subject.refresh()
    expect(subject.getSnapshot()).toEqual({ status: 'ready' })
  })

  it('derives a credential reference the same way the Models page does', () => {
    expect(deriveModelKeyRef('deepseek-official')).toBe('DEEPSEEK_OFFICIAL_API_KEY')
    expect(deriveModelKeyRef('my gateway/v2')).toBe('MY_GATEWAY_V2_API_KEY')
  })
})

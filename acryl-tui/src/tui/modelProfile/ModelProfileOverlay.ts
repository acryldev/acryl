/**
 * `/model` overlay: provider list, add/edit form, and the form's nested
 * model-catalog editor, as one component. The three used to be three
 * separate Ink components (`ProviderList`/`ProviderForm`/`ModelListEditor`)
 * switched by conditional mounting, with the form's local field state reset
 * via a React `key={formKey}` remount trick. pi-tui has no nested-focus
 * delegation (only one `Component` is ever focused at a time) and no
 * remount-to-reset-state idiom, so this is one class instead: `showModels`
 * picks which of the three views is active, and `syncFormState` reinitializes
 * the form's local fields from the store's draft whenever `formKey` changes
 * — the direct equivalent of the old remount, just explicit.
 * @module @tomowang/dsh-tui/tui/modelProfile/ModelProfileOverlay
 */

import type { Component, TUI } from '@earendil-works/pi-tui'
import { Key, matchesKey, fuzzyFilter } from '@earendil-works/pi-tui'
import type { TuiActions } from '../actions.js'
import type { ModelProfileOverlayState, TuiStore } from '../store.js'
import { emptyMiniTextField, miniTextFieldInput, renderMiniTextField, type MiniTextFieldState } from '../miniTextField.js'
import { deriveApiKeyRef, type ModelEntry, type ProviderDraft } from './types.js'
import { theme, fg } from '../theme.js'

const bold = (s: string): string => `\x1b[1m${s}\x1b[0m`
const secondary = fg(theme.secondary)
const muted = fg(theme.muted)
const warning = fg(theme.warning)
const errorColor = fg(theme.error)
const invert = (s: string): string => `\x1b[7m${s}\x1b[0m`

type TextField = 'route' | 'displayName' | 'baseURL' | 'apiKey'

/**
 * The only wire protocols `dsh-llm-pi-ai` can speak (`supportedProtocols()`),
 * matching the DSH Desktop GUI's "Custom provider" dialog's own dropdown
 * exactly. Free-text protocol entry let a typo reach `assertServiceable` as a
 * runtime save failure instead of being impossible to enter in the first
 * place, so this is a cycling choice, never a typed field.
 */
const PROTOCOLS = ['openai-completions', 'openai-responses', 'anthropic-messages'] as const

/** One live (route, model) pair the fuzzy picker can offer. */
interface ModelPickerItem {
  readonly route: string
  readonly id: string
  readonly authMethod: 'oauth' | 'api-key' | undefined
}

export class ModelProfileOverlay implements Component {
  // --- top-level mode: the fuzzy all-models picker (pi.dev's `/model`, the
  // default) vs the provider add/edit/delete list, reachable with `p`. ---
  private mode: 'picker' | 'providers' = 'picker'
  private modelSearch: MiniTextFieldState = emptyMiniTextField()
  private modelPickerCursor = 0

  // --- provider list: selection lives in the store; only the delete-confirm arm is local ---
  private confirmDelete: number | undefined
  // Set by the list's `m` shortcut (edit models directly, skipping the API-key
  // screen) right before `editProvider` swaps in a fresh `formKey`; consumed
  // once by `syncFormState` on that same transition, since it otherwise always
  // resets `showModels` to false there.
  private pendingShowModels = false

  // --- form view: local until Save, reset whenever `formKey` changes ---
  private formKeySeen = -1
  private route: MiniTextFieldState = emptyMiniTextField()
  private displayName: MiniTextFieldState = emptyMiniTextField()
  private api: string = PROTOCOLS[0]
  private baseURL: MiniTextFieldState = emptyMiniTextField()
  private apiKeyDraft: MiniTextFieldState = emptyMiniTextField()
  private models: ModelEntry[] = []
  private showModels = false
  private focused = 0

  // --- nested model-list editor, valid while `showModels` ---
  private modelDraftId: MiniTextFieldState = emptyMiniTextField()
  private modelSelected = 0

  constructor(
    private readonly tui: TUI,
    private readonly store: TuiStore,
    private readonly actions: TuiActions,
  ) {}

  invalidate(): void {}

  /**
   * Rows available for a scrollable list body: terminal height minus the
   * lines every such screen spends on chrome (header/hint/notice/search —
   * `chrome` lines, caller-counted since it varies by screen). Long catalogs
   * (~35 providers, matching that many models) previously rendered every row
   * unconditionally, pushing the key-legend hint line — the only place a
   * shortcut is documented — past the bottom of the terminal, invisible
   * without scrolling back. Every list-shaped view here windows around the
   * current selection instead, so the hint line is always the last line
   * printed and always fits on screen.
   */
  private listWindow(chrome: number): number {
    return Math.max(3, this.tui.terminal.rows - chrome)
  }

  /** The `[start, end)` slice of `count` items to show so `selected` stays visible within `maxVisible` rows, biased to keep it centered. */
  private visibleRange(count: number, selected: number, maxVisible: number): { start: number; end: number } {
    if (count <= maxVisible) return { start: 0, end: count }
    const start = Math.max(0, Math.min(selected - Math.floor(maxVisible / 2), count - maxVisible))
    return { start, end: start + maxVisible }
  }

  /**
   * The global one-line notice (`store.setNotice`), rendered inline here.
   * `/model` runs as a full-screen overlay that paints over the whole
   * terminal, so the notice dock underneath — where "Saved X."/"Active model
   * set to X." otherwise lands — is invisible for as long as this overlay
   * stays open (e.g. right after `saveProvider` returns to the list view
   * without closing the overlay). Surfacing it here is what makes a save
   * actually visible as "done" instead of the screen looking unchanged.
   */
  private noticeLines(): string[] {
    const notice = this.store.getSnapshot().notice
    return notice === undefined ? [] : [muted(notice)]
  }

  private textFields(draft: ProviderDraft): TextField[] {
    return draft.isNew ? ['route', 'displayName', 'baseURL', 'apiKey'] : ['displayName', 'baseURL', 'apiKey']
  }

  /** Reinitialize form-local state from the store's draft when `formKey` changes — the equivalent of the old `key={formKey}` remount. */
  private syncFormState(mp: ModelProfileOverlayState): ProviderDraft | undefined {
    if (mp.view !== 'form' || mp.draft === undefined) return undefined
    const draft = mp.draft
    if (mp.formKey !== this.formKeySeen) {
      this.formKeySeen = mp.formKey
      this.route = emptyMiniTextField(draft.route)
      this.displayName = emptyMiniTextField(draft.displayName)
      this.api = PROTOCOLS.includes(draft.api as (typeof PROTOCOLS)[number]) ? draft.api : PROTOCOLS[0]
      this.baseURL = emptyMiniTextField(draft.baseURL)
      this.apiKeyDraft = emptyMiniTextField('')
      this.models = [...draft.models]
      this.showModels = this.pendingShowModels
      this.pendingShowModels = false
      this.focused = 0
      this.modelDraftId = emptyMiniTextField()
      this.modelSelected = 0
    }
    return draft
  }

  private buildDraft(draft: ProviderDraft): ProviderDraft {
    const route = draft.isNew ? this.route.value.trim() : draft.route
    return {
      ...draft,
      route,
      // A brand-new route doesn't exist at `createProvider()` time to compute
      // these from, so they're placeholders until now: `dsh-llm-pi-ai` stores
      // every route's profile at `providers.<route>` within one shared
      // namespace (see `createProvider()`'s own comment), and a route with no
      // stored `apiKeyEnv` falls back to this same derived name.
      ...draft.isNew ? { settingsPath: ['providers', route], apiKeyRef: deriveApiKeyRef(route) } : {},
      displayName: this.displayName.value,
      api: this.api,
      baseURL: this.baseURL.value,
      apiKeyDraft: this.apiKeyDraft.value,
      models: this.models,
    }
  }

  render(_width: number): string[] {
    const overlay = this.store.getSnapshot().overlay
    if (overlay.kind !== 'modelProfile') return []
    const mp = overlay.modelProfile
    const draft = this.syncFormState(mp)
    if (draft !== undefined) {
      if (this.showModels) return this.renderModelListEditor(mp)
      return draft.isNew ? this.renderForm(draft, mp) : this.renderApiKeyPrompt(draft, mp)
    }
    return this.mode === 'picker' ? this.renderModelPicker(mp) : this.renderList(mp)
  }

  private pickerItems(mp: ModelProfileOverlayState): readonly ModelPickerItem[] {
    const items: ModelPickerItem[] = []
    for (const row of mp.providers ?? []) {
      if (!row.live) continue
      for (const model of row.models) items.push({ route: row.route, id: model.id, authMethod: row.authMethod })
    }
    return items
  }

  private filteredPickerItems(mp: ModelProfileOverlayState): readonly ModelPickerItem[] {
    const items = this.pickerItems(mp)
    const query = this.modelSearch.value.trim()
    return query === '' ? items : fuzzyFilter([...items], query, item => `${item.id} ${item.route}`)
  }

  /**
   * pi.dev's `/model` picker (see Image #45): a flat, fuzzy-searchable list of
   * every model on a live (actually usable) route, not a per-provider drill-down.
   * Provider add/edit/delete moves to a secondary `p` mode instead of being the
   * default, since picking a model to make active is the far more common action.
   */
  private renderModelPicker(mp: ModelProfileOverlayState): string[] {
    const lines: string[] = [warning('Only showing models from configured providers. Use /login to add providers.')]
    lines.push(...this.noticeLines())
    if (mp.error !== undefined) lines.push(errorColor(mp.error))
    lines.push(`> ${renderMiniTextField(this.modelSearch, true)}`)
    if (mp.busy && mp.providers === undefined) lines.push(muted('Loading…'))
    const all = this.pickerItems(mp)
    const filtered = this.filteredPickerItems(mp)
    const chrome = lines.length + 2 // lines pushed so far, plus this list's own final hint line and the "N/total" indicator
    const maxVisible = this.listWindow(chrome)
    const { start, end } = this.visibleRange(filtered.length, this.modelPickerCursor, maxVisible)
    filtered.slice(start, end).forEach((item, offset) => {
      const index = start + offset
      const isSelected = index === this.modelPickerCursor
      const via = item.authMethod === 'oauth' ? ' oauth' : item.authMethod === 'api-key' ? ' api' : ''
      const text = `${isSelected ? '→ ' : '  '}${item.id} [${item.route}${via}]`
      lines.push(isSelected ? invert(text) : text)
    })
    if (filtered.length > maxVisible) lines.push(muted(`(${this.modelPickerCursor + 1}/${filtered.length})`))
    if (all.length === 0 && mp.providers !== undefined) lines.push(muted('No models available yet — use /login to sign in to a provider.'))
    else if (filtered.length === 0) lines.push(muted('No matching models.'))
    lines.push(muted('type to search · ↑↓ select · enter set active · ctrl+p manage providers · esc close'))
    return lines
  }

  private handleModelPickerInput(data: string, mp: ModelProfileOverlayState): void {
    if (matchesKey(data, Key.escape)) {
      this.actions.closeModelProfile()
      return
    }
    // A plain letter must never be a shortcut here — every letter is valid
    // search text (a model starting with "p", say), so this is a modifier
    // combo specifically because it can never collide with something typed.
    if (matchesKey(data, Key.ctrl('p'))) {
      this.mode = 'providers'
      return
    }
    const filtered = this.filteredPickerItems(mp)
    if (matchesKey(data, Key.up)) { this.modelPickerCursor = Math.max(0, this.modelPickerCursor - 1); return }
    if (matchesKey(data, Key.down)) { this.modelPickerCursor = Math.min(Math.max(0, filtered.length - 1), this.modelPickerCursor + 1); return }
    if (matchesKey(data, Key.enter)) {
      const item = filtered[this.modelPickerCursor]
      if (item !== undefined) {
        this.actions.setActiveModel(item.route, item.id)
        this.actions.closeModelProfile()
      }
      return
    }
    const next = miniTextFieldInput(this.modelSearch, data)
    if (next !== undefined) {
      this.modelSearch = next
      this.modelPickerCursor = 0
    }
  }

  private renderList(mp: ModelProfileOverlayState): string[] {
    const { providers, selected, busy, error } = mp
    const lines: string[] = [bold(secondary('Model providers'))]
    lines.push(...this.noticeLines())
    if (error !== undefined) lines.push(errorColor(error))
    if (busy && providers === undefined) lines.push(muted('Loading…'))
    const chrome = lines.length + 2 // lines pushed so far, plus this list's own final hint line and the "N/total" indicator
    const maxVisible = this.listWindow(chrome)
    const { start, end } = this.visibleRange(providers?.length ?? 0, selected, maxVisible)
    providers?.slice(start, end).forEach((row, offset) => {
      const index = start + offset
      const marker = row.configured ? '● ' : '○ '
      const active = row.live ? ' (active)' : ''
      const noKey = row.apiKeyConfigured
        ? ` [${row.authMethod === 'oauth' ? 'oauth' : 'api key'}]`
        : ' [no api key]'
      const confirm = this.confirmDelete === index ? ' — press d again to delete' : ''
      const text = `${index === selected ? '› ' : '  '}${marker}${row.displayName}${active}${noKey}${confirm}`
      lines.push(index === selected ? invert(text) : text)
    })
    if ((providers?.length ?? 0) > maxVisible) lines.push(muted(`(${selected + 1}/${providers?.length ?? 0})`))
    if (providers?.length === 0) lines.push(muted('No providers configured yet — press a to add one.'))
    lines.push(muted('↑↓ select · enter edit · a add · d delete · m edit models · s set active model · esc back'))
    return lines
  }

  private handleListInput(data: string, mp: ModelProfileOverlayState): void {
    const { providers, selected } = mp
    if (matchesKey(data, Key.escape)) {
      this.mode = 'picker'
      return
    }
    if (providers === undefined || providers.length === 0) {
      if (data === 'a') this.actions.createProvider()
      return
    }
    if (matchesKey(data, Key.up)) {
      this.confirmDelete = undefined
      this.actions.selectProvider(Math.max(0, selected - 1))
      return
    }
    if (matchesKey(data, Key.down)) {
      this.confirmDelete = undefined
      this.actions.selectProvider(Math.min(providers.length - 1, selected + 1))
      return
    }
    if (matchesKey(data, Key.enter)) {
      this.actions.editProvider(providers[selected].route)
      return
    }
    if (data === 'a') {
      this.actions.createProvider()
      return
    }
    if (data === 'm') {
      this.pendingShowModels = true
      this.actions.editProvider(providers[selected].route)
      return
    }
    if (data === 's') {
      const row = providers[selected]
      const model = row.models[0]
      if (model !== undefined) this.actions.setActiveModel(row.route, model.id)
      return
    }
    if (data === 'd') {
      if (this.confirmDelete === selected) {
        this.confirmDelete = undefined
        this.actions.deleteProvider(providers[selected])
      } else {
        this.confirmDelete = selected
      }
      return
    }
    this.confirmDelete = undefined
  }

  /**
   * pi.dev-style masked secret entry (see `LoginOverlay.renderPrompt`'s
   * `secret` kind, the proven reference for this shape) — the only screen
   * shown when editing a provider that's already known to the catalog.
   * Route/protocol/base URL/models come from the catalog or a prior save;
   * the one thing worth re-entering here is the key itself, paste-and-go.
   * The old Tab-navigated Name/Protocol/Base URL/Models/Save form is kept
   * only for genuinely new/custom providers via `renderForm`, since those
   * fields have no catalog default to fall back on.
   */
  private renderApiKeyPrompt(draft: ProviderDraft, mp: ModelProfileOverlayState): string[] {
    const name = draft.displayName || draft.route
    const lines: string[] = [bold(secondary(`Login to ${name}`)), `Enter ${name} API key`]
    lines.push(...this.noticeLines())
    if (mp.error !== undefined) lines.push(errorColor(mp.error))
    if (draft.apiKeyConfigured) {
      const via = draft.authMethod === 'oauth'
        ? 'signed in via OAuth'
        : draft.authMethod === 'api-key'
          ? draft.apiKeyPreview === undefined ? 'signed in via API key' : `signed in via API key ${draft.apiKeyPreview}`
          : 'already set'
      lines.push(muted(`(${via} — leave blank to keep it)`))
    }
    lines.push(renderMiniTextField(this.apiKeyDraft, true, '*'))
    lines.push(muted(`Models (${this.models.length}) — esc back, m from the provider list to edit`))
    const removeHint = draft.apiKeyConfigured ? ' · ctrl+d remove key' : ''
    lines.push(muted(`${mp.busy ? 'Saving…' : '(escape to cancel, enter to submit)'}${removeHint}`))
    return lines
  }

  private handleApiKeyPromptInput(data: string, draft: ProviderDraft): void {
    // No plain-letter shortcuts here — every letter is a valid API key
    // character, so this field's only reserved keys are modifier combos,
    // escape, and enter.
    if (matchesKey(data, Key.escape)) {
      this.actions.backToProviderList()
      return
    }
    if (matchesKey(data, Key.ctrl('d')) && draft.apiKeyConfigured) {
      this.actions.clearApiKey(draft)
      return
    }
    if (matchesKey(data, Key.enter)) {
      this.actions.saveProvider(this.buildDraft(draft))
      return
    }
    const next = miniTextFieldInput(this.apiKeyDraft, data)
    if (next !== undefined) this.apiKeyDraft = next
  }

  private renderForm(draft: ProviderDraft, mp: ModelProfileOverlayState): string[] {
    const textFields = this.textFields(draft)
    const protocolRow = textFields.length
    const modelsRow = protocolRow + 1
    const saveRow = protocolRow + 2
    const fieldState: Record<TextField, MiniTextFieldState> = {
      route: this.route,
      displayName: this.displayName,
      baseURL: this.baseURL,
      apiKey: this.apiKeyDraft,
    }
    const labels: Record<TextField, string> = {
      route: 'Provider ID',
      displayName: 'Display name',
      baseURL: 'Base URL',
      apiKey: draft.apiKeyConfigured ? 'API key (set — leave blank to keep)' : 'API key',
    }
    const lines: string[] = [bold(secondary(draft.isNew ? 'Custom provider' : `Edit ${draft.displayName || draft.route}`))]
    if (mp.error !== undefined) lines.push(errorColor(mp.error))
    textFields.forEach((field, index) => {
      const isFocused = this.focused === index
      const mask = field === 'apiKey' ? '*' : undefined
      const prefix = `${isFocused ? '› ' : '  '}${labels[field]}: `
      lines.push(`${prefix}${renderMiniTextField(fieldState[field], isFocused, mask)}`)
    })
    const protocolFocused = this.focused === protocolRow
    const protocolText = `${protocolFocused ? '› ' : '  '}API protocol: ‹ ${this.api} ›`
    lines.push(protocolFocused ? invert(protocolText) : protocolText)
    const modelsText = `${this.focused === modelsRow ? '› ' : '  '}Models (${this.models.length}) — enter to edit`
    lines.push(this.focused === modelsRow ? invert(modelsText) : modelsText)
    const saveText = `${this.focused === saveRow ? '› ' : '  '}${mp.busy ? 'Saving…' : 'Create provider'}`
    lines.push(this.focused === saveRow ? invert(saveText) : saveText)
    lines.push(muted('tab/shift+tab move · ←→ cycle protocol · enter confirm/activate · esc cancel'))
    return lines
  }

  private handleFormInput(data: string, draft: ProviderDraft): void {
    const textFields = this.textFields(draft)
    const protocolRow = textFields.length
    const modelsRow = protocolRow + 1
    const saveRow = protocolRow + 2
    const rowCount = protocolRow + 3
    if (matchesKey(data, Key.escape)) {
      this.actions.backToProviderList()
      return
    }
    if (matchesKey(data, 'shift+tab')) {
      this.focused = (this.focused - 1 + rowCount) % rowCount
      return
    }
    if (matchesKey(data, Key.tab)) {
      this.focused = (this.focused + 1) % rowCount
      return
    }
    if (this.focused === protocolRow && (matchesKey(data, Key.left) || matchesKey(data, Key.right))) {
      const direction = matchesKey(data, Key.left) ? -1 : 1
      const currentIndex = PROTOCOLS.indexOf(this.api as (typeof PROTOCOLS)[number])
      this.api = PROTOCOLS[(currentIndex + direction + PROTOCOLS.length) % PROTOCOLS.length]
      return
    }
    if (matchesKey(data, Key.enter) && this.focused === modelsRow) {
      this.showModels = true
      return
    }
    if (matchesKey(data, Key.enter) && this.focused === saveRow) {
      this.actions.saveProvider(this.buildDraft(draft))
      return
    }
    if (matchesKey(data, Key.enter) && this.focused <= protocolRow) {
      this.focused = (this.focused + 1) % rowCount
      return
    }
    if (this.focused < textFields.length) {
      const field = textFields[this.focused]
      const fieldState: Record<TextField, MiniTextFieldState> = {
        route: this.route,
        displayName: this.displayName,
        baseURL: this.baseURL,
        apiKey: this.apiKeyDraft,
      }
      const next = miniTextFieldInput(fieldState[field], data)
      if (next === undefined) return
      if (field === 'route') this.route = next
      else if (field === 'displayName') this.displayName = next
      else if (field === 'baseURL') this.baseURL = next
      else this.apiKeyDraft = next
    }
  }

  /**
   * No Tab-toggled focus, on purpose: a hidden "which of two things am I
   * typing into right now" mode with no visible indicator (the earlier
   * design) is exactly the kind of invisible-state bug already fixed
   * elsewhere in this file. Instead the "Add id" field is *always* live —
   * every printable key, paste, and left/right/backspace/delete/home/end
   * goes there, full stop, since ↑/↓ are the only keys `miniTextFieldInput`
   * never claims. That leaves ↑/↓ free to always drive the list selection
   * (for removal) at the same time, with no mode switch and no key that can
   * ever mean two different things depending on invisible state.
   */
  private renderModelListEditor(mp: ModelProfileOverlayState): string[] {
    const lines: string[] = [bold(secondary('Models'))]
    this.models.forEach((model, index) => {
      const isSelected = index === this.modelSelected
      const text = `${isSelected ? '› ' : '  '}${model.id}${model.name === undefined ? '' : ` — ${model.name}`}`
      lines.push(isSelected ? invert(text) : text)
    })
    if (this.models.length === 0) lines.push(muted('No models yet.'))
    lines.push(`Add id: ${renderMiniTextField(this.modelDraftId, true)}`)
    if (mp.busy) lines.push(muted('Discovering…'))
    if (mp.discovered !== undefined) {
      if (mp.discovered.length === 0) {
        lines.push(muted('No models discovered.'))
      } else {
        lines.push(muted('Discovered — type one into "Add id" above to adopt it:'))
        for (const model of mp.discovered) lines.push(muted(`  ${model.id}${model.name === undefined ? '' : ` — ${model.name}`}`))
      }
    }
    lines.push(muted('type + enter add · ↑↓ select · ctrl+x remove · ctrl+g discover · ctrl+s save · esc back (without saving)'))
    return lines
  }

  private addModel(id: string): void {
    const trimmed = id.trim()
    if (trimmed === '' || this.models.some(model => model.id === trimmed)) return
    const overlay = this.store.getSnapshot().overlay
    const discovered = overlay.kind === 'modelProfile' ? overlay.modelProfile.discovered : undefined
    const found = discovered?.find(model => model.id === trimmed)
    this.models = [...this.models, found === undefined ? { id: trimmed } : { ...found }]
    this.modelDraftId = emptyMiniTextField()
  }

  private handleModelListEditorInput(data: string, draft: ProviderDraft): void {
    if (matchesKey(data, Key.escape)) {
      this.showModels = false
      return
    }
    // Adding a model to this in-memory list is not itself a save — nothing
    // is written until a provider-level `saveProvider` call happens. The
    // natural way back (`esc`) intentionally does NOT save, matching every
    // other cancel-vs-confirm screen in this overlay, so this list would
    // otherwise be one easy-to-miss "esc → still need to press enter on the
    // *previous* screen" hop away from silently discarding what was just
    // typed. Ctrl+S saves right here, from the screen where the change was
    // actually made, instead of relying on a second confirm one level up.
    if (matchesKey(data, Key.ctrl('s'))) {
      this.actions.saveProvider(this.buildDraft(draft))
      return
    }
    if (matchesKey(data, Key.ctrl('g'))) {
      this.actions.discoverModelsForDraft(this.buildDraft(draft))
      return
    }
    if (matchesKey(data, Key.ctrl('x'))) {
      if (this.models.length === 0) return
      this.models = this.models.filter((_, index) => index !== this.modelSelected)
      this.modelSelected = Math.max(0, Math.min(this.modelSelected, this.models.length - 1))
      return
    }
    if (matchesKey(data, Key.up)) {
      if (this.models.length > 0) this.modelSelected = Math.max(0, this.modelSelected - 1)
      return
    }
    if (matchesKey(data, Key.down)) {
      if (this.models.length > 0) this.modelSelected = Math.min(this.models.length - 1, this.modelSelected + 1)
      return
    }
    if (matchesKey(data, Key.enter)) {
      this.addModel(this.modelDraftId.value)
      return
    }
    const next = miniTextFieldInput(this.modelDraftId, data)
    if (next !== undefined) this.modelDraftId = next
  }

  handleInput(data: string): void {
    const overlay = this.store.getSnapshot().overlay
    if (overlay.kind !== 'modelProfile') return
    const mp = overlay.modelProfile
    const draft = this.syncFormState(mp)
    if (draft !== undefined) {
      if (this.showModels) this.handleModelListEditorInput(data, draft)
      else if (draft.isNew) this.handleFormInput(data, draft)
      else this.handleApiKeyPromptInput(data, draft)
      return
    }
    if (this.mode === 'picker') this.handleModelPickerInput(data, mp)
    else this.handleListInput(data, mp)
  }
}

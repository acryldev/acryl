/** The custom agent catalog and the agent settings, for the app's own page only. */

import { Acryl } from 'acrylblends'
import { failure, isRecord, jsonBody, ownPage, readJson, type ReportError } from '../private-route.ts'
import type { AgentCatalog } from './catalog.ts'
import { WORKSPACE_AGENT_SETTINGS_PATH, WORKSPACE_AGENTS_PATH, WORKSPACE_AGENTS_REMOVE_PATH } from './contract.ts'
import { AgentDefinitionError } from './definition.ts'
import { parsePreferencesPatch } from './preferences.ts'
import type { AgentSettings } from './settings.ts'

/**
 * GET `agents` (the catalog) and POST `agents` `{ agent }` to add one, a refusal being a 400 whose message says what to fix; POST `agents/remove`
 * `{ id }` (idempotent); GET `agents/settings` (with a fresh check of which programs are installed) and POST one change, answered with the whole view.
 */
export function agentRoutes(catalog: AgentCatalog, settings: AgentSettings, reportError: ReportError): Acryl {
  return new Acryl()
    .get(WORKSPACE_AGENTS_PATH, ownPage, c => c.json({ agents: catalog.list() }))
    .post(WORKSPACE_AGENTS_PATH, ownPage, jsonBody(), async (c) => {
      const body = await readJson(c)
      if (!isRecord(body) || Object.keys(body).length !== 1 || !('agent' in body)) return c.json(failure('invalid agent request'), 400)
      try {
        await catalog.add(body.agent)
        return c.json({ agents: catalog.list() })
      } catch (cause) {
        if (cause instanceof AgentDefinitionError) return c.json(failure(cause.message), 400)
        reportError('add agent', cause)
        return c.json(failure('the agent could not be saved'), 500)
      }
    })
    .post(WORKSPACE_AGENTS_REMOVE_PATH, ownPage, jsonBody(), async (c) => {
      const body = await readJson(c)
      if (!isRecord(body) || Object.keys(body).length !== 1 || typeof body.id !== 'string') return c.json(failure('invalid agent request'), 400)
      try {
        await catalog.remove(body.id)
        return c.json({ agents: catalog.list() })
      } catch (cause) {
        reportError('remove agent', cause)
        return c.json(failure('the agent could not be removed'), 500)
      }
    })
    .get(WORKSPACE_AGENT_SETTINGS_PATH, ownPage, async c => c.json(await settings.view()))
    .post(WORKSPACE_AGENT_SETTINGS_PATH, ownPage, jsonBody(), async (c) => {
      const body = await readJson(c)
      try {
        return c.json(await settings.apply(parsePreferencesPatch(body)))
      } catch (cause) {
        if (cause instanceof AgentDefinitionError) return c.json(failure(cause.message), 400)
        reportError('save agent settings', cause)
        return c.json(failure('the settings could not be saved'), 500)
      }
    })
}

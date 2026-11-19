/** The status route: agents POST what they are doing (bearer token, loopback only); the page GETs the list. */

import { Acryl } from 'acrylblends'
import { bearerAuth } from 'acrylblends/bearer-auth'
import { loopbackOnly } from 'acrylblends/loopback-only'
import { INVALID_JSON, failure, jsonBody, ownPage, readJson, type ReportError } from '../../private-route.ts'
import { AgentStatusError, WORKSPACE_AGENT_STATUS_PATH, parseStatusReport, type AgentStatusStore } from './agent-status.ts'

/**
 * GET (from the app's own page): every live terminal's latest status.
 * POST (from an agent's hook, a program and not a page): `{ terminal, state }` with `Authorization: Bearer <token>`. The token is known only to
 * terminals ACRYL started for agents, and the request must come from this machine to the app's own loopback address.
 */
export function agentStatusRoutes(token: string, store: AgentStatusStore, reportError: ReportError): Acryl {
  const fromAgent = [
    loopbackOnly({ mutations: 'none', hostnames: ['127.0.0.1'] }),
    // A missing or wrong token is 401 with `WWW-Authenticate`, a malformed header 400; the hook ignores the answer either way.
    bearerAuth({
      token,
      noAuthenticationHeader: { message: failure('a bearer token is required') },
      invalidAuthenticationHeader: { message: failure('invalid authorization header') },
      invalidToken: { message: failure('wrong token') },
    }),
  ] as const
  return new Acryl()
    .get(WORKSPACE_AGENT_STATUS_PATH, ownPage, c => c.json({ statuses: store.list() }))
    .post(WORKSPACE_AGENT_STATUS_PATH, ...fromAgent, jsonBody(), async (c) => {
      const body = await readJson(c)
      if (body === INVALID_JSON) return c.json(failure('invalid report'), 400)
      try {
        const report = parseStatusReport(body)
        // An unknown terminal is not an error for the hook: the agent may have outlived its terminal.
        return c.json({ ok: store.report(report.terminal, report.state) })
      } catch (cause) {
        if (cause instanceof AgentStatusError) return c.json(failure(cause.message), 400)
        reportError('record agent status', cause)
        return c.json(failure('the report could not be recorded'), 500)
      }
    })
}

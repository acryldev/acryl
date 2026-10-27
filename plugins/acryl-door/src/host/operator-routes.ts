/**
 * The operator's routes: an agent's shell on this machine, through `.acryl/bin/acryl`. Loopback only, with this run's secret.
 *
 * `POST <prefix>/call` takes `{ verb, args }` and answers {@link CallResponse}; `GET <prefix>/verbs` lists the verbs. A caller that goes
 * away aborts its call through the request's signal.
 */

import { Acryl } from 'acryl-router'
import { UiControlError } from '../page/protocol.ts'
import { Door, DoorError } from './door.ts'
import { error, INVALID_JSON, jsonBody, operatorOnly, readJson, type ReportError } from './http.ts'
import { VERBS } from './verbs.ts'

export type CallResponse =
  | { readonly ok: true; readonly value: unknown; readonly text: string }
  | { readonly ok: false; readonly code: string; readonly message: string }

export function operatorRoutes(prefix: string, secret: string, door: Door, reportError: ReportError): Acryl {
  return new Acryl()
    .get(`${prefix}/verbs`, operatorOnly(secret), c => c.json({ verbs: VERBS }))
    .post(`${prefix}/call`, operatorOnly(secret), jsonBody, async (c) => {
      const body = await readJson(c)
      if (body === INVALID_JSON || typeof body !== 'object' || body === null || typeof (body as { verb?: unknown }).verb !== 'string') {
        return c.json({ ok: false, code: 'invalid', message: 'the body is { verb, args }' } satisfies CallResponse, 400)
      }
      const { verb, args } = body as { verb: string; args?: unknown }
      try {
        const answer = await door.run(verb, args, c.req.raw.signal)
        return c.json({ ok: true, value: answer.value, text: answer.text } satisfies CallResponse)
      } catch (cause) {
        if (cause instanceof UiControlError || cause instanceof DoorError) {
          return c.json({ ok: false, code: cause.code, message: cause.message } satisfies CallResponse, cause.code === 'invalid' || cause.code === 'unknown-verb' ? 400 : 200)
        }
        reportError(`run the door verb ${verb}`, cause)
        return c.json(error('the verb could not be run'), 500)
      }
    })
}

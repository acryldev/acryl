/**
 * Cordis Host plugin: the routes behind a sign-in screen (Desktop's Welcome window today). The providers come from the
 * harness's own authorization flows (`ctx.authorization`: Anthropic, OpenAI Codex and the rest of the installed catalog),
 * and a successful sign-in makes the provider's route live like the terminal's `/login` does. When the default for new
 * sessions cannot answer (its provider has no credential), the signed-in provider becomes the default.
 */
import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import {
  createDefaultModelAdoption, createRouteActivation, isRouteUsable,
  type CredentialProjectionConfigurableProvider, type DefaultModelAdoptionPort, type DefaultModelAdoptionPorts, type RouteActivationSettingsPort, type RouteUsabilityServices,
} from 'acryl-control'
import { SignInController, type SignInPorts } from './controller.ts'
import {
  SIGN_IN_ANSWER_PATH, SIGN_IN_ATTEMPT_PATH, SIGN_IN_BEGIN_PATH, SIGN_IN_CANCEL_PATH, SIGN_IN_PROVIDERS_PATH,
} from './contract.ts'
import { handleAnswerRequest, handleAttemptRequest, handleBeginRequest, handleCancelRequest, handleProvidersRequest } from './route.ts'

export const name = 'acryl-sign-in'
export const inject = ['acrylWeb', 'authorization', 'credentials']

/**
 * A harness service by name, typed by the narrow port this plugin needs. The harness types are not a dependency of this
 * package (the same choice the terminal makes): the ports in `controller.ts` are the contract, and the tests pin them.
 */
function service<T>(ctx: Context, serviceName: string): T | undefined {
  return (ctx as unknown as { get(name: string): unknown }).get(serviceName) as T | undefined
}

/** `settings` and `llm` are optional: without them a sign-in still stores the credential, it just does not activate the route. */
function routeActivation(ctx: Context): SignInPorts['routeActivation'] {
  const settings = service<RouteActivationSettingsPort>(ctx, 'settings')
  const llm = service<{ listConfigurableProviders(): readonly CredentialProjectionConfigurableProvider[] }>(ctx, 'llm')
  if (settings === undefined || llm === undefined) return undefined
  // `dsh-llm-pi-ai` rebuilds its live registry on a watcher chained off the settings commit; one macrotask later it has run.
  return createRouteActivation({ settings, llm, settled: () => new Promise<void>(resolve => { setImmediate(resolve) }) })
}

/**
 * The services are looked up when a sign-in succeeds, not at activation, so their load order does not matter. Without
 * `agentDefaultModel`, `llm` or `settings` a sign-in leaves the default for new sessions as it is.
 */
function defaultModelAdoption(ctx: Context, credentials: RouteUsabilityServices['credentials']): DefaultModelAdoptionPort {
  return {
    async adoptIfDefaultUnusable(provider) {
      const defaultModel = service<DefaultModelAdoptionPorts['defaultModel']>(ctx, 'agentDefaultModel')
      const settings = service<RouteUsabilityServices['settings']>(ctx, 'settings')
      const llm = service<RouteUsabilityServices['llm'] & { listModels(provider: string): Promise<readonly { readonly id: string }[]> }>(ctx, 'llm')
      if (defaultModel === undefined || settings === undefined || llm === undefined) return
      await createDefaultModelAdoption({
        defaultModel,
        isUsable: route => isRouteUsable({ llm, settings, credentials }, route),
        listModels: route => llm.listModels(route),
      }).adoptIfDefaultUnusable(provider)
    },
  }
}

export function apply(ctx: Context): void {
  const origin = `http://127.0.0.1:${String(ctx.acrylWeb.port)}`
  const authorization = service<SignInPorts['authorization']>(ctx, 'authorization')
  const credentials = service<SignInPorts['credentials'] & RouteUsabilityServices['credentials']>(ctx, 'credentials')
  if (authorization === undefined || credentials === undefined) throw new Error('acryl-sign-in: the harness authorization and credentials services are required')
  const activation = routeActivation(ctx)
  const controller = new SignInController({
    authorization,
    credentials,
    ...activation === undefined ? {} : { routeActivation: activation },
    defaultModel: defaultModelAdoption(ctx, credentials),
    newId: randomUUID,
  })
  const report = (operation: string, cause: unknown): void => {
    ctx.logger.error(`acryl-sign-in: failed to ${operation}: ${cause instanceof Error ? cause.message : String(cause)}`)
  }
  const routes: readonly (readonly [string, (req: IncomingMessage, res: ServerResponse) => unknown])[] = [
    [SIGN_IN_PROVIDERS_PATH, (req, res) => handleProvidersRequest(req, res, origin, controller, report)],
    [SIGN_IN_ATTEMPT_PATH, (req, res) => { handleAttemptRequest(req, res, origin, controller) }],
    [SIGN_IN_BEGIN_PATH, (req, res) => handleBeginRequest(req, res, origin, controller, report)],
    [SIGN_IN_ANSWER_PATH, (req, res) => handleAnswerRequest(req, res, origin, controller, report)],
    [SIGN_IN_CANCEL_PATH, (req, res) => handleCancelRequest(req, res, origin, controller, report)],
  ]
  for (const [path, handler] of routes) {
    ctx.effect(() => ctx.acrylWeb.register({ kind: 'exact', path, handler: (req, res) => { void handler(req, res) } }), `acryl-sign-in: route ${path}`)
  }
}

export { SignInController, SignInRequestError } from './controller.ts'
export type { SignInPorts } from './controller.ts'
export * from './contract.ts'

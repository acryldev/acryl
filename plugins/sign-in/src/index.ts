/**
 * Cordis Host plugin: the routes behind a sign-in screen (Desktop's Welcome window today). The providers come from the
 * harness's own authorization flows (`ctx.authorization`: Anthropic, OpenAI Codex and the rest of the installed catalog),
 * and a successful sign-in makes the provider's route live like the terminal's `/login` does. When the default for new
 * sessions cannot answer (its provider has no credential), the signed-in provider becomes the default.
 */
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import type { Context } from '@deepseek-ai/cordis'
import type {} from 'acrylblends/cordis/router'
import type {} from 'acrylblends/cordis/router-http'
import {
  createDefaultModelAdoption, createRouteActivation, isRouteUsable,
  type CredentialProjectionConfigurableProvider, type DefaultModelAdoptionPort, type DefaultModelAdoptionPorts, type RouteActivationSettingsPort, type RouteUsabilityServices,
} from 'acryl-control'
import { SignInController, type SignInPorts } from './controller.ts'
import type { DeepSeekAccountPort } from './deepseek-account.ts'
import { SIGN_IN_API_PREFIX } from './contract.ts'
import { signInRoutes } from './route.ts'

export const name = 'acryl-sign-in'
/** This package's version (`lib/index.js` sits one folder below `package.json`), sent to DeepSeek as the requesting client's version. */
const VERSION = (createRequire(import.meta.url)('../package.json') as { version: string }).version
/** The routes are served through the framework's router; `acrylWeb` still names the origin DeepSeek's browser sign-in returns to. */
export const inject = ['router', 'routerHttp', 'acrylWeb', 'authorization', 'credentials']

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
    deepseekAccount: () => {
      const port = service<DeepSeekAccountPort>(ctx, 'deepseekAccount')
      // The browser returns to the Host's `/oauth/callback` on the origin these routes are served on.
      return port === undefined ? undefined : {
        port, callbackOrigin: origin, loginSource: process.versions.electron === undefined ? 'web' : 'desktop', version: VERSION,
      }
    },
    newId: randomUUID,
  })
  const report = (operation: string, cause: unknown): void => {
    ctx.logger.error(`acryl-sign-in: failed to ${operation}: ${cause instanceof Error ? cause.message : String(cause)}`)
  }
  ctx.router.route('/', signInRoutes(controller, report))
  ctx.routerHttp.mount(SIGN_IN_API_PREFIX)
}

export { SignInController, SignInRequestError } from './controller.ts'
export type { SignInPorts } from './controller.ts'
export * from './contract.ts'

# acryl-sign-in

Sign in to a model provider with an account, from **Settings > Models** on Web and Desktop. A card at the foot of the page
offers Claude (Anthropic, Claude Pro or Max), ChatGPT (OpenAI Codex), DeepSeek (DeepSeek account) and, in a list, every other
provider whose harness flow offers an account sign-in (GitHub Copilot, ...). API keys stay on the page's own provider editor
("Add model provider").

- **Client** (`src/client/`): the card, registered in the Models page's `settings.models.footer` seat. It opens the provider's
  sign-in page (the system browser on Desktop, a new tab on Web; a pop-up opened without a click is blocked by browsers, so
  "Open sign-in page" stays on the card), shows the question a flow asks (paste a code or a redirect URL, choose browser or
  device login), and reads a failure in the provider's words.
- **Host** (`src/index.ts`, `src/controller.ts`): the providers are the harness's own authorization flows (`ctx.authorization`,
  registered by `dsh-llm-pi-ai`); nothing here knows a protocol. The terminal's `/login` drives the same flows.
  `acryl-control`'s `SignInAttempts` holds the one running conversation; `createRouteActivation` makes the provider usable
  once it succeeds, and `createDefaultModelAdoption` makes it the default for new sessions when the current default cannot
  answer (its provider has no credential or is not live; a default that works is never replaced). The starting model per
  provider is `STARTING_MODELS` in `acryl-control`, else the route's first model.
- **DeepSeek account** (`src/deepseek-account.ts`): DeepSeek's own account dialog registers only inside DeepSeek's Desktop
  window, so the Host drives the harness's `deepseekAccount` service directly and shows its attempt like a flow. The browser
  returns to the Host's own `/oauth/callback` on the origin these routes are served on; a successful sign-in makes the
  `deepseek-account` model route the default when the current default cannot answer. DeepSeek's account flow on
  `ctx.authorization` is never started as a flow.
- **Terminal** (`src/account-callback.ts`, entry `acryl-sign-in/account-callback`, row `acryl-sign-in-account-callback`): the
  terminal has no web server for DeepSeek's browser callback, and DSH's would also wake the API gateway. This row serves
  `/oauth/callback` on its own loopback port (listening from the first sign-in, closed with the row), as `webServer` in the
  Loader realm `acryl-account-callback` that only the `deepseek-account` row shares, and provides `acrylAccountSignIn`
  (`AccountSignInPort` in `acryl-control`), which `/login` uses for "DeepSeek". Composed by the `account-callback` capability.
- Routes (`src/route.ts`): one app on the framework's router, mounted under `/api/acryl-sign-in` with `ctx.routerHttp.mount`, under
  the shared private-route rules of `acryl-loopback-http/router`: only the app's own page on loopback, 405 with `Allow` for another
  method, a JSON body (415) of at most 16 KiB (413) for a change, a refusal the harness explains 409 with its reason. No response
  carries a secret, and a typed answer is handed to the flow and dropped:

  | Route | Method | Meaning |
  | --- | --- | --- |
  | `/api/acryl-sign-in/providers` | GET | providers, their methods, whether each is signed in, and whether any is |
  | `/api/acryl-sign-in/attempt` | GET | the current conversation, or `null` |
  | `/api/acryl-sign-in/begin` | POST `{ key, method?, locale? }` | start a sign-in (a running one is withdrawn); `locale` sets the language of DeepSeek's page |
  | `/api/acryl-sign-in/answer` | POST `{ attemptId, promptId, value }` | answer the question the flow asks |
  | `/api/acryl-sign-in/cancel` | POST `{ attemptId }` | withdraw the conversation |

Composed for Web and Desktop through the `sign-in` capability in `acryl-harness-runtime`'s `coding-capabilities.ts`, which needs
the router (`needsRouter`): a Blueprint with the capability must carry the `framework-kit` row, and Desktop composes the router
rows itself.

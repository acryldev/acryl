# acryl-sign-in

The Host routes behind a sign-in screen. Desktop's Welcome window uses them to offer Claude (Anthropic), ChatGPT (OpenAI Codex) and
the rest of the installed provider catalog, by account (OAuth) or by API key, before the workspace opens.

- The providers are the harness's own authorization flows (`ctx.authorization`, registered by `dsh-llm-pi-ai`); nothing here
  knows a protocol. The terminal's `/login` drives the same flows.
- `acryl-control`'s `SignInAttempts` holds the one running conversation (what the flow said, the question it waits on, how it
  ended); `createRouteActivation` makes the provider usable once it succeeds. `src/controller.ts` is those two over plain ports.
- Routes (same-origin, loopback, bounded JSON; no response carries a secret, and a typed answer is handed to the flow and dropped):

  | Route | Method | Meaning |
  | --- | --- | --- |
  | `/api/acryl-sign-in/providers` | GET | providers, their methods, whether each is signed in, and whether any is |
  | `/api/acryl-sign-in/attempt` | GET | the current conversation, or `null` |
  | `/api/acryl-sign-in/begin` | POST `{ key, method? }` | start a sign-in (a running one is withdrawn) |
  | `/api/acryl-sign-in/answer` | POST `{ attemptId, promptId, value }` | answer the question the flow asks |
  | `/api/acryl-sign-in/cancel` | POST `{ attemptId }` | withdraw the conversation |

Composed for Desktop through the `sign-in` capability in `acryl-harness-runtime`'s `coding-capabilities.ts`.

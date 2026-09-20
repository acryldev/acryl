# LLM adapters

Connect a new model provider: a class extending `LlmAdapter` with `async * stream(options)`, registered
with `ctx.llm.registerAdapter(['route'], adapter)` (inject `llm`). Obligations: emit `usage` before
`finish` and nothing after; tool-call arguments are raw JSON strings streamed as `argumentsDelta`;
honor `options.signal`; throw `LlmError` with a stable code for failures. Read the full contract and
reference implementations in `deepseek-harness/docs/cookbook/adding-an-llm-adapter.md` before
writing one. There is no example package for this type yet.

---
name: acryl-add-provider-or-capability
description: Use when the user wants a new model provider, a swappable capability, an agent preset or persona, or a Desktop profile feature.
---
# Add a provider, capability, preset or profile feature

Pick by what is asked and read the doc and the example COMPLETELY first: a new model provider
{{pack}}/docs/extending/llm-adapter.md (example llm-adapter-echo); interchangeable implementations
{{pack}}/docs/extending/three-role-capability.md; an agent preset or persona {{pack}}/docs/extending/agent-preset.md;
profile, pnpm or live activation {{pack}}/docs/extending/desktop-main.md. If unsure which mechanism fits read
{{pack}}/docs/extending/cordis-core.md. Never put a secret in a package file or chat. Verify, install, and report the
status; say plainly what you could not verify (for example a provider that needs a real key).

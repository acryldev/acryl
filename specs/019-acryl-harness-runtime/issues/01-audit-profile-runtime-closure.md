# Audit the ACRYL profile runtime closure

Type: research  
Status: resolved

## Question

Which exact pinned packages must the shared ACRYL Harness Runtime workspace
declare so a standard `@deepseek-ai/dsh-base` profile boots without resolving
modules from `dsh-plugin-desktop` or another sibling package?

The answer must distinguish required runtime packages from test-only and
presentation-only dependencies, and provide a reproducible profile-boot smoke
that proves the closure.

## Answer

The runtime closure is owned by the new `acryl-harness-runtime` workspace. Its
manifest includes every pinned package named by the `@deepseek-ai/dsh-base`
profile layer, plus the corresponding known Harness runtime closure already
pinned by the repository. It does not import `dsh-plugin-desktop`.

The smoke is `acryl-harness-runtime/tests/profile.spec.ts`: it creates an
isolated Harness home, boots a fresh profile, verifies `ctx.sessions` and
`ctx.agents` exist in the returned root, then disposes the root. The test
passes under `corepack yarn workspace acryl-harness-runtime check`.

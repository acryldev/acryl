# Three-role capability: definition, providers, consumers

Use this when several interchangeable implementations of one capability should exist (two storage backends, two
formatters) and other plugins must not care which one is mounted.

Working examples, copy from them (each is a real package):
`../example-plugins/packages/capability-swap-provider-loud/`, `capability-swap-provider-quiet/`, `capability-swap-consumer/`.

## The three roles

1. **Definition**: the service NAME and the method shape (the contract), written down in the provider headers
   and in your doc. Here: service `speller`, `shout(text: string): string`. In a large product the definition is
   its own package with types only; for a plugin you write, a documented name plus shape is enough.
2. **Provider**: a `Service` subclass providing that name: `class X extends Service { constructor(ctx) { super(ctx, 'speller') } }`,
   exported as `apply`. Only ONE provider of a name may be mounted at a time (a second is rejected), so a swap is
   "disable one row, enable the other".
3. **Consumer**: `export const inject = ['speller']`. It never imports or names a provider. While no provider is
   mounted it is PENDING (healthy); when one appears it becomes ACTIVE; when the provider is swapped it remounts
   against the new one without changes.

## Swapping providers

Each provider package is a row (`cordis.patch.yml`). To swap, deactivate the old provider package and install or
activate the new one (the install tool updates in place; use the remove tool for the old one). The real-engine
test in the repository mounts loud, disposes it, mounts quiet, and checks the consumer stays ACTIVE and now
gets the quiet behavior.

## Rules

- Depend on the NAME, never on a provider. Read optional capabilities with `ctx.get('name')` at call time.
- Keep the contract small and stable: adding a method is safe; changing one breaks every consumer.
- The provider owns its resources in effects so a swap releases them.
- More detail on why capabilities are split this way: `reference/harness/capability-seams.md`.

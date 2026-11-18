# Feature Specification: Core primitives

**Milestone**: M1 | **Parent**: [000-roadmap](../000-roadmap/spec.md) | **Status**: In progress

## Summary

The smallest set of building blocks every other milestone stands on: typed service tokens,
typed hooks over Hookable, typed registries whose entries are owned by a lifetime, and a
reverse-order disposal stack. None of them needs Cordis yet; they are deliberately defined
against an `Owner` abstraction ("something that releases things later") so M3 can bind them to
Cordis fibers without changing their API.

## User Scenarios & Testing

### User Story 1 - Typed service tokens (P1)

`service<T>(name)` returns a token carrying the value type `T`. `ValueOf<typeof token>` extracts it.

**Independent Test**: type tests with `expectTypeOf`; runtime test that invalid names throw `InvalidNameError`.

### User Story 2 - Typed hooks that clean up after themselves (P1)

A `Hooks<T>` instance registers, fires (serial and parallel) and counts hooks. Registering through an
`Owner` removes the hook automatically when the owner is disposed.

**Acceptance Scenarios**:

1. **Given** two hooks on `a`, **When** `callHook('a', 1)`, **Then** they run in registration order with `1`, and a rejection stops the serial chain and rejects the call.
2. **Given** `callHookParallel`, **Then** all hooks start before any finishes.
3. **Given** a hook registered through an owner, **When** the owner disposes, **Then** `count('a')` is 0.
4. **Given** `hookOnce`, **Then** it runs once.

### User Story 3 - Registries with owned entries (P1)

`registry<T>(name)` is a token. A `RegistryStore` holds entries per token; a view bound to an `Owner`
adds entries that are removed when the owner disposes. Subscribers see `add` and `remove` events.

**Acceptance Scenarios**:

1. **Given** two owners adding entries, **When** one disposes, **Then** only its entries are removed and subscribers get `remove` for each.
2. **Given** a `key` function on the token, **Then** `get(id)` works and a duplicate id throws `DuplicateRegistryEntryError`.

### User Story 4 - Disposal stack (P1)

`DisposerStack` runs disposers last-in first-out, continues past failures and reports them together,
is idempotent, and refuses new work once disposed.

## Requirements

- **FR-101**: Token names MUST match `^[A-Za-z][A-Za-z0-9._:/-]*$`.
- **FR-102**: `Hooks` MUST be generic over a map of function types; `callHook` returns `Promise<void>` always.
- **FR-103**: `Hooks.count()` MUST report live registrations (the leak probe).
- **FR-104**: `DisposerStack.dispose()` MUST run every disposer even if some throw, then throw `DisposalError` carrying all errors in order of occurrence.
- **FR-105**: `Owner` is `{ own(disposer): () => void }`. The returned function removes the disposer without running it.
- **FR-106**: Registry views MUST preserve insertion order and MUST NOT expose the mutable backing array.
- **FR-107**: The package MUST have only `hookable` as a runtime dependency in this milestone and import no Node-only module.

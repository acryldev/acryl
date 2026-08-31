# Deferred Runtime Composition Contract

The governing scope is [`../spec.md`](../spec.md).

This document intentionally defines no runtime-composition API. Terminal distribution optimization must not create a shared composition facade, expose a raw Cordis `Context`, or introduce remote client/server contracts.

## Deliberate deferral

Shared runtime composition, optional capability metadata, remote transports, loopback servers, and attachable clients are deferred to future evidence-backed specifications. The only contract in this feature is the clean installed-package acceptance contract documented in [`../data-model.md`](../data-model.md).

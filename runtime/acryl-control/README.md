# acryl-control

Host-neutral Cordis control-plane capabilities for ACRYL hosts.

This package is repository-owned. The pinned `deepseek-harness/` checkout remains unmodified.

## Temporary session subscription transport

Endpoint session subscriptions currently use a local, single-flight 25 ms
snapshot polling loop. A subsequent request is scheduled only after the prior
request settles, and a disposed subscription suppresses later callbacks. This
is a temporary compatibility transport, not a durable streaming protocol;
replace it with an endpoint push/subscription mechanism before treating it as
a general multi-surface update channel.

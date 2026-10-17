# ADR-0002: Owner direction for ACRYL and ACRYL Blends (October 2026)

Status: Accepted (2026-10-17, owner)

The owner answered the direction questions asked on 2026-10-16. This records the answers that shape ACRYL and Blends. Commercial decisions about the WebBoxes.ai cloud are kept in the WebBoxes repository.

## Decisions

- **Licence.** ACRYL and ACRYL Blends stay MIT. The multi-tenant hosting and orchestration software of WebBoxes.ai is proprietary (WebBoxes s.r.o.) and never lands in this repository. The upstream copyright notices ACRYL inherited stay as they are.
- **What the products are.** ACRYL is the open development environment for developers, usable locally and as a hosted workspace. Blends is two things: the framework apps are built with, and a versioned composition format (`EnvironmentBlend` for a development workspace, `ApplicationBlend` for a deployable app) that a runtime can validate and run.
- **Order of work.** The next work aims at one result (an ordered sequence with a gate per step, not a calendar: the owner, 2026-10-17, asked for agent pace instead of human week estimates): a new user gets a running, hosted ACRYL workspace from a starter Environment Blend without manual help. For ACRYL that means first proving it runs unattended and headless in a container, with agent sessions that keep running after the browser closes. Application Blends follow.
- **Portability.** A workspace's project and its Blend can always be exported and run outside the cloud.
- **DeepSeek Harness.** Stays a pinned, unmodified submodule; ACRYL moves toward Cordis plus its own thin harness over time.
- **Models.** All major providers work well, plus EU-hosted models (Mistral and similar).
- **Platforms.** Web first-class (the hosted workspace), then macOS; Windows and Linux supported; mobile later.
- **Compatibility.** Until 1.0, formats may change with automatic migrations (as the rename to "plugin" did). Published Blend schemas carry a version.
- **Plugin publishing.** Every route stays available: a private or public GitHub repository, a registry, npm; free or paid. A paid marketplace comes last, once the ecosystem has enough plugins.
- **Releases.** Unsigned builds during development; signed builds once paid offers launch. Installed apps update themselves, with a stable and a beta channel.
- **Support.** GitHub issues plus a Discord community.

## Consequences

The container and headless-runtime work for the hosted workspace comes before further desktop polish. The signing, auto-update and Discord items wait for their milestones and are not started now.

# Agent Note: Desktop profile management

English | [中文](2026-08-15-desktop-profile-management.zh.md)

## Problem

DSH Desktop originally always prepared and launched the product-owned `desktop` profile. Existing DSH users may already have a `web` profile or several purpose-specific Web profiles with different bundle and patch compositions. Sessions, settings, and storage in the ordinary shipped profiles already use the same DSH home by default, so copying records between profiles would duplicate data and misrepresent what a profile owns. The missing capability is selecting which plugin composition backs the desktop generation.

Selection happens before the Host Cordis tree and its settings provider exist. It therefore cannot be stored inside the selected profile's settings namespace. A failed selection must also remain recoverable when no renderer or tray can mount.

## Decision

The Electron launcher owns a private versioned selection document below its user-data directory. It records `active`, optional `pending`, and `lastKnownGood` profile names. Writes use a private directory, a `0600` temporary file, and same-directory atomic rename. Profile manifests, user patches, and dependencies are read-only during discovery.

Discovery lists existing profile manifests plus lazy `desktop` and `web` defaults. A non-desktop profile is selectable only when its direct bundle order contains `@deepseek-ai/dsh-base` before `@deepseek-ai/dsh-web-app`. Headless, malformed, wrong-order, and desktop-embedded profiles remain visible but disabled. `desktop` remains the sole launcher-managed exception and retains its existing installation-prefix repair. Selecting missing `web` uses the ordinary upstream template initialization path.

`desktop-profiles` is a normal Host plugin in the launcher-owned desktop layer. The launcher provides it a narrow `desktopProfiles` capability. It contributes a native tray submenu containing radio commands for discovered profiles; it has no renderer, filesystem, or process bridge. A selection is persisted as pending before it requests the existing orderly Electron restart.

At startup the launcher consumes a pending selection and prepares that profile without rewriting its manifest, user patch, or dependencies. The upstream launcher scratch root `cordis.yml` remains inside the selected profile because its directory is the Loader base for relative and profile-local package resolution. The launcher still inserts the desktop layer only in memory after `dsh-web-app`.

The profile is promoted to last-known-good only after `app-boot` completes and the native window loads successfully. The tray is created only after the Web surface loads, and the launcher commits last-known-good synchronously before Electron can dispatch a tray command. A failed pending generation is restored to the prior last-known-good profile and relaunched once. Failure of the last-known-good generation remains fail-loud, which prevents a restart loop.

Compatibility mode does not force official layout rows over the selected profile. Advanced mode keeps its explicit requirement for the official layout, sidebar, and conversation contracts. Desktop safety overlays such as the loopback bind, Windows browse picker, and Windows PowerShell trampoline remain generation overlays.

The packaged terminal is configured only after the selected profile boots. Its working directory, welcome text, process-local default profile, and private shim directory all use the active profile. Bare `dsh`, config dumps, and plugin commands therefore target the active profile, while an explicit `--profile` remains authoritative. Profile switches cannot rewrite shims used by an already open terminal. Selection state and generated commands preserve spaces and Unicode; path segments and control characters are rejected, while native Windows script encoding remains a target-platform release check.

## Records and settings

The shipped `desktop` and `web` compositions default to the same `$DSH_HOME/sessions`, `$DSH_HOME/settings.yaml`, and `$DSH_HOME/storages`. Profile switching performs no record migration or copy. A custom profile can intentionally redirect those roots through its own patch, so the product only promises shared records for the ordinary composition.

The shell mode remains in the active file-settings provider's `dsh-desktop` namespace. Profile selection is separate because it must be resolved before that provider can be composed.

## Verification

Focused tests cover read-only discovery, bundle order, malformed and duplicate desktop layers, Unicode names, atomic private state, pending and last-known-good transitions, deleted profiles, tray radio commands, persistence-before-restart ordering, active-profile terminal defaults, selected Web composition, and compatibility preservation. Build and packaged-runtime gates require both the profile manager and Host profile selector artifacts. The complete profile smoke provides the launcher capability and verifies the tray contribution.

Target-platform release verification still has to exercise profile switching and terminal commands from packaged macOS and Windows applications, including one profile-local third-party plugin.

## Alternatives considered

**Copy plugins or records from `web` into `desktop`.** This creates two compositions that drift and duplicates data that the shipped profiles already share.

**Store selection in `settings.yaml`.** The selected profile can change the settings provider and must be known before that provider starts, making this circular.

**Launch `dsh web` as a child process.** The desktop Host capability and launcher-owned Cordis plugins cannot cross that process boundary without a second control protocol.

**Silently add Web bundles to every selected profile.** This mutates user-owned composition and can turn a headless or intentionally custom profile into a different product.

## Consequences

DSH Desktop now manages several Web-capable profiles without owning their plugin rosters or their records. Switching is an explicit restart boundary, the terminal follows the active profile, and failed pending selections recover to the last mounted profile. The launcher gains a small persistent control document and another Host tray contribution, while the upstream checkout and renderer isolation remain unchanged.

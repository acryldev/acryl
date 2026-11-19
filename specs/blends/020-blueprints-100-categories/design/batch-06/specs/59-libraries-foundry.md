# 59 — The Foundry (Libraries and frameworks)

**Tagline:** Discover the components that make up a software stack.

## Product brief
A curated software-library catalogue for searching libraries and frameworks, inspecting metadata, comparing versions and assembling an illustrative stack manifest.

**Primary audience:** Developers, architects, technical leads and engineering enablement teams.

**UX direction:** Editorial package atlas: category filters, two-column package cards and a persistent package detail / install-command panel.

## Workspace / screen map
1. Package category and keyword explorer
2. Package card catalogue and search
3. Selected package metadata and version history
4. Local stack comparison / manifest preview

## Primary workflows
1. Filter and search packages by name, family or language.
2. Select a package and inspect its summary, version and example install command.
3. Copy the illustrative install command.
4. Add packages to a local stack comparison.

## Core data model
Package, PackageVersion, PackageCategory, LanguageTag, RuntimeTarget, StackManifest, StackEntry.

## Prototype boundaries
Catalogue entries and version numbers are example seed data. No registry metadata is fetched and no package is installed or resolved.

## Acceptance criteria
- A user can complete each primary workflow using seeded data without credentials or external API keys.
- The application has responsive behavior and meaningful empty, selected, success and error states.
- Data transformations and state transitions are separated from presentation and covered by domain tests.
- The UI uses semantic controls, visible focus states and keyboard-accessible primary actions.
- README documents purpose, target users, local run steps, prototype boundaries and the three agent prompts.

## Suggested implementation sequence
1. Define typed domain entities, seed fixtures and pure domain operations.
2. Implement the primary workspace and main state transitions.
3. Add detail / create / inspect flows, responsive layout and accessibility.
4. Add domain and route tests, then capture a screenshot for the registry entry.

## Coding-agent prompts
1. Define package, version, category and runtime-target schema with seed data and search tests.
2. Implement a multi-select stack composer and a serializable manifest preview.
3. Add package version comparison and accessibility improvements to category filters.

## Blueprint delivery notes
- Standalone UX prototype only; it is not a production application.
- Use local seed data and do not require paid services or third-party API keys.
- Implement in its own repository when promoted from mockup to Blueprint.
- Publish a registry entry only after domain tests, route tests, README and screenshot are complete.

# 44. Takeform Studio

**Category:** Creator software  
**Blueprint ID:** `acrylblends.creator-studio`  
**Mockup:** `mockups/44-creator-studio.html`

## Product purpose
A creator production desk for assembling a podcast/newsletter episode, managing assets, editing release notes and checking distribution readiness.

## Primary audience
Independent podcasters, newsletter writers and small creator teams

## UX direction
Dark production workspace with project asset rail, central audio sequence and script/description editor, plus release-health checklist.

## Primary data model
CreatorProject, Episode, MediaAsset, AudioClip, TimelineMarker, Script, ReleaseChannel, ChecklistItem

## Core user flows
Inspect the project; switch between edit/script/distribution; play/pause simulated audio; edit release description; add a timeline marker; validate release checklist.

## Implementation constraints and boundaries
Audio playback is simulated and no audio is distributed. Production requires media processing, transcoding, rights/consent management, channel adapters and immutable release versions.

## Suggested implementation slices
1. Define typed domain models and seed a compact, realistic demo dataset.
2. Implement the primary workflow and its state transitions without requiring third-party credentials.
3. Add route/domain tests for the core transitions and validation rules.
4. Add responsive empty, loading, error and success states; document all demo-only behavior.
5. Add a README explaining the app, intended user, local run steps and three useful coding-agent prompts.

## Acceptance criteria
- The primary workflow can be completed with seeded local data.
- The interface has distinct, category-appropriate information architecture rather than a generic dashboard template.
- Core actions produce visible state changes and handle invalid or empty input.
- No paid API key or external account is required for the demo.
- Domain behavior is covered by focused tests and the README documents limitations.

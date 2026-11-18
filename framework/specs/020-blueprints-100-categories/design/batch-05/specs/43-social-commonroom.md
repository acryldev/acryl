# 43. Commonroom

**Category:** Social software  
**Blueprint ID:** `acrylblends.social.commonroom`  
**Mockup:** `mockups/43-social-commonroom.html`

## Product purpose
A focused community product for sharing posts, discovering topic spaces, finding discussions and reacting to member contributions.

## Primary audience
Small professional or interest-based communities

## UX direction
Community feed with space navigation, inline post composer, Latest/Popular/Following tabs and a compact discovery sidebar.

## Primary data model
Member, Space, Membership, Post, Reaction, Reply, Topic, FeedPreference

## Core user flows
Compose a post; publish to the feed; like/unlike a post; switch feed tabs; search visible discussions.

## Implementation constraints and boundaries
Demo members and content are fictional. No private messaging, dating, livestreaming or real identity verification is included. Production needs moderation, reporting, blocking, abuse controls, consent and privacy settings.

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

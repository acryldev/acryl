# Deep Seek Harness: An Append-Only Design for Agent Frameworks

## Core Rule and Its Impact 📜

The fundamental rule: once something is sent to the model, it is never changed.

History is append-only; wrong entries remain with appended corrections.

This rule underpins all design choices and results in massive cost savings (120x on Deep Seek's price list).

## Architecture and Design Principles ⚙️

### Harness Concept

The harness wraps a language model and manages state, tools, loops, permissions, and conversation summarizing.

Language models themselves are stateless — text in, text out, no memory.

The harness reconstructs conversation context on each step by replaying an append-only log.

### Prefix Caching and Cost Efficiency

Providers use prefix caching: identical initial tokens in consecutive requests are not reprocessed.

Any change invalidates the cache beyond that point, increasing costs dramatically.

Deep Seek quantifies caching cost: cached tokens cost roughly 1/120th of uncached tokens.

### Append-Only Log Model

Conversation history is an immutable log of typed events (user messages, assistant replies, tool results).

Messages are derived via pure functions from the log; no direct editing or replacements allowed.

Model visible data must be reconstructible solely from this immutable log.

## Handling Changes and Summarization 🔄

### Modifications via Append-Only Events

Corrections or trimmed outputs are added as new events; the original log remains untouched.

This approach enforces stability of the prefix cache and maintains cost efficiency.

### Summarization Strategy

Summarization calls are expensive due to reprocessing history twice.

Deep Seek innovated by moving summarization instructions to the end of the request.

This preserves prefix cache state and dramatically reduces token processing costs.

### Guardrails and Integrity Checks

A separate validation module reconstructs each session from the log fresh and compares with live cache output.

This ensures that the live cache cannot self-validate and guards against divergence errors.

## Modular Plug-in Framework and Agent Presets 🧩

### Plug-in Architecture

Every capability (adapter, tool, shell, scheduler, summarizer) is a swappable plug-in.

Core agent loop itself is configurable and replaceable without source code changes.

The framework Cordis supports safe runtime module unloading, ensuring no leftover state or leaks.

### Four Agent Presets

Standard Mode: Full coding agent with many tools and workflows; baseline.

Programmatic Tool Calling: Model generates code to call multiple tools concurrently, reducing context size.

Minimal Mode: Only persistent shell and editor tools; used as a controlled environment for reinforcement learning training.

Creation Mode: Allows model to read and modify the harness code dynamically; used to write new agents.

### Cross-Model Sub-Agent Registry

Supports back-ends like Claude Code and Codex, calling official vendor kits directly.

Enables chaining agents across different model providers in isolated, self-contained processes.

## Development Process and Documentation 📚

### Extensive Design Memos

683 memos documenting every decision, alternative considered, rejection, and archival status.

Strict rules enforce adding or updating memos on any non-trivial code change.

Helps prevent re-litigation of decisions and preserves institutional knowledge.

### Postmortems and Incident Tracing

Bugs and incidents are documented with detailed traces tied to event sequence numbers in the append-only log.

Example: agent modifying its own interface led to multi-server confusion, but the logs made the failure fully diagnosable.

## Broader Significance and Industry Implications 🌍

### Harness as the Product

The harness wrapper affects performance more than the model weights themselves.

Open sourcing the harness gives insight into architecture more than just model code.

### Economic and Business Model Alignment

Token pricing changes amplify value of cost-saving prefix caching.

Deep Seek’s append-only design is key to controlling cloud expenses and sustaining agent use.

### Predictions and Industry Influence

By next year, major agent frameworks will adopt append-only or prefix-preserving history models.

The environment used to train models is increasingly the environment provided to users.

Raises questions on mutual optimization between model and harness.

## Conclusion and Recommendations ✅

Designers should adopt append-only, prefix-preserving history handling early.

Deep Seek Harness, though early (v0.1), offers valuable architectural lessons.

Reading and understanding Deep Seek’s reconstructible request note is strongly advised.

The harness is as important as the underlying model for agent effectiveness and cost control.


# **Deep Seek Harness: An Append-Only Agent Framework Revolutionizing AI Interaction** 

Deep Seek has open-sourced **Deep Seek Harness** , a novel AI agent framework with a foundational rule: once a message or event is sent to the model, it is never edited afterward. Instead, all changes append to an immutable log. This design maximizes **cache efficiency** , dramatically reducing token processing costs, and offers strong guarantees about session reproducibility and plugin safety. This video unpacks the technical design, modular architecture, and the cascading impact of this append-only approach on AI agent frameworks and business models. 

## **1. Append-Only Log and Cache Stability [00:00:00]** 

At the core of Deep Seek Harness is a **strict rule forbidding edits to any message or event once sent** . Instead, corrections append as new events, preserving the full history unchanged. This append-only event log contrasts with traditional mutable message arrays common in agent frameworks. 

• The harness derives the conversation state **fresh on every step by folding a pure function over these logged events** . 

• Because the underlying model is stateless and forgets history instantly, the harness maintains all loop mechanics — summaries, tool interactions, permission checks. 

• This design prevents any secondary source of truth, eliminating drift risks between message state and the log. 

• A key **design test** is that anyone handed the log and code can **rebuild every request identically, byte-for-byte** . 

### **Cache Efficiency and Token Pricing [00:01:57]** 

• Models process all tokens from the start in each call; no skipping allowed (order defines meaning). 

• **Prefix caching** is vital: if a request’s start matches a previously cached token sequence **wordfor-word** , the model resumes reading from the cache bookmark instead of reprocessing. 

• Deep Seek reports token prices explicitly showing a 120x cost difference: 

- The **append-only design is essential to this cache stability** ; any change to previous messages invalidates the bookmark, forcing costly reprocessing. 

## **2. Handling History and Summarization Without Breaking the Cache [00:06:46]** 

Long conversations exceed model token limits, requiring compaction via summarization, which typically breaks caching due to prepended new system prompts. 

• The team first used a summarizer call with a fresh system prompt at the front, invalidating the cache and doubling token cost. 

• The fix was **to move the summarizer’s instruction to the end as an appended event** , preserving the initial prefixes word-for-word, thus keeping the cached bookmark valid. 

• Summaries are logged as new events, continuing the conversation without disturbing history. 

• The summarizer still sends the full tool definitions (even if unused) **to keep token alignment perfect** , preventing cache invalidation. 

## **3. Modular, Plugin-Driven Architecture [00:09:06]** 

Deep Seek Harness treats **every capability as a swappable plugin** , from the language model adapter and tool registry to file systems, sandboxes, shells, schedulers, GUI, and the agent loop itself. 

• This modularity is safely supported by the append-only log, ensuring **unloading a component leaves no residual side effects** . 

• The underpinning framework, **Cordis** , is an older chatbot plugin framework from 2022 with roots in a Chinese bot ecosystem. 

- Cordis enforces **"revertible effects"** — every effect returns an inverse to allow complete undo, and **"reactive co-effects"** , notifying components of environment changes. 

• Deep Seek copied Cordis into their repo, renaming it and fixing lifecycle bugs related to plugin unloading under load, reflecting production rigor. 

## **4. Preset Modes for Different Use Cases [00:12:00]** 

Deep Seek shipped four agent presets (“animals in the same skin”) illustrating their modular approach: 

• The **programmatic tool calling** preset is notable: it gives the model a TypeScript API to write programs directly, allowing parallel I/O and minimal token cost, unlike the typical token-heavy round trips. 

## **5. Agent Interoperability and Official Integrations [00:15:25]** 

Deep Seek supports sub-agent backends, including: 

- **Claude Code** (Anthropic’s agent kit) 

- **Codex** (OpenAI’s code model) 

These backends are **official integrations** invoking vendor SDKs or apps, not hacks or reverseengineered protocols. This ensures tool, approval, and cleanup guarantees. 

## **6. Engineering Discipline: Design Notes as First-Class Artifacts [00:16:22]** 

- The repository contains **683 design "notes" in English and Chinese** , structured as: 

   - Proposed (work to be done) 

   - Implemented (shipped) 

   - Rejected (discarded proposals) 

   - Archived (obsolete reasoning) 

• Every non-trivial code change must update a note, including alternatives considered ("what it beat"), preventing re-litigation of decisions. 

• Mechanical edits are exempt; scripts enforce note-folder consistency and freeze archived notes. 

- Postmortems analyze production bugs and failures. 

• One example shows an agent mistakenly validating a restarted dev server on the wrong port — logged end-to-end, showcasing how the append-only log aids debugging. 

## **7. Industry and Business Implications [00:19:15]** 

• The harness shapes performance almost as much as the model: a benchmark shows Claude Code vs. Terminus 2 harness on the same model differ by 3.5 points. 

• Deep Seek open-sourced version 0.1 as a **developer preview** , promising breaking changes and incomplete cross-platform support. 

• Their pricing recently introduced peak/off-peak fees that raise uncached input costs dramatically ($0.435 to $1.32+), while cached input remains very cheap, doubling down on the business model viable only with a stable append-only harness. 

- The video predicts **append-only or prefix-preserving history models will become industry standards by next year** across various major agent frameworks. 

## **8. Fundamental Question: Who Is Being Optimized For? [00:21:12]** 

The environment used for training the model is now the _exact_ same environment handed to users. 

• This provokes a key query: **Is the harness optimized for the model or for the human user?** 

- Since the model “learns” the harness’s shape deeply, how much does the harness itself evolve or adapt back from usage feedback? 

# **Summary of Key Insights** 

• **Append-only event logs enable immutable history, pure function derivation of conversation states, and full reproductibility of agent requests.** 

• **Prefix caching depends critically on never editing previously sent tokens, yielding up to 120x cost savings per token.** 

• Summarization and history compaction work without invalidating cache by appending instructions and summaries rather than rewriting history. 

- The **entire agent stack is modular and plugin-based, backed by the Cordis framework’s formal revertible effect system.** 

• Four presets balance between full feature coding agents, efficient programmatic calls, controlled training environments, and agent self-modification. 

• Official integration with other agents (Claude Code, Codex) respects product boundaries and ensures cleanup. 

- Rigorous decision notes and enforced documentation prevent design drift and preserve institutional knowledge. 

• The harness architecture deeply influences cost, performance, and developer productivity, often more than the model itself. 

• Economic model changes simultaneously make cached tokens cheaper and uncached tokens more expensive, highlighting the harness’s critical role. 

- Industry adoption of append-only and prefix-preserving models is imminent. 

- The model and harness codesign raises philosophical questions around optimization targets. 

# **Timeline Table of Core Events & Releases** 

This deep technical and architectural overview reveals that **Deep Seek Harness is much more than a software wrapper: it is a meticulously engineered product aiming to reshape how AI agents maintain history, achieve cost efficiency, and enable safe modularity — a new frontier for agent design and deployment.** 


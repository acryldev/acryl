# Spec 057 tasks

Every idea from the owner's inbox of 2026-11-24 is here, once. Status: `idea` (not picked), `picked` (the owner chose it; it gets its own spec or
moves into the named spec), `mockup` (its design file exists), `building`, `done`.

Licenses were read from GitHub on 2026-11-26. Stars are GitHub's count that day, a rough measure of interest only.

## How one idea moves (every task follows these steps)

1. **Mockup**: a Lavish file in `design/`, with every state, before any code (owner rule 2026-11-03: UI is accepted against a mockup).
2. **Decision**: the owner picks it, changes it or drops it.
3. **Spec**: a new spec folder, or tasks added to the related spec named in the row.
4. **Build**: Cordis plugins first (one capability, one plugin), then the Blend that mounts them; an open-source source keeps its copyright and
   NOTICE files.
5. **Proof**: one real run of the user-visible feature (owner rule 2026-11-17: real features, one real proof each), with screenshots.

## Setup

- [ ] T001 Keep this list current: a new idea in the owner's inbox becomes a row here, the inbox line is marked "moved to 057 T0xx".
- [ ] T002 A license check script `specs/057-acryl-blends-plugins-features-ideas/check-licenses.mjs` that reads every `github.com/...` source in
  this file and fails when a license changed or is not MIT, Apache-2.0 or BSD for a row marked as a source.

## A. ACRYL features (T010-T049)

### ACRYL Durable: sessions that keep running, many people attached

- [ ] T010 Study Pi Durable's code (`earendil-works/pi`, `packages/durable`, MIT, 124k stars): its storage adapter, phases, signals, replay contract
  and document patches. Write `research-pi-durable.md`: what ACRYL takes as a dependency, what it ports, what it already has (Cordis effects, DSH
  sessions, spec 011 checkpoints, spec 012 continuous mode).
- [x] T011 Mockup `design/acryl-durable.html`: one Blend running in a box, three people attached from desktop, web and Telegram, presence, a crash
  and resume, a parked task, a fork.
- [ ] T012 Cordis mini-design (the six questions in CLAUDE.md): a `durable` service with storage providers (local file, WebBoxes volume, later
  SQLite or Postgres), how tools declare replay safety, what is durable session state and what is not.
- [ ] T013 Spike: one Blend whose agent turn survives `kill -9` of the box process mid tool call and resumes on restart, proven on the z370n test
  box.
- [ ] T014 Persistent objects: typed versioned JSON documents with patches (RFC 6902), rewind to any version, and live updates to every attached
  client. One example: a shared task list two people edit at once.
- [ ] T015 Attach: any signed-in member of the app opens the same running session from desktop, web or CLI; presence (who is here), and roles
  owner, editor, viewer. Builds on WebBoxes sign-in and spec 055's invite.
- [ ] T016 Parked tasks: a task waits for a time or a signal with no process running (a reminder, a reply from Telegram), with idempotent delivery.
- [ ] T017 Forks: branch a conversation at a turn, as a frozen copy or sharing live documents; ties into spec 055 History and branches.
- [ ] T018 Self-improvement: a durable task where the app's agent reviews usage and failed turns, proposes a change as a version, and an owner
  accepts or rejects it. Never applies by itself.
- [ ] T019 Proof: two people on two machines edit the same Blend in one box, the box restarts, both reconnect and see the same state.

### Blends working together

- [ ] T020 Blends calling Blends: one Blend calls another's published action (for example the video editor asks the voice studio to clean audio).
  Design the contract: discovery, permission, the call, the result.
- [ ] T021 Pipelines: a workflow of several Blends in order, built on T020 and the Workflow Automation Blend.
- [ ] T022 Mockup and proof of one pipeline: record, clean audio, cut, captions, post.

### Acrylify: any open-source project becomes a Blend

- [ ] T025 Mockup: paste a git URL, see its license, its features, and the proposed Cordis plugins, then a plan.
- [ ] T026 Design: how the agent splits a project into Cordis plugins (one capability, one plugin), what it refuses (AGPL, no license), and how the
  copyright and NOTICE travel with the code.
- [ ] T027 A Blend template `acrylify` that runs the plan on a URL and makes a working Blend, checked against the original's behavior (the idea in
  `erkamyaman/rust-anything`, Apache-2.0: rewrite piece by piece, checked against recorded behavior).
- [ ] T028 Proof: Acrylify one small MIT project end to end.

### Platform

- [ ] T030 MCP servers and skills, properly: add an MCP server or a skill pack to a Blend from Settings, with its tools listed and switchable.
- [ ] T031 Software factories and profiles modes: move into spec 045 (software factory), as its next tasks.
- [ ] T032 Reduce size: reuse every repeated part between Blends to the maximum; move into spec 052 (the shared install) as a measured task (size of
  N Blends before and after).

## B. Cordis plugin ideas (T050-T079)

### Remote sessions from the phone

- [x] T050 Mockup `design/connect-telegram.html`: pair a Blend with a Telegram chat, talk to its agent, approve a risky step, get the result.
- [ ] T051 `acryl-connect-telegram`: a Cordis plugin that links one Blend session to one Telegram chat with a bot token the owner creates
  (BotFather), a pairing code shown in the app, and an allow-list of Telegram users. Messages go in as turns; the agent's replies, files and
  approval questions come back. Needs ACRYL Durable (T016) so a reply hours later still lands.
- [ ] T052 `acryl-connect-whatsapp`: the same through the WhatsApp Business Cloud API (needs a Meta business account and a phone number).
- [ ] T053 More channels on the same contract: Slack, Discord, email. One channel interface, one plugin each.
- [ ] T054 Mobile remote control of a desktop session: `ccch1mneyyy/dsh-Go` (AGPL-3.0) is reference only. Our path is spec 054 plus T051.

### Models

- [ ] T060 Model router plugin from `cheaper-inference/OmniRoute` (MIT, 90k stars): one endpoint for many providers with quota-aware fallback.
- [ ] T061 `Ebony-Vinyl/dsh-our-free-model` (free models in DSH): no license file (GitHub NOASSERTION). Owner decision before any use.

### Tools for agents

- [ ] T065 Browse and scrape tools: `unclecode/crawl4AI` (Apache-2.0, 88k), `browser-use/browser-use` (MIT, 122k), `Panniantong/agent-reach` (MIT,
  115k). `firecrawl/firecrawl` is AGPL-3.0: reference only.
- [ ] T066 Skill packs as plugins: `obra/superpowers` (MIT, 327k), `mattpocock/skills` (MIT, 333k), `mvanhorn/last30days-skill` (MIT, 75k),
  `cloudflare/security-audit-skill` (MIT, 78k), `elementalsouls/Claude-BugHunter` (MIT, 23k), `nutlope/hallmark` (MIT, 61k, anti-slop design).
  Also to look at, from the inbox: the ai.dosa.dev listings for taste-skill alternatives, pieces-for-developers and agenttrace (not checked yet).
- [ ] T067 Codebase maps: `Graphify-Labs/graphify` (Apache-2.0, 153k), `DeusData/codebase-memory-mcp` (MIT, 49k), `tt-a1i/archify` (Apache-2.0,
  100k: any idea or codebase as an interactive diagram).

## C. Blend ideas (T080-T139)

Category is the Blends store category (the repository number prefix follows it). "Source" is the project it starts from; none means built new.

| Task | Blend | Category | Source (license, stars) | Status |
| --- | --- | --- | --- | --- |
| T080 | **AI video editor** ("Tyler" in the example): transcript, captions, clean cut, podcast-grade sound, music and sound effects, video effects, stock footage, 3D animation, image and video generation, any input (file, YouTube link, MP3), post text, thumbnails and 2-10 shorts per video, knows the brand and pricing | media | HyperFrames for the video side, `heygen-com/hyperframes` (Apache-2.0, 90k) | done: v0.1.0, `acrylblends/13-content-machine`, store Media > Content creation (2026-11-26) |
| T081 | Video animation with code | media | `heygen-com/hyperframes` (Apache-2.0, 90k) | idea |
| T082 | Media manager, a content machine: one recording in, a month of posts out | media | none | merged into T080 (the same app: ACRYL Content Machine) |
| T083 | Voice studio and voice processor | media | `jamiepine/voicebox` (MIT, 61k); `debpalash/VoiceStudio` is AGPL-3.0, reference only | idea |
| T084 | Music editor, live concert processor | media | none | idea |
| T085 | Virtual company: media person (T080), then finance, lawyer, developer, as Blends that call each other (T020) | business | none | idea |
| T086 | Accounting | business | none | idea |
| T087 | Legal | business | none | idea |
| T088 | 3D space and architecture | 3d-cad-design | `tangency-labs/solidcraft` (Apache-2.0, Rust, 18k) | idea |
| T089 | Design studio, an open alternative to AI design tools | 3d-cad-design | `nexu-io/open-design` (Apache-2.0, 110k) with `nutlope/hallmark` (MIT) | idea |
| T090 | Reverse Engineer Anything | developer | `morluto/rea` (MIT, 479k) | idea |
| T091 | RAG made easy | ai | `infiniflow/ragflow` (Apache-2.0, 95k) | idea |
| T092 | Train an LLM from scratch (64M parameters in about 2 hours) | ai | `jingyaogong/minimind` (Apache-2.0, 71k) | idea |
| T093 | Voice sales representative: takes the incoming call and does the actions | business | none | idea |
| T094 | Sales agent: proposals, cold contacts | business | none | idea |
| T095 | Language speaking trainer with a digital avatar | education | none | idea |
| T096 | Council of agents | ai | `chain-ml/council` (Apache-2.0, 0.9k) | idea |
| T097 | Multi-harness agent workspace for teams | ai | `mdiri-ai/SoduWork` (MIT, 8k); `multica-ai/multica` has custom terms on Apache-2.0: owner decision. Overlaps ACRYL ADE: compare first | idea |
| T098 | Long-horizon research agent | ai | `bytedance/deer-flow` (MIT, 86k); `significant-gravitas/autogpt` only outside `autogpt_platform/` (MIT there, Polyform Shield inside) | idea |
| T099 | Trending radar ("HypeRadar"): what is rising this month | analytics | `mvanhorn/last30days-skill` (MIT); data from ossinsight.io trending | idea |
| T100 | Agents at work: approvals, budgets, projects | business | `paperclipai/paperclip` (MIT, 117k) | idea |
| T101 | Multi-chat bot | ai | `milind-soni/OpenMausBot` (Apache-2.0, 28k) | idea |
| T102 | Security audit and pentest | cybersecurity | skills from T066; `BaaRai/ARTEX` is AGPL-3.0, reference only | idea |
| T103 | Learn by doing: follow an agent as it builds, understand any software | education | `storytold/craft-anything` (Apache-2.0, 44k) | idea |
| T104 | Rewrite in Rust, piece by piece | developer | `erkamyaman/rust-anything` (Apache-2.0, 10k) | idea |
| T105 | Project backlog in markdown | productivity | `MrLesk/Backlog.md` (MIT, 7k) and `MrLesk/Groma.md` (MIT) | idea |
| T106 | Automation like n8n | automation | `activepieces/activepieces`, only outside `packages/ee/` and `packages/server/api/src/app/ee` (MIT there). Overlaps the Workflow Automation Blend: extend it rather than a second one | idea |
| T107 | Human and agent team board | business | `multica-ai/multica` (custom terms, see T097) | idea |

## T080 as built (2026-11-26)

ACRYL Content Machine, `acrylblends/13-content-machine` (v0.1.0), in the store at Media > Content creation. Thirteen Cordis plugins: `content`
(the domain and a feature registry the screen, the API and the agent all read), one plugin per step (`content-ingest`, `content-transcribe`,
`content-cut`, `content-sound`, `content-music`, `content-visuals`, `content-shorts`, `content-thumbnail`, `content-posts`), `content-api`,
`content-studio` (React) and `content-tools` (ten `content_*` tools for the ACRYL agent).

Proven on a 53.7 s sample recording made with `scripts/make-sample.mjs` (fillers, a sentence said twice, long pauses): 4 fillers, 5 pauses and
the earlier take found, cut to 42.6 s; the sound at -16 LUFS; captions, title card and progress bar drawn by HyperFrames; one vertical short,
a thumbnail, and posts written by DeepSeek; all steps in 62 s (`scripts/e2e.ts`). In the ACRYL frame, the chat (DeepSeek) listed the
projects, switched the captions to karaoke, and re-rendered the finished video through the tools. 20 tests.

Not proven: transcription through a speech-to-text API. The stored OpenAI and z.ai accounts have no credit and OrcaRouter has no speech
model, so the proof imported the sample's exact word times; the API path is written against OpenAI's documented `verbose_json` shape and
its parsing is tested. Owner action: a speech-to-text key with credit, set in the app's Settings.

## Sources not usable as code (reference only)

`firecrawl/firecrawl`, `debpalash/VoiceStudio`, `BaaRai/ARTEX`, `ccch1mneyyy/dsh-Go`: AGPL-3.0. `Ebony-Vinyl/dsh-our-free-model`: no license.

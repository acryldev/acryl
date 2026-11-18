# 020 - Tasks

One task per category, in the site's order (`src/lib/content.ts` in acrylblends.github.io). Each task is one blueprint that meets "Done for one
blueprint" in spec.md. The idea is a starting point: a builder may pick a better one inside the same category and records why in the task line.
Ten tasks make one batch, and one batch is one cloud-agent session (cloud-brief.md).

Format: `T<nnn> [B<batch>] <category> (subcategories) - acrylblends.<name>: <the app>`.

## Setup (done by the coordinator before batch 1)

- [x] T000 The registry path works end to end with one real blueprint: `acrylblends.system-monitor` made, published to
  `registry/blends/` in acrylblends.github.io with `make-entry.mjs`, `index.json` regenerated, and started again with
  `npm create acrylblends@latest t -- --from acrylblends.system-monitor --registry <checkout>`. The steps that worked go into cloud-brief.md. (Done 2026-11-04: site branch `blueprints/batch-01`; the brief is the steps as run.)


## Batch 1 (categories 1-10)

- [x] T001 [B01] System (`system`: Operating systems, Kernels, Device drivers, Firmware, Boot software, System utilities) - `acrylblends.system-monitor`: System Monitor: this machine's processes, memory and disk, refreshed live, with a kill-list of the heaviest
- [x] T002 [B01] Application (`application`: Productivity, Personal information management, Communication, Collaboration) - `acrylblends.productivity-hub`: Productivity Hub: notes, tasks and a week calendar on one page
- [ ] T003 [B01] Business (`business`: ERP, CRM, Finance, Payments, HR, Project management, Procurement, Operations) - `acrylblends.small-crm`: Small CRM: contacts, companies and a drag-and-drop deals pipeline
- [ ] T004 [B01] Developer (`developer`: Code editors, IDEs, Version control, Build tools, Language tooling, Dependency management, Testing, API development, Developer collaboration) - `acrylblends.snippets`: Snippet Manager: code snippets with tags, syntax highlighting and search
- [ ] T005 [B01] AI (`ai`: AI assistants, AI agents, Agent infrastructure, Machine learning software, Generative AI, AI infrastructure, AI safety) - `acrylblends.prompt-lab`: Prompt Lab: a prompt library with variables, run on the configured model, results kept side by side
- [ ] T006 [B01] Data (`data`: Databases, Data engineering, Data platforms, Data governance) - `acrylblends.csv-explorer`: CSV Explorer: import a CSV, filter and sort it, chart a column
- [ ] T007 [B01] Analytics (`analytics`: Business intelligence, Data science, Product analytics, Web analytics, Observability analytics) - `acrylblends.web-analytics`: Web Analytics: a tracking snippet, page-view events in, a daily dashboard out
- [ ] T008 [B01] Cloud (`cloud`: Cloud infrastructure, Cloud management, Container infrastructure, Cloud platforms) - `acrylblends.cloud-costs`: Cloud Costs: monthly spend per provider and service from CSV exports, with budget alerts
- [ ] T009 [B01] DevOps (`devops`: CI/CD, Infrastructure automation, Observability, Reliability) - `acrylblends.deploy-board`: Deploy Board: a log of deploys per service and an incident board with status and timeline
- [ ] T010 [B01] Networking (`networking`: Network infrastructure, Network services, Network management) - `acrylblends.uptime`: Uptime Checker: hosts and URLs checked on a schedule, status history and response times

## Batch 2 (categories 11-20)

- [ ] T011 [B02] Cybersecurity (`cybersecurity`: Endpoint security, Network security, Identity security, Application security, Cloud security, Security operations, Privacy) - `acrylblends.vuln-tracker`: Vulnerability Tracker: assets, CVEs per asset, severity and fix status
- [ ] T012 [B02] Internet (`internet`: Browsers, Search, Web servers, Internet publishing) - `acrylblends.link-shortener`: Link Shortener: short links with click counts per day and referrer
- [ ] T013 [B02] Media (`media`: Graphics, Video, Audio, Music, Plugins) - `acrylblends.photo-gallery`: Photo Gallery: albums, uploads, thumbnails and a lightbox
- [ ] T014 [B02] 3D / CAD / Design (`3d-cad-design`: CAD, 3D, BIM, CAM, CAE) - `acrylblends.moodboard`: Moodboard: a canvas of images, colours and notes for a design project
- [ ] T015 [B02] Scientific & Engineering (`scientific-engineering`: Mathematics, Statistics, Science, Engineering) - `acrylblends.lab-notebook`: Lab Notebook: experiments with entries, measurements and a unit converter
- [ ] T016 [B02] Industrial (`industrial`: Manufacturing, Industrial control, Digital twins) - `acrylblends.maintenance-log`: Maintenance Log: machines, scheduled maintenance, breakdowns and downtime totals
- [ ] T017 [B02] Robotics (`robotics`: Robot operating systems, Motion planning, Navigation, SLAM, Computer vision) - `acrylblends.robot-missions`: Robot Missions: a grid map, waypoints per robot and a simulated run
- [ ] T018 [B02] Embedded / IoT (`embedded-iot`: IoT platforms, Smart devices) - `acrylblends.sensor-dashboard`: Sensor Dashboard: devices post readings over HTTP, live charts and thresholds
- [ ] T019 [B02] Automotive (`automotive`: Infotainment, Navigation, ADAS, Autonomous driving, Vehicle operating systems) - `acrylblends.vehicle-log`: Vehicle Log: service history, fuel, costs per km and reminders
- [ ] T020 [B02] Aerospace / Aviation (`aerospace-aviation`: Flight control, Avionics, Navigation, Air traffic control, Mission control) - `acrylblends.flight-logbook`: Flight Logbook: flights, aircraft, hours per type and currency checks

## Batch 3 (categories 21-30)

- [ ] T021 [B03] Geographic (`geographic`: GIS, Navigation, Remote sensing) - `acrylblends.places-map`: Places Map: places with categories and notes on an OpenStreetMap map
- [ ] T022 [B03] Education (`education`: Learning management systems, Course platforms, Virtual classrooms, Assessment tools) - `acrylblends.flashcards`: Flashcards: decks and spaced-repetition review
- [ ] T023 [B03] Healthcare (`healthcare`: Clinical, Patient software, Medical devices) - `acrylblends.clinic-booking`: Clinic Booking: practitioners, slots and appointments (sample data only)
- [ ] T024 [B03] Finance & Fintech (`finance-fintech`: Banking, Trading, Fintech, Crypto) - `acrylblends.budget`: Budget: accounts, expenses by category, monthly budget and charts
- [ ] T025 [B03] Legal (`legal`: Legal research, Case management, Contract lifecycle management, Compliance) - `acrylblends.matters`: Matters: legal matters, deadlines, documents and a clause library
- [ ] T026 [B03] Government / Public Sector (`government-public-sector`: Tax administration, Identity systems, E-government portals, Public records) - `acrylblends.citizen-requests`: Citizen Requests: residents report issues, staff triage, a public status page
- [ ] T027 [B03] Military / Defense (`military-defense`: Command and control, Intelligence systems, Battlefield management, Simulation) - `acrylblends.training-roster`: Training Roster: units, training schedule and readiness per person (non-operational)
- [ ] T028 [B03] Retail (`retail`: Point-of-sale, Inventory, Store management, Retail analytics) - `acrylblends.pos`: Point of Sale: products, a till screen, receipts and stock decrement
- [ ] T029 [B03] E-commerce (`e-commerce`: Online stores, Marketplaces, Order management, Headless commerce) - `acrylblends.shop`: Shop: catalogue, cart and checkout in test mode, with orders
- [ ] T030 [B03] Marketing (`marketing`: MarTech, Advertising, SEO) - `acrylblends.content-calendar`: Content Calendar: campaigns, posts per channel and a month view

## Batch 4 (categories 31-40)

- [ ] T031 [B04] Sales (`sales`: CRM, Sales engagement, Lead generation, Sales intelligence) - `acrylblends.quotes`: Quote Builder: products, quotes with discounts and a printable PDF view
- [ ] T032 [B04] Customer Service (`customer-service`: Help desks, Ticketing, Live chat, Contact centers) - `acrylblends.helpdesk`: Helpdesk: tickets by email-style form, assignment, status and replies
- [ ] T033 [B04] Logistics (`logistics`: Transportation management, Warehouse management, Fleet management, Route optimization) - `acrylblends.shipments`: Shipments: shipments, carriers, tracking events and a status board
- [ ] T034 [B04] Travel (`travel`: Booking engines, Hotel management, Airline reservation systems, Travel planning) - `acrylblends.trip-planner`: Trip Planner: trips with days, places, bookings and a packing list
- [ ] T035 [B04] Hospitality (`hospitality`: Hotel PMS, Restaurant POS, Reservation systems, Guest management) - `acrylblends.reservations`: Reservations: tables, time slots and bookings with a floor view
- [ ] T036 [B04] Real Estate (`real-estate`: Property management, Real-estate CRM, Listing platforms, Mortgage software) - `acrylblends.listings`: Listings: properties with photos, filters and enquiries
- [ ] T037 [B04] Architecture / Construction (`architecture-construction`: BIM, CAD, Construction project management, Estimation) - `acrylblends.site-diary`: Site Diary: daily site log, punch list items with photos and owners
- [ ] T038 [B04] Agriculture (`agriculture`: Farm management, Precision agriculture, Crop monitoring, Yield prediction) - `acrylblends.field-planner`: Field Planner: fields, crops per season, tasks and yields
- [ ] T039 [B04] Energy (`energy`: Grid management, Smart grid, Energy trading, EV charging) - `acrylblends.energy-tracker`: Energy Tracker: meter readings, usage per day and cost
- [ ] T040 [B04] Telecom (`telecom`: OSS/BSS, Billing, Network management, 5G core) - `acrylblends.sim-inventory`: SIM Inventory: numbers, plans, assigned people and monthly cost

## Batch 5 (categories 41-50)

- [ ] T041 [B05] Gaming (`gaming`: Games, Game development, Gaming platforms) - `acrylblends.tournaments`: Tournaments: players, brackets and a leaderboard
- [ ] T042 [B05] Entertainment (`entertainment`: Streaming platforms, Music streaming, Video streaming, Media centers) - `acrylblends.event-tickets`: Event Tickets: events, ticket types, sales and check-in by code
- [ ] T043 [B05] Social (`social`: Social networks, Forums, Communities, Livestreaming) - `acrylblends.forum`: Forum: boards, threads, replies and moderation
- [ ] T044 [B05] Creator (`creator`: Content creation, Newsletter platforms, Podcasting, Creator monetization) - `acrylblends.link-in-bio`: Link in Bio: a creator's page of links and products, with click stats
- [ ] T045 [B05] Publishing (`publishing`: Desktop publishing, Typesetting, E-book production, Editorial workflow) - `acrylblends.blog`: Blog: posts with drafts, tags, RSS and an editor
- [ ] T046 [B05] Office Automation (`office-automation`: Document generation, Mail merge, RPA, E-signatures) - `acrylblends.form-builder`: Form Builder: build forms, collect submissions, export CSV
- [ ] T047 [B05] Low-code / No-code (`low-code-no-code`: App builders, Website builders, Workflow builders, AI app builders) - `acrylblends.table-builder`: Table Builder: user-defined tables, fields and views, like a tiny Airtable
- [ ] T048 [B05] Automation (`automation`: RPA, Workflow automation, Browser automation) - `acrylblends.rules`: Rules: webhook in, if-this-then-that rules, actions out, with a run log
- [ ] T049 [B05] Search & Retrieval (`search-retrieval`: Search engines, Enterprise search, Semantic search, Vector search) - `acrylblends.doc-search`: Doc Search: upload documents and search their full text
- [ ] T050 [B05] Knowledge (`knowledge`: Wikis, Knowledge bases, Knowledge graphs, Reference managers) - `acrylblends.wiki`: Wiki: pages in Markdown with backlinks and history

## Batch 6 (categories 51-60)

- [ ] T051 [B06] Simulation (`simulation`: Physics simulation, Digital twins, Flight simulators, Business simulation) - `acrylblends.queue-sim`: Queue Simulator: arrivals, servers and wait times, charted over a run
- [ ] T052 [B06] Virtualization (`virtualization`: Hypervisors, Virtual machines, Desktop virtualization, Storage virtualization) - `acrylblends.vm-inventory`: VM Inventory: hosts, VMs and containers with owners and state
- [ ] T053 [B06] Remote Computing (`remote-computing`: Remote desktop, SSH clients, VDI, Remote development) - `acrylblends.ssh-bookmarks`: Remote Hosts: host bookmarks, connection notes and a session log
- [ ] T054 [B06] Storage (`storage`: File systems, Object storage, Backup, Synchronization) - `acrylblends.file-drop`: File Drop: upload files, share links that expire, quotas
- [ ] T055 [B06] Distributed Systems (`distributed-systems`: Cluster management, Distributed coordination, Distributed databases, Message brokers) - `acrylblends.job-queue`: Job Queue: a queue with workers, retries and a dashboard
- [ ] T056 [B06] Messaging Infrastructure (`messaging-infrastructure`: Message queues, Event buses, Pub/sub, Webhooks) - `acrylblends.pubsub`: Pub/Sub Inspector: topics, publish, subscribe and a live message view
- [ ] T057 [B06] Middleware (`middleware`: Application servers, RPC frameworks, API gateways, Integration middleware) - `acrylblends.api-gateway`: API Gateway: routes to upstreams with rate limits and request logs
- [ ] T058 [B06] Runtime (`runtime`: Language runtimes, JavaScript runtimes, WebAssembly runtimes, Container runtimes) - `acrylblends.script-runner`: Script Runner: small scripts run on a schedule in a sandbox, with logs
- [ ] T059 [B06] Libraries & Frameworks (`libraries-frameworks`: Libraries, Frameworks) - `acrylblends.component-gallery`: Component Gallery: the app's components with states and code
- [ ] T060 [B06] API / SDK (`api-sdk`: SDKs, API clients, Platform SDKs, AI SDKs) - `acrylblends.api-mock`: API Mock: define endpoints and responses, serve them, with generated docs

## Batch 7 (categories 61-70)

- [ ] T061 [B07] Integration (`integration`: iPaaS, ETL, API integration, Connectors) - `acrylblends.data-sync`: Data Sync: map fields between two JSON APIs and sync on demand
- [ ] T062 [B07] Mobile (`mobile`: Native apps, Hybrid apps, Progressive web apps, Mobile games) - `acrylblends.habit-tracker`: Habit Tracker: an installable PWA with daily habits and streaks
- [ ] T063 [B07] Desktop (`desktop`: Native desktop apps, Electron apps, Tauri apps, Qt apps) - `acrylblends.desk-notes`: Desk Notes: a desktop app (--desktop) for quick notes and a clipboard history
- [ ] T064 [B07] Web (`web`: Websites, Web apps, SaaS apps, Browser extensions) - `acrylblends.landing-builder`: Landing Builder: sections to compose a landing page, published by the app
- [ ] T065 [B07] Terminal (`terminal`: Shells, Terminal emulators, CLI tools, TUIs) - `acrylblends.runbooks`: Runbooks: step-by-step command runbooks with copy buttons and a done log
- [ ] T066 [B07] Extended Reality (`extended-reality`: Virtual reality, Augmented reality, Mixed reality, XR engines) - `acrylblends.photo-tour`: Photo Tour: a 360 photo tour with hotspots, viewable in WebXR
- [ ] T067 [B07] Human-Computer Interaction (`human-computer-interaction`: Accessibility, Screen readers, Gesture recognition, Brain-computer interfaces) - `acrylblends.usability-tests`: Usability Tests: test plans, tasks, sessions and findings
- [ ] T068 [B07] Localization (`localization`: Translation management, Machine translation, CAT tools, Internationalization tools) - `acrylblends.translations`: Translations: string keys, languages, missing-string report and export
- [ ] T069 [B07] Accessibility (`accessibility`: Screen readers, Magnifiers, Speech recognition, Captioning) - `acrylblends.a11y-audit`: Accessibility Audit: pages, a WCAG checklist per page and issues
- [ ] T070 [B07] Backup / Recovery (`backup-recovery`: Backup, Snapshotting, Disaster recovery, File recovery) - `acrylblends.backup-log`: Backup Log: backup jobs, schedules, runs and restore tests

## Batch 8 (categories 71-80)

- [ ] T071 [B08] Compliance / Governance (`compliance-governance`: GRC, Audit, Risk management, Regulatory compliance) - `acrylblends.controls`: Control Register: policies, controls, evidence and audit status
- [ ] T072 [B08] Blockchain (`blockchain`: Blockchain nodes, Smart contract platforms, Wallets, DeFi protocols) - `acrylblends.ledger-sim`: Ledger Simulator: a teaching blockchain with blocks, hashes and an explorer
- [ ] T073 [B08] Decentralized (`decentralized`: Peer-to-peer systems, Federated systems, Distributed identity, Web3 applications) - `acrylblends.local-first-notes`: Local-first Notes: notes that work offline and merge on sync
- [ ] T074 [B08] Peer-to-Peer (`peer-to-peer`: File sharing, Communication, Distributed computing, P2P networking) - `acrylblends.p2p-share`: P2P Share: send a file browser to browser over WebRTC
- [ ] T075 [B08] Content Management (`content-management`: CMS, Headless CMS, DAM, ECM) - `acrylblends.cms`: Headless CMS: content types, entries and a JSON API
- [ ] T076 [B08] File (`file`: File managers, File synchronization, File conversion, Compression) - `acrylblends.file-manager`: File Manager: folders, upload, rename, move and preview
- [ ] T077 [B08] Digital Asset Management (`digital-asset-management`: Images, Video, Brand assets, Rights management) - `acrylblends.media-library`: Media Library: assets with tags, renditions and usage
- [ ] T078 [B08] Identity (`identity`: Authentication, Authorization, SSO, Directory services) - `acrylblends.directory`: User Directory: people, groups and roles with an org chart
- [ ] T079 [B08] Authentication (`authentication`: Password authentication, MFA, Passwordless, Biometrics) - `acrylblends.passkeys`: Passkeys Demo: sign-up and sign-in with passkeys and TOTP
- [ ] T080 [B08] Cryptographic (`cryptographic`: Encryption, Key management, PKI, Digital signatures) - `acrylblends.vault`: Vault: secrets encrypted in the browser, the server never sees plaintext

## Batch 9 (categories 81-90)

- [ ] T081 [B09] Operating / Management Consoles (`operating-management-consoles`: Admin dashboards, Control panels, Management interfaces, Operations consoles) - `acrylblends.admin-console`: Admin Console: users, settings and an audit log for an app
- [ ] T082 [B09] Monitoring (`monitoring`: Infrastructure monitoring, Application monitoring, Security monitoring, Uptime monitoring) - `acrylblends.log-viewer`: Log Viewer: ingest logs, filter and search, alert rules
- [ ] T083 [B09] Optimization (`optimization`: Scheduling, Routing, Resource allocation, Constraint solving) - `acrylblends.route-optimizer`: Route Optimizer: stops on a map and a best-order route
- [ ] T084 [B09] Scheduling (`scheduling`: Workforce scheduling, Appointment scheduling, Job scheduling, Cloud workload scheduling) - `acrylblends.shift-scheduler`: Shift Scheduler: staff, shifts, availability and a week grid
- [ ] T085 [B09] Workflow (`workflow`: Human workflow, Machine workflow, Developer workflow, Durable workflows) - `acrylblends.approvals`: Approvals: requests, approval chains and an audit trail
- [ ] T086 [B09] Document (`document`: Editing, Conversion, PDF, Document intelligence) - `acrylblends.invoices`: Invoices: clients, invoices and a printable PDF view
- [ ] T087 [B09] Research (`research`: Literature search, Citation management, Research notebooks, Lab management) - `acrylblends.reading-list`: Reading List: papers and books, notes and citations
- [ ] T088 [B09] Information Management (`information-management`: PIM, ECM, DAM, Knowledge management) - `acrylblends.records`: Records Register: records, retention rules and disposal dates
- [ ] T089 [B09] Personal (`personal`: Personal finance, Fitness, Journaling, Life planning) - `acrylblends.journal`: Journal: daily entries with mood and a calendar of moods
- [ ] T090 [B09] Home (`home`: Home automation, Smart-home control, Home security, NAS management) - `acrylblends.household`: Household: chores rota, shopping list and bills

## Batch 10 (categories 91-100)

- [ ] T091 [B10] Utilities (`utilities`: Calculators, Converters, Clipboard managers, Launchers) - `acrylblends.dev-toolbox`: Toolbox: JSON formatter, Base64, UUID, hashes and time conversion
- [ ] T092 [B10] Emulation (`emulation`: Console emulators, CPU emulators, OS emulators, Compatibility layers) - `acrylblends.chip8`: CHIP-8: a CHIP-8 emulator in the browser with sample ROMs
- [ ] T093 [B10] Compatibility (`compatibility`: Wine-like compatibility layers, Translation layers, Binary translation, Legacy runtime compatibility) - `acrylblends.compat-checker`: Compat Checker: this browser's feature support against a page's needs
- [ ] T094 [B10] Licensing / Distribution (`licensing-distribution`: App stores, Package repositories, License servers, Update systems) - `acrylblends.license-keys`: License Keys: products, keys, activations and revocations
- [ ] T095 [B10] Software Marketplaces (`software-marketplaces`: App stores, Plugin stores, Extension marketplaces, Agent marketplaces) - `acrylblends.plugin-market`: Plugin Market: a listing of plugins with categories and install counts
- [ ] T096 [B10] Plugin / Extension Ecosystems (`plugin-extension-ecosystems`: Browser extensions, IDE extensions, AI skills, MCP servers) - `acrylblends.plugin-host`: Plugin Host: install and remove small plugins at runtime, a showcase of Cordis
- [ ] T097 [B10] Software Factories (`software-factories`: Code generation systems, AI software factories, Specification-driven development, Multi-agent development systems) - `acrylblends.app-generator`: App Generator: describe an app in a form and generate its skeleton
- [ ] T098 [B10] Self-modifying / Adaptive (`self-modifying-adaptive`: Self-updating applications, Plugin-generating systems, Generative UI, Self-healing software) - `acrylblends.self-editing`: Self-editing App: an app whose agent changes its own pages on request (agent template)
- [ ] T099 [B10] Autonomous (`autonomous`: Autonomous agents, Autonomous vehicles, Trading bots, Self-healing systems) - `acrylblends.goal-runner`: Goal Runner: give an agent a goal, watch its steps, approve actions (agent template)
- [ ] T100 [B10] Meta-software (`meta-software`: Compilers, AI coding agents, Software factories, DSLs) - `acrylblends.blueprint-browser`: Blueprint Browser: browse and preview the acrylblends registry

## Found

Things a builder ran into that the CLI, the framework or the registry should fix (one line each, with the task that found it).
- T001: `make-entry.mjs` wrote into `workshop-registry/blends/` of this repository and always set `category: workshop`; it now takes `--out <registry folder>` and `--category <slug>` (tested in workshop-registry/test/rules.test.mjs).
- T001: `blend.yaml`'s `metadata` has no field for a subcategory (the format refuses unknown keys), so the spec's "subcategory set in the entry" cannot be done there. The site's taxonomy placement is a hand-written line in `src/lib/registry-placement.ts` (site repository), by display names; an entry without one is not shown on the site.
- T001: `scripts/registry-index.ts` in the site repository imports `registry.ts` from a checkout of the private ACRYL repo (CI pins a commit). The published `@webboxes/blends-core@0.4.0` has the same code as `dist/registry.js` and no `src/`; a two-line shim (cloud-brief.md, "Once") makes the script run on it, with Node 24 or bun, and it reproduces the existing `index.json` byte for byte. A cloud agent has no other way to run it.
- T001: every batch branch appends a line to `registryPlacement` and an entry to `registry/index.json`, so merging the ten branches conflicts there; after merging, regenerate the index (`node scripts/registry-index.ts registry`) instead of resolving it by hand, and keep every placement line.
- T001: `npm run dev` in a blank-template app is `node --watch` (the app alone). "Serves the app inside the frame" in spec.md's "Done for one blueprint" (3) is therefore not something a cloud agent can check; the brief leaves the frame to the coordinator. The system-monitor was not opened in the frame in T000.
- T001: the made app starts with `package-lock.json` after `npm install`; `make-entry.mjs` carries it into the entry (kept: it makes the entry's install repeatable).
- T001: `npm create acrylblends@latest` printed "Next: see the template's README" for an app made from a registry entry; harmless, not changed.

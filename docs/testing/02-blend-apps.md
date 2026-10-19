# 2. Blend apps: from scratch, from a starter, change it, copy it

About 45 minutes. Make a folder for your test apps first, outside the clone:

```bash
mkdir -p ~/acryl-test && cd ~/acryl-test
```

## 2.1 From scratch: the Blank app

```bash
acryl new my-app                 # under a second; a new git repository
my-app/bin/acryl web             # prints ACRYL web: http://127.0.0.1:PORT/?token=...
```

Open the printed URL (keep the `?token=...`), add your model key, then look:

- The window carries the app's own name (`my-app`) and a chat: "Describe what you want to build".
- Open `my-app/` in your editor: `blend.yaml` is the whole app (its rows of plugins); `plugins/` is empty; `AGENTS.md` is what the agent inside is told.

Now ask the builder inside for an app, in one sentence. For example:

> Build me a habit tracker app: a page where I can add habits and tick each one off for today, showing each habit's current streak, and tools so you
> can add a habit and mark it done when I tell you. Keep the data in this project.

Expected: it takes a few minutes (7 in our run). The agent reads ACRYL's plugin docs, writes a plugin under `my-app/plugins/`, verifies it, installs
it while the app runs, and tests it. Then:

- Ask it "add habits: stretch every morning, and read 20 pages; I stretched today". The data changes and the page shows it.
- Look at what it wrote in `my-app/plugins/<its plugin>/`: tools in `index.js`, rules, a store, tests.

Report: the time it took, whether it worked on the first try, and anything you had to ask twice.

## 2.2 From a starter (Blueprint)

The public starters: `acryl.blank`, `acryl.gtd`, `acryl.accounting`, `acryl.music`, `acryl.organizer`
([list](https://acrylblends.github.io)). Make one of each:

```bash
acryl new beats --from acryl.music
acryl new books --from acryl.accounting
acryl new planner --from acryl.gtd
acryl new day --from acryl.organizer
```

Start one at a time (`beats/bin/acryl web`, or pick a port: `beats/bin/acryl web --port 3410`).

Expected for each: **the app opens as its own window** (the drum machine, the books, the board, your day), with the agent's conversation on the
right. If you see only a chat with "Into the Unknown", that is a bug: report it with a screenshot.

Try these prompts (times from our run with DeepSeek):

| App | Prompt | Expected |
|---|---|---|
| beats | "Make a 128 bpm techno beat." (click Play first: a browser needs one click before sound) | 5 s, the grid fills while it plays, tempo 128 |
| beats | "Slow it down to 90, take the clap out, and save it as Warehouse." | 5 s, tempo 90, clap row empty, a Warehouse chip |
| books | "Add an invoice for ACME, 1200 EUR net, due in 14 days." | 4 s, a new row, 1,440.00 gross |
| books | "Which invoices are overdue?" then "Summarize this quarter's VAT." | the overdue rows in red; the VAT tab shows the same figure |
| planner | "Capture: call the dentist tomorrow, and plan a team offsite as a project with three next actions." | cards appear on the board without a reload |
| day | "Book a 30 minute call with Sam today at 14:00 UTC." then "Book the team sync today at 14:15 UTC." | the first is booked; the second is refused (it overlaps) |

Also use each window yourself (buttons, forms) and check the agent sees what you changed: ask it "what is on the board now?".

## 2.3 Extend a starter

Ask the agent in a starter app for a feature it does not have. For example:

- books: "Add a CSV export of the invoices: a download button on the Invoices tab and a tool I can ask for."
- beats: "Add a closed hi-hat track: it should show in the drum machine, make a synthesized hi-hat sound, and be playable with the tools like the
  other tracks."

Expected: the agent edits the app's own plugin (`plugins/acryl-accounting/`, `plugins/acryl-music/`), runs its tests, and the new feature shows after a
page reload. Report what happened and how long it took; these were not yet rehearsed on the current app layout.

## 2.4 Snapshot and copy

In a running app's chat (in a brand-new chat, send "hello" first; a slash command's answer appears after the first message):

```
/blend snapshot          records the app in blend.yaml and blend.lock.json (every plugin, its version and checksum)
/blend verify            checks the app against its lock
/blend ledger            what changed since the last snapshot
```

Then stop the app (Ctrl-C) and make a copy:

```bash
acryl new books-copy --from ./books
books-copy/bin/acryl web
```

Expected: the copy starts with the same plugins (plugins pulled from GitHub or npm are fetched again, checked by checksum). The data in `.acryl/` is
not copied: a Blend is the recipe, not your records.

## 2.5 Save an app to its own repository

```bash
cd books
acryl remote connect --private     # creates a GitHub repository with your own gh login
acryl save -m "my books app"       # commits and pushes; refuses secrets and private-to-public
```

Then anyone with access can start from it: `acryl new another --from https://github.com/<you>/<repo>.git`.

## 2.6 Without ACRYL: the acrylblends CLI

The framework also works on its own, without the ACRYL apps:

```bash
npx acrylblends@0.2.0 init my-agent --agent --yes
cd my-agent && npm install && npm start
```

Expected: a small agent server starts and prints its address. Report whether it worked and how long it took.

## Known limits (do not report these)

- `npm install -g acryl` (the published 0.2.5) cannot run `acryl new` yet: Blend apps need the clone from guide 1 (spec 036 T013).
- Times in the organizer starter are UTC.
- An app built from Blank by the agent may serve its UI as a page at a URL rather than as the app's window; the starters show the target shape.

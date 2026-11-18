# acryl-blends-frame

The workbench around an app made with ACRYL Blends, as the owner's mockup draws it (`docs/design/blends-frame-mockup.html`):

- a top bar: the left-panel toggle, the app's name and newest version, Build/Preview, Settings, the right-panel toggle;
- on the left: the app's branches, each with what is open on it, then the versions (save points) of the checked-out branch;
- in the centre: the app alone, in one frame that only a person or the door navigates or reloads; its Select control picks an element of the
  app, and the next message the chat sends then carries that element's page and selector, shown at the left of the composer's input row as
  `Selected: ...` until its x clears it;
- on the right: the agents as tabs, with the chat's History.

On a new app the frame is the first screen: both panels open, a blank chat with its composer at the bottom, and the model connected in
Settings > Models. DSH's preview notice and credential prompt stay out of the frame instead of covering the app.

The canvas page reads the frame's view (`src/client/frame-view.ts`): Build keeps the app's own build-time controls out of the canvas (the
agent-panel's button and the feedback button), and Preview shows what production shows without a reload. The page's plugins read the handle
through `window.parent`; a page opened directly is unchanged.

A feedback note shows its screenshot as a thumbnail, and handing it to the chat puts the page and selector text in the composer with the picture as a real attachment. Settings > Plugins shares a local plugin: the frame packages it under the app's home (`plugin-packages/<name>`; the builder's package shape,
plus the Loader patch the plugin-hub needs) and first says what it will do, for example "Create repository ana/notes on GitHub and publish
v0.1.0? It will be private.", with Cancel as the default. Only on the person's yes does it publish, with `@webboxes/plugin-hub` through the user's
own `gh` and `git`, exactly that repository, version and visibility; when the plan changed meanwhile nothing is sent. The Host refuses a share
that does not carry the confirmed plan. The row then shows the repository and version. A second app installs it with `acrylblends add <the
package folder>`; the plugin-hub refuses a package with secrets before anything is sent. `shareOwner` in the frame row's config names the GitHub
account or organization (the signed-in account when absent); a rehearsal sets a test organization there (`shareOwner: inboxxobni`). A version
already released there is planned as the next patch, and the question says so.

It owns the page's `root` slot, so it is mounted instead of the IDE's workbench (`acryl-workspace`), never beside it. The Host half serves one
private route, `GET /api/acryl-blends-frame/state` (the app's name, folder, page and branches); `appPage` in the row's config says where the
app's page is served.

## The chat saves by itself

When the chat's agent finishes a turn that changed files in the app's folder, the Host makes a save point (a version) without being asked. It is named
after the person's request (its first sentence, cut at a word after 50 characters), it holds the whole folder as `Save point` does, and the chat says
so in one line under that answer: `edited src/routes.ts, src/board.ts · saved as v7`. The new version is the top of Versions, "(current)", and the top
bar reads `v7 · saved`. A turn that changed no file makes no version and says nothing. A turn the person stops saves the files it had changed
by then, under the same line: DSH tells the Host about a stopping turn's changes before the turn ends, and the Host saves on that.

Which files a turn changed comes from DSH's `workspace-changes` row, which compares the working tree before and after each turn, so edits the person
made earlier and has not saved are not credited to the agent (they are still in the version, as in any save point). The Host keeps which turn made
which version in `chat-saves.json` in the app's data home (`GET /api/acryl-blends-frame/chat-saves?session=`), so the line is still there after a restart.

The chat the frame mounts needs more of DSH than the frame draws: the agent preset `acryl-blends` (shell, file tools and jobs; the registry's default),
the host rows it stands on, and the chat view's client rows. They are in `packages/cli/src/ide-profile.ts`. DSH's right sidebar (`ui-sidebar-right`) is
drawn inside the right panel as its Panel tab: when DSH opens a page there (a plan, the review of a turn's changed files) the tab opens, and closing the
tab collapses the sidebar.

## Nothing leaves the machine without a yes

Share (Settings > Plugins) and Push (the `↑N` chip on the versions header, and the Git tab's Push) send the person's work under their name, so each
first says what it will send and where, read without sending anything: "Create repository ana/notes on GitHub and publish v0.1.0? It will be
private.", "Push 2 versions to origin/main (github.com/ana/notes)?". Cancel is focused, so Enter or a stray click sends nothing. The Host's routes
take only the plan the person confirmed (`/plugins/share` and `/git/push` answer 400 without one), read it again just before sending, and send
nothing when it changed meanwhile (another account, a new version, the remote moved). The remote's address is shown without any credential.

The agent is held to the same rule (`src/outward-guard.ts`): a shell call that pushes or publishes (`git push`, `gh repo create`, `gh release create`,
a `gh api` write, `npm publish`, ...) and the app's `save_app` tool become DSH's approval prompt, naming the command, whatever the access mode; they
run only when the person allows them once. It reads the command's words, so it is a seat belt for an honest agent, not a sandbox.

## Chats belong to a branch

A chat belongs to the branch it was made on. The Host records that once per chat in `branch-chats.json` in the app's data home (`/api/acryl-blends-frame/branches/chats`): a chat made by the frame is recorded as it is made, a chat DSH made (or one from before this file) is recorded
the first time the frame sees it with a turn, on the branch checked out then, and a record is never moved by a later switch. That file is the only source
of truth; the client reads it and keeps no list of its own.

The chat on screen always belongs to the checked-out branch (`src/client/chats.ts`, `decideChat`): switching to a branch shows its most recently used chat
(or the one whose tab is showing), and a branch with no chat gets a new one, made on the Host and recorded for it before anything is shown. Expanding a
branch in the left panel lists its own chats; History in the right panel opens the checked-out branch's. `+` then **Chat** starts a new chat of its own on
the current branch as a tab (the one on screen is reused while it has no turn); the base tab and each `chat:<id>` tab follow the chat on screen.

### Open and closed chats

A chat is **open** while it has a tab or is the chat on screen; every other chat is **closed**. The left panel lists only open chats (a branch's "N open"
counts only those), and History lists all of them: `open · now`, or `closed · 1 h · opens as a tab`. Picking a closed chat of the checked-out branch opens
it as a tab and it joins the left panel; picking one of another branch hands the request to the left panel, which offers the switch first through the
same guard as its own rows. Closing a chat's tab (the x) closes the chat; when it was on screen the view moves to the chat of the tab now shown, else to the
base tab's chat. The base tab (never closed) shows the branch's newest open chat that has no tab of its own, or a new chat when there is none.

Which chats are open is remembered per app in the same Host file: `open` maps the app's root to the open chat ids (`POST {id, open}` opens or closes one,
`POST {opened: [ids]}` records the first decision; the Host keeps the first). While the file has no `open` entry for the app, nobody decided: the frame
decides once - the latest chat with a turn of each branch, the chat on screen and the chats that already have a tab (`initialOpenChats`) - so an app that
already has many chats opens with only one per branch and the rest in History. A tab left in a remembered strip whose chat is not open is dropped.

DSH moves its main view in steps and finishes a move it started even when something else moved the view meanwhile, so the frame asks for a chat only
after the call that told it has ended, asks once while that move is on its way, and never from inside DSH's start-up.

## The canvas shows what the files say

The app's code runs in the dev host (`npm run dev`), and the host loads it once. So that a version the person goes back to, a file the chat wrote, a
line typed in an editor or a `git switch` shows in the canvas without a restart (a restart would end the terminals and agents in the right panel),
the Host loads the app's code again whenever `blend.yaml` or a file under `src/` or `plugins/` changes, whoever changed it (300 ms after the last
change).

How it works: the launcher (`scripts/ide-host.mjs`) loads `acryl-blends-frame/app-generation` before anything of the app does. It installs a resolve
hook that, once the Host raises the generation, gives every file of the app's `src/`, of its own plugins (the
folders of `plugins/` that `plugins/library.json` does not list) and of the generated `frame/` rows a `?gen=N` query, so a new import of them - and
of everything they import - is a fresh copy. Nothing in `node_modules` or the library copies in `plugins/` gets one, so their services stay single
instances. The Host (`src/app-reload.ts`) then imports the app's rows (`app-plugins`, `app-routes`) under the new generation, and only if that
succeeds stops them and starts them from the new code. The page follows a long poll on `GET /api/acryl-blends-frame/app?after=<seq>` and reloads the
canvas when a new generation is up.

A file that does not load (a syntax error, a missing import) or a row that does not start leaves the last good code running and shows one line in
the top bar (`Not reloaded: src/routes.ts:47 ...`) until the next change loads. In-memory state of the app's modules starts again with each load.
Development only: Node cannot unload a module, so the old copies stay in memory until the host stops; `npm start` has no launcher and never loads the
hook. A host started by a launcher that predates the hook runs the code as it started.

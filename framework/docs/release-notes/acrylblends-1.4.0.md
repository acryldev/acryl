# acrylblends 1.4.0

A group's app: everyone's plugins come into one app with one command, and a showcase page shows who made what. Released with [create-acrylblends 1.4.2](create-1.4.2.md), which asks for this release, so `npm create acrylblends@latest` makes an app with it even on a machine that ran an older one.

## Try it

Make a framed agent app with the showcase:

```sh
npm create acrylblends@latest collective -- --template agent --desktop
cd collective
npx acrylblends add showcase
npm install
npm run dev
```

Put the group's plugins in a file in the app, one per line, as `plugin publish` printed them (`#` starts a comment), for example `group.txt`:

```text
github:inboxxobni/acrylblends-guestbook@0.1.0
github:inboxxobni/acrylblends-dice@0.1.0
github:inboxxobni/acrylblends-hello-widget@0.1.0
github:inboxxobni/acrylblends-wordcount@0.1.0
github:inboxxobni/acrylblends-pomodoro@0.1.0
```

Then, in a second terminal in the app:

```sh
npm run acryl -- plugin pull --from group.txt
```

It answers with one line per plugin, and the app keeps running:

```text
5 of 5 from group.txt pulled.
github:inboxxobni/acrylblends-guestbook@0.1.0: installed acrylblends-guestbook
...
```

Open the address `npm run dev` printed, with `/app/showcase` after it: a card for each plugin, with the GitHub login of whoever released it, its version, where it came from, whether it is running, and links to its pages, its home page widget and its tool. The cards change by themselves while plugins are pulled and removed. `/app` is the app's home page, with the widgets plugins put there.

## Added

- **`plugin pull --from <list>`** pulls a group's plugins in one command. The list is a file in the app or an https address of one (a gist's raw link). Each line is pulled on its own: a line that is refused is named with its reason, while the others come in and keep running, and the command then fails so a script notices. A pasted `npm run acryl -- plugin pull github:...` line counts as its source. In the frame the app's page reloads once at the end, not once per plugin.
- **The showcase**: `npx acrylblends add showcase` adds a page at `/showcase` with a card for every plugin in the app, kept up to date while plugins are pulled and removed. `GET /showcase/plugins` answers the same cards as JSON.
- **The agent template's home page shows plugins' widgets.** A new agent app has the `home` plugin, so a pulled plugin that puts a widget on the home page installs and its widget shows at `/`.

## Fixed

- **Two plugins that want the same page:** the second is refused by name ("GET /guestbook is already served by acrylblends-guestbook"), and the first keeps it. A wrong digest on a line is refused the same way, and nothing of it is installed.
- **A publish confirmed from the frame is accepted** when its plan comes back with its fields in another order.

## Known limits

- In the frame, a plugin that comes with acrylblends (such as the showcase) is not reloaded when `upgrade` changes it; stop `npm run dev` and start it again.
- When a line of the list is refused, the summary starts with `refused:` even though the other lines came in. The lines below it say which.

## Upgrading

`npx acrylblends@latest upgrade` in the app, then `npm install`. An agent app made by an earlier release gets `plugins/home` and the new `src/app.ts` and `src/routes.ts` when it has not edited them; its `blend.yaml` is not changed, so its home page shows widgets once a `- id: home` / `name: home` row is added after the router row. Upgrade also knows the scaffolds 1.3.2 made.

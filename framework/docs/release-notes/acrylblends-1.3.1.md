# acrylblends 1.3.1

Pull plugins from several people into one app: a plugin whose route or widget another plugin already has is refused, naming that plugin; the list says who released each one; and every template that installs live can pull. `create-acrylblends` is unchanged (1.4.0); `npm create acrylblends@latest` installs this release.

## Added

- **Every template that installs live can pull.** `npm run acryl -- plugin pull ...` works in the blank, notes, chat, nodejs and agent templates. The todo template installs nothing live and says so.
- **`plugin list` says where each pulled plugin came from and who released it**, and `plugin remove` takes a pulled plugin out of the running app with its record. Its folder goes too when it still holds the release exactly as pulled; a folder with someone's work in it stays, and the answer says so. Both work in the frame as well.

## Fixed

- **A plugin whose route another plugin serves is refused, naming that plugin.** Before, the second plugin installed and answered nothing, because the router serves the first mount of a route. Now:

  ```text
  GET /pomodoro is already served by acrylblends-pomodoro; rename this plugin's route, or remove acrylblends-pomodoro first
  ```

  A route under another plugin's path is its own route (`/notes/list` beside `/notes`), while a wildcard over it (`/notes/*`) is refused. The first plugin keeps its route, and in the frame the message names the route without the canvas prefix.
- **A plugin putting its widget under another plugin's name is refused**, and the first widget stays on the home page. The message says a widget's id is the name of the plugin that puts it there.
- **In the frame, a pulled plugin that puts a widget on the home page installs.** It was refused "needs home", because plugin-share asked for services with its caller's context.
- **In the frame, a pull no longer restarts the app**, whatever the source: GitHub, an address, or a local file. The frame loaded the app's code again after every pull, so the plugin's route answered 404 for a few seconds and a pull in that moment was refused. Now the frame tells the app's own live writes from changes to its code by their content: a pulled plugin folder that still holds the release as pulled is not loaded again, and an edit to it is. A refused pull and a removed plugin do not restart the app either. This is `@acrylblends/blends-frame` 0.1.1.
- **A different copy of a plugin with the same name is refused, naming where the copy in the app came from** ("pulled from github:ana/hello@1.0.0", or "made in this app").

## Known limits

- The frame's own Share button in Settings > Plugins still uses its older path, and it is not yet connected to `plugin publish`.

## Upgrading

`npx acrylblends@latest upgrade` in the app, then `npm install`. An app made with `--desktop` before this release keeps its frame pin; to take the frame fix, run `npm install @acrylblends/blends-frame@0.1.1` in it. A new app gets the 0.1.1 frame.

# acrylblends 1.3.0

Share a plugin between people: pull a release someone published into your running app, and publish your own after saying yes to exactly what will be sent. `create-acrylblends` 1.4.0 ships with it, see [its notes](create-1.4.0.md).

## Added

- **`plugin pull`, in the agent template.** With the app running (`npm run dev`):

  ```sh
  npm run acryl -- plugin pull github:<owner>/<repo>@<version>
  ```

  It fetches without running anything, checks the content digest and that the plugin works on every OS, then installs it live. `@sha256:<digest>` at the end names the exact bytes, and other bytes are refused. A refusal changes nothing and exits 1. The app remembers the source in `blend.yaml`, so a copy of the app fetches the same bytes at its next start.
- **`plugin publish <name>`.** It prints the account, repository, version, visibility, license and files. Only a person's yes at the terminal publishes; an agent gets the plan and cannot say yes. The output ends with the full pull line, digest included.
- **`npm run acryl`.** Every app with the door has this script, on every OS and before the first start, when `.acryl/bin/acryl` does not exist yet. A stopped app says to start it and run the same line again. It never installs offline.
- **`package_plugin` writes a release file** with the same bytes on every OS.

## Fixed

- **`add` and `upgrade` move a dependency forward when a plugin asks for a newer version.** Before, `upgrade` replaced a plugin's code and kept the older pin, so an upgraded app could fail its type-check. A plugin never moves the app back, and a tag, path or URL stays the app's choice.
- **In the frame, a plugin's own check finds its route.** The check asked `/pomodoro` while the route was at `/app/pomodoro`, so every live install with a check failed there.
- **A refused door command fails.** A refused pull or publish plan used to print JSON and exit 0.

## Known limits

- The pull and publish commands are in the **agent** template only. Other apps refuse them, and `upgrade` does not add the plugin to an older app; `plugins/plugin-share/README.md` has the steps.
- In a framed app, the frame reloads the app's plugins just after a pull: the plugin's route answers 404 for a few seconds, and a pull in that moment says to try again.
- In a framed app, `plugin list` and `plugin remove` do not work through the door.
- The frame's own Share button in Settings > Plugins still uses its older path, and it is not yet connected to `plugin publish`.

## Upgrading

`npx acrylblends@latest upgrade` in the app, then `npm install`. The frame stays at its current published version.

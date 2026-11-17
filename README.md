# ACRYL

The ACRYL launcher as a Blend: the control center of your ACRYL apps. Registry id `acryl.launcher`. Source:
<https://github.com/acrylblends/63-acryl-launcher>, made from <https://github.com/acryldev/acryl> (`scripts/launcher-blend.mjs --no-start`).

- your apps, with their surface (web or desktop), started and stopped from one list;
- a new app from a starter or from a Blend of the registry;
- plugins to pull into an app and to share from it;
- the Blends right panel: chat, Claude Code, Codex, Pi and a terminal.

## Start

```bash
npx acryl --gui    # in its own window
npx acryl --web    # in your browser
```

The first start makes it in `~/.acryl/launcher` and installs it (about a minute). Or run it from a clone:

```bash
git clone https://github.com/acrylblends/63-acryl-launcher.git
cd 63-acryl-launcher && npm install && npm run desktop
```

`npm run dev` serves it to a browser instead. The apps it lists live in `~/.acryl/apps.json`; new apps are suggested in `~/ACRYL`.

MIT licence.

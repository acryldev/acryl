# Ticket: three one-minute demo scenarios, and Music as a Blends blueprint

Status: ready-for-agent. Asked 2026-11-12 after the talk at the Sentry office in Vienna (2026-11-11).

## Why

The owner, after the talk: "it looked complicated to the audience, as I lacked simple scenarios to show". The apps ran (Blank and
Small CRM in their windows, the CRM in the browser), but there was no short story to walk through. The Music app the owner asked for
during the talk did not start at all: `acryl.music` is an ACRYL IDE starter and the IDE checkout failed to boot (renderer boot health
timeout, `layout` service never provided).

## What

1. Three scenarios, each under one minute, each a script a presenter can follow word for word, verified on a fresh machine:
   - Make an app: `npx acrylblends@latest init my-app -y`, `npm run desktop`, the window with the chat beside the app.
   - Ask the agent for a feature in the chat, see it appear live in the canvas without a restart.
   - Pull a blueprint from the registry (Small CRM) and change it by asking.
2. Music as an ACRYL Blends blueprint (`acrylblends.music`), from the MIT `acryl-music` plugin (about 600 lines: tools, a WebAudio
   sequencer page, a JSON store), so it runs like the CRM: `npm create acrylblends@latest my-beats -- --from acrylblends.music`.
3. A demo checklist in the docs: which apps to start before the talk, how to keep their windows open, how to restart one.

## Done when

Each scenario was run end to end from npm on a clean HOME, timed, and recorded in the checklist; the Music blueprint opens in the
frame, plays, and the agent changes the beat by tools.

# What runs in production

`acrylblends` has two kinds of parts: the ones an app is built from, which run in production, and the development tools that let an agent (or you) work on the running app, which do not. This page says which is which, and exactly what the safety checks around live plugin install do and do not promise. A test (`plugins/driver-pty/test/production.test.ts`) mounts every development tool in one app and checks the table below.

## The table

| Part | In development | With `NODE_ENV=production` |
| --- | --- | --- |
| Your routes and plugins, the router, the server, state, the `db` and `kv` ports and their providers | run | run |
| **The door** (`acryl-door`: `.acryl/bin/acryl`, the page script, the operator routes) | **experimental**: starts when the server is up | starts nothing: no service, no route, no `.acryl/` folder, no script in the page. `ACRYL_DOOR=off` also turns it off. A host that means to run it in production sets `allowInProduction: true` in the plugin's config |
| **The agent panel** (`agent-panel`) | **experimental**: a script tag on every HTML page and `/api/agent-panel/*` | does nothing (no tag, no routes). `ACRYL_DOOR=off` too |
| **The PTY driver** (`driver-pty`) | **experimental**: terminal drivers in the panel, `/api/driver-pty/*` | does nothing. `ACRYL_DOOR=off` too |
| **Live plugin install and the agent** (`extensions`, `builder`, `agent`: `POST /ask`) | **experimental**: install, update, remove and reload plugins while the app runs; the agent builds them | left out: the `nodejs`, `notes` and `chat` templates drop the `extensions` row, and the `agent` template drops `agent` and `builder` (since 1.0.1) and starts the `extensions` read-only (since 1.0.7: the plugins in `plugins/` run as deployed, nothing can be installed or changed) unless `ACRYL_PRODUCTION_KEEP` names them |
| **The chat template's model endpoint** (`POST /api/chat`) | answers anyone | **closed** (503) unless `CHAT_ACCESS_TOKEN` is set, or `ACRYL_PRODUCTION_KEEP=chat` makes it public with a warning and a per-address limit (since 1.0.2) |
| `acrylblends/bun` | **experimental**: one smoke gate runs it on Bun | the same |

Experimental means: it works and is gated, its interface may still change in a minor version, and it is not for the public internet. The door and the panel are loopback and own-page only, with a per-run secret and an audit log; that is a convenience fence for a developer's machine, not an authentication system.

## The `agent` template in production

The `agent` template mounts an agent behind `POST /ask` that spends the model key and can write plugins into the running app (`builder`) and install them (`extensions`, with `POST /extensions/approve` deciding installs). **None of that is behind a login.** Since 1.0.1, with `NODE_ENV=production` the template leaves the `agent` and `builder` rows out, along with the door: `/ask`, `/extensions*` and `/tasks*` are not mounted, and the page and `GET /health` stay. 1.0.0 left them mounted. **What the agent built is still served**: 1.0.1 to 1.0.6 also left the `extensions` row out, so an app whose pages were extensions (the workshop's board) lost them in production. Since 1.0.7 the row starts again, read-only: the extension folders of `plugins/` (what the agent installed in development, committed with the app) are loaded once from where they are, nothing can be installed, updated, removed or approved while the app runs, and the start prints one line, `extensions (read-only): board, notes` (or `extensions: none found in plugins/`). If `.acrylblends/extensions.json` records an extension that `plugins/` has no folder for, a `WARNING` names it: commit its folder, or install it again in development.

- To keep a row anyway, name it: `ACRYL_PRODUCTION_KEEP=agent,builder,extensions` (a comma list; naming `extensions` keeps the live install, not just the read-only start). Each row kept prints a `WARNING` line at start saying what it gives a visitor. Put your own login in front before you do.
- **An app made by 1.0.0 keeps its own `src/app.ts` and `src/routes.ts`**, which `acrylblends upgrade` never touches (they are your files). Until you change them: deploy with the `agent`, `builder` and `extensions` rows set to `disabled: true` in `blend.yaml`, or start from another template, or copy the new `src/app.ts` and `src/routes.ts` of a fresh `acrylblends init my-app --template agent` over yours.

## The `chat` template in production

The chat template answers with the owner's model key, so anyone who can reach it spends that key. Since 1.0.2, with `NODE_ENV=production` it is **closed**: every route but `GET /health` answers 503 until you choose one of:

- `CHAT_ACCESS_TOKEN=<a long random string>`: the browser asks for a login and takes any user name with the token as the password. Share the token with the people who may use the chat.
- `ACRYL_PRODUCTION_KEEP=chat`: the chat is public, with a `WARNING` line at start and a limit of `CHAT_RATE_PER_MINUTE` messages a minute from one address (default 20; behind a proxy you run, set `TRUST_PROXY=1` so the limit counts the visitor, not the proxy). Prefer your own login in front.

An app made by 1.0.0 or 1.0.1 keeps its own `src/routes.ts`: copy `src/access.ts`, `src/chat-app.ts` and `src/routes.ts` from a fresh `acrylblends init my-app --template chat`, or put a login in front.

## What live plugin install does and does not promise

Installing a plugin (`ctx.extensions.install`, the door's `plugin add`, the builder's `install_plugin`) is a **correctness check, not a security boundary**:

- It stages a content-hashed copy, imports it, mounts it, and reports the real state (`active`, `pending` with what it waits for, or `failed` with the error). If an update fails to start, the previous version is mounted again. A ledger line records every change.
- **The plugin's code runs inside the app's own process with the app's permissions**: it can read the app's files and environment, open sockets and start processes. Nothing in the install check stops that.
- At start-up the app reinstalls what was installed, and installs a new folder only from a source trusted to `install` (the app's own `plugins/` is). Code that arrived through a `git pull` into an untrusted source is listed, not run.
- `approval: true` holds an install until someone posts to `/extensions/approve`: it decides *whether* a plugin installs, not what an installed plugin can do.

## What the sandbox does and does not stop

`ctx.sandbox` runs code you do not trust, such as a **tool** an agent just wrote, in a separate Node process with the permission model on (`node --permission`):

- It **stops**: reading any file outside the tool's own folder; writing files; starting child processes or workers; loading native addons; using the inspector. It gets an empty environment (no keys, no paths). It is killed after a time limit and capped in memory and output size. Calls are independent: nothing survives into the next one.
- It **does not stop**: network access (Node 24 has no network permission: restrict egress outside the process where that matters), and it does not apply to plugins installed live (those are not run in the sandbox).

## The address and the port

A server made from a template listens on `127.0.0.1` and starts looking for a free port at a number of its own (3100 and up, chosen from the app's folder). A hosting platform tells the process where to listen with `PORT`, and a container needs `0.0.0.0` to be reached from outside. The app reads four variables, in this order:

| What | First | Then | Otherwise |
| --- | --- | --- | --- |
| The port to start from (`0` for any free port) | `ACRYLBLENDS_PORT` | `PORT` | a number of its own, from the app's folder |
| The interface | `ACRYLBLENDS_HOST` | `HOST` | `127.0.0.1` (this machine only) |

`PORT` and `HOST` have been read since 1.1.0; before it, the `agent` and `blank` templates ignored `PORT` (`PORT=3299` still listened on the app's own number). If the port is taken the server tries the next ones, and the line it prints at start (`app listening on http://0.0.0.0:3299`) says which it got; a platform that routes to a fixed port should be given one that is free. For example, on a plain server:

```sh
npm ci --omit=dev
NODE_ENV=production HOST=0.0.0.0 PORT=3299 npm start
# app listening on http://0.0.0.0:3299 (data in /srv/app/.acrylblends; ...)
curl http://127.0.0.1:3299/health
```

Putting the app on `0.0.0.0` makes it reachable by anyone who can reach the machine: put the login or the proxy in front first (see the checklist below).

## Checklist for a deployment

1. `NODE_ENV=production` (the process manager or the Dockerfile sets it; the templates' Dockerfile does).
2. With the `agent` template, leave `ACRYL_PRODUCTION_KEEP` unset (1.0.1 and later), or remove the agent rows. With the `chat` template, set `CHAT_ACCESS_TOKEN` (1.0.2 and later) or put your own login in front.
3. Do not set `allowInProduction` on the door unless the host is a single-user desktop app.
4. Keep `ACRYL_DOOR=off` in any environment where an agent should not be able to see the page.

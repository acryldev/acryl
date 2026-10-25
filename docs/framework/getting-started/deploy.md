# Deploy

This page runs an app made by `npm create acrylblends@latest` (the `nodejs` and `notes` templates) on a Linux server with Node.js 22.19 or later: install, start, keep it running, put HTTPS in front, and look after the SQLite file.
The snippets are examples to adapt: check them against your own server before relying on them.

## What the template already does

- **Port and address.** `src/index.ts` reads `PORT` (default 3000) and `HOST` (default `127.0.0.1`). The default is local on purpose: `serve()` without a `hostname` listens on every interface. In a container, set `HOST=0.0.0.0`.
- **Graceful stop.** On `SIGTERM` and `SIGINT` the server stops taking requests, closes idle connections, lets the requests in flight finish, closes the database (the `notes` template) and exits with 0. A connection that never ends cannot keep it alive past 10 seconds (it then exits with 1).
- **Errors.** An error answers `500 Internal Server Error` with no stack and no detail; the stack goes to the log (standard error).
- **Cookies.** The `notes` template marks its session cookie `Secure` when the request is HTTPS, or when `TRUST_PROXY=1` and the proxy sends `X-Forwarded-Proto: https`.

## Environment variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `NODE_ENV` | unset | set it to `production` on the server |
| `PORT` | `3000` | the port to listen on |
| `HOST` | `127.0.0.1` | the address to bind. `0.0.0.0` exposes the app to the network: do it in a container or when nothing else is in front |
| `NOTES_DB` | `notes.db` in the working directory | the SQLite file (`notes` template) |
| `TRUST_PROXY` | unset | `1` when a reverse proxy you run terminates HTTPS in front of the app (`notes` template) |
| `PUBLIC_ORIGIN` | unset | the address in the browser, for example `https://notes.example.com`. Behind a proxy the app sees `http://127.0.0.1:3000`, so csrf needs to be told which origin is the site (`notes` template) |

Keep secrets out of the repository: put them in an environment file the service reads (below), readable only by the service user.

## Install and start

```sh
git clone <your repository> /srv/notes && cd /srv/notes
npm ci --omit=dev
NODE_ENV=production PORT=3000 npm start
```

`npm ci --omit=dev` installs `acrylblends` and `typescript`. `typescript` is a normal dependency on purpose: `.tsx` pages are compiled when the app starts, by `acrylblends/node-server/register`, with the app's own `typescript`.
There is no build step today. When a build step appears (compiling client code, for instance) it belongs in `npm run build` before `npm start`, not in the start command.

## Keep it running with systemd

`/etc/systemd/system/notes.service`:

```ini
[Unit]
Description=Notes
After=network.target

[Service]
User=notes
WorkingDirectory=/srv/notes
EnvironmentFile=/etc/notes.env
ExecStart=/usr/bin/node --import acrylblends/node-server/register src/index.ts
Restart=on-failure
TimeoutStopSec=15
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/var/lib/notes

[Install]
WantedBy=multi-user.target
```

`/etc/notes.env` (mode `0640`, owned by root, group `notes`):

```sh
NODE_ENV=production
PORT=3000
HOST=127.0.0.1
NOTES_DB=/var/lib/notes/notes.db
TRUST_PROXY=1
PUBLIC_ORIGIN=https://notes.example.com
```

```sh
sudo useradd --system --home /srv/notes notes
sudo install -d -o notes -g notes /var/lib/notes
sudo systemctl daemon-reload && sudo systemctl enable --now notes
sudo systemctl stop notes   # sends SIGTERM; the app exits within seconds
```

`ExecStart` runs `node` directly (not `npm start`) so the signal reaches the app and not an `npm` wrapper.

## Behind a reverse proxy

Let the proxy handle HTTPS and keep the app on `127.0.0.1`.

Caddy (`Caddyfile`), which also obtains the certificate:

```text
notes.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

nginx (certificates from your own tool, for example certbot):

```nginx
server {
    listen 443 ssl;
    server_name notes.example.com;
    # ssl_certificate and ssl_certificate_key here

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $remote_addr;
    }
}
```

Both pass `X-Forwarded-Proto`. Set `TRUST_PROXY=1` only when the app is reachable **only** through that proxy (it listens on `127.0.0.1`): the header is otherwise something any client can send.

## The SQLite file and backups

The database is one file (plus `-wal` and `-shm` files while it is open). Keep it outside the code folder (`NOTES_DB=/var/lib/notes/notes.db`), owned by the service user, on a disk you back up.
Do not copy the file while the app writes to it. Take a consistent copy with SQLite's backup, which is safe on a running database:

```ts
import { DatabaseSync, backup } from 'node:sqlite'

const db = new DatabaseSync(process.env.NOTES_DB ?? 'notes.db')
await backup(db, `/var/backups/notes-${new Date().toISOString().slice(0, 10)}.db`)
db.close()
```

or, with the `sqlite3` command line tool installed: `sqlite3 /var/lib/notes/notes.db ".backup '/var/backups/notes.db'"`. Run it from cron or a systemd timer and copy the result off the machine. To restore, stop the service and put the backup file in place of `notes.db`.

## Check it

```sh
curl -I http://127.0.0.1:3000/            # the app, directly
curl -I https://notes.example.com/        # through the proxy
journalctl -u notes -n 50                 # the log, including error stacks
```

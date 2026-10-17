# ACRYL web container

One ACRYL workspace per container: the ACRYL web surface, unattended, with everything it keeps on one volume. A host that runs workspaces for other
people (a proxy, an orchestrator) puts this image behind its own sign-in; ACRYL's launch token is the handshake between the two.

## Build

The build context is the repository root.

```sh
# from a published release (checks the archive against its release receipt)
docker build -f distribution/acryl-web-container/Dockerfile --build-arg ACRYL_VERSION=0.2.5 -t acryl-web:0.2.5 .

# from this checkout, for changes not released yet (send a clean tree: untracked files and the submodule are not needed)
git archive HEAD | docker build -f distribution/acryl-web-container/Dockerfile --build-arg ARCHIVE_SOURCE=source -t acryl-web:dev -
```

Both use the same portable runtime the GitHub release ships (`scripts/build-web-archive.mjs`: Node plus the deployed `acryl-web`), on Debian slim
with `git`, `ca-certificates` and `tini`. Release 0.2.4 and older do not read `ACRYL_WEB_HOST`, so they cannot serve from a container; use a newer
release or the source build.

## Run

```sh
docker run -d --name ws-1 -p 127.0.0.1:3080:3080 -v ws-1:/data \
  -e ACRYL_WEB_TRUSTED_HOSTS=ws-1.example.com \
  -e DEEPSEEK_API_KEY \
  acryl-web:dev
docker logs ws-1 | grep '^ACRYL web:'
```

## Contract

| What | Value |
| --- | --- |
| Port | `3080` inside the container (`ACRYL_WEB_PORT`) |
| Listens on | `0.0.0.0` (`ACRYL_WEB_HOST`); the container's network is the boundary |
| Public names | `ACRYL_WEB_TRUSTED_HOSTS`: comma-separated `host` or `host:port` the browser uses. The `/api` routes refuse any other non-loopback `Host` (403) |
| State | Everything under the `/data` volume: the ACRYL home `/data/acryl` (settings, sessions, profiles, plugins and their store, the engine home `.dsh`, the first project in `documents/`) and the OS home `/data/home`. Recreate the container on the same volume and the workspace is back |
| User | `acryl`, uid 10001, never root |
| Start | One stdout line `ACRYL web: http://127.0.0.1:3080/?token=<launch token>`. The token is new on every start |
| Sign-in | Send the browser once to `https://<public name>/?token=<launch token>`: ACRYL answers `303` with a signed session cookie for that name, valid 30 days, and the cookie survives restarts and recreates (its signing secret lives in `/data`). Without a token or cookie the index answers `401` |
| Stop | `SIGTERM` (`docker stop`): ACRYL disposes cleanly and exits `0` |
| Model key | The user's own key as an environment variable the engine reads (for example `DEEPSEEK_API_KEY`), never baked into the image |

The launch token is a credential: whoever has it can open the workspace. Read it from the container log on the host that owns the container, never
put it in a URL a third party sees, and do not log it.

## Verify

```sh
distribution/acryl-web-container/scripts/smoke.sh acryl-web:dev
```

It boots the image on a throwaway volume, checks the user, the `401`, the `403` for an untrusted host, the session cookie, that a recreated
container on the same volume gets a new token and still accepts the old session, and that `SIGTERM` exits `0` within 15 seconds. It removes its
container and volume on exit.

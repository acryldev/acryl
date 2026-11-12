# M9 - the hosted workspace on WebBoxes.ai (design)

**Status: unparked by the owner 2026-11-12, target the workshop of 2026-11-20** (parked 2026-10-28 so the framework came first).
Owner: "do it also please, for the browser-only attendees on 20.11 so that those attendees can follow the workshop with 0 setup, just
from the browser". Nothing here has been built yet, nothing has gone to webboxesai, and z370n was only read.

What the owner wants on 20.11 (2026-11-12, their words condensed):

- An app made with `acryl new` has a deployment option: deploy to the WebBoxes.ai cloud, with no hosting setup of one's own. This is
  one of WebBoxes.ai's commercial models ("our clients can choose to deploy to webboxes.ai").
- Attendees see their own web apps running in the cloud.
- Attendees can edit an app in the WebBoxes.ai cloud with no setup at all, from the browser only.

The goal (milestone M9 in [spec 049](../spec.md)): an app made with `npm create acrylblends` runs on WebBoxes.ai, reachable by URL,
with its agent working through the door.

## What exists

Read 2026-10-27 from webboxesai `origin/main` `fa7f094` (unchanged since 2026-10-17):

- The runner on z370n provisions one container per WebBox from `webbox-node:1` (Node 24) on its own /28 network. Egress is open except
  private ranges, so npm works. The runner proxies the preview to `http://<ip>:<appPort>`.
- The preview is path-prefixed (`https://webboxes.ai/preview/<id>/<token>/...`) and framed in a sandboxed iframe (opaque origin, no
  cookies), with a signed URL token. The proxy forwards only `accept`, `accept-language`, `content-type` and `user-agent`, and cuts a
  request after 30 s (35 s total).

## Why an acrylblends app does not work there as is

Each found in source, not run:

1. Its URLs are root-absolute (`/api/...`, `/api/acryl-door/page.js`). Under a path prefix they leave the box; only `Location` is
   rewritten.
2. Its private routes and the door's page channel admit only the own page: a loopback peer, `Host` on the local port, and an exact
   `Origin` (or same-origin fetch metadata plus `Referer`). Behind the proxy the peer is the runner, `Origin` is `null` (the sandbox),
   and `Origin` and `Referer` are not forwarded, so every own-page route answers 403.
3. The door's channel is an event stream kept open (ping every 15 s, reconnect after 45 s). The proxy's 30 s cap cuts it, and a call in
   flight settles as disconnected.
4. node-server binds `127.0.0.1` by default, and the runner reaches the container's IP.

## Proposed shape

The smallest change that keeps both trust models honest:

- **A. One origin per WebBox.** `https://<short-id>.<preview domain>` instead of a path prefix. That fixes 1 and gives the page a real
  origin instead of `null`, so the sandbox goes and the own-page rule means something again. Access: the signed token is traded once for
  a host-only, `HttpOnly`, `SameSite=Lax` cookie on that origin, which every later request carries. This is spec 008's open T091
  ("preview needs a separate origin"). Needs a wildcard DNS record and wildcard routing in Coolify's proxy (Q1), both owner decisions.
- **B. A streaming proxy.** No total timeout on an event stream (an idle timeout instead). The runner forwards `Origin`, `Referer`,
  `Sec-Fetch-*` and the public host in a fixed set of `X-Forwarded-*` headers, which only the runner sets.
- **C. "Behind a trusted front" in acrylblends.** One framework-kit config, set only by the hosted template: `publicOrigin`
  (`https://<id>.<domain>`) and `trustedProxy` (the runner's address on the box network). The own-page rule then accepts the public
  origin from that peer, and only from it; on loopback nothing changes. This changes acryl-router's `loopbackOnly` and own-page middleware
  and the door's page routes in the acrylblends repository (Blends' work), and it needs its own security review. The door's operator
  side (`POST /api/acryl-door/call` with the run's secret over loopback inside the box) needs no change.
- **D. Bind `0.0.0.0` inside the container** (node-server `hostname`), set by the same hosted template. The box network is private, and
  the firewall blocks box-to-host traffic.
- **E. The agent is the app's own agent** (decided, Q2): the agent panel, with the account's own model key (BYOK) injected at run time,
  works on the folder in the box and drives the page through the door from inside the box (`.acryl/bin/acryl` over loopback). The
  person watches and stops it on the same page through the proxy (the door's Stop bar). No agent runs on the web server for this path.

## Slices

Each one is verifiable on its own:

1. **WebBoxes, staging only.** A template `acrylblends-starter` in the runner's catalog: the `npm create acrylblends` output, prebuilt
   into the image or created at provision, started with hostname `0.0.0.0`. Verify: the box runs, and `curl` from the runner gets the
   page.
2. **Blends.** The trusted-front config in acryl-router and acryl-door, with tests on both sides of the rule. The public origin
   through the proxy peer is accepted. The same origin from any other peer, any other origin, and `null` are refused.
3. **WebBoxes, after the owner's DNS and Coolify answer.** Per-box origin, the cookie exchange, the streaming proxy and the forwarded
   headers. Verify in a real browser: open the box URL, the door's bar shows, and `.acryl/bin/acryl look` inside the box returns the
   page.
4. **The gate run.** Sign in, create a box from the starter, open its URL, ask its agent for a change, see the agent act on the page
   through the door, and see the change land as a commit. Recorded with the commit, URL and evidence.

## Workshop plan (2026-11-12, target 2026-11-20, times CET)

Facts checked 2026-11-12, read only: `webboxes.ai` resolves to 213.47.80.26, which is z370n's public address (home line, port
forwarding to Coolify's Traefik `coolify-proxy`). So `<id>.213-47-80-26.sslip.io` reaches the same Traefik with no DNS change.
z370n has 16 cores, 62 GB memory (42 GB available) and 206 GB free disk: room for about 30 boxes of 1 GB each.

- W1, Fri 2026-11-13 18:00, acrylblends: "behind a trusted front" (C) and binding `0.0.0.0` (D), with tests on both sides of the
  own-page rule. No outward action.
- W2, Sat 2026-11-14 18:00, webboxesai: a box template that holds an `acryl new` app, prebuilt with its dependencies in the image
  so a box starts in seconds; `curl` from the runner gets its page.
- W3, Sun 2026-11-15 18:00, webboxesai + z370n (needs the owner's go, a Coolify/Traefik change on production): one route for
  `*.213-47-80-26.sslip.io` to the runner with a certificate per name, the token-to-cookie exchange, the streaming proxy and the
  forwarded headers (A, B).
- W4, Mon 2026-11-16 18:00: browser only. Sign in on webboxes.ai, "New app", the box opens on its own address with the ACRYL frame and
  its agent; the agent changes the app through the door.
- W5, Tue 2026-11-17 18:00, acryl: `acryl deploy` in a local app folder sends it to a new box and prints its address (`acryl login`
  once, with a token from the WebBoxes.ai dashboard), and a "Deploy to WebBoxes.ai" step in the launcher.
- W6, Wed 2026-11-18: the dry run as an attendee, from a browser and from the three systems; Thu 2026-11-19 for fixes.

Owner answers of 2026-11-12 for the workshop:

- z370n: "Feel free to update anything you want. This is our development server, Ubuntu ... fully ours, fully by our control, and running
  in our own network". So W3's Traefik route on z370n is approved.
- Model key: "i will provide 1 key for all". One workshop DeepSeek key, injected into every box at start as a secret (the existing key file
  on z370n, read by the runner, never printed).
- Attendees: 17 signed up (https://luma.com/nvede5nv); z370n's room for about 30 boxes is enough.

**Changed 2026-11-12, same day: `<id>.box.webboxes.ai` instead of sslip.io.** sslip.io is not on the Public Suffix List (checked
against publicsuffix.org), so every sslip.io certificate in the world shares Let's Encrypt's 50 a week and a box would get none. The owner
adds one wildcard record at Spaceship (`*.box` A `213.47.80.26`); every box name then resolves by itself. Per box, the runner writes one
Traefik file-provider route for `<id>.box.webboxes.ai` (Traefik's HTTP challenge needs an exact name, not a pattern) and removes it with
the box; the certificate comes on the first visit and counts against webboxes.ai's own limit.

### W3 in detail (2026-11-12)

1. **One route per box.** Traefik on z370n sends `https://<id>.box.webboxes.ai` to a second runner listener, the box gate (port 7071),
   with a Let's Encrypt certificate per name (HTTP challenge), from a route file the runner writes when it creates the box.
2. **Entering a box.** Only the signed-in owner of a box gets in. On webboxes.ai, "Open" checks the session and the row, as the preview
   does today, and redirects to `https://<id>.<suffix>/__webbox/enter?t=<signed>`. The signature is the preview's HMAC scheme (same secret,
   shared with the runner), valid two minutes. The gate checks it, sets a host-only cookie `__Host-webbox` (`Secure`, `HttpOnly`,
   `SameSite=Lax`, 12 hours), and redirects to the app's own launch address (its frame token, read from the box), so the ACRYL frame's own
   sign-in happens on that origin too.
3. **Every later request.** No valid cookie: 403 with a link back to webboxes.ai. Valid: the gate passes the request to the box (method,
   body, `Host` = the public host, `Origin`, `Referer`, `Sec-Fetch-*`, the app's own cookies without `__Host-webbox`), streams the answer,
   upgrades WebSockets, and closes an idle stream after 10 minutes instead of cutting every request at 30 seconds.
4. **What the box checks** is acrylblends 1.5.2's trusted front: the peer is the runner's fixed address, the `Host` is the public host.

Risk named: the home line's address can change; every sslip.io name then breaks until the template is re-pointed. The
`<appId>.webboxes.ai` names (later, owner) remove that.

## Rules that stay in force

- A push to webboxesai `main` deploys to production, so every push goes through the coordinator first.
- z370n is production: scratch folders only, no system installs, no `docker rm` or prune, nothing under `/data/coolify`.
- Coolify and DNS change only with the owner's go-ahead.
- No secrets are read or printed.

## Questions

- **Q1 (answered by the owner 2026-11-12).** "for now let's make what is faster to demonstrate so `<id>.<ip>.sslip.io` will be fine
  for now and later with `<appId>.webboxes.ai` subdomain". So the workshop uses sslip.io names (no DNS change); the webboxes.ai
  subdomain comes later.
- **Q2 (answered by the owner 2026-10-28).** The agent of the gate is the app's own agent: the agent panel with the account's own
  model key (BYOK), not `@webboxes/agent`.
- **Q3 (moot while parked).** The order of the Blends trusted-front slice against spec 047 T009 (upgrades). T009 shipped in
  acrylblends 0.11.0, so the trusted-front slice is free whenever M9 resumes.

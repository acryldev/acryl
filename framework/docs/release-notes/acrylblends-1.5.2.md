# acrylblends 1.5.2

An app can run behind a hosting front, such as a WebBoxes.ai box. Released with [create-acrylblends 1.5.2](create-1.5.2.md); the frame packages
are unchanged. Nothing changes for an app on your own machine: both settings below are unset there.

- **A trusted front.** A hosted app's page reaches it through a reverse proxy under a public origin, for example
  `https://a1b2.213-47-80-26.sslip.io`. The hosting template sets `ACRYL_PUBLIC_ORIGIN` (that origin) and `ACRYL_TRUSTED_PROXY` (the proxy's exact
  peer addresses, comma separated). A request then counts as the app's own page only when it comes from one of those addresses, names exactly the
  public host, and, for a change, shows exactly the public origin. Another peer, another host, another origin, `null` and cross-site requests are
  refused. The page routes and the state, door and agent panel sockets accept the front; the door's operator route (`.acryl/bin/acryl`) stays
  loopback-only, so nothing outside the box can operate the app.
- **The frame host listens where the instance says.** `ACRYLBLENDS_HOST` (else a hosting platform's `HOST`) is the interface the frame host binds;
  unset, it stays `127.0.0.1`. A hosted box sets `0.0.0.0`. The launch token is still required on every interface.

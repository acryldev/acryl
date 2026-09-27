# acryl-loopback-http

The single strict same-origin loopback check for ACRYL's private Host routes, with a bounded JSON body reader
and uniform JSON responses. Used by `acryl-workspace`, `acryl-plugin-admin` and Desktop's settings routes.

A private route must be reachable only from the app's own page: the socket must be on loopback, the `Host`
header must match, and a mutating request (or a WebSocket upgrade) must carry the exact `Origin`.

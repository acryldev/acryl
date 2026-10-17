#!/usr/bin/env bash
# Prove the ACRYL web image runs unattended: it boots with no one at it, refuses a browser without the launch token, mints a session for the
# proxy's public name with it, runs as a non-root user, keeps the workspace (and the browser session) when the container is recreated on the same
# volume, and stops cleanly on SIGTERM. Everything it creates is named acryl-smoke-<random> and removed on exit, pass or fail.
#
#   distribution/acryl-web-container/scripts/smoke.sh <image> [host-port]
set -euo pipefail
image="${1:?usage: smoke.sh <image> [host-port]}"
port="${2:-39080}"
run="acryl-smoke-$(od -An -N4 -tx1 /dev/urandom | tr -d ' \n')"
public="ws-smoke.example.test"
fail() { echo "SMOKE FAILED: $*" >&2; docker logs "$run" 2>&1 | sed -E 's/token=[A-Za-z0-9_-]+/token=<redacted>/g' | tail -30 >&2 || true; exit 1; }
cleanup() { docker rm -f "$run" >/dev/null 2>&1 || true; docker volume rm "$run" >/dev/null 2>&1 || true; }
trap cleanup EXIT

start() {
  docker run -d --name "$run" -p "127.0.0.1:$port:3080" -v "$run:/data" -e ACRYL_WEB_TRUSTED_HOSTS="$public" "$image" >/dev/null
  for _ in $(seq 1 120); do
    token="$(docker logs "$run" 2>&1 | sed -nE 's#^ACRYL web: http://[^ ]*[?&]token=([A-Za-z0-9_-]+).*#\1#p' | tail -1)"
    [ -n "$token" ] && return 0
    [ "$(docker inspect -f '{{.State.Running}}' "$run")" = true ] || fail "the container exited during boot"
    sleep 1
  done
  fail "no 'ACRYL web:' line within 120 s"
}
# status <Host header> <path> [curl options...]: the HTTP status as a browser behind the proxy (or an attacker naming another host) would get it.
status() { local host="$1" path="$2"; shift 2; curl -s -o /dev/null -w '%{http_code}' -H "Host: $host" "$@" "http://127.0.0.1:$port$path"; }

start
echo "booted unattended"
[ "$(docker exec "$run" id -u)" = 10001 ] || fail "ACRYL runs as uid $(docker exec "$run" id -u), not the image's acryl user"
[ "$(status "$public" /)" = 401 ] || fail "the index answered without the launch token"
[ "$(status evil.example.test /api/ping)" = 403 ] || fail "an untrusted Host passed the /api fence"
cookie="$(curl -s -o /dev/null -D - -H "Host: $public" "http://127.0.0.1:$port/?token=$token" | sed -nE 's/^[Ss]et-[Cc]ookie: ([^;]+).*/\1/p' | tr -d '\r' | head -1)"
[ -n "$cookie" ] || fail "the launch token did not mint a session cookie"
[ "$(status "$public" / -H "Cookie: $cookie")" = 200 ] || fail "the session cookie does not open the workspace"
echo "auth: 401 without token, 403 for an untrusted host, session cookie for $public"

first="$token"
docker rm -f "$run" >/dev/null
start
[ "$token" != "$first" ] || fail "the launch token did not change across a recreate"
[ "$(status "$public" / -H "Cookie: $cookie")" = 200 ] || fail "the workspace session did not survive a recreate on the same volume"
docker exec "$run" test -d /data/acryl/.dsh/profiles || fail "no engine profile under /data/acryl/.dsh"
echo "recreated on the same volume: new launch token, the old session still opens it"

began="$(date +%s)"
docker stop -t 20 "$run" >/dev/null
took=$(( $(date +%s) - began ))
code="$(docker inspect -f '{{.State.ExitCode}}' "$run")"
[ "$code" = 0 ] || fail "SIGTERM stop exited with $code"
[ "$took" -lt 15 ] || fail "stopping took ${took}s"
echo "SIGTERM: exit 0 in ${took}s"
echo "SMOKE PASSED"

# syntax=docker/dockerfile:1.7
#
# ACRYL web in a container: one workspace per container, everything it keeps under the /data volume, reachable on port 3080 by whoever owns the
# network in front of it (a proxy, a port mapping). See README.md next to this file for the contract.
#
# Two ways to get the ACRYL web archive (the same portable runtime the GitHub release ships):
#   docker build -f distribution/acryl-web-container/Dockerfile --build-arg ACRYL_VERSION=0.2.5 .        a published release (default)
#   docker build -f distribution/acryl-web-container/Dockerfile --build-arg ARCHIVE_SOURCE=source .      built from this checkout (unreleased changes)
# The build context is the repository root either way; the source build needs a clean tree (`git archive HEAD` piped to `docker build -` works).

ARG ARCHIVE_SOURCE=release
ARG NODE_VERSION=24.19.0

# --- the archive, from a published release ---------------------------------------------------------------------------------------------------------------
FROM debian:bookworm-slim AS archive-release
ARG ACRYL_VERSION=0.2.4
ARG TARGETARCH
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*
RUN set -eu; \
    arch="$(case "$TARGETARCH" in amd64) echo x64;; arm64) echo arm64;; *) echo "unsupported architecture $TARGETARCH" >&2; exit 1;; esac)"; \
    base="https://github.com/acryldev/acryl/releases/download/v${ACRYL_VERSION}"; \
    curl -fsSL -o /tmp/acryl-web.tar.gz "$base/acryl-web-linux-$arch.tar.gz"; \
    curl -fsSL -o /tmp/receipt.json "$base/acryl-web-linux-$arch.tar.gz.receipt.json"; \
    grep -q "\"$(sha256sum /tmp/acryl-web.tar.gz | cut -d' ' -f1)\"" /tmp/receipt.json || { echo "the archive does not match its release receipt" >&2; exit 1; }; \
    mkdir -p /opt && tar -xzf /tmp/acryl-web.tar.gz -C /opt && mv "/opt/acryl-web-linux-$arch" /opt/acryl-web

# --- the archive, built from this checkout ----------------------------------------------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm AS archive-source
ARG NODE_VERSION
ARG TARGETARCH
WORKDIR /src
COPY . .
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 CI=1
# Package scripts call `pnpm` by name: the shims make it the repository's pinned release.
RUN corepack enable && pnpm install --frozen-lockfile
RUN pnpm --filter "acryl-web..." run build
RUN set -eu; \
    arch="$(case "$TARGETARCH" in amd64) echo x64;; arm64) echo arm64;; *) echo "unsupported architecture $TARGETARCH" >&2; exit 1;; esac)"; \
    node scripts/build-web-archive.mjs "linux-$arch" "$NODE_VERSION" /tmp/out; \
    mkdir -p /opt && tar -xzf "/tmp/out/acryl-web-linux-$arch.tar.gz" -C /opt && mv "/opt/acryl-web-linux-$arch" /opt/acryl-web

FROM archive-${ARCHIVE_SOURCE} AS archive

# --- the runtime image ------------------------------------------------------------------------------------------------------------------------------------
FROM debian:bookworm-slim
# git: the agent's checkpoints and project history; tini: signals reach ACRYL so SIGTERM disposes it cleanly; ca-certificates: model APIs over TLS.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates git tini \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --uid 10001 --create-home --home-dir /data/home --shell /bin/bash acryl \
 && mkdir -p /data/acryl && chown -R acryl:acryl /data
COPY --from=archive /opt/acryl-web /opt/acryl-web
# Everything the workspace keeps lives under /data: the ACRYL home (settings, sessions, profiles, plugins with their store, the engine home in .dsh, and the
# first project folder in documents/) and the OS home. Recreating the container on the same volume brings the workspace back.
ENV HOME=/data/home \
    ACRYL_HOME=/data/acryl \
    ACRYL_WEB_HOST=0.0.0.0 \
    ACRYL_WEB_PORT=3080 \
    ACRYL_REQUIRE_ISOLATED_HOME=1 \
    PATH=/opt/acryl-web/runtime/bin:$PATH
VOLUME ["/data"]
EXPOSE 3080
USER acryl
WORKDIR /data/home
ENTRYPOINT ["/usr/bin/tini", "--", "/opt/acryl-web/runtime/bin/acryl-web"]

#!/bin/bash
# Publish a product release of this monorepo (made by .github/workflows/product-release.yml) to that product's own release repository, where it is
# the Latest release: a person's fixed download link is https://github.com/<repo>/releases/latest/download/<file> and never changes between releases.
# The source stays here; the release repository holds only releases and a README that points back. Owner decision 2026-11-20.
# Usage: bash scripts/publish-product-release.sh control-center-v0.2.2   (or ade-v0.2.1). Needs gh signed in with write access to the release repo.
set -euo pipefail
TAG=${1:?usage: publish-product-release.sh <control-center-vX.Y.Z|ade-vX.Y.Z>}
case "$TAG" in
  control-center-v*) REPO=acrylblends/63-acryl-control-center; NAME="ACRYL Control Center" ;;
  ade-v*) REPO=acrylblends/05-acryl-ade; NAME="ACRYL ADE" ;;
  *) echo "not a product tag: $TAG" >&2; exit 2 ;;
esac
SOURCE=acryldev/acryl
VERSION=v${TAG##*-v}
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
gh release download "$TAG" -R "$SOURCE" -D "$WORK"
COUNT=$(find "$WORK" -type f | wc -l | tr -d ' ')
[ "$COUNT" -gt 0 ] || { echo "no assets in $SOURCE $TAG" >&2; exit 1; }
NOTES="$NAME $VERSION. Built from https://github.com/$SOURCE/tree/$TAG (release https://github.com/$SOURCE/releases/tag/$TAG).

First start: on macOS the app is not signed yet, so right-click it and choose Open; on Windows, if SmartScreen asks, click More info and then Run anyway; on Linux, double-click the .deb to open it in the Software app."
if gh release view "$VERSION" -R "$REPO" >/dev/null 2>&1; then
  gh release upload "$VERSION" -R "$REPO" --clobber "$WORK"/*
else
  gh release create "$VERSION" -R "$REPO" --title "$NAME $VERSION" --notes "$NOTES" --latest "$WORK"/*
fi
# A run that stopped half way (a timeout while downloading) leaves the release without the Latest mark: set it every time, after every file is up.
gh release edit "$VERSION" -R "$REPO" --latest >/dev/null
echo "published $COUNT files: https://github.com/$REPO/releases/tag/$VERSION (Latest)"

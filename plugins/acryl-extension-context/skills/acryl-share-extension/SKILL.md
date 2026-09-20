---
name: acryl-share-extension
description: Use when the user wants to publish, share or distribute an extension through the marketplace.
---
# Prepare an extension for the marketplace

Read {{pack}}/docs/delivery/marketplace.md and {{pack}}/docs/extending/packaging.md. Make sure it works locally first
(installed and verified). Add the catalog metadata (keyword acryl-package, GitHub repository, license, version, no
private) then call acryl_prepare_publish with the absolute package directory and fix every error it lists. When it
reports ready, tell the user the exact npm publish step is theirs; you cannot and must not publish, and never ask for
or handle a token.

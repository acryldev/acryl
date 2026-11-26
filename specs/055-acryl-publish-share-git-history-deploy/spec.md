# Spec 055: Publish, Share, Git sync, History and Deploy

Status: design, waiting for the owner's go. Nothing is built.

## Why

The owner, 2026-11-26: "share with team sounds misleading... what if i'm solo builder", "orient on established players base44.com Lovable.dev",
"they allow sync to git and it's easy", and on versions: "i still don't see usefulness of this UX and save didn't work, typed 712 -> save -> nothing".

## What

Modeled on Lovable and Base44:

- **History** replaces Versions and the Save point button: every agent turn and every pause in your own edits is a version, a star bookmarks one, Restore
  brings one back as a new version. Branches move behind a switch in History.
- **GitHub sync** replaces Share to GitHub: connect once in Settings > GitHub, a private repository is created, and it syncs both ways by itself. The
  secret check runs before every sync.
- **Publish** (top bar): Web (WebBoxes.ai), Desktop app (today's Share with team: GitHub builds the installers), Blends store.
- **Share** (top bar): copy link, invite on GitHub, download the code as a ZIP.
- **Deploy**: the WebBoxes production deploy of branch `webbox-frame-current` (current frame, Build installer hidden in a box, the Share with team row).

## Design

[design/publish-share-git-history.html](design/publish-share-git-history.html): every state of each part, the WebBoxes deploy case by case, and the two
decisions. Open it in a browser, or with `npx -y lavish-axi` to annotate it.

## Open decisions

1. Build the design as shown, with changes, or not yet; and Branches: behind a switch, kept, or removed.
2. WebBoxes production deploy: now as on the test box, or once with 055.

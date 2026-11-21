# @acryldev/blends 1.7.16

Released 2026-11-21.

## Changed

- Where an app came from is recorded in its package.json (`"acryl": { "from": "github:ana/notes#v0.2.0" }`), not in blend.yaml.
  An app made from a Blend shared before 1.7.15 carries an older manifest checker that refuses unknown blend.yaml fields; with the
  record in package.json such an app passes its own tests. `acrylblends update` reads package.json first, then blend.yaml
  `metadata.from` (apps made with 1.7.13 to 1.7.15).
- Linux: `acrylblends pack` also writes a portable `ACRYL-<Product>-linux-<arch>.tar.gz`, and `acrylblends pkgbuild` writes a PKGBUILD
  for Arch Linux and Omarchy (`makepkg -si`).

# acrylblends 1.5.8

A finished app packed as its own product (ACRYL Control Center, ACRYL ADE) no longer asks "Name your app", also for an app it made before.
Released with [create-acrylblends 1.5.8](create-1.5.8.md); no frame package changes.

- **The packer marks a product made from one Blend `named` in `product.json`, and its first start reads that.** 1.5.7 keyed on the
  product's `seed`, which a product packed from its own folder does not have, so ACRYL Control Center and ACRYL ADE still asked.
- **An app such a product made before is marked on its next start**, under the name it has: the dialog does not come back.

An app made with an earlier release gets these with `npx acrylblends upgrade`, then `npm install`.

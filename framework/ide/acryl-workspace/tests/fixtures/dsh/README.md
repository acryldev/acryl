# The DSH source `tab-kinds.spec.ts` scans

These are byte-identical copies of the DeepSeek Harness client source files that the ported guard in
[`tests/shell/tab-kinds.spec.ts`](../../../../tests/shell/tab-kinds.spec.ts) reads, from the pinned DSH source
(`deepseek-harness`, commit `639ed01539`, the submodule ACRYL's checkout carries), MIT licensed.

ACRYL's suite reads them from its `deepseek-harness` submodule at `packages/client/`. This repository has no
such submodule, so the files live here. Only the under-`src` files the guard's own filter selects are copied:
the guard walks `packages/client/<package>/src` and reads the files that mention the right-sidebar tab
registry, so every other source file contributes nothing to its result. The layout (`<package>/src/...`) is
kept so the ported guard reads the same tree shape.

Keep them byte-identical to the pinned source. Do not edit them to make a test pass: a failure here means the
ported tab kinds collide with an upstream kind, or the pinned DSH source moved.

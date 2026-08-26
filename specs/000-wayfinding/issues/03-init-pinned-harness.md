# Initialize the pinned DeepSeek Harness submodule

Type: task
Status: open

## Question

Nothing to decide. The pin is `b150a551` / `0.1.1-rc.2` in `upstream.json`.
The checkout must be present so later research and specs cite the exact
source, not a sibling clone.

Do: `git submodule update --init --recursive` in this repo, then record the
resolved commit and that the working tree is clean of submodule edits.

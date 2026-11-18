# The DSH source the ported suite reads

These files are byte-identical copies from the pinned DeepSeek Harness source (`deepseek-harness`, commit `639ed01539`), MIT licensed. ACRYL's suite compares parts of this package against DSH's own source (extraction provenance) and imports one pure function from the conversation client contract. The ACRYL repository reads them from its `deepseek-harness` submodule; this repository has no submodule, so the files live here.

Keep them byte-identical to the pinned source. Do not edit them to make a test pass: a failure here means the ported source drifted from the component it was extracted from.

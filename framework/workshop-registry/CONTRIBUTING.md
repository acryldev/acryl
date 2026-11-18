# Adding, changing or removing an entry

## The rules the check enforces

1. **One entry, your own folder.** A pull request changes files only inside `blends/<login>.<name>/`, where `<login>` is the GitHub login of the pull request's author, in lower case (`<name>`: lower case letters, digits and dashes). One entry per pull request. Nothing else may change: not `index.json`, not the README, not a script, not a workflow, not another login's entries.
2. **No links, nothing renamed in from elsewhere.** A symbolic link anywhere in the entry is refused.
3. **A valid, public entry.** `blend.yaml` passes the Blends format check for distribution: `metadata.id` is the folder name, a `version`, a `license` (an SPDX id such as `MIT`), `visibility: public`, a `category` and a one-line `description`. `node scripts/make-entry.mjs` writes all of it.
4. **An app for acrylblends.** The folder holds `acryl.template.json` (`name`, `description`, `plugins`), a `package.json` and a `src/` folder.
5. **Nothing that runs on install.** `package.json` defines none of `preinstall`, `install`, `postinstall`, `prepare` and the like.
6. **Small.** No file over 1 MB, no more than 8 MB or 1500 files in total, no `node_modules/` or `.git/`.
7. **No keys.** Nothing that looks like a private key, an API key, a GitHub or npm token.
8. **Works on every OS.** No name Windows reserves or refuses (`con`, `nul.txt`, a trailing dot or space, `< > : " | ? * \`), no two paths that differ only in case, no path over 200 characters, and no carriage return in a text file: save with LF. `make-entry` refuses these before it makes the entry, and adds the `.gitattributes` that keeps line endings LF.

## Changing your entry

Edit your folder and open a pull request; the check and the merge are the same. Bump `metadata.version` when you change what it does.

## Taking your entry down

`git rm -r blends/<login>.<name>`, commit, open a pull request. A pull request that only deletes your own folder is merged without further checks, and the entry leaves the listing.

## When the check refuses

The comment on your pull request lists every problem. Fix them and push to the same branch: the check runs again on the new commit.

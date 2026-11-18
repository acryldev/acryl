/** The `.tgz` of an entry's folder: its files under one top folder, the same bytes for the same files. */
export function packEntry(folder: string): Buffer
/** Write every entry's archive beside its folder and name them in the registry's `index.json`; the number of entries. */
export function writeArchives(root: string): number

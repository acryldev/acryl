import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'

// The pure parts of scripts/sync-sites.mjs: turn a release-notes file into the entry the framework site renders, and find which releases the site lacks.

/** Markdown inline syntax as the site's plain text: links keep their text, bold, italics and code lose their marks. */
export function plain(text) {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, '$1')
    .replace(/\*\*([^*]+)\*\*/gu, '$1')
    .replace(/(?<![\w*])\*([^*\n]+)\*(?![\w*])/gu, '$1')
    .replace(/`([^`]+)`/gu, '$1')
    .replace(/\s+/gu, ' ')
    .trim()
}

/**
 * `{ intro, body: [{ heading, paragraphs }] }` from the markdown of one release's notes: the first paragraph under the title is the intro, every `##` starts a section,
 * every bullet and every paragraph is one entry of it. Fenced code is left out.
 */
export function entryOf(markdown, version) {
  const lines = markdown.replace(/\r\n/gu, '\n').split('\n')
  let intro = ''
  const body = []
  let section
  let paragraph = []
  let inFence = false
  const flush = () => {
    const text = plain(paragraph.join(' '))
    paragraph = []
    if (text === '') return
    if (section === undefined) intro = intro === '' ? text : intro
    else section.paragraphs.push(text)
  }
  for (const line of lines) {
    if (line.startsWith('```')) {
      flush()
      inFence = !inFence
      continue
    }
    if (inFence) continue
    if (/^#\s/u.test(line)) continue
    const heading = /^##\s+(.*)$/u.exec(line)
    if (heading) {
      flush()
      section = { heading: plain(heading[1]), paragraphs: [] }
      body.push(section)
      continue
    }
    if (/^\s*[-*]\s+/u.test(line)) {
      flush()
      paragraph = [line.replace(/^\s*[-*]\s+/u, '')]
      continue
    }
    if (line.trim() === '') {
      flush()
      continue
    }
    paragraph.push(line.trim())
  }
  flush()
  return {
    intro: intro === '' ? `Release notes ${version}.` : intro,
    body: body.filter((s) => s.paragraphs.length > 0),
  }
}

/** The TypeScript of one `doc-content.ts` entry. */
export function entrySource(version, entry) {
  const slug = `framework/release-notes-${version.replaceAll('.', '-')}`
  const sections = entry.body
    .map(
      (section) =>
        `      { heading: ${JSON.stringify(section.heading)}, paragraphs: [\n${section.paragraphs.map((p) => `        ${JSON.stringify(p)},`).join('\n')}\n      ] },`,
    )
    .join('\n')
  return `  "${slug}": {\n    intro: ${JSON.stringify(entry.intro)},\n    body: [\n${sections}\n    ],\n  },\n`
}

const compare = (a, b) => {
  const x = a.split('.').map(Number)
  const y = b.split('.').map(Number)
  for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return (x[i] ?? 0) - (y[i] ?? 0)
  return 0
}

/** The versions the site's `doc-content.ts` has release notes for. */
export function presentVersions(docContent) {
  return [...docContent.matchAll(/"framework\/release-notes-(\d+)-(\d+)-(\d+)":/gu)].map(
    (m) => `${m[1]}.${m[2]}.${m[3]}`,
  )
}

/**
 * `doc-content.ts` and `content.ts` with the missing releases added (newest first, above the newest the site has). `notes` is `{ version: markdown }`. Returns the new texts, the versions added, and `gaps`: older releases the site lacks that were not added.
 * Throws when the site's files no longer have the anchors this edits (the site's layout changed: the script has to follow it).
 */
export function addReleases(docContent, content, notes) {
  const have = presentVersions(docContent)
  const newest = have.reduce(
    (best, version) => (best === undefined || compare(version, best) > 0 ? version : best),
    undefined,
  )
  // Forward only: a release older than the newest the site has would belong in the middle of its list; those gaps are reported, not filled.
  const missing = Object.keys(notes)
    .filter(
      (version) =>
        !have.includes(version) && (newest === undefined || compare(version, newest) > 0),
    )
    .sort((a, b) => compare(b, a))
  const gaps = Object.keys(notes)
    .filter((version) => !have.includes(version) && !missing.includes(version))
    .sort(compare)
  if (missing.length === 0) return { docContent, content, added: [], gaps }
  const anchor = /^ {2}"framework\/release-notes-\d+-\d+-\d+": \{$/mu.exec(docContent)
  if (anchor === null) throw new Error('doc-content.ts has no release-notes entry to insert above')
  const blocks = missing
    .map((version) => entrySource(version, entryOf(notes[version], version)))
    .join('')
  const newDoc = `${docContent.slice(0, anchor.index)}${blocks}${docContent.slice(anchor.index)}`
  const firstItem = content.indexOf('"Release notes ')
  if (firstItem === -1) throw new Error('content.ts has no "Release notes" item to insert before')
  const newContent = `${content.slice(0, firstItem)}${missing.map((version) => `"Release notes ${version}", `).join('')}${content.slice(firstItem)}`
  return { docContent: newDoc, content: newContent, added: missing, gaps }
}

/**
 * Every picture a synced page shows that the site does not have. `docsDir` is the site's `src/docs/framework`, `publicDir` its `public` folder: an image written root-absolute
 * (`/docs-assets/workshop/s1.webp`) must be a file below `publicDir`, a relative one a file next to its page. A web address is not checked. Returns `[{ page, image }]`, `page` relative to `docsDir`.
 */
export function missingImages(docsDir, publicDir) {
  const missing = []
  const pages = (folder) =>
    readdirSync(folder, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? pages(join(folder, entry.name))
        : entry.name.endsWith('.md')
          ? [join(folder, entry.name)]
          : [],
    )
  for (const page of pages(docsDir)) {
    // Fenced code shows image syntax as text: only prose is read.
    const prose = readFileSync(page, 'utf8').replace(/^(```|~~~)[\s\S]*?^\1/gmu, '')
    for (const match of prose.matchAll(/!\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/gu)) {
      const image = match[1].split(/[?#]/u)[0]
      if (/^[a-z][a-z0-9+.-]*:|^\/\//iu.test(image)) continue
      const file = image.startsWith('/')
        ? resolve(publicDir, `.${image}`)
        : resolve(dirname(page), image)
      if (
        !file.startsWith(resolve(image.startsWith('/') ? publicDir : docsDir) + sep) ||
        !existsSync(file)
      )
        missing.push({
          page: page
            .slice(docsDir.length + 1)
            .split(sep)
            .join('/'),
          image: match[1],
        })
    }
  }
  return missing
}

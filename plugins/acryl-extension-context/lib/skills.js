import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const BUNDLED_RANK = 600

/** Minimal frontmatter reader: `---\nname: x\ndescription: y\n---\nbody`. */
export function parseSkill(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/u.exec(text)
  if (!match) return undefined
  const meta = {}
  for (const line of match[1].split(/\r?\n/u)) {
    const kv = /^([a-z-]+):\s*(.*)$/u.exec(line)
    if (kv) meta[kv[1]] = kv[2].trim()
  }
  if (!meta.name || !meta.description) return undefined
  return { name: meta.name, description: meta.description, body: match[2] }
}

/**
 * A SkillProvider over `<root>/skills/<name>/SKILL.md`, the same seam pi.dev's skills use:
 * only name and description sit in context; the body loads on demand. `{{pack}}` in a body
 * is replaced by the pack root so its doc links are real paths. Rank is the bundled rank, so
 * a project or user skill of the same name overrides it.
 */
export function createSkillProvider(root, fs = { existsSync, readdirSync, readFileSync }) {
  const dir = join(root, 'skills')
  const read = () => {
    if (!fs.existsSync(dir)) return []
    return fs.readdirSync(dir)
      .map(entry => ({ entry, parsed: parseSkill(safeRead(fs, join(dir, entry, 'SKILL.md'))) }))
      .filter(item => item.parsed !== undefined)
  }
  const candidateOf = ({ parsed }) => ({
    name: parsed.name,
    description: parsed.description,
    invocation: { modelInvocable: true, userInvocable: true },
    provider: 'acryl-extension-skills',
    source: 'bundled',
    rank: BUNDLED_RANK,
  })
  return {
    name: 'acryl-extension-skills',
    list: () => Promise.resolve(read().map(candidateOf)),
    get: candidate => {
      const found = read().find(item => item.parsed.name === candidate.name)
      if (!found) return Promise.resolve(undefined)
      return Promise.resolve({ ...candidateOf(found), content: found.parsed.body.replaceAll('{{pack}}', root) })
    },
  }
}

function safeRead(fs, path) {
  try { return fs.readFileSync(path, 'utf8') } catch { return '' }
}

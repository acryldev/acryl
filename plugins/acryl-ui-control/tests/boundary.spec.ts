import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Agent Control is one implementation for Web and Desktop (spec 041 FR-013, TS02): nothing in this package may
 * import Electron or reach into a surface. This reads the sources so a slip fails here, not in one surface.
 */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? sources(path) : /\.(ts|tsx)$/.test(name) ? [path] : []
  })
}

const files = sources(join(process.cwd(), 'src'))

describe('acryl-ui-control boundaries', () => {
  it('has source to check', () => {
    expect(files.length).toBeGreaterThan(10)
  })

  it('imports nothing from Electron, Desktop or the apps', () => {
    const offenders = files.filter(file => /from\s+['"](?:electron|acryl-desktop|acryl-web|acryl-cli)(?:['"/])/.test(readFileSync(file, 'utf8')) || /['"](?:\.\.\/)+apps\//.test(readFileSync(file, 'utf8')))
    expect(offenders).toEqual([])
  })

  it('keeps the Host free of DOM code and the driver free of Host code', () => {
    const host = files.filter(file => file.includes('/host/') || file.endsWith('/src/index.ts'))
    const client = files.filter(file => file.includes('/client/'))
    expect(host.filter(file => /from\s+['"](?:\.\.\/)+client\//.test(readFileSync(file, 'utf8')))).toEqual([])
    expect(client.filter(file => /from\s+['"](?:\.\.\/)+host\//.test(readFileSync(file, 'utf8')) || /from\s+['"](?:ws|acryl-loopback-http|@deepseek-ai\/dsh-tools)['"]/.test(readFileSync(file, 'utf8')))).toEqual([])
  })

  it('only the Host reads the environment', () => {
    expect(files.filter(file => file.includes('/client/') && /process\.env/.test(readFileSync(file, 'utf8')))).toEqual([])
  })
})

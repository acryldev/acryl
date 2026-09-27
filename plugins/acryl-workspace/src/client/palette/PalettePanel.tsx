/**
 * Settings > Command palette: what the palette lists. Whole groups (commands, agents, open tabs, worktrees,
 * settings, files) and single entries can be turned off. The choice is kept in the browser storage and applies at once.
 */

import { useSyncExternalStore } from 'react'
import { Segmented } from '../agents/controls.tsx'
import type { PaletteConfigState } from './palette-config.ts'
import { GROUP_LABELS, PALETTE_GROUPS } from './palette-items.ts'
import { CONFIGURABLE_ENTRIES, PALETTE_SHORTCUT_LABEL } from './palette-commands.ts'

export interface PaletteSectionInjected {
  readonly config: PaletteConfigState
}

export function PalettePanel({ config }: PaletteSectionInjected) {
  const current = useSyncExternalStore(config.subscribe, config.getSnapshot)
  return (
    <section className="dshAgentsSection" aria-label="Command palette">
      <h3 className="dshAgentsHeading">Command palette</h3>
      <p className="dshAgentsText">Press <kbd>{PALETTE_SHORTCUT_LABEL()}</kbd> to search commands, agents, tabs, worktrees, settings and files. Choose what it lists here.</p>
      <div className="dshAgentsBlock">
        <h4 className="dshAgentsSubheading">Groups</h4>
        <ul className="dshAgentsList">
          {PALETTE_GROUPS.map(group => (
            <li key={group} className="dshAgentsRow" data-palette-group={group}>
              <div className="dshAgentsRowMain">
                <div className="dshAgentsRowName"><span className="dshAgentsRowLabel">{GROUP_LABELS[group]}</span></div>
                <Segmented
                  label={`${GROUP_LABELS[group]} in the palette`}
                  value={current.hiddenGroups.includes(group) ? 'off' : 'on'}
                  options={[{ id: 'on', label: 'Shown' }, { id: 'off', label: 'Hidden' }]}
                  onChange={() => { config.toggleGroup(group) }}
                />
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="dshAgentsBlock">
        <h4 className="dshAgentsSubheading">Individual commands</h4>
        <ul className="dshAgentsList">
          {CONFIGURABLE_ENTRIES.map(item => (
            <li key={item.id} className="dshAgentsRow" data-palette-item={item.id}>
              <div className="dshAgentsRowMain">
                <div className="dshAgentsRowName"><span className="dshAgentsRowLabel">{item.title}</span></div>
                <Segmented
                  label={`${item.title} in the palette`}
                  value={current.hiddenItems.includes(item.id) ? 'off' : 'on'}
                  options={[{ id: 'on', label: 'Shown' }, { id: 'off', label: 'Hidden' }]}
                  onChange={() => { config.toggleItem(item.id) }}
                />
              </div>
            </li>
          ))}
        </ul>
        <div><button type="button" className="dshAgentsButton" onClick={() => { config.reset() }}>Show everything again</button></div>
      </div>
    </section>
  )
}

export function PaletteSection(props: PaletteSectionInjected) {
  return <PalettePanel {...props} />
}

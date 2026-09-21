/**
 * Extracted from DSH: the tab strip and panel of packages/client/ui-settings-plugins/src/client/PluginsSettingsSection.tsx, pinned deepseek-harness 5dda764ed3.
 * Markup, keyboard handling (ArrowLeft/ArrowRight/Home/End with roving tabindex) and Tabs.module.css are the original's; the slot rendering and locale
 * are replaced by plain props (tabs, the active id, the panel as children). See manifest.yml.
 */
import { useId, useRef } from 'react'
import type { ReactNode } from 'react'
import css from './Tabs.module.css'

export interface TabItem {
  id: string
  label: string
}

export interface TabsProps {
  tabs: readonly TabItem[]
  /** Active tab id. */
  value: string
  onChange: (id: string) => void
  /** Accessible name of the tab list. */
  label?: string
  /** The active panel's content. */
  children?: ReactNode
}

/**
 * Render the tab strip with the active panel below it.
 * @param props - tabs, selection and the panel content.
 * @returns the strip and panel.
 */
export function Tabs({ tabs, value, onChange, label, children }: TabsProps) {
  const tabsId = useId()
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  return (
    <>
      <div className={css.tabs} role="tablist" {...label === undefined ? {} : { 'aria-label': label }}>
        {tabs.map((row, index) => {
          const selected = row.id === value
          return (
            <button
              key={row.id}
              ref={(element) => { tabRefs.current[index] = element }}
              id={`${tabsId}-tab-${row.id}`}
              type="button"
              role="tab"
              className={css.tab}
              aria-selected={selected}
              aria-controls={`${tabsId}-panel`}
              data-active={selected ? 'true' : undefined}
              tabIndex={selected ? 0 : -1}
              onClick={() => { onChange(row.id) }}
              onKeyDown={(event) => {
                let nextIndex: number
                switch (event.key) {
                  case 'ArrowRight': nextIndex = (index + 1) % tabs.length; break
                  case 'ArrowLeft': nextIndex = (index - 1 + tabs.length) % tabs.length; break
                  case 'Home': nextIndex = 0; break
                  case 'End': nextIndex = tabs.length - 1; break
                  default: return
                }
                event.preventDefault()
                const nextRow = tabs[nextIndex] as TabItem
                onChange(nextRow.id)
                tabRefs.current[nextIndex]?.focus()
              }}
            >
              {row.label}
            </button>
          )
        })}
      </div>
      <div id={`${tabsId}-panel`} className={css.panel} role="tabpanel" aria-labelledby={`${tabsId}-tab-${value}`}>
        {children}
      </div>
    </>
  )
}

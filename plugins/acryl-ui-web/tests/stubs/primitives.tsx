// Test stub for @deepseek-ai/dsh-client-ui-primitives: the same export names the library uses, rendering plain elements so markup can be asserted.
import type { ReactNode } from 'react'

export const Button = ({ children, ...rest }: { children?: ReactNode } & Record<string, unknown>) => <button {...rest}>{children}</button>
export const Switch = ({ checked, onChange, label }: { checked: boolean, onChange: (v: boolean) => void, label: string }) => <button role="switch" aria-checked={checked} onClick={() => { onChange(!checked) }}>{label}</button>
export const Tag = ({ children }: { children?: ReactNode }) => <span data-tag="">{children}</span>
export const Pill = ({ children }: { children?: ReactNode }) => <span data-pill="">{children}</span>
export const Toast = () => null
export const Tooltip = ({ children }: { children?: ReactNode }) => <>{children}</>
export const Modal = ({ open, title, children, footer }: { open: boolean, title: string, children?: ReactNode, footer?: ReactNode }) => (open ? <div role="dialog" aria-label={title}>{children}{footer}</div> : null)
export const Menu = ({ open, anchor, items, selectedId }: { open: boolean, anchor: ReactNode, items: readonly { id: string, label: string }[], selectedId?: string }) => (
  <>{anchor}{open && <ul role="menu">{items.map(i => <li key={i.id} role="menuitem" aria-checked={i.id === selectedId}>{i.label}</li>)}</ul>}</>
)
export const IconChevronDownOutline14 = ({ className }: { className?: string }) => <svg className={className} data-icon="chevron" />
export const StateDot = ({ state }: { state: string }) => <span data-statedot={state} />
export const DisclosureRow = ({ icon, title, open, expandable, onToggle, collapsedContent, children }: { icon: ReactNode, title: string, open: boolean, expandable: boolean, onToggle: () => void, collapsedContent?: ReactNode, children?: ReactNode }) => (
  <div role="group" data-open={open} data-expandable={expandable}><button onClick={onToggle}>{icon}{title}</button>{collapsedContent}{open && children}</div>
)

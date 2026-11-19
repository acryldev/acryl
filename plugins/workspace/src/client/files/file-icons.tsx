/** Line icons for the Files tab: the tree's chevrons, folders and files (tinted by type), and its header actions. They inherit the text colour. */

const props = { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const

export function ChevronIcon({ open }: { readonly open: boolean }) {
  return <svg {...props} width={12} height={12} className="dshWorkspaceFileChevron" data-open={open || undefined}><path d="M6 4l4 4-4 4" /></svg>
}

export function FolderIcon({ open }: { readonly open: boolean }) {
  return open
    ? <svg {...props}><path d="M1.8 4.2h4.4l1.4 1.4h6.6v1.6H4.6L2.8 12.8H1.8z" /><path d="M4.6 7.2h10.1l-1.9 5.6H2.8z" /></svg>
    : <svg {...props}><path d="M1.8 3.6h4.4l1.4 1.5h6.6v7.7H1.8z" /></svg>
}

/** Tints for common source types, so a folder of mixed files reads at a glance; anything else stays the text colour. */
const TINTS: readonly (readonly [RegExp, string])[] = [
  [/\.(ts|tsx|mts|cts)$/i, '#3b82f6'],
  [/\.(js|jsx|mjs|cjs)$/i, '#eab308'],
  [/\.(json|jsonc|ya?ml|toml|lock)$/i, '#f97316'],
  [/\.(md|mdx|markdown|txt)$/i, '#64748b'],
  [/\.(css|scss|less|html?)$/i, '#a855f7'],
  [/\.(py|rb|go|rs|java|kt|swift|c|cc|cpp|h|hpp|cs)$/i, '#10b981'],
  [/\.(sh|bash|zsh|ps1|bat)$/i, '#22c55e'],
  [/\.(png|jpe?g|gif|svg|webp|ico)$/i, '#ec4899'],
]

/** @returns the tint for a file name, or undefined for the text colour. */
export function fileTint(name: string): string | undefined {
  return TINTS.find(([pattern]) => pattern.test(name))?.[1]
}

export function FileIcon({ name }: { readonly name: string }) {
  const tint = fileTint(name)
  return (
    <svg {...props} style={tint === undefined ? undefined : { color: tint }}>
      <path d="M4 1.8h5.2l2.8 2.8v9.6H4z" />
      <path d="M9.2 1.8v2.8H12" />
    </svg>
  )
}

export function NewFileIcon() {
  return <svg {...props}><path d="M4 1.8h5.2l2.8 2.8v9.6H4z" /><path d="M8 7.2v4M6 9.2h4" /></svg>
}

export function NewFolderIcon() {
  return <svg {...props}><path d="M1.8 3.6h4.4l1.4 1.5h6.6v7.7H1.8z" /><path d="M8 7v4M6 9h4" /></svg>
}

export function CollapseAllIcon() {
  return <svg {...props}><path d="M4.5 2.5L8 6l3.5-3.5M4.5 13.5L8 10l3.5 3.5" /></svg>
}

export function ReloadIcon() {
  return <svg {...props}><path d="M13 8a5 5 0 1 1-1.5-3.6" /><path d="M13 2.5v3h-3" /></svg>
}

export function MoreIcon() {
  return <svg {...props}><circle cx="3.5" cy="8" r=".9" fill="currentColor" /><circle cx="8" cy="8" r=".9" fill="currentColor" /><circle cx="12.5" cy="8" r=".9" fill="currentColor" /></svg>
}

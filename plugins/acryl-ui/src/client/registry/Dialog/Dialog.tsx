/**
 * A confirm dialog over the app's Modal and Button primitives (composition only; the app's Button has no danger variant, DSH uses its RiskConfirmation primitive for destructive confirmations, so `danger` is terminal-only). See manifest.yml.
 */
import type { ReactNode } from 'react'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './Dialog.module.css'

export interface DialogProps {
  open: boolean
  title: string
  onClose: () => void
  onConfirm: () => void
  confirmLabel?: string
  cancelLabel?: string
  children?: ReactNode
}

/**
 * Render the dialog.
 * @param props - state, copy and actions.
 * @returns the modal.
 */
export function Dialog({ open, title, onClose, onConfirm, confirmLabel = 'OK', cancelLabel = 'Cancel', children }: DialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      closeLabel={cancelLabel}
      footer={(
        <div className={css.actions}>
          <Button variant="ghost" onClick={onClose}>{cancelLabel}</Button>
          <Button variant="primary" onClick={() => { onConfirm(); onClose() }}>{confirmLabel}</Button>
        </div>
      )}
    >
      {children}
    </Modal>
  )
}

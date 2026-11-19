/**
 * Ported from shadcn/ui's Input OTP (https://ui.shadcn.com/docs/components/input-otp, MIT licence, registry item `input-otp`, style new-york-v4, fetched
 * 2026-09-22). The `input-otp` package is dropped: the source's own `OTPInput` is a real `<input>` plus a context that hands each slot its character,
 * whether it is the active one, and whether to blink a caret, so that is what this port is - one real input covering the row, with the groups, slots and
 * separator as its visible decoration. Typing, backspace, arrow keys and paste are therefore the platform's behaviour, not a reimplementation.
 * lucide-react's MinusIcon is replaced by a plain inline SVG (no new dependency). See manifest.yml.
 */
import { createContext, useContext, useState } from 'react'
import clsx from 'clsx'
import type { ReactNode } from 'react'
import css from './InputOTP.module.css'

interface SlotState { char: string | undefined, hasFakeCaret: boolean, isActive: boolean }
const OTPContext = createContext<{ slots: SlotState[] } | null>(null)

export interface InputOTPProps {
  value?: string
  onChange?: (value: string) => void
  maxLength: number
  disabled?: boolean
  label?: string
  containerClassName?: string
  className?: string
  children?: ReactNode
}

/**
 * Render a one-time-code input: one real input over a row of slots, so the slots show what the platform is doing rather than replacing it.
 * @param props - the value, a change handler, how many digits there are, and the groups/slots as children.
 * @returns the element.
 */
export function InputOTP({ value = '', onChange, maxLength, disabled = false, label, containerClassName, className, children }: InputOTPProps) {
  const [activeIndex, setActiveIndex] = useState(-1)
  const slots: SlotState[] = Array.from({ length: maxLength }, (_, index) => ({
    char: value[index],
    hasFakeCaret: activeIndex === index && value[index] === undefined,
    isActive: activeIndex === index,
  }))
  const syncActive = (element: HTMLInputElement): void => {
    setActiveIndex(Math.min(element.selectionStart ?? value.length, maxLength - 1))
  }
  return (
    <OTPContext.Provider value={{ slots }}>
      <div data-slot="input-otp" data-disabled={disabled} className={clsx(css.root, containerClassName)}>
        <input
          className={clsx(css.input, className)}
          value={value}
          onChange={event => { onChange?.(event.target.value.slice(0, maxLength)) }}
          maxLength={maxLength}
          disabled={disabled}
          inputMode="numeric"
          autoComplete="one-time-code"
          aria-label={label}
          onFocus={event => { syncActive(event.currentTarget) }}
          onSelect={event => { syncActive(event.currentTarget) }}
          onBlur={() => { setActiveIndex(-1) }}
        />
        {children}
      </div>
    </OTPContext.Provider>
  )
}

export function InputOTPGroup({ children, className }: { children?: ReactNode, className?: string }) {
  return <div data-slot="input-otp-group" className={clsx(css.group, className)}>{children}</div>
}

export function InputOTPSlot({ index, className, invalid }: { index: number, className?: string, invalid?: boolean }) {
  const slot = useContext(OTPContext)?.slots[index]
  return (
    <div data-slot="input-otp-slot" data-active={slot?.isActive} aria-invalid={invalid} className={clsx(css.slot, className)}>
      {slot?.char}
      {slot?.hasFakeCaret === true && <div className={css.caretWrap}><div className={css.caret} /></div>}
    </div>
  )
}

export function InputOTPSeparator({ className }: { className?: string }) {
  return (
    <div data-slot="input-otp-separator" role="separator" className={clsx(css.separator, className)}>
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d="M3 8h10" stroke="currentColor" strokeWidth="1.5" fill="none" /></svg>
    </div>
  )
}
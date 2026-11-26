// The left panel's buttons that open a text field (Save point, a new branch's New).

/**
 * What a click on the button that opens a text field does (Save point, a new branch's New): with something typed it submits it, otherwise it opens or closes
 * the field. A second click on the same button is the person saying "do it" (owner 2026-11-26: typed "712", clicked Save point, nothing was saved).
 */
export function secondClick(typed: string | undefined): 'submit' | 'toggle' {
  return typed !== undefined && typed.trim() !== '' ? 'submit' : 'toggle'
}

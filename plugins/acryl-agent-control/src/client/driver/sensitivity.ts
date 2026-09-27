/**
 * What the agent may never see or type into, decided by rule and not by trusting the agent:
 * secrets and payment fields (sensitive), and controls that govern the agent itself (protected).
 */

/** Field names and labels that mean a secret or a payment detail. */
const SENSITIVE_WORDS = /pass(?:word|code|phrase)|secret|token|api[-_ ]?key|credential|private[-_ ]?key|\bpin\b|card|cvv|cvc|iban|routing|account[-_ ]?number|ssn|social[-_ ]?security|one[-_ ]?time|otp/i
/** `autocomplete` values that browsers treat as credentials or payment data. */
const SENSITIVE_AUTOCOMPLETE = /^(?:cc-|current-password|new-password|one-time-code)/

const label = (el: Element, attr: string): string => el.getAttribute(attr) ?? ''

/** True for a form field (or anything marked) that holds a secret or payment detail. */
export function isSensitive(el: Element): boolean {
  if (el.closest('[data-acryl-sensitive]') !== null) return true
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) return false
  if (el instanceof HTMLInputElement && el.type === 'password') return true
  const autocomplete = label(el, 'autocomplete').trim().toLowerCase()
  if (autocomplete.split(/\s+/).some(token => SENSITIVE_AUTOCOMPLETE.test(token))) return true
  return SENSITIVE_WORDS.test([el.name, el.id, label(el, 'placeholder'), label(el, 'aria-label')].join(' '))
}

/** Areas whose controls the agent may look at but never operate. */
const PROTECTED_REGION = /approval|permission|policy|agent control|ui control|acryl-agent-control|kill switch/i

/** The text an ancestor uses to name itself, for region rules. */
function ancestorName(el: Element): string {
  const own = label(el, 'aria-label') || label(el, 'data-region') || ''
  if (own !== '') return own
  const labelled = label(el, 'aria-labelledby')
  if (labelled !== '') {
    return labelled.split(/\s+/).map(id => el.ownerDocument.getElementById(id)?.textContent ?? '').join(' ')
  }
  return ''
}

/**
 * True for a control the agent must not operate: inside `[data-acryl-no-agent]`, inside a region whose
 * name says approval, permission, policy or Agent Control, or itself named after switching Agent Control off.
 */
export function isProtected(el: Element): boolean {
  if (el.closest('[data-acryl-no-agent]') !== null) return true
  let node: Element | null = el
  for (let depth = 0; node !== null && depth < 12; depth += 1) {
    if (PROTECTED_REGION.test(ancestorName(node))) return true
    node = node.parentElement
  }
  return false
}

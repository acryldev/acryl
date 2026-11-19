/**
 * What the agent may never see or type into, decided by rule and not by trusting the agent:
 * secrets and payment fields (sensitive), and controls that govern the agent itself (protected).
 */

/**
 * Field names and labels that unmistakably name a secret or a payment detail. A word that is only sometimes one is not here: a bare "card" is the title of a card on a board,
 * "pin" a map marker, "routing" a page. What a field *is* decides first: a password input, an `autocomplete` of a credential or a payment detail, a value
 * that looks like a key. The words only catch a field that says what it holds in plain text.
 */
const SENSITIVE_WORDS = new RegExp(
  [
    'pass(?:word|code|phrase)',
    'secret',
    'api[-_ ]?key',
    'private[-_ ]?key',
    'credential',
    '\\btoken\\b',
    '(?:pin|security)[-_ ]?(?:code|number)',
    '\\bcvv\\b',
    '\\bcvc\\b',
    '(?:credit|debit|payment)?[-_ ]?card[-_ ]?(?:number|no|num|code|expir)',
    '\\bcc[-_ ]?(?:num|number|exp|csc)',
    'iban',
    '(?:bank[-_ ]?)?routing[-_ ]?number',
    'account[-_ ]?number',
    '\\bssn\\b',
    'social[-_ ]?security',
    'one[-_ ]?time[-_ ]?(?:code|password)',
    '\\botp\\b',
  ].join('|'),
  'i',
)
/** `autocomplete` values that browsers treat as credentials or payment data. */
const SENSITIVE_AUTOCOMPLETE = /^(?:cc-|current-password|new-password|one-time-code)/

/** A value that is a key or a token by its shape: a known prefix, a JSON web token, or one long unbroken string that mixes lower case, upper case and digits (a git hash is lower-case hex and is not one). */
const KEY_PREFIX = /^(?:sk[-_]|pk[-_]|rk[-_]|ghp_|gho_|ghs_|github_pat_|glpat-|xox[abprs]-|AKIA[0-9A-Z]{12,}|AIza[0-9A-Za-z_-]{20,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.)/
export function looksLikeSecret(value: string): boolean {
  const text = value.trim()
  if (text.length < 20 || /\s/u.test(text)) return false
  if (KEY_PREFIX.test(text)) return true
  return text.length >= 32 && /^[A-Za-z0-9+/_=-]+$/u.test(text) && /[a-z]/u.test(text) && /[A-Z]/u.test(text) && /\d/u.test(text)
}

const label = (el: Element, attr: string): string => el.getAttribute(attr) ?? ''

/** True for a form field (or anything marked) that holds a secret or payment detail. */
export function isSensitive(el: Element): boolean {
  if (el.closest('[data-acryl-sensitive]') !== null) return true
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) return false
  if (el instanceof HTMLInputElement && el.type === 'password') return true
  const autocomplete = label(el, 'autocomplete').trim().toLowerCase()
  if (autocomplete.split(/\s+/).some(token => SENSITIVE_AUTOCOMPLETE.test(token))) return true
  if (SENSITIVE_WORDS.test([el.name, el.id, label(el, 'placeholder'), label(el, 'aria-label')].join(' '))) return true
  return !(el instanceof HTMLSelectElement) && looksLikeSecret(el.value)
}

/** Areas whose controls the agent may look at but never operate. */
const PROTECTED_REGION = /approval|permission|policy|agent control|ui control|acryl-agent-control|acryl-door|kill switch/i

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

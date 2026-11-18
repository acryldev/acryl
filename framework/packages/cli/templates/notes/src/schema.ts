import type { StandardSchema } from '../plugins/acryl-router/src/helpers/index.ts'

export interface NoteInput {
  title: string
  body: string
}

export const TITLE_MAX = 80
export const BODY_MAX = 2000

/** The one place a note's rules live: the HTML forms and the JSON API both use it. */
export function checkNote(
  value: unknown,
): { value: NoteInput } | { issues: { message: string; path: string[] }[] } {
  const input = (value ?? {}) as Record<string, unknown>
  const title = typeof input.title === 'string' ? input.title.trim() : ''
  const body = typeof input.body === 'string' ? input.body : ''
  const issues: { message: string; path: string[] }[] = []
  if (title === '') issues.push({ message: 'Give the note a title.', path: ['title'] })
  else if (title.length > TITLE_MAX)
    issues.push({ message: `The title is at most ${TITLE_MAX} characters.`, path: ['title'] })
  if (body.length > BODY_MAX)
    issues.push({ message: `The note is at most ${BODY_MAX} characters.`, path: ['body'] })
  return issues.length > 0 ? { issues } : { value: { title, body } }
}

export const NoteSchema: StandardSchema<NoteInput> = {
  '~standard': { validate: (value) => checkNote(value) },
}

export function checkCredentials(email: unknown, password: unknown, signup: boolean): string[] {
  const errors: string[] = []
  if (typeof email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    errors.push('Enter a valid email address.')
  if (typeof password !== 'string' || password === '') errors.push('Enter a password.')
  else if (signup && password.length < 8) errors.push('The password needs at least 8 characters.')
  return errors
}

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cookieValue, sameSecret, VISITOR_COOKIE, Visitors } from '../visitors.ts'

interface Run {
  ended: boolean
}

const cookieOf = (setCookie: string | undefined): string => {
  assert.ok(setCookie)
  return setCookie.split(';')[0] ?? ''
}

test('development has one visitor, the owner: every request is theirs, with no cookie and no limits but one run at a time', () => {
  const visitors = new Visitors<Run>({ shared: true })
  const owner = visitors.of(undefined)
  assert.ok(owner)
  assert.equal(visitors.of('acryl-visitor=someone-else'), owner)
  assert.equal(visitors.session(undefined, false).setCookie, undefined)
  for (let i = 0; i < 50; i++) assert.equal(visitors.admit(owner), undefined)
  owner.current = { ended: false }
  assert.equal(visitors.admit(owner)?.status, 409)
  assert.equal(visitors.checkMessage('x'.repeat(8000)), undefined)
})

test('the Assistant knows each visitor by an HttpOnly cookie of their own, with a token of their own', () => {
  const visitors = new Visitors<Run>({ shared: false })
  assert.equal(visitors.of(undefined), undefined)
  const a = visitors.session(undefined, true)
  assert.match(
    a.setCookie ?? '',
    new RegExp(
      `^${VISITOR_COOKIE}=[\\w-]+; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400; Secure$`,
      'u',
    ),
  )
  const b = visitors.session('other=1', false)
  assert.doesNotMatch(b.setCookie ?? '', /Secure/u)
  assert.notEqual(a.visitor, b.visitor)
  // A known cookie gets its visitor back, and no new cookie.
  const again = visitors.session(`x=1; ${cookieOf(a.setCookie)}`, true)
  assert.equal(again.visitor, a.visitor)
  assert.equal(again.setCookie, undefined)
  // A visitor's token is good only with that visitor's cookie.
  assert.equal(visitors.knows(cookieOf(a.setCookie), a.visitor.token), true)
  assert.equal(visitors.knows(cookieOf(b.setCookie), a.visitor.token), false)
  assert.equal(visitors.knows('acryl-visitor=made-up', a.visitor.token), false)
  // The audit names a visitor by a short hash, never the cookie.
  assert.match(a.visitor.tag, /^[0-9a-f]{12}$/u)
  assert.equal(cookieOf(a.setCookie).includes(a.visitor.tag), false)
})

test("the Assistant's limits: the question's length, the visitor's hour, runs at once, and the day", () => {
  let now = 0
  const visitors = new Visitors<Run>({
    shared: false,
    now: () => now,
    limits: { perVisitorPerHour: 2, concurrent: 2, perDay: 5, messageLength: 10 },
  })
  assert.equal(visitors.checkMessage('x'.repeat(11))?.status, 400)
  assert.equal(visitors.checkMessage('')?.status, 400)
  const [a, b, c] = [1, 2, 3].map(() => visitors.session(undefined, false).visitor)
  assert.ok(a && b && c)
  assert.equal(visitors.admit(a), undefined)
  a.current = { ended: true }
  assert.equal(visitors.admit(a), undefined)
  a.current = { ended: true }
  const hour = visitors.admit(a)
  assert.equal(hour?.status, 429)
  assert.match(hour?.error ?? '', /2 questions this hour\. Ask again in 60 minutes\./u)
  // Two runs going: a third visitor waits, whoever asks.
  assert.equal(visitors.admit(b), undefined)
  b.current = { ended: false }
  a.current = { ended: false }
  assert.equal(visitors.admit(c)?.status, 503)
  a.current = { ended: true }
  b.current = { ended: true }
  // The hour passes for a; the day still counts every ask it took: 3 so far (the refused ones are not counted), two left.
  now += 60 * 60 * 1000
  assert.equal(visitors.admit(c), undefined)
  c.current = { ended: true }
  assert.equal(visitors.admit(a), undefined)
  a.current = { ended: true }
  const day = visitors.admit(b)
  assert.equal(day?.status, 429)
  assert.match(day?.error ?? '', /all the questions it can today/u)
  // A refused ask is not counted: after the day, a may ask again.
  now += 24 * 60 * 60 * 1000
  assert.equal(visitors.admit(a), undefined)
})

test('past its capacity the Assistant lets go of the visitors seen longest ago, never one with a run going', () => {
  let now = 0
  const visitors = new Visitors<Run>({ shared: false, capacity: 2, now: () => ++now })
  const first = visitors.session(undefined, false)
  first.visitor.current = { ended: false }
  const second = visitors.session(undefined, false)
  visitors.session(undefined, false)
  assert.equal(visitors.size, 2)
  assert.equal(visitors.of(cookieOf(first.setCookie)), first.visitor)
  assert.equal(visitors.of(cookieOf(second.setCookie)), undefined)
})

test('cookie values and secrets', () => {
  assert.equal(cookieValue('a=1; acryl-visitor=xyz; b=2', 'acryl-visitor'), 'xyz')
  assert.equal(cookieValue('a=1', 'acryl-visitor'), undefined)
  assert.equal(cookieValue(null, 'a'), undefined)
  assert.equal(sameSecret('abc', 'abc'), true)
  assert.equal(sameSecret('abd', 'abc'), false)
  assert.equal(sameSecret('ab', 'abc'), false)
  assert.equal(sameSecret(undefined, 'abc'), false)
})

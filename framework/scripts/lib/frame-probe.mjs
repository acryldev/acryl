/**
 * What every surface of the ACRYL frame must show, asserted through a DevTools connection to the page: the left panel (the app's branches and the versions
 * of this branch), the right panel (the chat's tab strip, its History button and the + menu's tools), DSH's Settings opened from the bar's gear, and the app's
 * own page in the frame's canvas. `scripts/verify-desktop-door.mjs` is the only caller: it checks these in the Electron window. A panel the window's width
 * keeps closed is opened with the bar's own button, as a person opens it. `evaluate` runs an expression in the page and returns its value.
 */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function until(fn, ms, every = 300) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const value = await fn().catch(() => undefined)
    if (value) return value
    await sleep(every)
  }
}

/** `evaluate` over a DevTools session, by value; an exception in the page is a thrown error with its text. */
export function evaluator(session) {
  return async (expression) => {
    const answer = await session.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    const details = answer.result?.exceptionDetails
    if (details !== undefined)
      throw new Error(details.exception?.description ?? details.text ?? 'evaluation failed')
    return answer.result?.result?.value
  }
}

/**
 * Assert the frame. `appText` is text the app's own page shows in the canvas. Returns what it found, for the gate's log; throws with what the page held when
 * a surface is missing.
 */
/** How long a press of the Settings gear is given to open the dialog before it is pressed again. */
const GEAR_PRESS_INTERVAL_MS = 5_000

export async function assertFrame(evaluate, { appText, timeoutMs = 30_000 }) {
  const click = (label) =>
    evaluate(`(() => {
      const element = [...document.querySelectorAll('button,[role=button],[role=menuitem],a')]
        .find(candidate => candidate.getAttribute('aria-label') === ${JSON.stringify(label)} || candidate.textContent.trim() === ${JSON.stringify(label)})
      if (element === undefined) return false
      element.click()
      return true
    })()`)
  const body = () => evaluate(`document.body?.innerText?.slice(0, 1500) ?? ''`)

  // The left panel: the app's branches, the checked-out one among them, and the versions of this branch with their rows.
  const left = await until(async () => {
    const snapshot = await evaluate(`(() => {
      const side = document.querySelector('.acrylBlendsLeft')
      if (side === null || side.hidden) return undefined
      const branches = [...side.querySelectorAll('.acrylBlendsBranchName')].map((name) => name.textContent.trim()).filter(Boolean)
      const versions = side.querySelectorAll('.acrylBlendsVersion').length
      return { branches, versions }
    })()`)
    if (snapshot !== undefined && snapshot.branches.length >= 1 && snapshot.versions >= 1)
      return snapshot
    // A narrow window shows the panel closed: a person opens it with the bar's own button.
    await click('Left panel: branches and versions')
    return undefined
  }, timeoutMs)
  if (left === undefined)
    throw new Error(
      `the left panel has no branches or versions of this branch: ${JSON.stringify(await body())}`,
    )

  // The app's own page, drawn in the frame's canvas as an iframe of the host's /app.
  const tile = await until(
    () =>
      evaluate(`(() => {
        const frame = document.querySelector('iframe.acrylAppCanvasFrame')
        const text = frame?.contentDocument?.body?.innerText ?? ''
        return text.includes(${JSON.stringify(appText)}) ? text.slice(0, 120) : undefined
      })()`),
    timeoutMs,
  )
  if (tile === undefined)
    throw new Error(
      `the app's page is not in the frame's canvas: ${JSON.stringify(
        await evaluate(`(() => {
          const frame = document.querySelector('iframe.acrylAppCanvasFrame')
          return { src: frame?.getAttribute('src') ?? null, text: frame?.contentDocument?.body?.innerText?.slice(0, 200) ?? null }
        })()`),
      )}`,
    )

  // The right panel: the chat's tab strip, its History button, and the + that opens the tools.
  const right = await until(async () => {
    const snapshot = await evaluate(`(() => {
      const side = document.querySelector('.acrylBlendsRight')
      if (side === null || side.hidden) return undefined
      const tabs = [...side.querySelectorAll('.acrylBlendsTab')].map((tab) => tab.textContent.trim()).filter(Boolean)
      return {
        tabs,
        history: side.querySelector('.acrylBlendsHistoryButton') !== null,
        plus: side.querySelector('.acrylBlendsPlus') !== null,
      }
    })()`)
    if (snapshot?.tabs.some((text) => text.startsWith('Chat')) && snapshot.history && snapshot.plus)
      return snapshot
    await click('Right panel: agents')
    return undefined
  }, timeoutMs)
  if (right === undefined)
    throw new Error(
      `the right panel did not open with the chat's tabs: ${JSON.stringify(await body())}`,
    )

  // The + menu holds the tools the frame has: a terminal, Files and Git (the canvas is the browser, so it does not offer one).
  const tools = await until(async () => {
    const items = await evaluate(`(() => {
      const plus = document.querySelector('.acrylBlendsRight .acrylBlendsPlus')
      if (plus === null) return undefined
      if (plus.getAttribute('aria-expanded') !== 'true') plus.click()
      return [...document.querySelectorAll('.acrylBlendsMenuItem')].map((item) => item.textContent.trim()).filter(Boolean)
    })()`)
    if (items === undefined || items.length === 0) return undefined
    // Closed again, so the person's next click lands where they mean it to (and Settings' gear is not under the menu).
    await evaluate(`(() => {
      const plus = document.querySelector('.acrylBlendsRight .acrylBlendsPlus')
      if (plus?.getAttribute('aria-expanded') === 'true') plus.click()
      return true
    })()`)
    return items
  }, 10_000)
  if (tools === undefined)
    throw new Error(`the right panel's + menu did not open: ${JSON.stringify(await body())}`)
  for (const tool of ['Terminal', 'Files', 'Git'])
    if (!tools.some((text) => text.startsWith(tool)))
      throw new Error(`the right panel's + menu offers no ${tool}: ${tools.join(', ')}`)

  // Settings the way a person opens it (the bar's gear); only a visible dialog whose nav has a real section counts. A press is given time to work before the next:
  // on a slow machine a second press while the dialog is still opening closes it again, and the wait below then looks at nothing.
  const isSettingsOpen = `(() => {
        const isSection = (button) => ['Models', '模型'].includes((button.getAttribute('aria-label') ?? '').trim() || (button.textContent ?? '').replace(/\\s+/g, ' ').trim())
        const open = [...document.querySelectorAll('[role=dialog]')].some((dialog) =>
          dialog.getClientRects().length > 0 && [...dialog.querySelectorAll('nav button')].some(isSection))
        return open
      })()`
  let pressedAt = 0
  const opened = await until(
    async () => {
      if (await evaluate(isSettingsOpen)) return true
      if (Date.now() - pressedAt < GEAR_PRESS_INTERVAL_MS) return false
      pressedAt = Date.now()
      await evaluate(`(() => {
        const gear = [...document.querySelectorAll('button[aria-label="Settings"]')].find((button) => button.getClientRects().length > 0)
        gear?.click()
        return true
      })()`)
      return false
    },
    timeoutMs,
    500,
  )
  if (opened !== true) throw new Error(`Settings did not open: ${JSON.stringify(await body())}`)
  const settingsText = await until(async () => {
    const text = await evaluate(`(() => {
      const labels = [...document.querySelectorAll('button,[role=tab],[role=menuitem],a')]
        .map(element => element.getAttribute('aria-label') ?? element.textContent.trim()).filter(Boolean)
      return document.body.innerText.slice(-4000) + '\\n' + labels.slice(0, 120).join('\\n')
    })()`)
    return /Shortcuts/iu.test(text) ? text : undefined
  }, 15_000)
  if (settingsText === undefined)
    throw new Error(`Settings did not render: ${JSON.stringify(await body())}`)
  const sections = ['General', 'Models', 'Plugins', 'Support', 'Shortcuts']
  const missing = sections.filter((section) => !new RegExp(section, 'iu').test(settingsText))
  if (missing.length > 0) throw new Error(`Settings is missing ${missing.join(', ')}`)

  return {
    rows: left.branches.length,
    branches: left.branches,
    versions: left.versions,
    tabs: right.tabs,
    tile: tile.trim().split('\n')[0],
    sections,
  }
}

import { createPool } from './concurrent.ts'

describe('concurrent execution', () => {
  test.each`
    concurrency | count
    ${1}        | ${10}
    ${10}       | ${10}
    ${100}      | ${10}
    ${Infinity} | ${2000}
  `('concurrency $concurrency, count $count', async ({ concurrency, count }) => {
    const running = new Set()

    const pool = createPool({ concurrency })
    let resolve: (() => void) | undefined
    const promise = new Promise<void>((r) => {
      resolve = r
    })
    const fn = async (i: number) => {
      if (running.size > concurrency) {
        throw new Error('concurrency exceeded')
      }

      running.add(i)
      await promise
      running.delete(i)
      return i
    }

    const jobs = new Array(count).fill(0).map((_, i) => () => fn(i))
    const expectedResults = new Array(count).fill(0).map((_, i) => i)
    const resultPromises = jobs.map((job) => pool.run(job))

    expect(running.size).toBe(Math.min(concurrency, count))
    resolve?.()
    const results = await Promise.all(resultPromises)
    expect(running.size).toBe(0)
    expect(results).toEqual(expectedResults)
  })

  describe('with interval', () => {
    test.each`
      concurrency | interval
      ${1}        | ${10}
      ${2}        | ${10}
    `('concurrency $concurrency, interval $interval', async ({ concurrency, interval }) => {
      // Fake timers, not wall-clock: under a loaded runner two interval timers can fire in the same tick and start two jobs together, which the old
      // wall-clock assertion read as a violation, and the resulting rejection then hung the case to its timeout (run 41555001559, ubuntu Node 26). With
      // the clock moving only when the timers do, the spacing measured here is the pool's own behaviour, not the scheduler's luck.
      vi.useFakeTimers()
      try {
        const started: number[] = []
        const pool = createPool({ concurrency, interval })
        const jobs = new Array(10).fill(0).map((_, i) => () => {
          started.push(Date.now())
          return i
        })
        const resultPromises = jobs.map((job) => pool.run(job))
        // Each advance releases the slots whose interval elapsed and runs the pool's zero-delay retries, with microtasks flushed between timers.
        for (let step = 0; step < 60; step += 1) await vi.advanceTimersByTimeAsync(interval)
        const results = await Promise.all(resultPromises)
        expect(results).toEqual(new Array(10).fill(0).map((_, i) => i))
        expect(started).toHaveLength(10)
        for (let i = concurrency; i < started.length; i += 1)
          expect(started[i]! - started[i - concurrency]!).toBeGreaterThanOrEqual(interval - 1)
      } finally {
        vi.useRealTimers()
      }
    }, 15_000)
  })
})

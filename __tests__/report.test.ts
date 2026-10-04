import { describe, expect, it, vi } from 'vitest'
import { countResults } from '../src/report.js'

vi.setConfig({ testTimeout: 5000 })

describe('report.ts', () => {
  it('counts results by status and adds up durations', () => {
    expect.hasAssertions()

    expect(
      countResults([
        { suite: 's', name: 'a', status: 'passed', durationMs: 5 },
        { suite: 's', name: 'b', status: 'failed', durationMs: 10 },
        { suite: 's', name: 'c', status: 'skipped', durationMs: 0 },
        { suite: 's', name: 'd', status: 'passed', durationMs: 1.5 }
      ])
    ).toStrictEqual({ passed: 2, failed: 1, skipped: 1, durationMs: 16.5 })
  })

  it('counts nothing for no cases', () => {
    expect.hasAssertions()

    expect(countResults([])).toStrictEqual({
      passed: 0,
      failed: 0,
      skipped: 0,
      durationMs: 0
    })
  })
})

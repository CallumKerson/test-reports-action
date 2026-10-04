import { describe, expect, it, vi } from 'vitest'
import { countResults } from '../src/report.js'

vi.setConfig({ testTimeout: 5000 })

describe('report.ts', () => {
  it('counts results by status and adds up durations', () => {
    expect.hasAssertions()

    expect(
      countResults([
        { durationMs: 5, name: 'a', status: 'passed', suite: 's' },
        { durationMs: 10, name: 'b', status: 'failed', suite: 's' },
        { durationMs: 0, name: 'c', status: 'skipped', suite: 's' },
        { durationMs: 1.5, name: 'd', status: 'passed', suite: 's' }
      ])
    ).toStrictEqual({ durationMs: 16.5, failed: 1, passed: 2, skipped: 1 })
  })

  it('counts nothing for no cases', () => {
    expect.hasAssertions()

    expect(countResults([])).toStrictEqual({
      durationMs: 0,
      failed: 0,
      passed: 0,
      skipped: 0
    })
  })
})

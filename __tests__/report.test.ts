import { countResults } from '../src/report.js'

describe('report.ts', () => {
  it('Counts results by status and adds up durations', () => {
    expect(
      countResults([
        { suite: 's', name: 'a', status: 'passed', durationMs: 5 },
        { suite: 's', name: 'b', status: 'failed', durationMs: 10 },
        { suite: 's', name: 'c', status: 'skipped', durationMs: 0 },
        { suite: 's', name: 'd', status: 'passed', durationMs: 1.5 }
      ])
    ).toEqual({ passed: 2, failed: 1, skipped: 1, durationMs: 16.5 })
  })

  it('Counts nothing for no cases', () => {
    expect(countResults([])).toEqual({
      passed: 0,
      failed: 0,
      skipped: 0,
      durationMs: 0
    })
  })
})

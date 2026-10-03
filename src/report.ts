export type TestStatus = 'passed' | 'failed' | 'skipped'

export interface TestCase {
  suite: string
  name: string
  status: TestStatus
  durationMs: number
  message?: string
}

export interface TestReport {
  name: string
  path: string
  cases: TestCase[]
}

export interface TestCounts {
  passed: number
  failed: number
  skipped: number
  durationMs: number
}

export function countResults(cases: TestCase[]): TestCounts {
  const counts = { passed: 0, failed: 0, skipped: 0, durationMs: 0 }
  for (const testCase of cases) {
    counts[testCase.status]++
    counts.durationMs += testCase.durationMs
  }
  return counts
}

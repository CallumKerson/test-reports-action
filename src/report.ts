type TestStatus = 'passed' | 'failed' | 'skipped'

interface TestCase {
  suite: string
  name: string
  status: TestStatus
  durationMs: number
  message?: string
}

interface TestReport {
  name: string
  path: string
  cases: TestCase[]
  /** Why the report could not be parsed, when it couldn't */
  parseError?: string
}

interface TestCounts {
  passed: number
  failed: number
  skipped: number
  durationMs: number
}

function countResults(cases: TestCase[]): TestCounts {
  const counts = { durationMs: 0, failed: 0, passed: 0, skipped: 0 }
  for (const testCase of cases) {
    counts[testCase.status] += 1
    counts.durationMs += testCase.durationMs
  }
  return counts
}

/**
 * Describes counts in words, such as `3 passed, 1 skipped`.
 */
function describeCounts(counts: TestCounts): string {
  const parts = (['passed', 'failed', 'skipped'] as const)
    .filter((status) => counts[status] > 0)
    .map((status) => `${counts[status]} ${status}`)
  if (parts.length === 0) {
    return 'No tests'
  }
  return parts.join(', ')
}

export { countResults, describeCounts }
export type { TestCase, TestCounts, TestReport, TestStatus }

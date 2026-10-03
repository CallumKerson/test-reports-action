import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'
import type { TestCase, TestReport } from '../src/report.js'

jest.unstable_mockModule('@actions/core', () => core)

const { formatDuration, renderSummary, writeSummary } =
  await import('../src/summary.js')

const passed: TestCase = {
  suite: 'math',
  name: 'adds',
  status: 'passed',
  durationMs: 1200
}

const failed: TestCase = {
  suite: 'math',
  name: 'divides',
  status: 'failed',
  durationMs: 300,
  message: 'Expected: <2>\nReceived: 3'
}

const report = (name: string, cases: TestCase[]): TestReport => ({
  name,
  path: `${name}.junit.xml`,
  cases
})

describe('summary.ts', () => {
  it('Renders a row of counts for each report', () => {
    const html = renderSummary([
      report('unit', [passed, failed]),
      report('go', [{ ...passed, status: 'skipped', durationMs: 0 }])
    ])

    expect(html).toContain(
      '<tr><td>❌ unit</td><td>1</td><td>1</td><td>0</td><td>1.5s</td></tr>'
    )
    expect(html).toContain(
      '<tr><td>✅ go</td><td>0</td><td>0</td><td>1</td><td>0ms</td></tr>'
    )
  })

  it('Renders escaped details for each failed test', () => {
    const html = renderSummary([report('unit', [passed, failed])])

    expect(html).toContain('<h3>❌ unit</h3>')
    expect(html).toContain(
      '<details><summary>math › divides</summary>\n\n<pre><code>Expected: &lt;2&gt;\nReceived: 3</code></pre>\n</details>'
    )
    expect(html).not.toContain('adds</summary>')
  })

  it('Leaves out a suite that repeats the test name', () => {
    const html = renderSummary([
      report('go', [
        { suite: 'pkg', name: 'pkg', status: 'failed', durationMs: 0 }
      ])
    ])

    expect(html).toContain(
      '<details><summary>pkg</summary>\n\n<p>No failure message</p>\n</details>'
    )
  })

  it('Leaves out failure details when everything passed', () => {
    expect(renderSummary([report('unit', [passed])])).not.toContain('<details>')
  })

  it('Cuts long messages and long lists of failures short', () => {
    const message = Array.from({ length: 60 }, (_, i) => `line ${i}`).join('\n')
    const failures = Array.from({ length: 53 }, (_, i) => ({
      ...failed,
      name: `test ${i}`,
      message
    }))

    const html = renderSummary([report('unit', failures)])

    expect(html.match(/<details>/g)).toHaveLength(50)
    expect(html).toContain('line 49\n…10 more lines</code>')
    expect(html).toContain('<p>…and 3 more failed tests</p>')
  })

  it('Writes the summary', async () => {
    core.summary.addRaw.mockReturnValue(core.summary)

    await writeSummary([report('unit', [passed])])

    expect(core.summary.addRaw).toHaveBeenCalledWith(
      expect.stringContaining('<h2>Test results</h2>'),
      true
    )
    expect(core.summary.write).toHaveBeenCalled()
  })

  it.each([
    [0.4, '0ms'],
    [999, '999ms'],
    [1000, '1.0s'],
    [59_940, '59.9s'],
    [125_000, '2m 5s']
  ])('Formats %d ms as %s', (ms, text) => {
    expect(formatDuration(ms)).toBe(text)
  })
})

import type { TestCase, TestReport } from '../src/report.js'
import { describe, expect, it, vi } from 'vitest'
import {
  formatDuration,
  maxSummaryBytes,
  renderSummary,
  writeSummary
} from '../src/summary.js'
import { summary } from '../__fixtures__/core.js'

const { uploadFullSummary } = vi.hoisted(() => ({
  uploadFullSummary:
    vi.fn<
      (html: string, retentionDays: number) => Promise<string | undefined>
    >()
}))

vi.mock(import('@actions/core'), async () => import('../__fixtures__/core.js'))
vi.mock(import('../src/artifact.js'), () => ({ uploadFullSummary }))

vi.setConfig({ testTimeout: 5000 })

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
  it('renders a heading with the counts for each report', () => {
    expect.hasAssertions()

    const html = renderSummary(
      [
        report('unit', [passed, failed]),
        report('go', [{ ...passed, status: 'skipped', durationMs: 0 }])
      ],
      'full'
    )

    expect(html).toContain(
      '<h3>❌ unit</h3>\n<p><code>unit.junit.xml</code> · 1 passed, 1 failed · 1.5s</p>'
    )
    expect(html).toContain(
      '<h3>✅ go</h3>\n<p><code>go.junit.xml</code> · 1 skipped · 0ms</p>'
    )
  })

  it('renders a row per suite when everything passed', () => {
    expect.hasAssertions()

    const html = renderSummary(
      [
        report('unit', [
          passed,
          { ...passed, name: 'subtracts', durationMs: 300 },
          { ...passed, suite: 'text', status: 'skipped', durationMs: 0 }
        ])
      ],
      'full'
    )

    expect(html).toContain(
      [
        '<table>',
        '<tr><th>Suite</th><th>Passed</th><th>Skipped</th><th>Duration</th></tr>',
        '<tr><td>math</td><td>2</td><td>0</td><td>1.5s</td></tr>',
        '<tr><td>text</td><td>0</td><td>1</td><td>0ms</td></tr>',
        '</table>'
      ].join('\n')
    )
    expect(html).not.toContain('<details>')
  })

  it('renders a row per failed test with its escaped failure', () => {
    expect.hasAssertions()

    const html = renderSummary([report('unit', [passed, failed])], 'full')

    expect(html).toContain(
      [
        '<table>',
        '<tr><th>Suite</th><th>Test</th><th>Failure</th></tr>',
        '<tr><td>math</td><td>divides</td><td><details><summary>Expected: &lt;2&gt;</summary>\n\n<pre><code>Expected: &lt;2&gt;\nReceived: 3</code></pre>\n</details></td></tr>',
        '</table>'
      ].join('\n')
    )
    expect(html).not.toContain('adds')
  })

  it('strips terminal colours from failure messages', () => {
    expect.hasAssertions()

    const html = renderSummary(
      [
        report('unit', [
          {
            ...failed,
            message: '\u001b[31mExpected\u001b[39m: \u001b[1;32m2\u001b[0m'
          }
        ])
      ],
      'full'
    )

    expect(html).toContain(
      '<summary>Expected: 2</summary>\n\n<pre><code>Expected: 2</code></pre>'
    )
  })

  it('says when a failed test has no message', () => {
    expect.hasAssertions()

    const html = renderSummary(
      [
        report('go', [
          { suite: 'pkg', name: 'pkg', status: 'failed', durationMs: 0 }
        ])
      ],
      'full'
    )

    expect(html).toContain(
      '<tr><td>pkg</td><td>pkg</td><td>No failure message</td></tr>'
    )
  })

  it('renders only the heading for a report with no tests', () => {
    expect.hasAssertions()

    expect(renderSummary([report('empty', [])], 'full')).toBe(
      '<h2>Test results</h2>\n<h3>✅ empty</h3>\n<p><code>empty.junit.xml</code> · No tests · 0ms</p>'
    )
  })

  describe('with many long failures', () => {
    const message = Array.from(
      { length: 60 },
      (_value, index) => `line ${index}`
    ).join('\n')
    const failures = Array.from({ length: 53 }, (_value, index) => ({
      ...failed,
      name: `test ${index}`,
      message
    }))

    it('renders every failure in full', () => {
      expect.hasAssertions()

      const html = renderSummary([report('unit', failures)], 'full')

      expect(html.match(/<details>/g)).toHaveLength(53)
      expect(html).toContain('line 59</code>')
      expect(html).not.toContain('more lines')
      expect(html).not.toContain('more failed tests')
    })

    it('cuts long messages and long lists of failures short', () => {
      expect.hasAssertions()

      const html = renderSummary([report('unit', failures)], 'limited')

      expect(html.match(/<details>/g)).toHaveLength(50)
      expect(html).toContain('line 49\n…10 more lines</code>')
      expect(html).toContain('<p>…and 3 more failed tests</p>')
    })

    it('renders only the counts with no detail', () => {
      expect.hasAssertions()

      const html = renderSummary([report('unit', failures)], 'none')

      expect(html).toContain('<h3>❌ unit</h3>')
      expect(html).toContain('53 failed')
      expect(html).not.toContain('<table>')
    })
  })

  describe('writing the summary', () => {
    // Each failure renders to just over 1 KiB, in full or cut short
    const big = (count: number): TestCase[] =>
      Array.from({ length: count }, (_value, index) => ({
        ...failed,
        name: `test ${index}`,
        message: 'x'.repeat(1024)
      }))
    const written = (): string => summary.addRaw.mock.calls[0][0]

    it('writes the full summary when it fits', async () => {
      expect.hasAssertions()

      await writeSummary([report('unit', [passed, failed])], 7)

      expect(written()).toBe(
        renderSummary([report('unit', [passed, failed])], 'full')
      )
      expect(summary.addRaw).toHaveBeenCalledWith(written(), true)
      expect(summary.write).toHaveBeenCalledWith()
      expect(uploadFullSummary).not.toHaveBeenCalled()
    })

    it('uploads the full summary and links to it when it is too big', async () => {
      expect.hasAssertions()

      uploadFullSummary.mockResolvedValue('https://example.com/artifact')
      const reports = [report('unit', big(1100))]

      await writeSummary(reports, 1)

      const full = renderSummary(reports, 'full')
      expect(Buffer.byteLength(full)).toBeGreaterThan(maxSummaryBytes)
      expect(uploadFullSummary).toHaveBeenCalledWith(full, 1)
      expect(written()).toBe(
        `${renderSummary(reports, 'limited')}\n<p>⚠️ Cut short to fit GitHub's 1 MiB limit. <a href="https://example.com/artifact">Download the full summary</a>, which is kept for 1 day.</p>`
      )
    })

    it('says how many days the full summary is kept for', async () => {
      expect.hasAssertions()

      uploadFullSummary.mockResolvedValue('https://example.com/artifact')

      await writeSummary([report('unit', big(1100))], 7)

      expect(written()).toContain('which is kept for 7 days.')
    })

    it('notes the summary was cut short when the upload fails', async () => {
      expect.hasAssertions()

      uploadFullSummary.mockResolvedValue(undefined)

      await writeSummary([report('unit', big(1100))], 7)

      expect(written()).toMatch(
        /<\/table>\n<p>…and 1050 more failed tests<\/p>\n<p>⚠️ Cut short to fit GitHub's 1 MiB limit.<\/p>$/
      )
    })

    it('writes only the counts when the cut short summary is still too big', async () => {
      expect.hasAssertions()

      uploadFullSummary.mockResolvedValue('https://example.com/artifact')
      const reports = Array.from({ length: 21 }, (_value, index) =>
        report(`unit${index}`, big(50))
      )

      await writeSummary(reports, 7)

      expect(written()).toMatch(/^<h2>Test results<\/h2>\n<h3>/)
      expect(written()).not.toContain('<table>')
      expect(written()).toContain('Download the full summary')
    })
  })

  it.each([
    [0.4, '0ms'],
    [999, '999ms'],
    [1000, '1.0s'],
    [59_940, '59.9s'],
    [125_000, '2m 5s'],
    [999.6, '1.0s'],
    [59_960, '1m 0s'],
    [119_600, '2m 0s']
  ])('formats %d ms as %s', (ms, text) => {
    expect.hasAssertions()

    expect(formatDuration(ms)).toBe(text)
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as core from '../__fixtures__/core.js'
import type { TestCase, TestReport } from '../src/report.js'

const uploadFullSummary =
  vi.fn<(html: string, retentionDays: number) => Promise<string | undefined>>()

vi.doMock('@actions/core', () => core)
vi.doMock('../src/artifact.js', () => ({ uploadFullSummary }))

const { formatDuration, maxSummaryBytes, renderSummary, writeSummary } =
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
  beforeEach(() => {
    core.summary.addRaw.mockReturnValue(core.summary)
  })

  it('Renders a row of counts for each report', () => {
    const html = renderSummary(
      [
        report('unit', [passed, failed]),
        report('go', [{ ...passed, status: 'skipped', durationMs: 0 }])
      ],
      'full'
    )

    expect(html).toContain(
      '<tr><td>❌ unit</td><td>1</td><td>1</td><td>0</td><td>1.5s</td></tr>'
    )
    expect(html).toContain(
      '<tr><td>✅ go</td><td>0</td><td>0</td><td>1</td><td>0ms</td></tr>'
    )
  })

  it('Renders escaped details for each failed test', () => {
    const html = renderSummary([report('unit', [passed, failed])], 'full')

    expect(html).toContain('<h3>❌ unit</h3>')
    expect(html).toContain(
      '<details><summary>math › divides</summary>\n\n<pre><code>Expected: &lt;2&gt;\nReceived: 3</code></pre>\n</details>'
    )
    expect(html).not.toContain('adds</summary>')
  })

  it('Strips terminal colours from failure messages', () => {
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

    expect(html).toContain('<pre><code>Expected: 2</code></pre>')
  })

  it('Leaves out a suite that repeats the test name', () => {
    const html = renderSummary(
      [
        report('go', [
          { suite: 'pkg', name: 'pkg', status: 'failed', durationMs: 0 }
        ])
      ],
      'full'
    )

    expect(html).toContain(
      '<details><summary>pkg</summary>\n\n<p>No failure message</p>\n</details>'
    )
  })

  it('Leaves out failure details when everything passed', () => {
    expect(renderSummary([report('unit', [passed])], 'full')).not.toContain(
      '<details>'
    )
  })

  describe('with many long failures', () => {
    const message = Array.from({ length: 60 }, (_, i) => `line ${i}`).join('\n')
    const failures = Array.from({ length: 53 }, (_, i) => ({
      ...failed,
      name: `test ${i}`,
      message
    }))

    it('Renders every failure in full', () => {
      const html = renderSummary([report('unit', failures)], 'full')

      expect(html.match(/<details>/g)).toHaveLength(53)
      expect(html).toContain('line 59</code>')
      expect(html).not.toContain('more lines')
      expect(html).not.toContain('more failed tests')
    })

    it('Cuts long messages and long lists of failures short', () => {
      const html = renderSummary([report('unit', failures)], 'limited')

      expect(html.match(/<details>/g)).toHaveLength(50)
      expect(html).toContain('line 49\n…10 more lines</code>')
      expect(html).toContain('<p>…and 3 more failed tests</p>')
    })

    it('Renders only the table with no detail', () => {
      const html = renderSummary([report('unit', failures)], 'none')

      expect(html).toContain('<tr><td>❌ unit</td>')
      expect(html).not.toContain('<h3>')
    })
  })

  describe('writeSummary', () => {
    // Each failure renders to just over 1 KiB, in full or cut short
    const big = (count: number) =>
      Array.from({ length: count }, (_, i) => ({
        ...failed,
        name: `test ${i}`,
        message: 'x'.repeat(1024)
      }))
    const written = () => core.summary.addRaw.mock.calls[0][0]

    it('Writes the full summary when it fits', async () => {
      await writeSummary([report('unit', [passed, failed])], 7)

      expect(written()).toBe(
        renderSummary([report('unit', [passed, failed])], 'full')
      )
      expect(core.summary.addRaw).toHaveBeenCalledWith(written(), true)
      expect(core.summary.write).toHaveBeenCalled()
      expect(uploadFullSummary).not.toHaveBeenCalled()
    })

    it('Uploads the full summary and links to it when it is too big', async () => {
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

    it('Says how many days the full summary is kept for', async () => {
      uploadFullSummary.mockResolvedValue('https://example.com/artifact')

      await writeSummary([report('unit', big(1100))], 7)

      expect(written()).toContain('which is kept for 7 days.')
    })

    it('Notes the summary was cut short when the upload fails', async () => {
      uploadFullSummary.mockResolvedValue(undefined)

      await writeSummary([report('unit', big(1100))], 7)

      expect(written()).toMatch(
        /<\/details>\n<p>…and 1050 more failed tests<\/p>\n<p>⚠️ Cut short to fit GitHub's 1 MiB limit.<\/p>$/
      )
    })

    it('Writes only the table when the cut short summary is still too big', async () => {
      uploadFullSummary.mockResolvedValue('https://example.com/artifact')
      const reports = Array.from({ length: 21 }, (_, i) =>
        report(`unit${i}`, big(50))
      )

      await writeSummary(reports, 7)

      expect(written()).toMatch(/^<h2>Test results<\/h2>\n<table>/)
      expect(written()).not.toContain('<details>')
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
  ])('Formats %d ms as %s', (ms, text) => {
    expect(formatDuration(ms)).toBe(text)
  })
})

import * as core from '@actions/core'
import { uploadFullSummary } from './artifact.js'
import { countResults, type TestCase, type TestReport } from './report.js'

// GitHub rejects a step summary over 1 MiB
export const maxSummaryBytes = 1024 * 1024
const maxFailures = 50
const maxLines = 50

/**
 * How much of each failure to show: everything, a limited amount of it, or
 * none, leaving only the table of results.
 */
export type Detail = 'full' | 'limited' | 'none'

/**
 * Writes a table of results and the details of every failed test to the job
 * summary.
 *
 * A summary too big for GitHub is cut short, and the full one is uploaded as
 * an artifact, kept for retentionDays, and linked from it.
 */
export async function writeSummary(
  reports: TestReport[],
  retentionDays: number
): Promise<void> {
  const full = renderSummary(reports, 'full')
  if (fits(full)) {
    await core.summary.addRaw(full, true).write()
    return
  }

  const url = await uploadFullSummary(full, retentionDays)
  const note = url
    ? `<p>⚠️ Cut short to fit GitHub's 1 MiB limit. <a href="${url}">Download the full summary</a>, which is kept for ${retentionDays} ${retentionDays === 1 ? 'day' : 'days'}.</p>`
    : "<p>⚠️ Cut short to fit GitHub's 1 MiB limit.</p>"
  // Many failing reports can be too big even when each one is cut short
  const limited = `${renderSummary(reports, 'limited')}\n${note}`
  const summary = fits(limited)
    ? limited
    : `${renderSummary(reports, 'none')}\n${note}`
  await core.summary.addRaw(summary, true).write()
}

function fits(html: string): boolean {
  return Buffer.byteLength(html) < maxSummaryBytes
}

export function renderSummary(reports: TestReport[], detail: Detail): string {
  const rows = reports.map((report) => {
    const counts = countResults(report.cases)
    const icon = counts.failed > 0 ? '❌' : '✅'
    return row('td', [
      `${icon} ${escape(report.name)}`,
      String(counts.passed),
      String(counts.failed),
      String(counts.skipped),
      formatDuration(counts.durationMs)
    ])
  })
  const table = [
    '<table>',
    row('th', ['Report', 'Passed', 'Failed', 'Skipped', 'Duration']),
    ...rows,
    '</table>'
  ].join('\n')

  const failures =
    detail === 'none'
      ? []
      : reports.flatMap((report) =>
          renderFailures(report, detail === 'limited')
        )
  return ['<h2>Test results</h2>', table, ...failures].join('\n')
}

function renderFailures(report: TestReport, limited: boolean): string[] {
  const failures = report.cases.filter(({ status }) => status === 'failed')
  if (failures.length === 0) return []

  const shown = (limited ? failures.slice(0, maxFailures) : failures).map(
    (testCase) => renderFailure(testCase, limited)
  )
  const hidden = failures.length - shown.length
  if (hidden > 0) shown.push(`<p>…and ${hidden} more failed tests</p>`)
  return [
    `<h3>❌ ${escape(report.name)}</h3>`,
    `<p><code>${escape(report.path)}</code></p>`,
    ...shown
  ]
}

function renderFailure(testCase: TestCase, limited: boolean): string {
  const title =
    testCase.suite && testCase.suite !== testCase.name
      ? `${testCase.suite} › ${testCase.name}`
      : testCase.name
  const body = testCase.message
    ? `<pre><code>${escape(limited ? truncate(testCase.message) : testCase.message)}</code></pre>`
    : '<p>No failure message</p>'
  return `<details><summary>${escape(title)}</summary>\n\n${body}\n</details>`
}

function truncate(message: string): string {
  const lines = message.split('\n')
  if (lines.length <= maxLines) return message
  const hidden = lines.length - maxLines
  return [...lines.slice(0, maxLines), `…${hidden} more lines`].join('\n')
}

function row(cell: 'th' | 'td', values: string[]): string {
  return `<tr>${values.map((value) => `<${cell}>${value}</${cell}>`).join('')}</tr>`
}

function escape(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.round((ms % 60_000) / 1000)
  return `${minutes}m ${seconds}s`
}

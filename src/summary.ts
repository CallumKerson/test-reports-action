import * as core from '@actions/core'
import { countResults, type TestCase, type TestReport } from './report.js'

// The job summary is capped at 1 MiB, so long output and long lists of
// failures are cut short
const maxFailures = 50
const maxLines = 50

/**
 * Writes a table of results and the details of every failed test to the job
 * summary.
 */
export async function writeSummary(reports: TestReport[]): Promise<void> {
  await core.summary.addRaw(renderSummary(reports), true).write()
}

export function renderSummary(reports: TestReport[]): string {
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

  return [
    '<h2>Test results</h2>',
    table,
    ...reports.flatMap(renderFailures)
  ].join('\n')
}

function renderFailures(report: TestReport): string[] {
  const failures = report.cases.filter(({ status }) => status === 'failed')
  if (failures.length === 0) return []

  const shown = failures.slice(0, maxFailures).map(renderFailure)
  const hidden = failures.length - shown.length
  if (hidden > 0) shown.push(`<p>…and ${hidden} more failed tests</p>`)
  return [
    `<h3>❌ ${escape(report.name)}</h3>`,
    `<p><code>${escape(report.path)}</code></p>`,
    ...shown
  ]
}

function renderFailure(testCase: TestCase): string {
  const title =
    testCase.suite && testCase.suite !== testCase.name
      ? `${testCase.suite} › ${testCase.name}`
      : testCase.name
  const body = testCase.message
    ? `<pre><code>${escape(truncate(testCase.message))}</code></pre>`
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

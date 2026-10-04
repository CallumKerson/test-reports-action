import * as core from '@actions/core'
import { uploadFullSummary } from './artifact.js'
import {
  countResults,
  describeCounts,
  type TestCase,
  type TestReport
} from './report.js'

// GitHub rejects a step summary over 1 MiB
export const maxSummaryBytes = 1024 * 1024
const maxFailures = 50
const maxLines = 50
// Terminal colours and styles, which test runners leave in their output
// oxlint-disable-next-line no-control-regex -- matching ESC is the point
const ansiEscape = /\u001b\[[0-?]*[ -/]*[@-~]/g

/**
 * How much of each report to show: everything, a limited amount of each
 * failure, or none, leaving only each report's counts.
 */
export type Detail = 'full' | 'limited' | 'none'

/**
 * Writes a table for each report to the job summary: a row per suite when
 * everything passed, or else a row per failed test with its failure.
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
  return [
    '<h2>Test results</h2>',
    ...reports.map((report) => renderReport(report, detail))
  ].join('\n')
}

function renderReport(report: TestReport, detail: Detail): string {
  const counts = countResults(report.cases)
  const icon = counts.failed > 0 ? '❌' : '✅'
  const heading = [
    `<h3>${icon} ${escape(report.name)}</h3>`,
    `<p><code>${escape(report.path)}</code> · ${describeCounts(counts)} · ${formatDuration(counts.durationMs)}</p>`
  ]
  if (detail === 'none' || report.cases.length === 0) return heading.join('\n')
  const table =
    counts.failed > 0
      ? renderFailures(report.cases, detail === 'limited')
      : renderSuites(report.cases)
  return [...heading, ...table].join('\n')
}

// When everything passed, a row per test would be long and say nothing more
// than a row per suite
function renderSuites(cases: TestCase[]): string[] {
  const suites = new Map<string, TestCase[]>()
  for (const testCase of cases) {
    suites.set(testCase.suite, [
      ...(suites.get(testCase.suite) ?? []),
      testCase
    ])
  }
  const rows = [...suites].map(([suite, suiteCases]) => {
    const counts = countResults(suiteCases)
    return row('td', [
      escape(suite),
      String(counts.passed),
      String(counts.skipped),
      formatDuration(counts.durationMs)
    ])
  })
  return [
    '<table>',
    row('th', ['Suite', 'Passed', 'Skipped', 'Duration']),
    ...rows,
    '</table>'
  ]
}

function renderFailures(cases: TestCase[], limited: boolean): string[] {
  const failures = cases.filter(({ status }) => status === 'failed')
  const shown = limited ? failures.slice(0, maxFailures) : failures
  const rows = shown.map((testCase) =>
    row('td', [
      escape(testCase.suite),
      escape(testCase.name),
      renderMessage(testCase.message, limited)
    ])
  )
  const hidden = failures.length - shown.length
  return [
    '<table>',
    row('th', ['Suite', 'Test', 'Failure']),
    ...rows,
    '</table>',
    ...(hidden > 0 ? [`<p>…and ${hidden} more failed tests</p>`] : [])
  ]
}

// The blank line before <pre> starts a new HTML block in GitHub's Markdown,
// which only ends at </pre>, so blank lines in the message don't end it early
// and turn the rest of the message into Markdown
function renderMessage(message: string | undefined, limited: boolean): string {
  const text = message?.replace(ansiEscape, '').trim()
  if (!text) return 'No failure message'
  const [firstLine] = text.split('\n')
  return `<details><summary>${escape(firstLine)}</summary>\n\n<pre><code>${escape(limited ? truncate(text) : text)}</code></pre>\n</details>`
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

// Each unit is chosen after rounding, so 59.96s shows as 1m 0s, not 60.0s
export function formatDuration(ms: number): string {
  if (Math.round(ms) < 1000) return `${Math.round(ms)}ms`
  const tenths = Math.round(ms / 100)
  if (tenths < 600) return `${(tenths / 10).toFixed(1)}s`
  const seconds = Math.round(ms / 1000)
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

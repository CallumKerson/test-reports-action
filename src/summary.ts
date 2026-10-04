import {
  type TestCase,
  type TestCounts,
  type TestReport,
  countResults,
  describeCounts,
  msPerSecond
} from './report.js'
import { plural } from './text.js'
import { summary } from '@actions/core'
import { uploadFullSummary } from './artifact.js'

const bytesPerKiB = 1024
// GitHub rejects a step summary over 1 MiB
const maxSummaryBytes = bytesPerKiB * bytesPerKiB
const maxFailures = 50
const maxLines = 50
const tenthsPerSecond = 10
const msPerTenth = msPerSecond / tenthsPerSecond
const secondsPerMinute = 60

// Terminal colours and styles, which test runners leave in their output
// oxlint-disable-next-line no-control-regex -- matching ESC is the point
const ansiEscape = /\u001b\[[0-?]*[ -/]*[@-~]/g

/**
 * How much of each report to show: everything, a limited amount of each
 * failure, or none, leaving only each report's counts.
 */
type Detail = 'full' | 'limited' | 'none'

const fits = (html: string): boolean =>
  Buffer.byteLength(html) < maxSummaryBytes

const row = (cell: 'th' | 'td', values: string[]): string =>
  `<tr>${values.map((value) => `<${cell}>${value}</${cell}>`).join('')}</tr>`

const escape = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

// Each unit is chosen after rounding, so 59.96s shows as 1m 0s, not 60.0s
const formatDuration = (ms: number): string => {
  if (Math.round(ms) < msPerSecond) {
    return `${Math.round(ms)}ms`
  }
  const tenths = Math.round(ms / msPerTenth)
  if (tenths < secondsPerMinute * tenthsPerSecond) {
    return `${(tenths / tenthsPerSecond).toFixed(1)}s`
  }
  const seconds = Math.round(ms / msPerSecond)
  return `${Math.floor(seconds / secondsPerMinute)}m ${seconds % secondsPerMinute}s`
}

/*
 * When everything passed, a row per test would be long and say nothing more
 * than a row per suite
 */
const renderSuites = (cases: TestCase[]): string[] => {
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

const truncate = (message: string, limited: boolean): string => {
  const lines = message.split('\n')
  if (!limited || lines.length <= maxLines) {
    return message
  }
  const hidden = lines.length - maxLines
  return [...lines.slice(0, maxLines), `…${hidden} more lines`].join('\n')
}

/*
 * The blank line before <pre> starts a new HTML block in GitHub's Markdown,
 * which only ends at </pre>, so blank lines in the message don't end it early
 * and turn the rest of the message into Markdown
 */
const renderMessage = (
  message: string | undefined,
  limited: boolean
): string => {
  const text = message?.replace(ansiEscape, '').trim()
  if (!text) {
    return 'No failure message'
  }
  const [firstLine] = text.split('\n')
  return `<details><summary>${escape(firstLine)}</summary>\n\n<pre><code>${escape(truncate(text, limited))}</code></pre>\n</details>`
}

const shownFailures = (failures: TestCase[], limited: boolean): TestCase[] => {
  if (limited) {
    return failures.slice(0, maxFailures)
  }
  return failures
}

const renderFailures = (cases: TestCase[], limited: boolean): string[] => {
  const failures = cases.filter(({ status }) => status === 'failed')
  const shown = shownFailures(failures, limited)
  const rows = shown.map((testCase) =>
    row('td', [
      escape(testCase.suite),
      escape(testCase.name),
      renderMessage(testCase.message, limited)
    ])
  )
  const table = [
    '<table>',
    row('th', ['Suite', 'Test', 'Failure']),
    ...rows,
    '</table>'
  ]
  const hidden = failures.length - shown.length
  if (hidden > 0) {
    return [...table, `<p>…and ${hidden} more failed tests</p>`]
  }
  return table
}

const icon = (counts: TestCounts): string => {
  if (counts.failed > 0) {
    return '❌'
  }
  return '✅'
}

const renderReport = (report: TestReport, detail: Detail): string => {
  const counts = countResults(report.cases)
  const heading = [
    `<h3>${icon(counts)} ${escape(report.name)}</h3>`,
    `<p><code>${escape(report.path)}</code> · ${describeCounts(counts)} · ${formatDuration(counts.durationMs)}</p>`
  ]
  if (detail === 'none' || report.cases.length === 0) {
    return heading.join('\n')
  }
  if (counts.failed > 0) {
    return [
      ...heading,
      ...renderFailures(report.cases, detail === 'limited')
    ].join('\n')
  }
  return [...heading, ...renderSuites(report.cases)].join('\n')
}

const renderSummary = (reports: TestReport[], detail: Detail): string =>
  [
    '<h2>Test results</h2>',
    ...reports.map((report) => renderReport(report, detail))
  ].join('\n')

const cutShortNote = (url: string | null, retentionDays: number): string => {
  if (!url) {
    return "<p>⚠️ Cut short to fit GitHub's 1 MiB limit.</p>"
  }
  return `<p>⚠️ Cut short to fit GitHub's 1 MiB limit. <a href="${url}">Download the full summary</a>, which is kept for ${plural(retentionDays, 'day')}.</p>`
}

// Many failing reports can be too big even when each one is cut short
const cutShort = (reports: TestReport[], note: string): string => {
  const limited = `${renderSummary(reports, 'limited')}\n${note}`
  if (fits(limited)) {
    return limited
  }
  return `${renderSummary(reports, 'none')}\n${note}`
}

/**
 * Writes a table for each report to the job summary: a row per suite when
 * everything passed, or else a row per failed test with its failure.
 *
 * A summary too big for GitHub is cut short, and the full one is uploaded as
 * an artifact, kept for retentionDays, and linked from it.
 */
const writeSummary = async (
  reports: TestReport[],
  retentionDays: number
): Promise<void> => {
  const full = renderSummary(reports, 'full')
  if (fits(full)) {
    await summary.addRaw(full, true).write()
    return
  }

  const url = await uploadFullSummary(full, retentionDays)
  const note = cutShortNote(url, retentionDays)
  await summary.addRaw(cutShort(reports, note), true).write()
}

export { formatDuration, maxSummaryBytes, renderSummary, writeSummary }

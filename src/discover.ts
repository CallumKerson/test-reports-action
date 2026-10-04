import type { TestCase } from './report.js'
import { create as createGlobber } from '@actions/glob'
import { parseGoTest } from './gotest.js'
import { parseJUnit } from './junit.js'
import path from 'node:path'

const formats = [
  { suffix: '.junit.xml', parse: parseJUnit },
  { suffix: '.gotest.json', parse: parseGoTest }
]

// Commit statuses are keyed by name, so a name shared by two reports would
// have one overwrite the other
function uniqueName(
  relative: string,
  suffix: string,
  reports: { path: string; suffix: string }[]
): string {
  const candidates = [
    (file: string, ext: string): string => path.posix.basename(file, ext),
    (file: string, ext: string): string => file.slice(0, -ext.length)
  ]
  for (const candidate of candidates) {
    const name = candidate(relative, suffix)
    const clashes = reports.filter(
      (other) => candidate(other.path, other.suffix) === name
    )
    if (clashes.length === 1) {
      return name
    }
  }
  // Only reports in the same directory with the same name but different
  // formats get here
  return relative
}

export interface ReportFile {
  /** Absolute path, for reading the file */
  file: string
  /** Path relative to the workspace, for showing to people */
  path: string
  /** Unique name, used for the commit status */
  name: string
  parse: (content: string) => TestCase[]
}

/**
 * Finds every test report in the workspace, sorted by path.
 */
export async function findReports(workspace: string): Promise<ReportFile[]> {
  const patterns = [
    ...formats.map(({ suffix }) => path.join(workspace, `**/*${suffix}`)),
    `!${path.join(workspace, '**/node_modules/**')}`
  ]
  const globber = await createGlobber(patterns.join('\n'), {
    followSymbolicLinks: false,
    matchDirectories: false
  })
  const files = (await globber.glob()).sort()

  const reports = files.flatMap((file) => {
    const format = formats.find(({ suffix }) => file.endsWith(suffix))
    if (!format) {
      return []
    }
    const relative = path.relative(workspace, file).split(path.sep).join('/')
    return [
      { file, path: relative, suffix: format.suffix, parse: format.parse }
    ]
  })

  return reports.map(({ suffix, ...report }) => ({
    ...report,
    name: uniqueName(report.path, suffix, reports)
  }))
}

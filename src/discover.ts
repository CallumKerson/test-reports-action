import type { TestCase } from './report.js'
import { create as createGlobber } from '@actions/glob'
import { parseGoTest } from './gotest.js'
import { parseJUnit } from './junit.js'
import path from 'node:path'

/*
 * A file named exactly junit.xml is a common default, as in nextest's
 * target/nextest/<profile>/junit.xml and jest-junit's ./junit.xml. Its name
 * says nothing, so the report is named after its directory instead
 */
const PLAIN_JUNIT = 'junit.xml'

const formats = [
  { parse: parseJUnit, suffix: '.junit.xml' },
  { parse: parseGoTest, suffix: '.gotest.json' }
]

/*
 * The path that names a report: the file's path without its format suffix,
 * or for a plain junit.xml, its directory
 */
const stem = (relative: string): string => {
  if (relative === PLAIN_JUNIT) {
    return 'junit'
  }
  if (path.posix.basename(relative) === PLAIN_JUNIT) {
    return path.posix.dirname(relative)
  }
  const format = formats.find(({ suffix }) => relative.endsWith(suffix))
  if (!format) {
    return relative
  }
  return relative.slice(0, -format.suffix.length)
}

/*
 * Commit statuses are keyed by name, so a name shared by two reports would
 * have one overwrite the other
 */
const uniqueName = (relative: string, others: string[]): string => {
  const candidates = [
    (file: string): string => path.posix.basename(stem(file)),
    stem
  ]
  for (const candidate of candidates) {
    const name = candidate(relative)
    const clashes = others.filter((other) => candidate(other) === name)
    if (clashes.length === 1) {
      return name
    }
  }
  /*
   * Only reports in the same directory with the same name but different
   * formats, or a junit.xml in a directory named like a report beside it,
   * get here
   */
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
export const findReports = async (workspace: string): Promise<ReportFile[]> => {
  const patterns = [
    ...formats.map(({ suffix }) => path.join(workspace, `**/*${suffix}`)),
    path.join(workspace, `**/${PLAIN_JUNIT}`),
    `!${path.join(workspace, '**/node_modules/**')}`
  ]
  const globber = await createGlobber(patterns.join('\n'), {
    followSymbolicLinks: false,
    matchDirectories: false
  })
  const files = (await globber.glob()).sort()

  const reports = files.flatMap((file) => {
    let parse = formats.find(({ suffix }) => file.endsWith(suffix))?.parse
    if (path.basename(file) === PLAIN_JUNIT) {
      parse = parseJUnit
    }
    if (!parse) {
      return []
    }
    const relative = path.relative(workspace, file).split(path.sep).join('/')
    return [{ file, parse, path: relative }]
  })

  const paths = reports.map((report) => report.path)
  return reports.map((report) => ({
    ...report,
    name: uniqueName(report.path, paths)
  }))
}

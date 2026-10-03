import { XMLParser } from 'fast-xml-parser'
import type { TestCase } from './report.js'

type XmlNode = Record<string, unknown>

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  // Keep text and attributes as written, so names like "1" stay strings
  parseTagValue: false,
  parseAttributeValue: false,
  isArray: (tagName) =>
    ['testsuite', 'testcase', 'failure', 'error', 'skipped'].includes(tagName)
})

/**
 * Parses a JUnit XML report into test cases.
 *
 * The root can be <testsuites> or a single <testsuite>, and suites can nest.
 */
export function parseJUnit(xml: string): TestCase[] {
  const document = parser.parse(xml) as XmlNode
  const root = (document.testsuites ?? document) as XmlNode
  if (!Array.isArray(root.testsuite)) {
    throw new Error('not a JUnit report: no <testsuite> element')
  }
  return (root.testsuite as XmlNode[]).flatMap(parseSuite)
}

function parseSuite(suite: XmlNode): TestCase[] {
  const suiteName = attribute(suite, 'name')
  const cases = ((suite.testcase as XmlNode[] | undefined) ?? []).map(
    (testCase) => parseCase(testCase, suiteName)
  )
  const nested = ((suite.testsuite as XmlNode[] | undefined) ?? []).flatMap(
    parseSuite
  )
  return [...cases, ...nested]
}

function parseCase(testCase: XmlNode, suiteName: string): TestCase {
  const name = attribute(testCase, 'name')
  const className = attribute(testCase, 'classname')
  const result: TestCase = {
    // Some reporters, like jest-junit, repeat the test name as the class name
    suite: className && className !== name ? className : suiteName,
    name,
    status: 'passed',
    durationMs: seconds(attribute(testCase, 'time')) * 1000
  }

  const problems = [
    ...((testCase.failure as unknown[] | undefined) ?? []),
    ...((testCase.error as unknown[] | undefined) ?? [])
  ]
  if (problems.length > 0) {
    result.status = 'failed'
    const message = problems.map(describe).filter(Boolean).join('\n\n')
    if (message) result.message = message
  } else if (testCase.skipped) {
    result.status = 'skipped'
  }
  return result
}

// The body usually holds the message and a stack trace, so only fall back
// to the attributes when it is empty
function describe(problem: unknown): string {
  if (typeof problem === 'string') return problem.trim()
  const node = problem as XmlNode
  const text = typeof node['#text'] === 'string' ? node['#text'].trim() : ''
  return text || attribute(node, 'message') || attribute(node, 'type')
}

function attribute(node: XmlNode, name: string): string {
  const value = node[`@${name}`]
  return typeof value === 'string' ? value : ''
}

function seconds(value: string): number {
  const parsed = parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

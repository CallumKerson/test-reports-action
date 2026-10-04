import type { TestCase } from './report.js'
import { XMLParser } from 'fast-xml-parser'

type XmlNode = Record<string, unknown>

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  // Keep text and attributes as written, so names like "1" stay strings
  parseTagValue: false,
  parseAttributeValue: false,
  isArray: (tagName): boolean =>
    ['testsuite', 'testcase', 'failure', 'error', 'skipped'].includes(tagName)
})

function attribute(node: XmlNode, name: string): string {
  const value = node[`@${name}`]
  return typeof value === 'string' ? value : ''
}

function seconds(value: string): number {
  const parsed = parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

// The parser makes arrays of the tags in isArray, so anything else is absent
function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function isNode(value: unknown): value is XmlNode {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// The body usually holds the message and a stack trace, so only fall back
// to the attributes when it is empty
function describe(problem: unknown): string {
  if (typeof problem === 'string') {
    return problem.trim()
  }
  if (!isNode(problem)) {
    return ''
  }
  const text =
    typeof problem['#text'] === 'string' ? problem['#text'].trim() : ''
  return text || attribute(problem, 'message') || attribute(problem, 'type')
}

function parseOutcome(testCase: XmlNode): Pick<TestCase, 'status' | 'message'> {
  const problems = [...list(testCase.failure), ...list(testCase.error)]
  if (problems.length === 0) {
    return { status: testCase.skipped ? 'skipped' : 'passed' }
  }
  const message = problems.map(describe).filter(Boolean).join('\n\n')
  return message ? { status: 'failed', message } : { status: 'failed' }
}

function parseCase(testCase: XmlNode, suiteName: string): TestCase {
  const name = attribute(testCase, 'name')
  const className = attribute(testCase, 'classname')
  return {
    // Some reporters, like jest-junit, repeat the test name as the class name
    suite: className && className !== name ? className : suiteName,
    name,
    durationMs: seconds(attribute(testCase, 'time')) * 1000,
    ...parseOutcome(testCase)
  }
}

// An element with no attributes or children parses as an empty string, which
// is still an element, just one with nothing in it
function nodes(value: unknown): XmlNode[] {
  return list(value).map((item) => (isNode(item) ? item : {}))
}

function parseSuites(parent: unknown): TestCase[] {
  if (!isNode(parent)) {
    return []
  }
  // Suites can hold suites of their own
  return nodes(parent.testsuite).flatMap((suite) => {
    const suiteName = attribute(suite, 'name')
    const cases = nodes(suite.testcase).map((testCase) =>
      parseCase(testCase, suiteName)
    )
    return [...cases, ...parseSuites(suite)]
  })
}

/**
 * Parses a JUnit XML report into test cases.
 *
 * The root can be <testsuites> or a single <testsuite>, and suites can nest.
 */
export function parseJUnit(xml: string): TestCase[] {
  const document: unknown = parser.parse(xml)
  if (!isNode(document)) {
    throw new Error('not a JUnit report: no elements')
  }
  // jest-junit and others write a <testsuites> with no suites in it when no
  // tests ran
  if ('testsuites' in document) {
    return parseSuites(document.testsuites)
  }
  if (!Array.isArray(document.testsuite)) {
    throw new Error('not a JUnit report: no <testsuite> element')
  }
  return parseSuites(document)
}

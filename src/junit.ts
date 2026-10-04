import { type TestCase, msPerSecond } from './report.js'
import { XMLParser } from 'fast-xml-parser'

type XmlNode = Record<string, unknown>

const parser = new XMLParser({
  attributeNamePrefix: '@',
  ignoreAttributes: false,
  isArray: (tagName): boolean =>
    ['testsuite', 'testcase', 'failure', 'error', 'skipped'].includes(tagName),
  // Keep text and attributes as written, so names like "1" stay strings
  parseAttributeValue: false,
  parseTagValue: false
})

const attribute = (node: XmlNode, name: string): string => {
  const value = node[`@${name}`]
  if (typeof value === 'string') {
    return value
  }
  return ''
}

const seconds = (value: string): number => {
  const parsed = parseFloat(value)
  if (Number.isFinite(parsed)) {
    return parsed
  }
  return 0
}

// The parser makes arrays of the tags in isArray, so anything else is absent
const list = (value: unknown): unknown[] => {
  if (Array.isArray(value)) {
    return value
  }
  return []
}

const isNode = (value: unknown): value is XmlNode =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

// The body usually holds the message and a stack trace, so only fall back
// to the attributes when it is empty
const describe = (problem: unknown): string => {
  if (typeof problem === 'string') {
    return problem.trim()
  }
  if (!isNode(problem)) {
    return ''
  }
  const text = problem['#text']
  if (typeof text === 'string' && text.trim()) {
    return text.trim()
  }
  return attribute(problem, 'message') || attribute(problem, 'type')
}

const parseOutcome = (
  testCase: XmlNode
): Pick<TestCase, 'status' | 'message'> => {
  const problems = [...list(testCase.failure), ...list(testCase.error)]
  const message = problems.map(describe).filter(Boolean).join('\n\n')
  if (message) {
    return { message, status: 'failed' }
  }
  if (problems.length > 0) {
    return { status: 'failed' }
  }
  if (testCase.skipped) {
    return { status: 'skipped' }
  }
  return { status: 'passed' }
}

// Some reporters, like jest-junit, repeat the test name as the class name
const caseSuite = (
  className: string,
  name: string,
  suiteName: string
): string => {
  if (className && className !== name) {
    return className
  }
  return suiteName
}

const parseCase = (testCase: XmlNode, suiteName: string): TestCase => {
  const name = attribute(testCase, 'name')
  return {
    durationMs: seconds(attribute(testCase, 'time')) * msPerSecond,
    name,
    suite: caseSuite(attribute(testCase, 'classname'), name, suiteName),
    ...parseOutcome(testCase)
  }
}

// An element with no attributes or children parses as an empty string, which
// is still an element, just one with nothing in it
const asNode = (item: unknown): XmlNode => {
  if (isNode(item)) {
    return item
  }
  return {}
}

const nodes = (value: unknown): XmlNode[] => list(value).map(asNode)

const parseSuites = (parent: unknown): TestCase[] => {
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
export const parseJUnit = (xml: string): TestCase[] => {
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

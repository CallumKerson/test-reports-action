import { describe, expect, it, vi } from 'vitest'
import { parseJUnit } from '../src/junit.js'
import { readFile } from 'node:fs/promises'

vi.setConfig({ testTimeout: 5000 })

const fixture = async (name: string): Promise<string> =>
  readFile(new URL(`../__fixtures__/junit/${name}`, import.meta.url), 'utf8')

describe('junit.ts', () => {
  it('parses a jest-junit report', async () => {
    expect.hasAssertions()

    const cases = parseJUnit(await fixture('jest.xml'))

    expect(
      cases.map(({ suite, name, status }) => [suite, name, status])
    ).toStrictEqual([
      ['math', 'math adds numbers', 'passed'],
      ['math', 'math divides numbers', 'failed'],
      ['math', 'math rounds numbers', 'skipped'],
      ['strings', 'strings joins', 'passed']
    ])
    expect(cases[1].message).toMatch(/^Error: expect\(received\)/)
    expect(cases[1].message).toContain('at Object.<anonymous>')
    expect(cases[3].durationMs).toBe(250)
  })

  it('parses a Surefire report with a bare testsuite root', async () => {
    expect.hasAssertions()

    const cases = parseJUnit(await fixture('surefire.xml'))

    expect(cases.map(({ status }) => status)).toStrictEqual([
      'passed',
      'failed',
      'skipped'
    ])
    expect(cases[0].suite).toBe('com.example.CalculatorTest')
    expect(cases[1].message).toMatch(
      /^java.lang.ArithmeticException: \/ by zero\n\tat com.example/
    )
  })

  it('uses the class name as the suite and falls back to the message attribute', async () => {
    expect.hasAssertions()

    const cases = parseJUnit(await fixture('pytest.xml'))

    expect(cases[1]).toStrictEqual({
      durationMs: 2,
      message: 'assert 1 == 2',
      name: 'test_bad',
      status: 'failed',
      suite: 'tests.test_app'
    })
  })

  it('parses nested suites', () => {
    expect.hasAssertions()

    const cases = parseJUnit(`
      <testsuites>
        <testsuite name="outer">
          <testcase name="a"/>
          <testsuite name="inner">
            <testcase name="b"><failure type="AssertionError"/></testcase>
          </testsuite>
        </testsuite>
      </testsuites>`)

    expect(cases).toStrictEqual([
      { durationMs: 0, name: 'a', status: 'passed', suite: 'outer' },
      {
        durationMs: 0,
        message: 'AssertionError',
        name: 'b',
        status: 'failed',
        suite: 'inner'
      }
    ])
  })

  it('parses an empty suite', () => {
    expect.hasAssertions()

    expect(
      parseJUnit('<testsuites><testsuite name="none"/></testsuites>')
    ).toStrictEqual([])
  })

  it.each([
    '<testsuites></testsuites>',
    '<?xml version="1.0"?><testsuites name="jest tests" tests="0"/>'
  ])('parses a report with no suites: %p', (xml) => {
    expect.hasAssertions()

    expect(parseJUnit(xml)).toStrictEqual([])
  })

  it('parses a test case with no attributes', () => {
    expect.hasAssertions()

    expect(
      parseJUnit('<testsuite name="s"><testcase/></testsuite>')
    ).toStrictEqual([{ durationMs: 0, name: '', status: 'passed', suite: 's' }])
  })

  it('leaves out the message of a failure with no details', () => {
    expect.hasAssertions()

    const [testCase] = parseJUnit(
      '<testsuite><testcase name="a"><failure/></testcase></testsuite>'
    )

    expect(testCase).toStrictEqual({
      durationMs: 0,
      name: 'a',
      status: 'failed',
      suite: ''
    })
  })

  it('throws on XML that is not a JUnit report', () => {
    expect.hasAssertions()

    expect(() => parseJUnit('<project><name>x</name></project>')).toThrow(
      'not a JUnit report'
    )
  })
})

import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { parseJUnit } from '../src/junit.js'

const fixture = (name: string) =>
  readFile(new URL(`../__fixtures__/junit/${name}`, import.meta.url), 'utf8')

describe('junit.ts', () => {
  it('Parses a jest-junit report', async () => {
    const cases = parseJUnit(await fixture('jest.xml'))

    expect(
      cases.map(({ suite, name, status }) => [suite, name, status])
    ).toEqual([
      ['math', 'math adds numbers', 'passed'],
      ['math', 'math divides numbers', 'failed'],
      ['math', 'math rounds numbers', 'skipped'],
      ['strings', 'strings joins', 'passed']
    ])
    expect(cases[1].message).toMatch(/^Error: expect\(received\)/)
    expect(cases[1].message).toContain('at Object.<anonymous>')
    expect(cases[3].durationMs).toBe(250)
  })

  it('Parses a Surefire report with a bare testsuite root', async () => {
    const cases = parseJUnit(await fixture('surefire.xml'))

    expect(cases.map(({ status }) => status)).toEqual([
      'passed',
      'failed',
      'skipped'
    ])
    expect(cases[0].suite).toBe('com.example.CalculatorTest')
    expect(cases[1].message).toMatch(
      /^java.lang.ArithmeticException: \/ by zero\n\tat com.example/
    )
  })

  it('Uses the class name as the suite and falls back to the message attribute', async () => {
    const cases = parseJUnit(await fixture('pytest.xml'))

    expect(cases[1]).toEqual({
      suite: 'tests.test_app',
      name: 'test_bad',
      status: 'failed',
      durationMs: 2,
      message: 'assert 1 == 2'
    })
  })

  it('Parses nested suites', () => {
    const cases = parseJUnit(`
      <testsuites>
        <testsuite name="outer">
          <testcase name="a"/>
          <testsuite name="inner">
            <testcase name="b"><failure type="AssertionError"/></testcase>
          </testsuite>
        </testsuite>
      </testsuites>`)

    expect(cases).toEqual([
      { suite: 'outer', name: 'a', status: 'passed', durationMs: 0 },
      {
        suite: 'inner',
        name: 'b',
        status: 'failed',
        durationMs: 0,
        message: 'AssertionError'
      }
    ])
  })

  it('Parses an empty suite', () => {
    expect(
      parseJUnit('<testsuites><testsuite name="none"/></testsuites>')
    ).toEqual([])
  })

  it.each([
    '<testsuites></testsuites>',
    '<?xml version="1.0"?><testsuites name="jest tests" tests="0"/>'
  ])('Parses a report with no suites: %p', (xml) => {
    expect(parseJUnit(xml)).toEqual([])
  })

  it('Parses a test case with no attributes', () => {
    expect(parseJUnit('<testsuite name="s"><testcase/></testsuite>')).toEqual([
      { suite: 's', name: '', status: 'passed', durationMs: 0 }
    ])
  })

  it('Leaves out the message of a failure with no details', () => {
    const [testCase] = parseJUnit(
      '<testsuite><testcase name="a"><failure/></testcase></testsuite>'
    )

    expect(testCase).toEqual({
      suite: '',
      name: 'a',
      status: 'failed',
      durationMs: 0
    })
  })

  it('Throws on XML that is not a JUnit report', () => {
    expect(() => parseJUnit('<project><name>x</name></project>')).toThrow(
      'not a JUnit report'
    )
  })
})

import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { parseGoTest } from '../src/gotest.js'

const fixture = async (name: string): Promise<string> =>
  readFile(new URL(`../__fixtures__/gotest/${name}`, import.meta.url), 'utf8')

const events = (...lines: object[]): string =>
  lines.map((line) => JSON.stringify(line)).join('\n')

describe('gotest.ts', () => {
  it('Parses go test -json output', async () => {
    const cases = parseGoTest(await fixture('demo.jsonl'))

    expect(
      cases.map(({ suite, name, status }) => [suite, name, status])
    ).toStrictEqual([
      ['example.com/demo/calc', 'TestAdd', 'passed'],
      ['example.com/demo/calc', 'TestDivide', 'failed'],
      ['example.com/demo/calc', 'TestRound', 'skipped'],
      ['example.com/demo/calc', 'TestTable/one', 'passed'],
      ['example.com/demo/calc', 'TestTable/two', 'failed'],
      ['example.com/demo/calc', 'TestParentOnly', 'failed'],
      ['example.com/demo/calc', 'TestParentOnly/ok', 'passed'],
      ['example.com/demo/broken', 'example.com/demo/broken', 'failed']
    ])
  })

  it('Keeps only what the test logged as the failure message', async () => {
    const cases = parseGoTest(await fixture('demo.jsonl'))

    expect(cases[1].message).toBe('calc_test.go:8: got 3, want 2')
    expect(cases[4].message).toBe('calc_test.go:15: bad two')
    expect(cases[5].message).toBe('calc_test.go:20: parent failed')
    expect(cases[0].message).toBeUndefined()
  })

  it('Reports a build failure with the compiler output', async () => {
    const cases = parseGoTest(await fixture('demo.jsonl'))

    expect(cases[7].message).toBe(
      [
        '# example.com/demo/broken [example.com/demo/broken.test]',
        'broken/broken_test.go:5:28: undefined: undefined',
        'FAIL\texample.com/demo/broken [build failed]'
      ].join('\n')
    )
  })

  it('Reports a package that fails without a failing test', () => {
    const cases = parseGoTest(
      events(
        { Action: 'run', Package: 'p', Test: 'TestA' },
        { Action: 'pass', Package: 'p', Test: 'TestA', Elapsed: 0.25 },
        { Action: 'output', Package: 'p', Output: 'panic: TestMain broke\n' },
        { Action: 'output', Package: 'p', Output: '\tmain.go:3 +0x1\n' },
        { Action: 'fail', Package: 'p', Elapsed: 1.5 }
      )
    )

    expect(cases).toStrictEqual([
      { suite: 'p', name: 'TestA', status: 'passed', durationMs: 250 },
      {
        suite: 'p',
        name: 'p',
        status: 'failed',
        durationMs: 1500,
        message: 'panic: TestMain broke\n\tmain.go:3 +0x1'
      }
    ])
  })

  it('Fails a test that never finished', () => {
    const cases = parseGoTest(
      events(
        { Action: 'run', Package: 'p', Test: 'TestSlow' },
        {
          Action: 'output',
          Package: 'p',
          Test: 'TestSlow',
          Output: 'panic: test timed out\n'
        },
        { Action: 'fail', Package: 'p', Elapsed: 600 }
      )
    )

    expect(cases).toStrictEqual([
      {
        suite: 'p',
        name: 'TestSlow',
        status: 'failed',
        durationMs: 0,
        message: 'panic: test timed out'
      }
    ])
  })

  it('Reports only the deepest failure in nested subtests', () => {
    const cases = parseGoTest(
      events(
        { Action: 'fail', Package: 'p', Test: 'TestA/b/c' },
        { Action: 'pass', Package: 'p', Test: 'TestA/b/d' },
        { Action: 'fail', Package: 'p', Test: 'TestA/b' },
        { Action: 'fail', Package: 'p', Test: 'TestA' },
        { Action: 'pass', Package: 'p', Test: 'TestAB' },
        { Action: 'pass', Package: 'q', Test: 'TestA' }
      )
    )

    expect(
      cases.map(({ suite, name, status }) => [suite, name, status])
    ).toStrictEqual([
      ['p', 'TestA/b/c', 'failed'],
      ['p', 'TestA/b/d', 'passed'],
      ['p', 'TestAB', 'passed'],
      ['q', 'TestA', 'passed']
    ])
  })

  it('Leaves out the message of a failure with no output', () => {
    expect(
      parseGoTest(events({ Action: 'fail', Package: 'p', Test: 'TestA' }))
    ).toStrictEqual([
      { suite: 'p', name: 'TestA', status: 'failed', durationMs: 0 }
    ])
  })

  it('Skips lines that are not JSON events', () => {
    const cases = parseGoTest(
      [
        'go: downloading example.com/dep v1.0.0',
        '{not json',
        events(
          { Action: 'start', Package: 'p' },
          { Action: 'pass', Package: 'p', Test: 'TestA' },
          { Action: 'pass', Package: 'p', Elapsed: 0.1 }
        )
      ].join('\n')
    )

    expect(cases).toStrictEqual([
      { suite: 'p', name: 'TestA', status: 'passed', durationMs: 0 }
    ])
  })

  it('Parses an empty file', () => {
    expect(parseGoTest('')).toStrictEqual([])
  })

  it('Throws on output that is not from go test -json', () => {
    expect(() =>
      parseGoTest('--- FAIL: TestA (0.00s)\nFAIL\texample.com/p\t0.1s\n')
    ).toThrow('not a go test -json report')
  })
})

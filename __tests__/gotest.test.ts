import { describe, expect, it, vi } from 'vitest'
import { parseGoTest } from '../src/gotest.js'
import { readFile } from 'node:fs/promises'

vi.setConfig({ testTimeout: 5000 })

const fixture = async (name: string): Promise<string> =>
  readFile(new URL(`../__fixtures__/gotest/${name}`, import.meta.url), 'utf8')

const events = (...lines: object[]): string =>
  lines.map((line) => JSON.stringify(line)).join('\n')

describe('gotest.ts', () => {
  it('parses go test -json output', async () => {
    expect.hasAssertions()

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

  it('keeps only what the test logged as the failure message', async () => {
    expect.hasAssertions()

    const cases = parseGoTest(await fixture('demo.jsonl'))

    expect(cases[1].message).toBe('calc_test.go:8: got 3, want 2')
    expect(cases[4].message).toBe('calc_test.go:15: bad two')
    expect(cases[5].message).toBe('calc_test.go:20: parent failed')
    expect(cases[0].message).toBeUndefined()
  })

  it('reports a build failure with the compiler output', async () => {
    expect.hasAssertions()

    const cases = parseGoTest(await fixture('demo.jsonl'))

    expect(cases[7].message).toBe(
      [
        '# example.com/demo/broken [example.com/demo/broken.test]',
        'broken/broken_test.go:5:28: undefined: undefined',
        'FAIL\texample.com/demo/broken [build failed]'
      ].join('\n')
    )
  })

  it('reports a package that fails without a failing test', () => {
    expect.hasAssertions()

    const cases = parseGoTest(
      events(
        { Action: 'run', Package: 'p', Test: 'TestA' },
        { Action: 'pass', Elapsed: 0.25, Package: 'p', Test: 'TestA' },
        { Action: 'output', Output: 'panic: TestMain broke\n', Package: 'p' },
        { Action: 'output', Output: '\tmain.go:3 +0x1\n', Package: 'p' },
        { Action: 'fail', Elapsed: 1.5, Package: 'p' }
      )
    )

    expect(cases).toStrictEqual([
      { durationMs: 250, name: 'TestA', status: 'passed', suite: 'p' },
      {
        durationMs: 1500,
        message: 'panic: TestMain broke\n\tmain.go:3 +0x1',
        name: 'p',
        status: 'failed',
        suite: 'p'
      }
    ])
  })

  it('fails a test that never finished', () => {
    expect.hasAssertions()

    const cases = parseGoTest(
      events(
        { Action: 'run', Package: 'p', Test: 'TestSlow' },
        {
          Action: 'output',
          Output: 'panic: test timed out\n',
          Package: 'p',
          Test: 'TestSlow'
        },
        { Action: 'fail', Elapsed: 600, Package: 'p' }
      )
    )

    expect(cases).toStrictEqual([
      {
        durationMs: 0,
        message: 'panic: test timed out',
        name: 'TestSlow',
        status: 'failed',
        suite: 'p'
      }
    ])
  })

  it('reports only the deepest failure in nested subtests', () => {
    expect.hasAssertions()

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

  it('leaves out the message of a failure with no output', () => {
    expect.hasAssertions()

    expect(
      parseGoTest(events({ Action: 'fail', Package: 'p', Test: 'TestA' }))
    ).toStrictEqual([
      { durationMs: 0, name: 'TestA', status: 'failed', suite: 'p' }
    ])
  })

  it('skips lines that are not JSON events', () => {
    expect.hasAssertions()

    const cases = parseGoTest(
      [
        'go: downloading example.com/dep v1.0.0',
        '{not json',
        events(
          { Action: 'start', Package: 'p' },
          { Action: 'pass', Package: 'p', Test: 'TestA' },
          { Action: 'pass', Elapsed: 0.1, Package: 'p' }
        )
      ].join('\n')
    )

    expect(cases).toStrictEqual([
      { durationMs: 0, name: 'TestA', status: 'passed', suite: 'p' }
    ])
  })

  it('parses an empty file', () => {
    expect.hasAssertions()

    expect(parseGoTest('')).toStrictEqual([])
  })

  it('throws on output that is not from go test -json', () => {
    expect.hasAssertions()

    expect(() =>
      parseGoTest('--- FAIL: TestA (0.00s)\nFAIL\texample.com/p\t0.1s\n')
    ).toThrow('not a go test -json report')
  })
})

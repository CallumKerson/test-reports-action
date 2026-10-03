import type { TestCase, TestStatus } from './report.js'

interface Event {
  Action?: string
  Package?: string
  Test?: string
  Output?: string
  Elapsed?: number
  ImportPath?: string
  FailedBuild?: string
}

interface Test {
  pkg: string
  name: string
  status?: TestStatus
  elapsed: number
  output: string[]
}

interface Package {
  failed: boolean
  failedBuild?: string
  elapsed: number
  output: string[]
}

const results: Record<string, TestStatus> = {
  pass: 'passed',
  fail: 'failed',
  skip: 'skipped'
}

// go test prints these around each test's own output, and the status is
// already shown elsewhere
const noise = /^\s*(=== (RUN|PAUSE|CONT|NAME)|--- (PASS|FAIL|SKIP):)/

/**
 * Parses the output of `go test -json` into test cases.
 *
 * Only leaf tests are kept, so a table test counts once per subtest. A package
 * that fails without a failing test, such as from a build error, becomes one
 * failed case named after the package.
 */
export function parseGoTest(ndjson: string): TestCase[] {
  const tests = new Map<string, Test>()
  const packages = new Map<string, Package>()
  const builds = new Map<string, string[]>()
  let events = 0

  for (const line of ndjson.split('\n')) {
    const event = parseEvent(line)
    if (!event) continue
    events++

    if (event.ImportPath) {
      if (event.Action === 'build-output') {
        builds.set(event.ImportPath, [
          ...(builds.get(event.ImportPath) ?? []),
          event.Output ?? ''
        ])
      }
      continue
    }
    if (!event.Package) continue

    if (event.Test) {
      const key = `${event.Package}\0${event.Test}`
      const test = tests.get(key) ?? {
        pkg: event.Package,
        name: event.Test,
        elapsed: 0,
        output: []
      }
      tests.set(key, test)
      applyEvent(test, event)
      continue
    }

    const pkg = packages.get(event.Package) ?? {
      failed: false,
      elapsed: 0,
      output: []
    }
    packages.set(event.Package, pkg)
    if (event.Action === 'output') pkg.output.push(event.Output ?? '')
    if (event.Action === 'fail') {
      pkg.failed = true
      pkg.failedBuild = event.FailedBuild
      pkg.elapsed = event.Elapsed ?? 0
    }
  }

  if (events === 0 && ndjson.trim()) {
    throw new Error('not a go test -json report: no JSON events')
  }

  const all = [...tests.values()]
  const cases = all.filter((test) => isReported(test, all)).map(toCase)

  for (const [name, pkg] of packages) {
    if (
      !pkg.failed ||
      cases.some((c) => c.suite === name && c.status === 'failed')
    ) {
      continue
    }
    const output = pkg.failedBuild ? (builds.get(pkg.failedBuild) ?? []) : []
    cases.push({
      suite: name,
      name,
      status: 'failed',
      durationMs: pkg.elapsed * 1000,
      message: clean([...output, ...pkg.output])
    })
  }
  return cases
}

function parseEvent(line: string): Event | undefined {
  // Build errors go to stderr, which is sometimes redirected into the file
  if (!line.startsWith('{')) return undefined
  try {
    return JSON.parse(line) as Event
  } catch {
    return undefined
  }
}

function applyEvent(test: Test, event: Event): void {
  if (event.Action === 'output') {
    test.output.push(event.Output ?? '')
  } else if (event.Action && event.Action in results) {
    test.status = results[event.Action]
    test.elapsed = event.Elapsed ?? 0
  }
}

// A parent test fails whenever a subtest does, so it is only worth reporting
// when it failed on its own account
function isReported(test: Test, all: Test[]): boolean {
  const children = all.filter(
    (other) => other.pkg === test.pkg && other.name.startsWith(`${test.name}/`)
  )
  if (children.length === 0) return true
  return (
    status(test) === 'failed' &&
    !children.some((child) => status(child) === 'failed')
  )
}

// A test with no result was cut off, by a panic or a timeout
function status(test: Test): TestStatus {
  return test.status ?? 'failed'
}

function toCase(test: Test): TestCase {
  const result: TestCase = {
    suite: test.pkg,
    name: test.name,
    status: status(test),
    durationMs: test.elapsed * 1000
  }
  if (result.status === 'failed') {
    const message = clean(test.output)
    if (message) result.message = message
  }
  return result
}

function clean(output: string[]): string {
  const lines = output
    .join('')
    .split('\n')
    .filter((line) => line.trim() && !noise.test(line))
  const indent = Math.min(
    ...lines.map((line) => line.length - line.trimStart().length)
  )
  return lines.map((line) => line.slice(indent).trimEnd()).join('\n')
}

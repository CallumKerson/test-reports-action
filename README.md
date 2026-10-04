# Test Reports Action

![CI](https://github.com/CallumKerson/test-reports-action/actions/workflows/ci.yaml/badge.svg)
![Check dist/](https://github.com/CallumKerson/test-reports-action/actions/workflows/check-dist.yaml/badge.svg)
![Coverage](./badges/coverage.svg)

An opinionated test reporter for GitHub Actions.

## Usage

Write your test results to files the action recognises, then run it after your
tests, even when they fail:

```yaml
permissions:
  contents: read
  statuses: write

steps:
  - uses: actions/checkout@v7
  - run: go test -json ./... > results.gotest.json
  - uses: CallumKerson/test-reports-action@23f5ad8f899498e8a8ad3a2461943bd0a1c879e2 # v0.1.1
    if: ${{ !cancelled() }}
```

There is no major version tag, such as `@v0`, to follow. Pin a release's
commit SHA, as above, so every run uses the same code, or at least its exact
version tag, such as `@v0.1.1`. Dependabot and Renovate can keep either pin up
to date.

The action finds every report in the workspace, outside `node_modules`, with no
paths to configure:

| Format                       | File name       | Produced by                                   |
| ---------------------------- | --------------- | --------------------------------------------- |
| JUnit XML                    | `*.junit.xml`   | jest-junit, Maven Surefire, pytest and others |
| [Go test JSON][go-test-json] | `*.gotest.json` | `go test -json ./... > results.gotest.json`   |

For each report it sets a commit status named `Tests / <name>`, where the name
is the file name without the format suffix, so `unit.junit.xml` becomes
`Tests / unit`. When two reports would share a name, their directories are
added to tell them apart.

In a matrix job, every job finds reports with the same names, so the matrix
values are added to each status, as in `Tests (ubuntu-latest, 24) / unit`.
Set `name` to use something else.

Separate jobs or workflows that report on the same commit with the same report
names overwrite each other's statuses too, and the action can't tell when
that happens. Give each of them its own `name`.

It also writes a table for each report to the job summary. When everything in
a report passed, its table has a row for each suite. Otherwise, it has a row
for each failed test, with the test's failure output.

GitHub limits a job summary to 1 MiB. When the full summary is bigger than
that, the job summary shows at most 50 failures per report and 50 lines of
each failure's output, or only each report's counts if that is still too big.
The full summary is uploaded as an HTML artifact, linked from the job summary,
and kept for `retention-days`.

The step fails if any test failed, and only warns when it finds no reports.
A report that can't be parsed shows up as a failed test, so the other reports
are still summarised and given statuses.

Setting commit statuses needs the `statuses: write` permission. Without it,
for example on pull requests from forks, the action warns and still writes the
summary. To set them on pull requests from forks, upload the reports as an
artifact, then download them and run the action in a `workflow_run` workflow,
which sets the statuses on the commit that triggered it.

Go needs the `-json` flag: plain `go test` output can't be parsed.

[go-test-json]: https://pkg.go.dev/cmd/test2json

| Input            | Description                                | Default               |
| ---------------- | ------------------------------------------ | --------------------- |
| `token`          | Token used to set commit statuses          | `${{ github.token }}` |
| `name`           | Name added to each commit status           | The matrix values     |
| `retention-days` | Days to keep the full summary artifact for | `7`                   |

## Development

Tooling is managed with [mise](https://mise.jdx.dev), and Node dependencies
with [aube](https://aube.sh). Install everything with:

```bash
mise install
hk install --mise
```

The second command installs the [hk](https://hk.jdx.dev) git hooks, which lint
and format staged files on commit. Node dependencies install automatically
before any `mise run` task when `package.json` or `package-lock.json` change.

| Task                    | Description                                         |
| ----------------------- | --------------------------------------------------- |
| `mise run test`         | Runs the unit tests with coverage                   |
| `mise run typecheck`    | Type checks the action source                       |
| `mise run package`      | Bundles the action into `dist/`                     |
| `mise run check-dist`   | Checks `dist/` is a fresh build of `src/`           |
| `mise run local-action` | Runs the action locally with inputs from `.env`     |
| `mise run check`        | Lints changed files (`check-all` for every file)    |
| `mise run fix`          | Fixes changed files (`fix-all` for every file)      |
| `mise run all`          | Fixes, type checks and tests everything             |
| `mise run ci`           | Runs the same checks as CI                          |

`dist/index.js` is what GitHub runs, and on `main` it is always the latest
release's build. Don't commit `dist/`: the release PR rebuilds and commits it,
and CI fails if any other PR changes it.

For `local-action`, copy [`.env.example`](./.env.example) to `.env` and set the
inputs there.

Tool configuration lives in [`.config/`](./.config), except for files that
their tools or editors only look for at the root: `tsconfig.json`,
`tsdown.config.ts`, `.oxlintrc.json` and `.oxfmtrc.json`.

## Releasing

Releases are made with [release-please](https://github.com/googleapis/release-please)
from [conventional commits](https://www.conventionalcommits.org).
Every push to `main` updates a release PR with the next version and changelog,
and the release workflow commits a fresh build of `dist/` to it.
Merging the release PR tags the release, as in `v0.2.0`.

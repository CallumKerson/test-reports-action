# Test Reports Action

![CI](https://github.com/CallumKerson/test-reports-action/actions/workflows/ci.yaml/badge.svg)
![Check dist/](https://github.com/CallumKerson/test-reports-action/actions/workflows/check-dist.yaml/badge.svg)
![Coverage](./badges/coverage.svg)

An opinionated test reporter for GitHub Actions.

## Usage

```yaml
steps:
  - uses: CallumKerson/test-reports-action@v1
    with:
      milliseconds: 1000
```

See [`action.yaml`](./action.yaml) for the inputs and outputs.

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
| `mise run local-action` | Runs the action locally with inputs from `.env`     |
| `mise run check`        | Lints changed files (`check-all` for every file)    |
| `mise run fix`          | Fixes changed files (`fix-all` for every file)      |
| `mise run all`          | Fixes, tests and bundles everything, ready to commit |
| `mise run ci`           | Runs the same checks as CI                          |

`dist/index.js` is what GitHub runs, so run `mise run package` and commit
`dist/` with any change to `src/`. CI fails if it is out of date.

For `local-action`, copy [`.env.example`](./.env.example) to `.env` and set the
inputs there.

Tool configuration lives in [`.config/`](./.config), except for files that
their tools or editors only look for at the root: `tsconfig.json`,
`tsdown.config.ts`, `.oxlintrc.json` and `.oxfmtrc.json`.

## Releasing

[`script/release`](./script/release) tags a new release and moves the major
version tag (e.g. `v1`) to it.

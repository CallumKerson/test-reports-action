#!/usr/bin/env bash
# Fails unless commit $SHA has a commit status named $CONTEXT.
# Needs GH_TOKEN, GITHUB_REPOSITORY, SHA and CONTEXT.

set -euo pipefail

gh api --paginate "repos/$GITHUB_REPOSITORY/commits/$SHA/statuses" --jq '.[].context' |
	grep -Fqx "$CONTEXT" || {
	echo "::error::No commit status named '$CONTEXT'"
	exit 1
}

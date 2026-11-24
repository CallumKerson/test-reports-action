#!/usr/bin/env bash
# Fails unless commit $SHA has a commit status named $CONTEXT.
# Needs GH_TOKEN, GITHUB_REPOSITORY, SHA and CONTEXT.
#
# Tries for up to 20 seconds: GitHub can list a commit's statuses without one
# created a second earlier, which once failed this check on a status that
# the action had set.

set -euo pipefail

for _ in 1 2 3 4 5 6 7 8 9 10; do
	if gh api --paginate "repos/$GITHUB_REPOSITORY/commits/$SHA/statuses" --jq '.[].context' |
		grep -Fqx "$CONTEXT"; then
		exit 0
	fi
	sleep 2
done
echo "::error::No commit status named '$CONTEXT'"
exit 1

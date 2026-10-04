#!/usr/bin/env bash
# Writes a passing JUnit report for the matrix-names job to report on.

set -euo pipefail

mkdir -p reports
echo '<testsuite name="matrix"><testcase name="passes"/></testsuite>' >reports/matrix.junit.xml

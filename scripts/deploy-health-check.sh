#!/usr/bin/env bash
#
# Post-deploy health gate.
#
# `kubectl rollout status` only proves the pods reached Ready. That is a
# statement about a process, not about the platform: a bad environment
# variable, a migration that half-applied, or an upstream the new build cannot
# reach all produce perfectly healthy pods serving errors.
#
# So this checks three different things, and its exit code is what decides
# whether cd-production rolls the release back:
#
#   /health/live   — the process is up (what rollout status already knew)
#   /health/ready  — its DEPENDENCIES are up; the one that catches a database
#                    or Redis the new build cannot reach
#   a real read    — the request path end to end, through the gateway's auth,
#                    rate limiting and proxy, into a service
#
# Retried rather than checked once, because pods pass readiness before caches
# are warm and before every replica has rotated. A single immediate curl tests
# timing as much as health.
#
# Lives here rather than inline in the workflow so it can be tested — see
# scripts/__tests__/deploy-rollback.test.sh. Shell embedded in YAML cannot be,
# and this is the path you least want to discover is broken during an incident.
#
# Usage:   ./scripts/deploy-health-check.sh [base-url]
# Env:     HEALTH_ATTEMPTS (default 10), HEALTH_SLEEP_SECONDS (default 15)
# Exit:    0 all three healthy; 1 any of them never became healthy.

set -uo pipefail

BASE="${1:-${HEALTH_BASE_URL:-https://api.muni.ug}}"
ATTEMPTS="${HEALTH_ATTEMPTS:-10}"
SLEEP_SECONDS="${HEALTH_SLEEP_SECONDS:-15}"

check() {
  local label="$1" url="$2" i
  for i in $(seq 1 "$ATTEMPTS"); do
    if curl -fsS --max-time 10 "$url" > /dev/null 2>&1; then
      echo "✅ ${label}"
      return 0
    fi
    if [ "$i" -lt "$ATTEMPTS" ]; then
      echo "  ${label} attempt ${i}/${ATTEMPTS} failed; retrying in ${SLEEP_SECONDS}s"
      sleep "$SLEEP_SECONDS"
    fi
  done
  echo "::error::${label} never became healthy after $((ATTEMPTS * SLEEP_SECONDS))s"
  return 1
}

check "liveness"       "${BASE}/health/live"            || exit 1
check "readiness"      "${BASE}/health/ready"           || exit 1
check "catalogue read" "${BASE}/api/v1/products?limit=1" || exit 1

echo "All post-deploy health checks passed."

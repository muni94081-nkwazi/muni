#!/usr/bin/env bash
#
# Roll every service back to its previous revision.
#
# Called by cd-production when EITHER the rollout or the post-deploy health gate
# failed. Rollback used to live inside the rollout step, so it covered only the
# first of those: a deploy whose pods came up healthy and whose smoke test then
# failed was left running in production while the job went red.
#
# EVERY service is rolled back, not just the failing one. `rollout undo` is a
# no-op on a Deployment that was never updated, so this is safe — and it is the
# right call regardless, because a partially-rolled-back fleet is a version-skew
# problem stacked on top of an outage.
#
# Deliberately does NOT stop at the first failure. A service that will not undo
# is exactly the one a human needs named, and abandoning the loop there would
# leave the remaining services on the broken release too.
#
# NOTE: database migrations are NOT rolled back. Prisma migrations are
# forward-only, so rolling the application back while the schema stays migrated
# forward is safe only if the migration was backward-compatible. See the
# expand/contract note in docs/DEPLOYMENT.md.
#
# Lives here rather than inline in the workflow so it can be tested — see
# scripts/__tests__/deploy-rollback.test.sh.
#
# Usage:   ./scripts/deploy-rollback.sh "svc-a svc-b svc-c"
# Env:     K8S_NAMESPACE (default muni-prod), ROLLBACK_TIMEOUT (default 300s)
# Exit:    0 every service came back; 1 at least one needs manual attention.

set -uo pipefail

SERVICES="${1:-${ROLLBACK_SERVICES:-}}"
NAMESPACE="${K8S_NAMESPACE:-muni-prod}"
TIMEOUT="${ROLLBACK_TIMEOUT:-300s}"

if [ -z "$SERVICES" ]; then
  # The rollout step never published its service list, which means it failed
  # before touching anything. Nothing to undo.
  echo "::warning::No service list supplied; rolling back nothing."
  exit 0
fi

echo "::warning::Deploy failed — rolling back all services to the previous revision"

undo_failures=0
for service in $SERVICES; do
  if ! kubectl rollout undo "deployment/${service}" -n "$NAMESPACE"; then
    echo "::warning::rollout undo failed for ${service}"
    undo_failures=$((undo_failures + 1))
  fi
done

unstable=0
for service in $SERVICES; do
  if ! kubectl rollout status "deployment/${service}" -n "$NAMESPACE" --timeout="$TIMEOUT"; then
    echo "::error::${service} did not stabilise after rollback — needs manual attention"
    unstable=$((unstable + 1))
  fi
done

if [ "$undo_failures" -eq 0 ] && [ "$unstable" -eq 0 ]; then
  echo "Rollback complete — every service is back on its previous revision."
  exit 0
fi

echo "Rollback finished with ${undo_failures} undo failure(s) and ${unstable} unstable service(s)."
echo "See docs/DEPLOYMENT.md for the manual procedure."
exit 1

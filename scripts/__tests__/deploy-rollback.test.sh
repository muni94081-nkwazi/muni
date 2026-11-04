#!/usr/bin/env bash
#
# Tests for scripts/deploy-health-check.sh and scripts/deploy-rollback.sh.
#
# This is the "simulate a failed deploy and verify auto-rollback triggers" test.
# It cannot use a real cluster — CI has none and neither does a laptop — so it
# stubs `curl` and `kubectl` and drives the real scripts, asserting on the exit
# codes the workflow branches on and the kubectl commands that would have been
# issued.
#
# What that does and does not prove: it proves the retry loop, the three-check
# sequence, the rollback loop, and the "keep going and name the casualty"
# behaviour are all correct. It does not prove GitHub Actions wires `if:
# failure()` the way we expect, or that the cluster accepts the commands. Those
# need a real deploy; the drill in docs/DEPLOYMENT.md is where that happens.
#
# Usage:  bash scripts/__tests__/deploy-rollback.test.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HEALTH_SH="${SCRIPT_DIR}/deploy-health-check.sh"
ROLLBACK_SH="${SCRIPT_DIR}/deploy-rollback.sh"

pass=0
fail=0
ok()   { pass=$((pass + 1)); echo "  ok   — $1"; }
bad()  { fail=$((fail + 1)); echo "  FAIL — $1"; }
check(){ if [ "$1" = "$2" ]; then ok "$3"; else bad "$3 (expected '$2', got '$1')"; fi; }

STUB_ROOT="$(mktemp -d)"
STUB_BIN="${STUB_ROOT}/bin"
STUB_STATE="${STUB_ROOT}/state"
mkdir -p "$STUB_BIN" "$STUB_STATE"

# `curl` fails for any URL listed in $STUB_STATE/curl_fail, and succeeds after
# $STUB_STATE/flaky_<n> attempts when the URL is listed in curl_flaky.
cat > "${STUB_BIN}/curl" <<'STUB'
#!/usr/bin/env bash
url="${@: -1}"
echo "$url" >> "${STUB_STATE}/curl_calls"

if [ -f "${STUB_STATE}/curl_fail" ] && grep -qF "$url" "${STUB_STATE}/curl_fail"; then
  exit 22
fi
if [ -f "${STUB_STATE}/curl_flaky" ] && grep -qF "$url" "${STUB_STATE}/curl_flaky"; then
  n=$(grep -cF "$url" "${STUB_STATE}/curl_calls")
  [ "$n" -lt 3 ] && exit 22
fi
echo "ok"
exit 0
STUB

# `kubectl` records every invocation; specific subcommands can be made to fail.
cat > "${STUB_BIN}/kubectl" <<'STUB'
#!/usr/bin/env bash
echo "$*" >> "${STUB_STATE}/kubectl_calls"
svc=""
for a in "$@"; do case "$a" in deployment/*) svc="${a#deployment/}";; esac; done

case "$2" in
  undo)   [ -f "${STUB_STATE}/undo_fail_${svc}" ]   && exit 1 ;;
  status) [ -f "${STUB_STATE}/status_fail_${svc}" ] && exit 1 ;;
esac
exit 0
STUB

chmod +x "${STUB_BIN}"/*
export PATH="${STUB_BIN}:${PATH}"
export STUB_STATE

reset() { rm -f "${STUB_STATE}"/*; }

# Keep the retry waits short — the loop's correctness is what is under test,
# not the wall-clock delay.
export HEALTH_ATTEMPTS=3
export HEALTH_SLEEP_SECONDS=1

BASE="https://api.muni.test"

# ═══════════════════════════════════════════════════════════════════════════════
echo
echo "deploy-health-check.sh"
echo "─────────────────────────────────────────────────────────────────────────"

reset
bash "$HEALTH_SH" "$BASE" > /dev/null 2>&1
check "$?" "0" "exits 0 when all three checks pass"
check "$(grep -c 'health/live'  "${STUB_STATE}/curl_calls")" "1" "checks liveness"
check "$(grep -c 'health/ready' "${STUB_STATE}/curl_calls")" "1" "checks readiness"
check "$(grep -c 'products'     "${STUB_STATE}/curl_calls")" "1" "makes a real catalogue read"

# The failure this whole gate exists for: pods Ready, dependencies not.
reset
echo "${BASE}/health/ready" > "${STUB_STATE}/curl_fail"
bash "$HEALTH_SH" "$BASE" > /dev/null 2>&1
check "$?" "1" "FAILS when readiness never comes up — pods Ready is not enough"
# `grep -c` prints 0 AND exits 1 on no match, so a `|| echo 0` fallback would
# append a second zero and make this assertion compare "0\n0".
check "$(grep -c 'products' "${STUB_STATE}/curl_calls")" "0" \
  "stops at the first failing check rather than carrying on"

reset
echo "${BASE}/health/live" > "${STUB_STATE}/curl_fail"
bash "$HEALTH_SH" "$BASE" > /dev/null 2>&1
check "$?" "1" "fails when liveness never comes up"

# A healthy process serving a broken request path — the case rollout status and
# a liveness probe both miss.
reset
echo "${BASE}/api/v1/products?limit=1" > "${STUB_STATE}/curl_fail"
bash "$HEALTH_SH" "$BASE" > /dev/null 2>&1
check "$?" "1" "fails when the request path is broken even though health is up"

reset
echo "${BASE}/health/live" > "${STUB_STATE}/curl_fail"
bash "$HEALTH_SH" "$BASE" > /dev/null 2>&1
check "$(grep -c 'health/live' "${STUB_STATE}/curl_calls")" "3" \
  "retries the configured number of times before giving up"

# Pods pass readiness before caches are warm; a single immediate curl would
# report a healthy deploy as broken and trigger a needless rollback.
reset
echo "${BASE}/health/live" > "${STUB_STATE}/curl_flaky"
bash "$HEALTH_SH" "$BASE" > /dev/null 2>&1
check "$?" "0" "TOLERATES a slow start — succeeds once the service settles"

# ═══════════════════════════════════════════════════════════════════════════════
echo
echo "deploy-rollback.sh"
echo "─────────────────────────────────────────────────────────────────────────"

SERVICES="api-gateway auth-service product-service"

reset
bash "$ROLLBACK_SH" "$SERVICES" > /dev/null 2>&1
check "$?" "0" "exits 0 when every service rolls back"
check "$(grep -c 'rollout undo' "${STUB_STATE}/kubectl_calls")" "3" \
  "undoes EVERY service, not just the failing one"
check "$(grep -c 'rollout status' "${STUB_STATE}/kubectl_calls")" "3" \
  "waits for each service to stabilise afterwards"
grep -q -- '-n muni-prod' "${STUB_STATE}/kubectl_calls" \
  && ok "targets the production namespace" || bad "targets the production namespace"

# The undo loop must not abandon the remaining services because one failed —
# that would leave them on the broken release.
reset
touch "${STUB_STATE}/undo_fail_auth-service"
bash "$ROLLBACK_SH" "$SERVICES" > "${STUB_ROOT}/rb.log" 2>&1
check "$?" "1" "exits non-zero when a service will not undo"
check "$(grep -c 'rollout undo' "${STUB_STATE}/kubectl_calls")" "3" \
  "and still attempts every OTHER service"
grep -q "auth-service" "${STUB_ROOT}/rb.log" \
  && ok "names the service that needs a human" || bad "names the service that needs a human"

reset
touch "${STUB_STATE}/status_fail_product-service"
bash "$ROLLBACK_SH" "$SERVICES" > "${STUB_ROOT}/rb2.log" 2>&1
check "$?" "1" "exits non-zero when a rolled-back service does not stabilise"
grep -q "::error::product-service did not stabilise" "${STUB_ROOT}/rb2.log" \
  && ok "flags the unstable service as an error, not a warning" \
  || bad "flags the unstable service as an error, not a warning"

# The rollout step failed before touching anything, so its output is empty.
reset
bash "$ROLLBACK_SH" "" > "${STUB_ROOT}/rb3.log" 2>&1
check "$?" "0" "exits 0 — and rolls nothing back — when no service list was published"
check "$([ -f "${STUB_STATE}/kubectl_calls" ] && echo called || echo none)" "none" \
  "issues no kubectl commands at all in that case"

reset
K8S_NAMESPACE=muni-staging bash "$ROLLBACK_SH" "api-gateway" > /dev/null 2>&1
grep -q -- '-n muni-staging' "${STUB_STATE}/kubectl_calls" \
  && ok "honours an overridden namespace" || bad "honours an overridden namespace"

# ═══════════════════════════════════════════════════════════════════════════════
echo
echo "the two together — a simulated failed deploy"
echo "─────────────────────────────────────────────────────────────────────────"

# Exactly the scenario the rollback was moved out of the rollout step to cover:
# the pods came up Ready, so `kubectl rollout status` succeeded, and the health
# gate is the only thing that notices the release is broken.
reset
echo "${BASE}/health/ready" > "${STUB_STATE}/curl_fail"

bash "$HEALTH_SH" "$BASE" > /dev/null 2>&1
health_rc=$?
check "$health_rc" "1" "health gate fails on a deploy whose pods are Ready but broken"

if [ "$health_rc" -ne 0 ]; then
  bash "$ROLLBACK_SH" "$SERVICES" > /dev/null 2>&1
  check "$?" "0" "rollback runs on that failure and completes"
  check "$(grep -c 'rollout undo' "${STUB_STATE}/kubectl_calls")" "3" \
    "and every service is returned to its previous revision"
else
  bad "rollback would not have been triggered"
fi

# ═══════════════════════════════════════════════════════════════════════════════
rm -rf "$STUB_ROOT"
echo
echo "─────────────────────────────────────────────────────────────────────────"
echo "  ${pass} passed, ${fail} failed"
[ "$fail" -eq 0 ] || exit 1

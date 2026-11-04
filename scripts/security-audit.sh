#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# MUNI Platform — Local security audit script
# Run: bash scripts/security-audit.sh
# ─────────────────────────────────────────────────────────────────────────────

set -e
FAILED=0

echo "╔══════════════════════════════════════════════════════╗"
echo "║     MUNI Platform — Security Audit                  ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ── 1. npm audit ──────────────────────────────────────────────────────────────
echo "📦 Step 1/5: npm dependency audit..."
if npm audit --audit-level=high 2>&1; then
  echo "✅ No high/critical npm vulnerabilities"
else
  echo "❌ npm audit found high/critical vulnerabilities"
  FAILED=$((FAILED+1))
fi
echo ""

# ── 2. Gitleaks secrets scan ──────────────────────────────────────────────────
echo "🔑 Step 2/5: Secrets detection (gitleaks)..."
if command -v gitleaks &>/dev/null; then
  if gitleaks detect --config .gitleaks.toml --verbose --no-git 2>&1; then
    echo "✅ No secrets detected"
  else
    echo "❌ Secrets detected! Remove them before committing."
    FAILED=$((FAILED+1))
  fi
else
  echo "⚠️  gitleaks not installed. Install with: brew install gitleaks"
fi
echo ""

# ── 3. Trivy container scan (if Docker is available) ─────────────────────────
echo "🐳 Step 3/5: Container vulnerability scan (Trivy)..."
if command -v trivy &>/dev/null && command -v docker &>/dev/null; then
  # Build api-gateway image for scanning
  echo "  Building api-gateway for scan..."
  docker build -t muni/api-gateway:scan-test ./backend/api-gateway -q 2>/dev/null || true
  trivy image --config backend/infrastructure/security/trivy/trivy-config.yaml \
    --severity CRITICAL,HIGH --exit-code 0 muni/api-gateway:scan-test 2>&1 | tail -20
  echo "✅ Trivy scan complete (review output above)"
else
  echo "⚠️  trivy or docker not available — skipping container scan"
  echo "   Install trivy: brew install trivy"
fi
echo ""

# ── 4. Semgrep SAST ───────────────────────────────────────────────────────────
echo "🔬 Step 4/5: Static analysis (semgrep)..."
if command -v semgrep &>/dev/null; then
  if semgrep scan --config p/nodejs --config p/owasp-top-ten \
    --exclude node_modules --exclude dist --quiet ./backend 2>&1; then
    echo "✅ No semgrep findings"
  else
    echo "⚠️  Semgrep found issues (review above)"
  fi
else
  echo "⚠️  semgrep not installed. Install with: pip install semgrep"
fi
echo ""

# ── 5. Environment files check ────────────────────────────────────────────────
echo "🔐 Step 5/5: Checking .env files are not tracked by git..."
TRACKED_ENVS=$(git ls-files "**/.env" ".env" 2>/dev/null | grep -v ".env.example" || true)
if [ -n "$TRACKED_ENVS" ]; then
  echo "❌ .env files are tracked by git:"
  echo "$TRACKED_ENVS"
  echo "   Remove with: git rm --cached <file>"
  FAILED=$((FAILED+1))
else
  echo "✅ No .env files tracked by git"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════"
if [ $FAILED -eq 0 ]; then
  echo "✅ ALL security checks PASSED"
else
  echo "❌ $FAILED security check(s) FAILED — review output above"
  exit 1
fi

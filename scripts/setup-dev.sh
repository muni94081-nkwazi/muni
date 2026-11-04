#!/usr/bin/env bash
#
# One-shot bootstrap for a fresh clone: create .env and fill in the secrets that
# services refuse to start without.
#
# Safe to re-run. It never overwrites a value that is already set to something
# real — only the placeholders shipped in .env.example — so running it again
# after adding payment credentials by hand will not clobber them.
#
#   npm run setup
#
set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE=".env"
EXAMPLE_FILE=".env.example"

# The secrets with a startup check behind them. Each is 32 bytes of hex:
#   INTERNAL_IDENTITY_SECRET  gateway exits without it (api-gateway/gateway.ts)
#   JWT_ACCESS_SECRET         shared/utils/token.ts throws in production
#   JWT_REFRESH_SECRET        likewise
#   PII_ENCRYPTION_KEY        shared/security/encryption.ts throws in production
SECRET_KEYS=(
  INTERNAL_IDENTITY_SECRET
  JWT_ACCESS_SECRET
  JWT_REFRESH_SECRET
  PII_ENCRYPTION_KEY
)

# Values shipped in .env.example as reminders rather than usable secrets. A
# variable holding one of these is treated as unset.
is_placeholder() {
  case "$1" in
    ''|*change-me*|*CHANGE_ME*|*your-*|*xxx*) return 0 ;;
    *) return 1 ;;
  esac
}

gen_secret() {
  # openssl is the documented path and is present nearly everywhere. Node is a
  # hard dependency of this repo anyway, so it is the fallback rather than a
  # reason to fail — a Windows shell without openssl on PATH is common.
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
  fi
}

# ── 1. Create .env ────────────────────────────────────────────────────────────
if [ ! -f "$ENV_FILE" ]; then
  if [ ! -f "$EXAMPLE_FILE" ]; then
    echo "✗ $EXAMPLE_FILE not found — are you in the repository root?" >&2
    exit 1
  fi
  cp "$EXAMPLE_FILE" "$ENV_FILE"
  echo "→ created $ENV_FILE from $EXAMPLE_FILE"
else
  echo "→ $ENV_FILE already exists — filling in missing secrets only"
fi

# ── 2. Fill in each secret ────────────────────────────────────────────────────
generated=0
kept=0

for key in "${SECRET_KEYS[@]}"; do
  # Read the current value: last assignment wins, matching how a .env is parsed.
  current="$(sed -n "s/^${key}=//p" "$ENV_FILE" | tail -n 1)"

  if ! is_placeholder "$current"; then
    echo "  · ${key} already set — left alone"
    kept=$((kept + 1))
    continue
  fi

  value="$(gen_secret)"

  if grep -q "^${key}=" "$ENV_FILE"; then
    # In-place rewrite via a temp file: `sed -i` differs between GNU and BSD,
    # and the replacement is hex only, so no delimiter escaping is needed.
    tmp="$(mktemp)"
    sed "s|^${key}=.*|${key}=${value}|" "$ENV_FILE" > "$tmp"
    mv "$tmp" "$ENV_FILE"
  else
    printf '\n%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi

  echo "  ✓ ${key} generated"
  generated=$((generated + 1))
done

# ── 3. Per-service .env files ─────────────────────────────────────────────────
#
# Services read the root .env under compose, but running one directly
# (npm run dev inside its directory) needs its own. Only created when absent,
# so local edits survive a re-run.
#
# Dependencies are deliberately NOT installed here: this is an npm workspace,
# so a single `npm install` at the root wires up every service. The per-service
# install loop this script used to run both duplicated that and defeated
# hoisting — which the root package.json depends on for the express 4 types.
# The glob used to be backend/services/*/.env.example, which silently excluded
# backend/api-gateway — the one component that EXITS without a secret rather
# than degrading. Running it directly then failed with
# "INTERNAL_IDENTITY_SECRET is required", even though the root .env had one,
# because dotenv resolves .env against the process's working directory and the
# gateway's directory had none.
copied=0
for example in backend/services/*/.env.example backend/api-gateway/.env.example; do
  [ -e "$example" ] || continue
  target="${example%.example}"
  if [ ! -f "$target" ]; then
    cp "$example" "$target"
    copied=$((copied + 1))
  fi
done
echo "→ ${copied} per-component .env file(s) created"

# ── 3b. Share the generated secrets with those files ──────────────────────────
#
# The secrets above are generated ONCE into the root .env. They have to be
# byte-identical everywhere: INTERNAL_IDENTITY_SECRET signs the assertions the
# gateway mints and order-, payment- and inventory-service verify, so a
# component holding a different value rejects every call from the others.
#
# Copying the .env.example verbatim would have given each component the shipped
# placeholder instead — long enough to pass the gateway's length check, and
# different from the root one, which is worse than missing: the gateway would
# start and then every signed call would fail verification.
#
# So the real values are read back out of the root .env and written into each
# component file that lacks them. Nothing is invented here; if the root .env has
# no value for a key, none is written.
synced=0
for target in backend/services/*/.env backend/api-gateway/.env; do
  [ -f "$target" ] || continue
  for key in "${SECRET_KEYS[@]}"; do
    value="$(grep -E "^${key}=" "$ENV_FILE" | tail -n 1 | cut -d= -f2-)"
    [ -n "$value" ] || continue
    if grep -qE "^${key}=" "$target"; then
      # Replace whatever is there — a placeholder, or a stale value from an
      # earlier generation — with the root's current one.
      grep -vE "^${key}=" "$target" > "${target}.tmp"
      printf '%s=%s
' "$key" "$value" >> "${target}.tmp"
      mv "${target}.tmp" "$target"
    else
      printf '%s=%s
' "$key" "$value" >> "$target"
    fi
    synced=$((synced + 1))
  done
done
echo "→ ${synced} shared secret(s) propagated from ${ENV_FILE}"

# ── 4. Report ─────────────────────────────────────────────────────────────────
echo
echo "✅ .env ready — ${generated} secret(s) generated, ${kept} kept"
echo "   Next:  npm install  &&  npm run docker:up"
echo
echo "   .env is gitignored. Never commit it, and note that changing"
echo "   PII_ENCRYPTION_KEY later makes already-encrypted rows unreadable."

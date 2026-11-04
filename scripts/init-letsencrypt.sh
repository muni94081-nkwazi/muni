#!/usr/bin/env bash
#
# One-time TLS bootstrap for a production MUNI deployment.
#
# Solves the chicken-and-egg between nginx and Let's Encrypt: nginx.ssl.conf
# refuses to start without a certificate, but obtaining a certificate over
# http-01 requires nginx to already be serving /.well-known/acme-challenge/.
# So this runs in three phases:
#
#   1. bring the stack up on the plain-HTTP config (serves the challenge)
#   2. run certbot to issue the certificate
#   3. switch .env to the TLS config and recreate nginx
#
# Safe to re-run: certbot will not reissue a still-valid certificate unless
# --force is passed through.
#
# Usage:
#   ./scripts/init-letsencrypt.sh                 # issue real certificate
#   ./scripts/init-letsencrypt.sh --staging       # dry run against LE staging
#
# Let's Encrypt rate-limits failed issuance for a domain hard (5 failures per
# hour). Use --staging first if DNS or firewall setup is at all uncertain; it
# produces an untrusted cert but exercises the whole path.

set -euo pipefail

cd "$(dirname "$0")/.."

STAGING_ARG=""
if [[ "${1:-}" == "--staging" ]]; then
  STAGING_ARG="--staging"
  echo "→ Using Let's Encrypt STAGING. The resulting certificate is NOT trusted by browsers."
fi

if [[ ! -f .env ]]; then
  echo "ERROR: .env not found. Run: cp .env.example .env" >&2
  exit 1
fi

# shellcheck disable=SC1091
set -a; source .env; set +a

DOMAIN="${DOMAIN:-muni.ug}"
EMAIL="${CERTBOT_EMAIL:-}"

if [[ -z "$EMAIL" ]]; then
  echo "ERROR: CERTBOT_EMAIL is not set in .env." >&2
  echo "       Let's Encrypt uses it for expiry warnings — set it before continuing." >&2
  exit 1
fi

echo
echo "Domain : $DOMAIN (and www.$DOMAIN)"
echo "Contact: $EMAIL"
echo
echo "Before continuing, confirm BOTH of these — issuance fails otherwise:"
echo "  • DNS A/AAAA records for $DOMAIN and www.$DOMAIN point at this host"
echo "  • Ports 80 and 443 are reachable from the public internet"
echo
read -r -p "Continue? [y/N] " reply
[[ "$reply" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 1; }

# ── Phase 1: stack up on plain HTTP so the challenge path is served ──────────
# NGINX_CONF is forced for this phase regardless of what .env says, because a
# re-run on an already-TLS deployment would otherwise fail if the cert expired.
echo
echo "→ [1/3] Starting stack on plain HTTP to serve the ACME challenge…"
NGINX_CONF=nginx.conf docker compose --profile services up -d --build

echo "→ Waiting for the edge to answer on :80…"
for _ in $(seq 1 30); do
  if docker compose exec -T nginx wget -q --spider http://localhost/ 2>/dev/null; then
    echo "  edge is up."
    break
  fi
  sleep 2
done

# ── Phase 2: issue the certificate ───────────────────────────────────────────
echo
echo "→ [2/3] Requesting certificate…"
docker compose --profile certbot run --rm certbot \
  certonly --webroot -w /var/www/certbot \
  -d "$DOMAIN" -d "www.$DOMAIN" \
  --email "$EMAIL" \
  --agree-tos --no-eff-email --non-interactive \
  $STAGING_ARG

# ── Phase 3: switch to TLS ───────────────────────────────────────────────────
# Rewrites two keys in .env in place. Both are additive if absent.
echo
echo "→ [3/3] Switching .env to the TLS config…"
set_env() {
  local key="$1" value="$2"
  if grep -qE "^${key}=" .env; then
    sed -i.bak -E "s|^${key}=.*|${key}=${value}|" .env && rm -f .env.bak
    echo "  updated ${key}=${value}"
  else
    printf '\n%s=%s\n' "$key" "$value" >> .env
    echo "  added   ${key}=${value}"
  fi
}
set_env NGINX_CONF nginx.ssl.conf
set_env COOKIE_SECURE true

echo "→ Recreating nginx with TLS…"
docker compose --profile services up -d nginx

echo
echo "Done. https://$DOMAIN should now be serving."
echo
echo "Renewal is not automatic — schedule it, e.g. a weekly cron entry:"
echo "  0 3 * * 1  cd $(pwd) && npm run tls:renew"

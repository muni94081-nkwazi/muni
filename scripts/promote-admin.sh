#!/usr/bin/env bash
#
# Grant ROLE_ADMIN to an already-registered user.
#
# There is deliberately no API for this — auth-service exposes no endpoint that
# adds ROLE_ADMIN, and no migration or seed creates an admin account. The only
# way to get the first admin is here, at the database. (ROLE_SELLER is
# different: users apply via POST /sellers/register and an existing admin
# approves through PUT /admin/sellers/:id/verify, which sets the role.)
#
# Register the account through the normal signup flow first, then run this.
#
# Note the login that follows will require TOTP enrollment: ROLE_ADMIN is in
# MFA_REQUIRED_ROLES, so auth-service returns MFA_ENROLLMENT_REQUIRED and
# issues no tokens until an authenticator is enrolled.
#
# Usage: ./scripts/promote-admin.sh someone@muni.ug

set -euo pipefail

EMAIL="${1:-}"
if [[ -z "$EMAIL" ]]; then
  echo "Usage: $0 <email>" >&2
  exit 1
fi

PGUSER="${PGUSER:-muni}"

if ! docker ps --format '{{.Names}}' | grep -q '^muni-postgres$'; then
  echo "ERROR: muni-postgres is not running." >&2
  exit 1
fi

# array_append only if not already present, so re-running is harmless.
docker exec muni-postgres psql -U "$PGUSER" -d muni_auth -v ON_ERROR_STOP=1 -c "
  UPDATE \"User\"
     SET roles = array_append(roles, 'ROLE_ADMIN')
   WHERE email = '$EMAIL'
     AND NOT ('ROLE_ADMIN' = ANY(roles));
"

echo "── Current roles ───────────────────────────────────────────────────"
docker exec muni-postgres psql -U "$PGUSER" -d muni_auth -c \
  "SELECT email, roles FROM \"User\" WHERE email = '$EMAIL';"

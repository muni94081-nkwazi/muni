#!/usr/bin/env bash
#
# MUNI — PostgreSQL restore.
#
# The other half of scripts/backup-postgres.sh. A backup nobody has restored is
# a hypothesis, not a backup, so this exists to be run — both in a real incident
# and as the periodic drill described in docs/DISASTER_RECOVERY.md.
#
# Usage:
#   ./scripts/restore-postgres.sh <backup-dir> [database ...]
#
#   <backup-dir>   a timestamped directory produced by backup-postgres.sh
#   [database]     optional; restore only these databases. Omit for all of them.
#
# Examples:
#   ./scripts/restore-postgres.sh /backups/20260905T120000Z
#   ./scripts/restore-postgres.sh /backups/20260905T120000Z muni_auth
#
# This DROPS AND RECREATES each database it restores. It refuses to run against
# anything that does not look like a recovery target unless CONFIRM_RESTORE=yes
# is set, because the realistic way to lose production is a restore aimed at it
# by mistake during an incident.

set -uo pipefail

BACKUP_PATH="${1:-}"
shift || true
REQUESTED_DBS="$*"

PGHOST="${PGHOST:-postgres}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-muni}"
export PGHOST PGPORT PGUSER

log() { echo "[restore $(date -u +%H:%M:%S)] $*"; }
die() { log "ERROR: $*"; exit 1; }

[ -n "$BACKUP_PATH" ] || die "usage: $0 <backup-dir> [database ...]"
[ -d "$BACKUP_PATH" ] || die "no such backup directory: $BACKUP_PATH"

# ─── Refuse an incomplete backup ──────────────────────────────────────────────
# backup-postgres.sh writes MANIFEST last and only when every database dumped
# cleanly. Its absence means the backup is partial — restoring from it would
# quietly bring back a subset of the platform's state.
[ -f "${BACKUP_PATH}/MANIFEST" ] || die \
  "${BACKUP_PATH} has no MANIFEST — it is a failed or partial backup. Pick another."

log "restoring from $(grep '^backup_utc=' "${BACKUP_PATH}/MANIFEST" | cut -d= -f2)"

# ─── Guard against restoring onto production by accident ──────────────────────
if [ "${CONFIRM_RESTORE:-}" != "yes" ]; then
  cat <<WARNING
This will DROP AND RECREATE databases on:

    host: ${PGHOST}:${PGPORT}
    user: ${PGUSER}

Every row currently in those databases will be gone.

If that is what you intend, re-run with:

    CONFIRM_RESTORE=yes $0 ${BACKUP_PATH} ${REQUESTED_DBS}

WARNING
  exit 1
fi

for attempt in $(seq 1 30); do
  pg_isready -q && break
  [ "$attempt" -eq 30 ] && die "Postgres unreachable at ${PGHOST}:${PGPORT} after 60s"
  sleep 2
done

# ─── Roles and grants first ───────────────────────────────────────────────────
# Databases are owned by roles; restoring a database before the role it belongs
# to exists produces a pile of permission errors.
if [ -f "${BACKUP_PATH}/globals.sql" ]; then
  log "restoring globals (roles, grants)"
  # Not fatal: on a cluster where the roles already exist, every CREATE ROLE
  # reports "already exists" and that is fine.
  psql -d postgres -v ON_ERROR_STOP=0 -q -f "${BACKUP_PATH}/globals.sql" > /dev/null 2>&1 || \
    log "  globals reported errors (usually pre-existing roles) — continuing"
fi

# ─── Databases ────────────────────────────────────────────────────────────────
if [ -n "$REQUESTED_DBS" ]; then
  dumps=""
  for db in $REQUESTED_DBS; do
    [ -f "${BACKUP_PATH}/${db}.dump" ] || die "${db} is not in this backup"
    dumps="${dumps} ${BACKUP_PATH}/${db}.dump"
  done
else
  dumps="$(find "$BACKUP_PATH" -maxdepth 1 -name '*.dump' | sort)"
fi

[ -n "$dumps" ] || die "no .dump files found in ${BACKUP_PATH}"

failures=0
for dump in $dumps; do
  db="$(basename "$dump" .dump)"
  log "restoring ${db}"

  # Terminate open connections first — DROP DATABASE fails while any session is
  # attached, and during an incident there is always something reconnecting.
  psql -d postgres -q -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${db}' AND pid <> pg_backend_pid();" \
    > /dev/null 2>&1 || true

  psql -d postgres -q -c "DROP DATABASE IF EXISTS \"${db}\";" || {
    log "  ERROR: could not drop ${db}"; failures=$((failures + 1)); continue;
  }
  psql -d postgres -q -c "CREATE DATABASE \"${db}\" WITH OWNER = \"${PGUSER}\" ENCODING = 'UTF8' TEMPLATE = template0;" || {
    log "  ERROR: could not create ${db}"; failures=$((failures + 1)); continue;
  }

  # --no-owner/--no-acl match how the dump was taken, so a restore into a
  # differently-named role (a staging cluster, a scratch database) works.
  if pg_restore --no-owner --no-acl --exit-on-error -d "$db" "$dump"; then
    count="$(psql -tAd "$db" -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';")"
    log "  ${db} restored (${count} tables)"
  else
    log "  ERROR: pg_restore failed for ${db}"
    failures=$((failures + 1))
  fi
done

if [ "$failures" -eq 0 ]; then
  log "restore complete — now run the verification steps in docs/DISASTER_RECOVERY.md"
else
  log "restore finished with ${failures} failure(s)"
fi

exit $(( failures > 0 ? 1 : 0 ))

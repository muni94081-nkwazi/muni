#!/usr/bin/env bash
#
# MUNI — PostgreSQL backup.
#
# Dumps every MUNI database in the cluster and prunes anything older than the
# retention window. Designed to be run on a schedule; the `postgres-backup`
# service in docker-compose.yml runs it hourly, which is what makes the
# one-hour RPO in docs/DISASTER_RECOVERY.md true rather than aspirational.
#
# Why `pg_dumpall --globals-only` plus per-database `pg_dump`, rather than one
# `pg_dumpall`:
#
#   • Per-database custom-format dumps (-Fc) can be restored INDIVIDUALLY and
#     in parallel. A plain pg_dumpall is one enormous SQL script that must be
#     replayed start to finish — so recovering one corrupted service database
#     would mean restoring all 24, which is the difference between a four-hour
#     RTO and a much worse one.
#   • Roles and grants live outside any single database, so they need the
#     separate globals dump or a restore comes back with no users.
#
# Exit codes: 0 all databases dumped; 1 one or more failed (the failure is
# logged per database and the script continues, so one bad database does not
# cost you the backup of the other 23).

set -uo pipefail

PGHOST="${PGHOST:-postgres}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-muni}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"

export PGHOST PGPORT PGUSER
# PGPASSWORD is expected in the environment. Deliberately not echoed anywhere.

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="${BACKUP_DIR}/${timestamp}"
failures=0

log() { echo "[backup $(date -u +%H:%M:%S)] $*"; }

mkdir -p "$target"

# ─── Wait for the database ────────────────────────────────────────────────────
# A scheduled run can start while Postgres is restarting. Fail after a bounded
# wait rather than dumping nothing and reporting success.
for attempt in $(seq 1 30); do
  if pg_isready -q; then break; fi
  if [ "$attempt" -eq 30 ]; then
    log "ERROR: Postgres unreachable at ${PGHOST}:${PGPORT} after 60s — no backup taken"
    exit 1
  fi
  sleep 2
done

# ─── Roles, grants and other cluster-wide objects ─────────────────────────────
log "dumping globals (roles, grants)"
if ! pg_dumpall --globals-only --no-role-passwords > "${target}/globals.sql"; then
  log "ERROR: globals dump failed"
  failures=$((failures + 1))
fi

# ─── Every MUNI database ──────────────────────────────────────────────────────
# Enumerated from the server rather than hardcoded, so a database added by a new
# service is backed up without anyone remembering to edit this file. That is the
# failure mode worth designing out: a backup that silently stops covering new
# state is worse than no backup, because it still reports success.
databases="$(psql -tAc \
  "SELECT datname FROM pg_database
   WHERE datname LIKE 'muni%' AND datistemplate = false
   ORDER BY datname")"

if [ -z "$databases" ]; then
  log "ERROR: no muni* databases found — refusing to record an empty backup"
  rm -rf "$target"
  exit 1
fi

for db in $databases; do
  log "dumping ${db}"
  # -Fc: custom format. Compressed, and restorable selectively with pg_restore.
  if pg_dump -Fc --no-owner --no-acl -d "$db" -f "${target}/${db}.dump"; then
    size="$(du -h "${target}/${db}.dump" | cut -f1)"
    log "  ${db} ok (${size})"
  else
    log "  ERROR: ${db} dump FAILED"
    failures=$((failures + 1))
  fi
done

# ─── Manifest ─────────────────────────────────────────────────────────────────
# Written last and only on success, so a half-written backup directory is
# identifiable: no MANIFEST means do not trust it. The restore runbook checks
# for this file before it will restore from a directory.
if [ "$failures" -eq 0 ]; then
  {
    echo "backup_utc=${timestamp}"
    echo "postgres_host=${PGHOST}"
    echo "database_count=$(echo "$databases" | wc -w)"
    echo "databases=$(echo "$databases" | tr '\n' ' ')"
    echo "pg_dump_version=$(pg_dump --version)"
  } > "${target}/MANIFEST"
  log "backup complete: ${target}"
else
  log "backup finished with ${failures} failure(s); MANIFEST withheld — do not restore from ${target}"
fi

# ─── Retention ────────────────────────────────────────────────────────────────
# Pruned AFTER the new backup succeeds, never before. Deleting first would mean
# a failed run leaves you with fewer backups than you started with.
log "pruning backups older than ${RETENTION_DAYS} days"
find "$BACKUP_DIR" -maxdepth 1 -type d -name '20*' -mtime "+${RETENTION_DAYS}" -print -exec rm -rf {} + 2>/dev/null || true

remaining="$(find "$BACKUP_DIR" -maxdepth 1 -type d -name '20*' | wc -l)"
log "${remaining} backup(s) retained"

exit $(( failures > 0 ? 1 : 0 ))

#!/usr/bin/env bash
#
# Tests for scripts/backup-postgres.sh and scripts/restore-postgres.sh.
#
# A backup script that has never run is a hypothesis, and until this file
# existed neither of these had executed a single line. Running them against a
# real PostgreSQL is the ideal, and it is what the quarterly drill in
# docs/DISASTER_RECOVERY.md is for — but that needs a live server, which CI does
# not always have and a laptop often does not either.
#
# So this stubs the five postgres binaries and exercises everything ELSE: the
# retry loop, the database enumeration, the per-database dump loop, the MANIFEST
# gating, retention pruning, the CONFIRM_RESTORE guard, selective restore, and
# every failure branch. That is all of the orchestration and none of the SQL —
# which is the half that actually contains the logic, and the half most likely
# to be wrong.
#
# Usage:  bash scripts/__tests__/backup-restore.test.sh
# Exit 0 when every assertion holds.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_SH="${SCRIPT_DIR}/backup-postgres.sh"
RESTORE_SH="${SCRIPT_DIR}/restore-postgres.sh"

pass=0
fail=0

ok()   { pass=$((pass + 1)); echo "  ok   — $1"; }
bad()  { fail=$((fail + 1)); echo "  FAIL — $1"; }
check(){ if [ "$1" = "$2" ]; then ok "$3"; else bad "$3 (expected '$2', got '$1')"; fi; }

# ─── Stub postgres ────────────────────────────────────────────────────────────
#
# Behaviour is steered by files in $STUB_STATE, so a test can make one command
# fail without rewriting the stubs.

STUB_ROOT="$(mktemp -d)"
STUB_BIN="${STUB_ROOT}/bin"
STUB_STATE="${STUB_ROOT}/state"
mkdir -p "$STUB_BIN" "$STUB_STATE"

cat > "${STUB_BIN}/pg_isready" <<'STUB'
#!/usr/bin/env bash
[ -f "${STUB_STATE}/pg_down" ] && exit 1
exit 0
STUB

cat > "${STUB_BIN}/pg_dumpall" <<'STUB'
#!/usr/bin/env bash
[ -f "${STUB_STATE}/globals_fail" ] && exit 1
echo "-- stub globals: CREATE ROLE muni;"
exit 0
STUB

# `psql -tAc "SELECT datname ..."` lists databases; every other psql call is a
# DDL statement the stub just acknowledges.
cat > "${STUB_BIN}/psql" <<'STUB'
#!/usr/bin/env bash
args="$*"
if [[ "$args" == *"SELECT datname"* ]]; then
  cat "${STUB_STATE}/databases"
  exit 0
fi
if [[ "$args" == *"information_schema.tables"* ]]; then
  echo "7"
  exit 0
fi
if [[ "$args" == *"DROP DATABASE"* ]] && [ -f "${STUB_STATE}/drop_fail" ]; then
  exit 1
fi
echo "$args" >> "${STUB_STATE}/psql_calls"
exit 0
STUB

# Writes the file -f names, so the caller's own existence checks are real.
cat > "${STUB_BIN}/pg_dump" <<'STUB'
#!/usr/bin/env bash
if [ "${1:-}" = "--version" ]; then echo "pg_dump (PostgreSQL) 16.0-stub"; exit 0; fi
out=""; db=""
while [ $# -gt 0 ]; do
  case "$1" in
    -f) out="$2"; shift 2 ;;
    -d) db="$2"; shift 2 ;;
    *)  shift ;;
  esac
done
if [ -f "${STUB_STATE}/dump_fail_${db}" ]; then exit 1; fi
printf 'PGDMP stub dump of %s\n' "$db" > "$out"
exit 0
STUB

cat > "${STUB_BIN}/pg_restore" <<'STUB'
#!/usr/bin/env bash
dump="${@: -1}"
db=""
prev=""
for a in "$@"; do [ "$prev" = "-d" ] && db="$a"; prev="$a"; done
if [ -f "${STUB_STATE}/restore_fail_${db}" ]; then exit 1; fi
echo "restored ${db} from ${dump}" >> "${STUB_STATE}/restored"
exit 0
STUB

chmod +x "${STUB_BIN}"/*
export PATH="${STUB_BIN}:${PATH}"
export STUB_STATE
export PGPASSWORD=stub

printf 'muni_auth\nmuni_products\nmuni_payment\n' > "${STUB_STATE}/databases"

reset_state() {
  rm -f "${STUB_STATE}"/pg_down "${STUB_STATE}"/globals_fail \
        "${STUB_STATE}"/dump_fail_* "${STUB_STATE}"/restore_fail_* \
        "${STUB_STATE}"/drop_fail "${STUB_STATE}"/restored "${STUB_STATE}"/psql_calls
  printf 'muni_auth\nmuni_products\nmuni_payment\n' > "${STUB_STATE}/databases"
}

# ═══════════════════════════════════════════════════════════════════════════════
echo
echo "backup-postgres.sh"
echo "─────────────────────────────────────────────────────────────────────────"

# ── A complete, successful backup ─────────────────────────────────────────────
reset_state
BACKUP_DIR="$(mktemp -d)"
BACKUP_DIR="$BACKUP_DIR" BACKUP_RETENTION_DAYS=7 bash "$BACKUP_SH" > "${STUB_ROOT}/backup.log" 2>&1
check "$?" "0" "exits 0 when every database dumps"

snapshot="$(find "$BACKUP_DIR" -maxdepth 1 -type d -name '20*' | head -1)"
[ -n "$snapshot" ] && ok "creates a timestamped snapshot directory" \
                   || bad "creates a timestamped snapshot directory"

for db in muni_auth muni_products muni_payment; do
  [ -f "${snapshot}/${db}.dump" ] && ok "dumps ${db}" || bad "dumps ${db}"
done

[ -f "${snapshot}/globals.sql" ] && ok "dumps roles and grants separately" \
                                 || bad "dumps roles and grants separately"

# The integrity marker the restore script refuses to proceed without.
[ -f "${snapshot}/MANIFEST" ] && ok "writes a MANIFEST on success" \
                             || bad "writes a MANIFEST on success"
grep -q "database_count=3" "${snapshot}/MANIFEST" \
  && ok "MANIFEST records how many databases were captured" \
  || bad "MANIFEST records how many databases were captured"

# Enumerated from the server, not hardcoded — a database added by a new service
# must be picked up without anyone editing the script.
reset_state
printf 'muni_auth\nmuni_newservice\n' > "${STUB_STATE}/databases"
BACKUP_DIR2="$(mktemp -d)"
BACKUP_DIR="$BACKUP_DIR2" bash "$BACKUP_SH" > /dev/null 2>&1
snap2="$(find "$BACKUP_DIR2" -maxdepth 1 -type d -name '20*' | head -1)"
[ -f "${snap2}/muni_newservice.dump" ] \
  && ok "picks up a database nobody added to the script" \
  || bad "picks up a database nobody added to the script"

# ── Failure branches ──────────────────────────────────────────────────────────
reset_state
touch "${STUB_STATE}/dump_fail_muni_payment"
BACKUP_DIR3="$(mktemp -d)"
BACKUP_DIR="$BACKUP_DIR3" bash "$BACKUP_SH" > "${STUB_ROOT}/partial.log" 2>&1
check "$?" "1" "exits non-zero when a database fails to dump"

snap3="$(find "$BACKUP_DIR3" -maxdepth 1 -type d -name '20*' | head -1)"
[ ! -f "${snap3}/MANIFEST" ] \
  && ok "WITHHOLDS the MANIFEST on a partial backup" \
  || bad "WITHHOLDS the MANIFEST on a partial backup"
# The other databases are still captured — one bad database must not cost the
# backup of the other 23.
[ -f "${snap3}/muni_auth.dump" ] \
  && ok "still captures the databases that did succeed" \
  || bad "still captures the databases that did succeed"

reset_state
touch "${STUB_STATE}/pg_down"
BACKUP_DIR4="$(mktemp -d)"
start=$(date +%s)
BACKUP_DIR="$BACKUP_DIR4" bash "$BACKUP_SH" > /dev/null 2>&1
rc=$?
elapsed=$(( $(date +%s) - start ))
check "$rc" "1" "exits non-zero when postgres never becomes reachable"
[ "$elapsed" -ge 55 ] && ok "waits (~60s) before giving up rather than reporting success instantly" \
                      || bad "gave up after only ${elapsed}s — the retry loop is not waiting"

reset_state
printf '' > "${STUB_STATE}/databases"
BACKUP_DIR5="$(mktemp -d)"
BACKUP_DIR="$BACKUP_DIR5" bash "$BACKUP_SH" > /dev/null 2>&1
check "$?" "1" "refuses to record an empty backup when no databases are found"
[ -z "$(find "$BACKUP_DIR5" -maxdepth 1 -type d -name '20*')" ] \
  && ok "removes the empty snapshot directory it had started" \
  || bad "removes the empty snapshot directory it had started"

# ── Retention ─────────────────────────────────────────────────────────────────
reset_state
BACKUP_DIR6="$(mktemp -d)"
mkdir -p "${BACKUP_DIR6}/20200101T000000Z" "${BACKUP_DIR6}/20200102T000000Z"
touch -d '30 days ago' "${BACKUP_DIR6}/20200101T000000Z" "${BACKUP_DIR6}/20200102T000000Z" 2>/dev/null
BACKUP_DIR="$BACKUP_DIR6" BACKUP_RETENTION_DAYS=7 bash "$BACKUP_SH" > /dev/null 2>&1
[ ! -d "${BACKUP_DIR6}/20200101T000000Z" ] \
  && ok "prunes snapshots older than the retention window" \
  || bad "prunes snapshots older than the retention window"
# Pruning happens AFTER the new backup succeeds — a failed run must never leave
# you with fewer backups than you started with.
[ -n "$(find "$BACKUP_DIR6" -maxdepth 1 -type d -name '20*')" ] \
  && ok "keeps the snapshot it just took" \
  || bad "keeps the snapshot it just took"

# ═══════════════════════════════════════════════════════════════════════════════
echo
echo "restore-postgres.sh"
echo "─────────────────────────────────────────────────────────────────────────"

reset_state
GOOD="$(mktemp -d)/20260101T000000Z"
mkdir -p "$GOOD"
printf 'stub' > "${GOOD}/muni_auth.dump"
printf 'stub' > "${GOOD}/muni_products.dump"
printf 'stub' > "${GOOD}/globals.sql"
printf 'backup_utc=20260101T000000Z\ndatabase_count=2\n' > "${GOOD}/MANIFEST"

# ── The guards ────────────────────────────────────────────────────────────────
bash "$RESTORE_SH" "$GOOD" > /dev/null 2>&1
check "$?" "1" "refuses to run without CONFIRM_RESTORE=yes"
[ ! -f "${STUB_STATE}/restored" ] \
  && ok "and drops nothing while refusing" \
  || bad "and drops nothing while refusing"

NOMANIFEST="$(mktemp -d)/20260102T000000Z"
mkdir -p "$NOMANIFEST"; printf 'stub' > "${NOMANIFEST}/muni_auth.dump"
CONFIRM_RESTORE=yes bash "$RESTORE_SH" "$NOMANIFEST" > /dev/null 2>&1
check "$?" "1" "refuses a backup with no MANIFEST — it is partial by definition"

CONFIRM_RESTORE=yes bash "$RESTORE_SH" "/nonexistent/path" > /dev/null 2>&1
check "$?" "1" "refuses a backup directory that does not exist"

CONFIRM_RESTORE=yes bash "$RESTORE_SH" > /dev/null 2>&1
check "$?" "1" "refuses with no arguments at all"

# ── Restoring ─────────────────────────────────────────────────────────────────
reset_state
CONFIRM_RESTORE=yes bash "$RESTORE_SH" "$GOOD" > "${STUB_ROOT}/restore.log" 2>&1
check "$?" "0" "restores a complete backup"
check "$(grep -c 'restored' "${STUB_STATE}/restored" 2>/dev/null || echo 0)" "2" \
  "restores every database in the backup"
grep -q "CREATE DATABASE" "${STUB_STATE}/psql_calls" \
  && ok "recreates each database before loading it" \
  || bad "recreates each database before loading it"
grep -q "pg_terminate_backend" "${STUB_STATE}/psql_calls" \
  && ok "terminates open connections first, or DROP DATABASE would fail" \
  || bad "terminates open connections first, or DROP DATABASE would fail"

reset_state
CONFIRM_RESTORE=yes bash "$RESTORE_SH" "$GOOD" muni_auth > /dev/null 2>&1
check "$?" "0" "restores a SINGLE named database"
check "$(grep -c 'restored' "${STUB_STATE}/restored" 2>/dev/null || echo 0)" "1" \
  "and touches only that one — the 15-minute recovery, not the 4-hour one"
grep -q "muni_auth" "${STUB_STATE}/restored" \
  && ok "restores the database that was asked for" \
  || bad "restores the database that was asked for"

reset_state
CONFIRM_RESTORE=yes bash "$RESTORE_SH" "$GOOD" muni_notinbackup > /dev/null 2>&1
check "$?" "1" "refuses a database name the backup does not contain"

reset_state
touch "${STUB_STATE}/restore_fail_muni_products"
CONFIRM_RESTORE=yes bash "$RESTORE_SH" "$GOOD" > /dev/null 2>&1
check "$?" "1" "exits non-zero when a database fails to restore"
grep -q "muni_auth" "${STUB_STATE}/restored" \
  && ok "and still restores the ones that can be restored" \
  || bad "and still restores the ones that can be restored"

reset_state
touch "${STUB_STATE}/pg_down"
CONFIRM_RESTORE=yes bash "$RESTORE_SH" "$GOOD" > /dev/null 2>&1
check "$?" "1" "exits non-zero when postgres is unreachable"

# ═══════════════════════════════════════════════════════════════════════════════
rm -rf "$STUB_ROOT"
echo
echo "─────────────────────────────────────────────────────────────────────────"
echo "  ${pass} passed, ${fail} failed"
[ "$fail" -eq 0 ] || exit 1

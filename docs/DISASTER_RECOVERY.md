# MUNI — Disaster Recovery

Backups, recovery objectives, and the runbooks for using them.

The short version: PostgreSQL is dumped hourly, seven days deep. Recovering one
service database takes minutes; recovering the whole platform takes under four
hours. Everything below is the detail behind those two sentences, plus an honest
account of what is *not* covered yet.

---

## 1. Recovery objectives

| Objective | Target | What it means here |
|---|---|---|
| **RPO** — Recovery Point Objective | **1 hour** | The most data we accept losing. Backups run hourly, so a failure at 10:59 loses everything written since the 10:00 dump. |
| **RTO** — Recovery Time Objective | **4 hours** | From "we have decided to restore" to "the platform is serving traffic again". |

### Why these numbers

**RPO of 1 hour** is set by the backup interval, and the interval is set by what
an hour of lost writes actually costs. For MUNI that is orders, payments and
messages — recoverable from the payment provider's own records and from the
customer, but genuinely painful. It is not set by what is technically possible:
continuous archiving (WAL shipping) would put the RPO in the seconds, and is the
right next step if the cost of an hour ever stops being acceptable. See
[Known gaps](#5-known-gaps).

**RTO of 4 hours** is a realistic sum of its parts, not a round number:

| Phase | Budget |
|---|---|
| Detect and decide to restore | 30 min |
| Provision a database host, if the old one is gone | 45 min |
| Restore 24 databases from the latest dump | 60 min |
| Apply migrations, start services, verify | 45 min |
| Smoke test and return traffic | 30 min |
| Contingency | 30 min |

Restoring a *single* service database is far quicker — typically 5–15 minutes,
which is why the dumps are per-database rather than one cluster-wide script.

---

## 2. What is backed up

### PostgreSQL — automated, hourly

The `postgres-backup` service in `docker-compose.yml` runs
[`scripts/backup-postgres.sh`](../scripts/backup-postgres.sh) on a loop.

- **What**: every `muni*` database, enumerated from the server rather than
  hardcoded — a database added by a new service is picked up without anyone
  editing the script. Plus `pg_dumpall --globals-only` for roles and grants,
  which live outside any single database.
- **Format**: `pg_dump -Fc` (custom, compressed). Restorable per-database and in
  parallel with `pg_restore`.
- **Where**: the `postgres_backups` Docker volume, one timestamped directory per
  run. Deliberately a *separate* volume from `postgres_data`, so a
  `docker compose down -v` typed during a bad day does not destroy the database
  and its backups in the same command.
- **Retention**: 7 days (`BACKUP_RETENTION_DAYS`). Pruning happens *after* a
  successful run, never before — a failed run must not leave you with fewer
  backups than you started with.
- **Integrity marker**: a `MANIFEST` file is written last, and only when every
  database dumped cleanly. **A backup directory with no MANIFEST is partial and
  must not be restored from.** `restore-postgres.sh` refuses one outright.

Tune with `BACKUP_INTERVAL_SECONDS` and `BACKUP_RETENTION_DAYS` in `.env`.

### On managed PostgreSQL (RDS / Cloud SQL)

If the database is managed rather than the compose container, use the provider's
automated backups **instead of** the container above (set the
`postgres-backup` service aside — running both doubles the load for no gain):

- Retention: **7 days** minimum, to match the policy here.
- Point-in-time recovery: **enable it**. It supersedes the hourly RPO entirely,
  taking it to roughly five minutes.
- Backup window: outside 07:00–21:00 EAT, which is when Ugandan shopping traffic
  peaks.
- **Test the restore anyway.** A managed backup you have never restored is the
  same hypothesis as an unmanaged one.

### Not backed up automatically

| Store | Holds | Why not, and what to do |
|---|---|---|
| **Redis** | Rate-limit counters, MFA attempt counts, OAuth handshake nonces, exchange codes | All of it is short-lived and reconstructible. Losing Redis logs everyone out of a half-finished OAuth flow and resets some counters — an inconvenience, not data loss. |
| **MongoDB** | Analytics and event documents | **This is a real gap.** See [Known gaps](#5-known-gaps). |
| **Elasticsearch** | The search index | Rebuildable from `muni_products`. Reindexing is part of the restore runbook rather than a backup. |
| **Kafka** | Events in flight | Retention is short by design; consumers replay from their own offsets. |
| **Uploaded documents** (`/uploads`, seller KYC) | Passports, IDs, bank statements | On the `media_uploads` volume with the local store. **Not backed up.** Moving to S3 with versioning enabled is the fix — see `DOCUMENT_STORE=s3` in `.env.example`. |

---

## 3. Runbook — restoring PostgreSQL

### 3.1 Choose a backup

```bash
docker compose exec postgres-backup ls -la /backups
```

Directories are UTC timestamps, e.g. `20260905T140000Z`. Confirm the one you
want is complete:

```bash
docker compose exec postgres-backup cat /backups/20260905T140000Z/MANIFEST
```

No MANIFEST means the run failed partway. Pick an earlier one.

### 3.2 Stop writers

Restoring under live traffic gives you a database that is a mix of restored and
newly-written rows. Stop the services first; leave the datastores up.

```bash
docker compose --profile services stop $(docker compose --profile services config --services \
  | grep -Ev '^(postgres|mongo|redis|kafka|zookeeper|rabbitmq|elasticsearch|nginx|postgres-backup)$')
```

### 3.3 Restore

Everything:

```bash
docker compose exec -e CONFIRM_RESTORE=yes postgres-backup \
  /usr/local/bin/restore-postgres.sh /backups/20260905T140000Z
```

A single service database — far quicker, and the common case:

```bash
docker compose exec -e CONFIRM_RESTORE=yes postgres-backup \
  /usr/local/bin/restore-postgres.sh /backups/20260905T140000Z muni_auth
```

`CONFIRM_RESTORE=yes` is required. The script drops and recreates each database
it touches, and the realistic way to lose production is a restore aimed at it by
mistake during an incident.

### 3.4 Reapply migrations

The dump is from whatever schema version was live when it was taken. If you are
restoring an older backup onto a newer build, run the migrator:

```bash
docker compose --profile services up db-migrator
```

It must exit 0 before continuing.

### 3.5 Restart and verify

```bash
docker compose --profile services up -d
```

Then work through [section 4](#4-verification--did-the-restore-actually-work).

### 3.6 Rebuild derived state

Neither is backed up; both are rebuilt from PostgreSQL.

```bash
# Search index
curl -fsS -X POST http://localhost:8080/api/v1/search/reindex \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

Redis needs nothing — it repopulates as traffic arrives.

---

## 4. Verification — did the restore actually work?

A restore is not finished when `pg_restore` exits 0. It is finished when someone
can log in and buy something. Run all of it.

### 4.1 Infrastructure

```bash
docker compose ps                          # every service Up / healthy
curl -fsS http://localhost/api/health/ready # dependencies reachable, not just the process
```

### 4.2 Data actually arrived

```bash
docker compose exec postgres psql -U muni -d muni_auth \
  -c "SELECT count(*) AS users FROM users;" \
  -c "SELECT count(*) AS oauth_links FROM oauth_accounts;" \
  -c "SELECT max(\"createdAt\") AS newest_user FROM users;"
```

`newest_user` should sit within the RPO window of the failure. If it is days
old, you have restored the wrong backup.

### 4.3 Auth flows — the ones to check first

Authentication is where a bad restore does the most damage, because a
half-restored `muni_auth` locks every customer out at once.

| Flow | Command | Expected |
|---|---|---|
| Register | `curl -fsS -X POST http://localhost/api/v1/auth/register -H 'Content-Type: application/json' -d '{"firstName":"Restore","lastName":"Check","email":"restore-check@example.com","password":"RestoreCheck1!x"}'` | `201` with `accessToken`, `refreshToken`, `user` |
| Login | `curl -fsS -X POST http://localhost/api/v1/auth/login -H 'Content-Type: application/json' -d '{"email":"restore-check@example.com","password":"RestoreCheck1!x"}'` | `200`, `status: AUTHENTICATED` |
| Wrong password | same with a bad password | `401` — **not** `500`. A 500 here means the password hashes did not restore. |
| Refresh | `curl -fsS -X POST http://localhost/api/v1/auth/refresh -H 'Content-Type: application/json' -d "{\"refreshToken\":\"$REFRESH\"}"` | `200` with a **different** refresh token (rotation working) |
| Token reuse | replay the *old* refresh token | `401` "reuse detected" — proves the family table restored |
| Profile | `curl -fsS http://localhost/api/v1/users/me -H "Authorization: Bearer $ACCESS"` | `200`, the right user |
| Providers | `curl -fsS http://localhost/api/v1/auth/providers` | `200`, three providers listed |
| Admin guard | `curl -s -o /dev/null -w '%{http_code}' http://localhost/api/v1/users -H "Authorization: Bearer $ACCESS"` | `403` for a customer token — proves roles restored, not just rows |

An existing user signing in matters more than a new one registering: it proves
the *restored* password hashes verify, rather than only that new writes work.

Delete the check account afterwards.

### 4.4 The rest of the platform

```bash
curl -fsS 'http://localhost/api/v1/products?limit=1'   # catalogue
curl -fsS 'http://localhost/api/v1/search?q=phone'      # index rebuilt
curl -fsS 'http://localhost/api/v1/currencies'          # reference data
```

Then, signed in: add to cart → checkout → confirm the order appears in
`/api/v1/orders`.

---

## 5. Known gaps

Stated plainly, because a DR document that implies more coverage than exists is
worse than none.

| Gap | Risk | Fix |
|---|---|---|
| **Backups live on the same host as the database** | Losing the host loses both. This protects against bad migrations and dropped tables, not against hardware or region failure. | Ship dumps to S3/object storage on a different provider or region. A cron'd `aws s3 sync /backups s3://muni-backups/` in the backup container is the minimum viable version. |
| **No off-site / cross-region copy** | Same as above, at region scale. | As above, plus cross-region replication on the bucket. |
| **MongoDB is not backed up** | Analytics and event documents are lost outright. | `mongodump` on the same hourly schedule, into the same volume. |
| **Uploaded KYC documents are not backed up** | Sellers would have to re-upload passports and bank statements; a compliance problem as well as a support one. | `DOCUMENT_STORE=s3` with bucket versioning. |
| **No point-in-time recovery** | RPO is capped at the backup interval — one hour. | WAL archiving (`archive_mode=on` + `archive_command`), or managed PITR. |
| **No automated restore drill** | The scripts are exercised by hand. An untested backup is a hypothesis. | A scheduled job that restores the newest backup into a scratch database and runs §4.3 against it. |
| **No read replica** | No failover target; recovery means restoring, not switching. | A streaming replica, promoted on failure. Turns a 4-hour RTO into minutes. |

### Failing over to a read replica

There is **no read replica today** — this section is the procedure for once one
exists, not a description of current capability.

```bash
# 1. Confirm the primary is actually gone, not just slow. Promoting while the
#    primary still accepts writes gives you two divergent databases, which is a
#    worse day than the outage.
pg_isready -h $PRIMARY_HOST -p 5432

# 2. Promote.
pg_ctl promote -D /var/lib/postgresql/data      # or: aws rds promote-read-replica

# 3. Repoint the services and restart them.
#    DATABASE_URL is per-service in docker-compose.yml.
sed -i "s/@postgres:/@${REPLICA_HOST}:/g" .env
docker compose --profile services up -d

# 4. Verify with section 4, then build a new replica from the new primary —
#    until you do, you are running with no failover target at all.
```

---

## 6. Drill schedule

| Cadence | Exercise |
|---|---|
| Weekly | Confirm the newest backup has a MANIFEST and a plausible size. |
| Monthly | Restore into a scratch database; run §4.3 against it. |
| Quarterly | Full drill: restore everything into a fresh environment, time it, and compare against the 4-hour RTO. |
| After any schema change | Confirm the migrator still applies cleanly onto a restored older backup. |

Record each drill's date, duration and outcome. If a quarterly drill overruns
the RTO, the RTO is wrong — change the number or fix the process, but do not
leave a target nobody has met.

-- ─── Index health checks ─────────────────────────────────────────────────────
--
-- Run these against the product/order databases before and after a load test.
-- Indexes are not free: each one is written on every INSERT and UPDATE, so an
-- index nothing reads is a pure tax on write throughput.
--
--   psql "$DATABASE_URL" -f backend/scripts/index-health.sql

-- ① Unused indexes, largest first.
--    idx_scan near zero after a representative traffic period means nothing
--    is choosing it. Verify against a full business cycle before dropping —
--    a month-end report may be the only reader.
SELECT
  s.relname                                    AS table_name,
  s.indexrelname                               AS index_name,
  s.idx_scan                                   AS scans,
  pg_size_pretty(pg_relation_size(s.indexrelid)) AS size
FROM   pg_stat_user_indexes s
JOIN   pg_index i ON i.indexrelid = s.indexrelid
WHERE  s.idx_scan < 50
  AND  NOT i.indisunique          -- never drop a uniqueness guarantee
  AND  NOT i.indisprimary
ORDER  BY pg_relation_size(s.indexrelid) DESC;

-- ② Tables taking sequential scans despite having indexes.
--    A high seq_scan count on a large table is the signature of a query whose
--    shape no index matches — the ILIKE '%term%' problem.
SELECT
  relname                AS table_name,
  seq_scan,
  seq_tup_read,
  idx_scan,
  CASE WHEN seq_scan > 0 THEN seq_tup_read / seq_scan ELSE 0 END AS avg_rows_per_seq_scan,
  n_live_tup             AS estimated_rows
FROM   pg_stat_user_tables
WHERE  seq_scan > 0
ORDER  BY seq_tup_read DESC
LIMIT  20;

-- ③ Slowest statements by total time.
--    Requires: shared_preload_libraries = 'pg_stat_statements' in
--    postgresql.conf, then CREATE EXTENSION pg_stat_statements;
SELECT
  round(total_exec_time::numeric, 1)          AS total_ms,
  calls,
  round(mean_exec_time::numeric, 2)           AS mean_ms,
  round((100 * total_exec_time / NULLIF(SUM(total_exec_time) OVER (), 0))::numeric, 1) AS pct_of_total,
  left(query, 160)                            AS query
FROM   pg_stat_statements
ORDER  BY total_exec_time DESC
LIMIT  20;

-- ④ Duplicate / redundant indexes — one is a prefix of another.
SELECT
  a.indrelid::regclass AS table_name,
  a.indexrelid::regclass AS redundant_index,
  b.indexrelid::regclass AS covered_by
FROM   pg_index a
JOIN   pg_index b
  ON   a.indrelid = b.indrelid
 AND   a.indexrelid <> b.indexrelid
 AND   array_to_string(b.indkey, ' ') LIKE array_to_string(a.indkey, ' ') || '%'
WHERE  NOT a.indisprimary AND NOT a.indisunique;

-- ⑤ Cache hit ratio. Below ~0.99 on a read-heavy catalogue means the working
--    set no longer fits in shared_buffers — the point at which adding a cache
--    layer or a read replica buys more than another index.
SELECT
  relname AS table_name,
  round((heap_blks_hit::numeric / NULLIF(heap_blks_hit + heap_blks_read, 0)), 4) AS cache_hit_ratio,
  heap_blks_read AS disk_reads
FROM   pg_statio_user_tables
WHERE  heap_blks_hit + heap_blks_read > 0
ORDER  BY heap_blks_read DESC
LIMIT  20;

-- ⑥ Verify a specific plan. Run before/after an index change to confirm the
--    planner switched from Seq Scan to Index Scan and the cost actually fell.
-- EXPLAIN (ANALYZE, BUFFERS)
-- SELECT * FROM "Product"
-- WHERE status = 'ACTIVE' ORDER BY "createdAt" DESC LIMIT 20;

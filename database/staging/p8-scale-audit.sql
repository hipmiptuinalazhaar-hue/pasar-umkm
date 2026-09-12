-- P8 Database Scale Audit
-- READ-ONLY ONLY. Do not add DDL/DML here.
-- Target: pasar_umkm_app

-- 1. Database footprint
SELECT
  current_database() AS database_name,
  pg_size_pretty(pg_database_size(current_database())) AS database_size;

-- 2. Largest tables
SELECT
  schemaname,
  relname AS table_name,
  pg_size_pretty(pg_table_size(relid)) AS table_size,
  n_live_tup,
  n_dead_tup,
  seq_scan,
  idx_scan
FROM pg_stat_user_tables
ORDER BY pg_table_size(relid) DESC
LIMIT 25;

-- 3. Largest indexes + scan counts
SELECT
  s.schemaname,
  s.relname AS table_name,
  s.indexrelname AS index_name,
  pg_size_pretty(pg_relation_size(s.indexrelid)) AS index_size,
  s.idx_scan
FROM pg_stat_user_indexes s
ORDER BY pg_relation_size(s.indexrelid) DESC
LIMIT 50;

-- 4. Low-usage non-unique indexes. Candidates only, never auto-drop.
SELECT
  s.schemaname,
  s.relname AS table_name,
  s.indexrelname AS index_name,
  pg_size_pretty(pg_relation_size(s.indexrelid)) AS index_size,
  s.idx_scan
FROM pg_stat_user_indexes s
JOIN pg_index i ON i.indexrelid = s.indexrelid
WHERE i.indisunique = false
  AND i.indisprimary = false
  AND s.idx_scan < 50
ORDER BY pg_relation_size(s.indexrelid) DESC, s.idx_scan ASC
LIMIT 100;

-- 5. Sequential-scan signals
SELECT
  schemaname,
  relname AS table_name,
  seq_scan,
  seq_tup_read,
  idx_scan,
  n_live_tup
FROM pg_stat_user_tables
ORDER BY seq_scan DESC
LIMIT 50;

-- 6. Vacuum/dead tuple signals
SELECT
  schemaname,
  relname AS table_name,
  n_live_tup,
  n_dead_tup,
  last_vacuum,
  last_autovacuum,
  last_analyze,
  last_autoanalyze
FROM pg_stat_user_tables
ORDER BY n_dead_tup DESC
LIMIT 50;

-- 7. Long-running active queries (>30s). Excludes this audit query.
SELECT
  pid,
  now() - query_start AS age,
  state,
  wait_event_type,
  wait_event,
  left(query, 500) AS query_preview
FROM pg_stat_activity
WHERE datname = current_database()
  AND pid <> pg_backend_pid()
  AND state = 'active'
  AND query_start < now() - interval '30 seconds'
ORDER BY query_start;

-- 8. Un-granted locks only. Zero rows is healthy.
SELECT
  a.pid,
  l.locktype,
  l.mode,
  l.granted,
  now() - a.query_start AS query_age,
  left(a.query, 500) AS query_preview
FROM pg_locks l
JOIN pg_stat_activity a ON a.pid = l.pid
WHERE a.datname = current_database()
  AND l.granted = false
ORDER BY a.query_start;

-- 9. Check whether pg_stat_statements is available. This is read-only.
SELECT EXISTS (
  SELECT 1
  FROM pg_extension
  WHERE extname = 'pg_stat_statements'
) AS pg_stat_statements_installed;

-- P8 policy:
-- * Never DROP INDEX from this output automatically.
-- * Never VACUUM FULL/REINDEX production automatically.
-- * Re-test plans with EXPLAIN (ANALYZE, BUFFERS) when row counts/latency cross thresholds.

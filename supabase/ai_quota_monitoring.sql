-- ── AI Quota Monitoring Schema ────────────────────────────────────────────────
-- Extends ai_usage_logs with tracking fields and adds aggregation infrastructure
-- for the AI Operations Dashboard.
--
-- IMPORTANT: Run this migration in Supabase SQL Editor.
-- After running, enable pg_cron extension and schedule the aggregation jobs below.

-- ── 1. Add new columns to ai_usage_logs ──────────────────────────────────────
-- These columns are populated by the updated logAiUsage() function in worker/index.js.
-- Existing rows will have NULL values — this is expected and safe.

ALTER TABLE ai_usage_logs
  ADD COLUMN IF NOT EXISTS thinking_tokens   integer  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS retry_count       smallint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS api_key_alias     text     DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS retry_delay_secs  integer  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS quota_type        text     DEFAULT NULL; -- 'daily' | 'minute' | NULL

-- ── 2. Performance indexes ────────────────────────────────────────────────────
-- BRIN index: ideal for append-only time-series, ~100x smaller than btree on created_at
CREATE INDEX IF NOT EXISTS ai_usage_logs_created_brin
  ON ai_usage_logs USING BRIN (created_at);

-- Composite index for daily RPD queries and by-feature breakdown
CREATE INDEX IF NOT EXISTS ai_usage_logs_date_feature
  ON ai_usage_logs (DATE(created_at), feature);

-- ── 3. ai_quota_snapshots — pre-aggregated 5-minute windows ──────────────────
-- Populated by pg_cron every 5 minutes. Powers real-time-ish gauges and sparklines
-- without hitting the raw logs table on every dashboard load.

CREATE TABLE IF NOT EXISTS ai_quota_snapshots (
  id               bigserial    PRIMARY KEY,
  period           text         NOT NULL CHECK (period IN ('5min', '1hour', '1day')),
  bucket_start     timestamptz  NOT NULL,
  total_requests   integer      NOT NULL DEFAULT 0,
  successful_reqs  integer      NOT NULL DEFAULT 0,
  failed_reqs      integer      NOT NULL DEFAULT 0,
  rate_429_reqs    integer      NOT NULL DEFAULT 0,
  total_input_tok  bigint       NOT NULL DEFAULT 0,
  total_output_tok bigint       NOT NULL DEFAULT 0,
  thinking_tok     bigint       NOT NULL DEFAULT 0,
  by_feature       jsonb        DEFAULT '{}',
  unique_users     integer      DEFAULT NULL,
  UNIQUE (period, bucket_start)
);

CREATE INDEX IF NOT EXISTS ai_quota_snapshots_period_bucket
  ON ai_quota_snapshots (period, bucket_start DESC);

-- ── 4. Modify get_ai_stats RPC — add quota, daily_7d, today_by_feature ───────
-- Drop and recreate with backward-compatible additions.
-- The worker spreads this result directly, so all existing fields are preserved.

CREATE OR REPLACE FUNCTION get_ai_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_30d     jsonb;
  v_7d      jsonb;
  v_24h     jsonb;
  v_feat    jsonb;
  v_top     jsonb;
  v_daily7  jsonb;
  v_today_f jsonb;
  v_quota   jsonb;
BEGIN
  -- Totals: 30d
  SELECT jsonb_build_object(
    'count',       COUNT(*),
    'input_tokens', COALESCE(SUM(input_tokens), 0),
    'output_tokens', COALESCE(SUM(output_tokens), 0),
    'thinking_tokens', COALESCE(SUM(thinking_tokens), 0),
    'error_count', COUNT(*) FILTER (WHERE status_code IS NOT NULL AND status_code != 200)
  ) INTO v_30d
  FROM ai_usage_logs
  WHERE created_at >= now() - interval '30 days';

  -- Totals: 7d
  SELECT jsonb_build_object(
    'count',        COUNT(*),
    'input_tokens',  COALESCE(SUM(input_tokens), 0),
    'output_tokens', COALESCE(SUM(output_tokens), 0),
    'error_count',  COUNT(*) FILTER (WHERE status_code IS NOT NULL AND status_code != 200)
  ) INTO v_7d
  FROM ai_usage_logs
  WHERE created_at >= now() - interval '7 days';

  -- Totals: 24h (includes 429 count for quota gauge)
  SELECT jsonb_build_object(
    'count',        COUNT(*),
    'input_tokens',  COALESCE(SUM(input_tokens), 0),
    'output_tokens', COALESCE(SUM(output_tokens), 0),
    'error_count',  COUNT(*) FILTER (WHERE status_code IS NOT NULL AND status_code != 200),
    'count_429',    COUNT(*) FILTER (WHERE status_code = 429)
  ) INTO v_24h
  FROM ai_usage_logs
  WHERE created_at >= now() - interval '24 hours';

  -- By feature: 30d breakdown with 7d count for spike detection
  SELECT jsonb_object_agg(
    feature,
    jsonb_build_object(
      'count',           total,
      'count_7d',        cnt_7d,
      'input_tokens',    inp,
      'output_tokens',   out,
      'avg_duration_ms', avg_dur,
      'error_count',     errs
    )
  ) INTO v_feat
  FROM (
    SELECT
      feature,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE created_at >= now() - interval '7 days') AS cnt_7d,
      COALESCE(SUM(input_tokens), 0) AS inp,
      COALESCE(SUM(output_tokens), 0) AS out,
      ROUND(AVG(duration_ms))::int AS avg_dur,
      COUNT(*) FILTER (WHERE status_code IS NOT NULL AND status_code != 200) AS errs
    FROM ai_usage_logs
    WHERE created_at >= now() - interval '30 days'
    GROUP BY feature
  ) t;

  -- Top users by token consumption (30d)
  SELECT jsonb_agg(
    jsonb_build_object(
      'user_id',           user_id,
      'requests',          requests,
      'requests_today',    req_today,
      'total_tokens',      total_tokens
    )
    ORDER BY total_tokens DESC
  ) INTO v_top
  FROM (
    SELECT
      user_id,
      COUNT(*) AS requests,
      COUNT(*) FILTER (WHERE created_at >= date_trunc('day', now())) AS req_today,
      COALESCE(SUM(input_tokens), 0) + COALESCE(SUM(output_tokens), 0) AS total_tokens
    FROM ai_usage_logs
    WHERE created_at >= now() - interval '30 days'
      AND user_id IS NOT NULL
    GROUP BY user_id
    ORDER BY total_tokens DESC
    LIMIT 10
  ) t;

  -- Daily 7d array for sparklines (oldest → newest)
  SELECT jsonb_agg(
    jsonb_build_object(
      'date',    to_char(day, 'YYYY-MM-DD'),
      'count',   cnt,
      'tokens',  tok,
      'errors',  errs
    )
    ORDER BY day ASC
  ) INTO v_daily7
  FROM (
    SELECT
      DATE(created_at AT TIME ZONE 'UTC') AS day,
      COUNT(*) AS cnt,
      COALESCE(SUM(input_tokens), 0) + COALESCE(SUM(output_tokens), 0) AS tok,
      COUNT(*) FILTER (WHERE status_code IS NOT NULL AND status_code != 200) AS errs
    FROM ai_usage_logs
    WHERE created_at >= now() - interval '7 days'
    GROUP BY DATE(created_at AT TIME ZONE 'UTC')
  ) t;

  -- Today's breakdown by feature (for spike detection vs 7d avg)
  SELECT jsonb_object_agg(feature, cnt) INTO v_today_f
  FROM (
    SELECT feature, COUNT(*) AS cnt
    FROM ai_usage_logs
    WHERE created_at >= date_trunc('day', now())
    GROUP BY feature
  ) t;

  -- Quota snapshot: RPD today, avg 7d for projection
  SELECT jsonb_build_object(
    'rpd_today',         rpd_today,
    'tpd_today',         tpd_today,
    'avg_rpd_7d',        ROUND(avg_rpd_7d::numeric, 1),
    'projected_days_left',
      CASE WHEN avg_rpd_7d > 0
        THEN ROUND(GREATEST(0, 10000 - rpd_today)::numeric / avg_rpd_7d, 1)  -- Paid Tier 1
        ELSE NULL
      END,
    'avg_latency_ms_7d', avg_lat
  ) INTO v_quota
  FROM (
    SELECT
      COUNT(*) FILTER (WHERE created_at >= date_trunc('day', now())) AS rpd_today,
      COALESCE(SUM(input_tokens + output_tokens) FILTER (WHERE created_at >= date_trunc('day', now())), 0) AS tpd_today,
      AVG(daily_cnt) AS avg_rpd_7d,
      ROUND(AVG(duration_ms) FILTER (WHERE created_at >= now() - interval '7 days'))::int AS avg_lat
    FROM ai_usage_logs,
    LATERAL (
      SELECT COUNT(*) AS daily_cnt
      FROM ai_usage_logs AS sub
      WHERE DATE(sub.created_at) = DATE(ai_usage_logs.created_at)
    ) daily_agg
    WHERE created_at >= now() - interval '7 days'
  ) t;

  RETURN jsonb_build_object(
    'totals_30d',        v_30d,
    'totals_7d',         v_7d,
    'totals_24h',        v_24h,
    'by_feature',        COALESCE(v_feat, '{}'),
    'top_users',         COALESCE(v_top, '[]'),
    'daily_7d',          COALESCE(v_daily7, '[]'),
    'today_by_feature',  COALESCE(v_today_f, '{}'),
    'quota',             v_quota
  );
END;
$$;

-- ── 5. pg_cron aggregation jobs ───────────────────────────────────────────────
-- Run these AFTER enabling pg_cron extension in Supabase Dashboard → Extensions.
--
-- Job 1: Roll up last 5-minute window every 5 minutes
SELECT cron.schedule(
  'aggregate-ai-quota-5min',
  '*/5 * * * *',
  $$
  INSERT INTO ai_quota_snapshots
    (period, bucket_start, total_requests, successful_reqs, failed_reqs, rate_429_reqs,
     total_input_tok, total_output_tok, thinking_tok)
  SELECT
    '5min',
    date_trunc('minute', now()) - interval '5 minutes',
    COUNT(*),
    COUNT(*) FILTER (WHERE status_code = 200),
    COUNT(*) FILTER (WHERE status_code IS NOT NULL AND status_code != 200),
    COUNT(*) FILTER (WHERE status_code = 429),
    COALESCE(SUM(input_tokens), 0),
    COALESCE(SUM(output_tokens), 0),
    COALESCE(SUM(thinking_tokens), 0)
  FROM ai_usage_logs
  WHERE created_at >= date_trunc('minute', now()) - interval '5 minutes'
    AND created_at  < date_trunc('minute', now())
  ON CONFLICT (period, bucket_start) DO UPDATE SET
    total_requests   = EXCLUDED.total_requests,
    successful_reqs  = EXCLUDED.successful_reqs,
    failed_reqs      = EXCLUDED.failed_reqs,
    rate_429_reqs    = EXCLUDED.rate_429_reqs,
    total_input_tok  = EXCLUDED.total_input_tok,
    total_output_tok = EXCLUDED.total_output_tok,
    thinking_tok     = EXCLUDED.thinking_tok;
  $$
);

-- Job 2: Roll up daily totals at 00:05 UTC
SELECT cron.schedule(
  'aggregate-ai-quota-daily',
  '5 0 * * *',
  $$
  INSERT INTO ai_quota_snapshots
    (period, bucket_start, total_requests, successful_reqs, failed_reqs, rate_429_reqs,
     total_input_tok, total_output_tok, thinking_tok)
  SELECT
    '1day',
    date_trunc('day', now() - interval '1 day'),
    COUNT(*),
    COUNT(*) FILTER (WHERE status_code = 200),
    COUNT(*) FILTER (WHERE status_code IS NOT NULL AND status_code != 200),
    COUNT(*) FILTER (WHERE status_code = 429),
    COALESCE(SUM(input_tokens), 0),
    COALESCE(SUM(output_tokens), 0),
    COALESCE(SUM(thinking_tokens), 0)
  FROM ai_usage_logs
  WHERE created_at >= date_trunc('day', now() - interval '1 day')
    AND created_at  < date_trunc('day', now())
  ON CONFLICT (period, bucket_start) DO UPDATE SET
    total_requests   = EXCLUDED.total_requests,
    rate_429_reqs    = EXCLUDED.rate_429_reqs,
    total_input_tok  = EXCLUDED.total_input_tok,
    total_output_tok = EXCLUDED.total_output_tok;
  $$
);

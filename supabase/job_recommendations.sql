-- ══════════════════════════════════════════════════════════════════════════════
-- AI Job Recommendations — Database Schema
-- OptimizaLK · Supabase / PostgreSQL
-- Run in Supabase SQL Editor in order: tables → indexes → RLS → RPCs
-- ══════════════════════════════════════════════════════════════════════════════


-- ── 1. job_cache — Normalized job listings, deduped by source + external_id ──
--   Purpose: avoid re-hitting job APIs for the same listings within 24 h.
--   Shared across all users (no user_id). Service role writes, anon reads.

CREATE TABLE IF NOT EXISTS job_cache (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source          text        NOT NULL
                              CHECK (source IN ('remoteok','remotive','adzuna','greenhouse','lever','arbeitnow','jsearch')),
  external_id     text        NOT NULL,
  title           text        NOT NULL,
  company         text        NOT NULL,
  -- Full description stored only when < 8 KB; larger ones are truncated to 6 KB.
  -- Storing the description avoids a second API round-trip during AI matching.
  description     text,
  location        text,
  remote          boolean     NOT NULL DEFAULT false,
  url             text        NOT NULL,
  salary_min      integer,    -- in local currency units (null = not published)
  salary_max      integer,
  currency        text,       -- 'ARS' | 'USD' | 'EUR' | null
  skills_required text[],     -- extracted by normalizer, e.g. {'Python','SQL','dbt'}
  seniority       text        CHECK (seniority IN ('Junior','Semi Senior','Senior','Lead','No especificado')),
  industry        text,
  posted_at       timestamptz,
  fetched_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  -- Dedup constraint: one row per (source, external_id)
  UNIQUE (source, external_id)
);

CREATE INDEX IF NOT EXISTS job_cache_expires        ON job_cache (expires_at);
CREATE INDEX IF NOT EXISTS job_cache_source_fetched ON job_cache (source, fetched_at DESC);
CREATE INDEX IF NOT EXISTS job_cache_remote_seniority ON job_cache (remote, seniority)
  WHERE expires_at > now();  -- partial index — only live rows

-- Full-text search on title + company (used when AI needs keyword pre-filter)
CREATE INDEX IF NOT EXISTS job_cache_fts ON job_cache
  USING GIN (to_tsvector('spanish', coalesce(title,'') || ' ' || coalesce(company,'')));

ALTER TABLE job_cache ENABLE ROW LEVEL SECURITY;
-- Public read (anon key) — descriptions are not PII
CREATE POLICY "anyone_reads_job_cache"  ON job_cache FOR SELECT USING (true);
-- Only service role writes (worker uses service role key)
CREATE POLICY "service_inserts_job_cache" ON job_cache FOR INSERT WITH CHECK (false);
CREATE POLICY "service_updates_job_cache" ON job_cache FOR UPDATE USING (false);


-- ── 2. job_searches — Per-user search parameter cache (dedup identical queries) ─
--   Purpose: avoid re-fetching + re-scoring when the same user re-runs the same
--   query within 2 hours.  Also drives analytics ("what are users searching for?").

CREATE TABLE IF NOT EXISTS job_searches (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Nullable: anonymous users can also trigger a search (IP-only rate limit applies)
  query_hash    text        NOT NULL,   -- SHA-256 hex of canonical(queries+location+remote_ok)
  queries       text[]      NOT NULL,   -- raw query strings sent by frontend
  location      text,
  remote_ok     boolean     NOT NULL DEFAULT true,
  result_ids    uuid[],                 -- ordered array of job_cache.id returned
  result_count  integer     NOT NULL DEFAULT 0,
  source_counts jsonb       NOT NULL DEFAULT '{}', -- {"remoteok":12,"adzuna":8}
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL DEFAULT (now() + interval '2 hours')
);

CREATE INDEX IF NOT EXISTS job_searches_hash_exp   ON job_searches (query_hash, expires_at DESC);
CREATE INDEX IF NOT EXISTS job_searches_user_recent ON job_searches (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

ALTER TABLE job_searches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_reads_own_searches" ON job_searches
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "user_inserts_searches" ON job_searches
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);


-- ── 3. job_recommendations — Per-user AI match results ───────────────────────
--   Purpose: persist scored recommendations so the user can revisit, save to
--   Kanban, trigger CV adapter, or prep interview — all from the same record.

CREATE TABLE IF NOT EXISTS job_recommendations (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_cache_id  uuid        REFERENCES job_cache(id) ON DELETE SET NULL,
  -- Denormalized snapshot — survives job_cache expiry
  title         text        NOT NULL,
  company       text        NOT NULL,
  location      text,
  remote        boolean,
  url           text        NOT NULL,
  -- AI scoring fields
  match_score   numeric(4,2) NOT NULL CHECK (match_score BETWEEN 0 AND 10),
  strengths     text[],      -- e.g. {'Experiencia en SQL','Inglés avanzado'}
  gaps          text[],      -- e.g. {'No tiene Python','Seniority bajo para el rol'}
  summary       text,        -- 1-2 sentence AI explanation of the match
  -- Provenance
  source        text        NOT NULL,
  search_id     uuid        REFERENCES job_searches(id) ON DELETE SET NULL,
  -- Lifecycle
  status        text        NOT NULL DEFAULT 'new'
                            CHECK (status IN ('new','seen','saved','applied','dismissed')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_rec_user_score  ON job_recommendations (user_id, match_score DESC)
  WHERE status != 'dismissed';
CREATE INDEX IF NOT EXISTS job_rec_user_status ON job_recommendations (user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS job_rec_job_cache   ON job_recommendations (job_cache_id);

ALTER TABLE job_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_manages_own_recs" ON job_recommendations
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- ── 4. Extend historial.tipo CHECK to accept 'job_recommendations' ────────────
--   Existing: CHECK (tipo IN ('analisis','cv','entrevista','star'))
--   The historial row stores the full batch context: queries + top results.

ALTER TABLE historial
  DROP CONSTRAINT IF EXISTS historial_tipo_check;

ALTER TABLE historial
  ADD CONSTRAINT historial_tipo_check
  CHECK (tipo IN ('analisis','cv','entrevista','star','job_recommendations'));


-- ── 5. Helper RPC: expire stale job_cache rows (called by worker cron or manually) ─
CREATE OR REPLACE FUNCTION purge_expired_job_cache()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM job_cache WHERE expires_at < now();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- ── 6. Helper RPC: fetch live cached jobs for a query_hash ───────────────────
CREATE OR REPLACE FUNCTION get_cached_jobs(p_query_hash text)
RETURNS TABLE (
  id uuid, source text, external_id text, title text, company text,
  description text, location text, remote boolean, url text,
  salary_min integer, salary_max integer, currency text,
  skills_required text[], seniority text, industry text, posted_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    jc.id, jc.source, jc.external_id, jc.title, jc.company,
    jc.description, jc.location, jc.remote, jc.url,
    jc.salary_min, jc.salary_max, jc.currency,
    jc.skills_required, jc.seniority, jc.industry, jc.posted_at
  FROM job_searches js
  JOIN LATERAL unnest(js.result_ids) AS rid ON true
  JOIN job_cache jc ON jc.id = rid AND jc.expires_at > now()
  WHERE js.query_hash = p_query_hash
    AND js.expires_at > now()
  ORDER BY jc.fetched_at DESC;
$$;

-- ── 7. Helper RPC: user recommendation stats (for admin dashboard) ────────────
CREATE OR REPLACE FUNCTION get_job_rec_stats()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total_recs_30d',     COUNT(*),
    'unique_users_30d',   COUNT(DISTINCT user_id),
    'avg_match_score',    ROUND(AVG(match_score)::numeric, 2),
    'saved_count',        COUNT(*) FILTER (WHERE status = 'saved'),
    'applied_count',      COUNT(*) FILTER (WHERE status = 'applied'),
    'dismissed_count',    COUNT(*) FILTER (WHERE status = 'dismissed'),
    'kanban_conversion',  ROUND(
                            100.0 * COUNT(*) FILTER (WHERE status IN ('saved','applied'))
                            / NULLIF(COUNT(*), 0), 1
                          )
  ) INTO result
  FROM job_recommendations
  WHERE created_at >= now() - interval '30 days';
  RETURN result;
END;
$$;

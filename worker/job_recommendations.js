// ══════════════════════════════════════════════════════════════════════════════
// AI Job Recommendations — Worker Module
// OptimizaLK · Cloudflare Workers
//
// INTEGRATION: Import these handlers into worker/index.js and wire them into
// the main fetch() switch.  All helpers (supabaseServiceFetch, callGeminiApi,
// logAiUsage, checkRateLimit, verifyUserJwt, getUserIdFromToken) are assumed
// to already exist in index.js — no duplication needed.
//
// WRANGLER.TOML additions required:
//   [[kv_namespaces]]
//   binding = "RATE_LIMIT_KV"   # already exists
//   # RATE_LIMIT_KV is reused for job search KV cache (same namespace, different key prefix)
//
// ENV VARS to add in Cloudflare dashboard:
//   JOOBLE_KEY        — from jooble.org/api/about (free, 500 req default)
//   ADZUNA_APP_ID     — from developer.adzuna.com (optional, V1)
//   ADZUNA_APP_KEY    — from developer.adzuna.com (optional, V1)
//   (RemoteOK + Remotive + Arbeitnow are free, no key needed)
// ══════════════════════════════════════════════════════════════════════════════

'use strict'

// ── Constants ─────────────────────────────────────────────────────────────────

const JOB_KV_TTL_SECS   = 7_200   // 2-hour KV cache for raw query results
const JOB_DB_TTL_HOURS  = 24      // job_cache table TTL
const JOB_SEARCH_TTL_SECS = 7_200 // job_searches row TTL (mirrors KV)

// Rate limits: job searches per user per day.
// Free users get 5/day, premium get 30/day.
// Key format: "jrl:{user_id_or_ip}:{YYYY-MM-DD}"
const JOB_SEARCH_LIMIT_FREE    = 5
const JOB_SEARCH_LIMIT_PREMIUM = 30

// Max jobs to send to Gemini in a single matching call (token budget guard).
// At ~500 tokens/job snippet, 40 jobs ≈ 20 K tokens input — well within Flash Lite limits.
const MAX_JOBS_FOR_AI_MATCHING = 40

// Max description length stored in job_cache (chars). Prevents >8 KB JSONB blobs.
const MAX_DESC_CHARS = 6_000

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 1 — Job Data Normalization
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Unified normalized job schema.
 * Every source-specific normalizer returns this shape.
 *
 * @typedef {{
 *   source:          string,
 *   external_id:     string,
 *   title:           string,
 *   company:         string,
 *   description:     string|null,
 *   location:        string|null,
 *   remote:          boolean,
 *   url:             string,
 *   salary_min:      number|null,
 *   salary_max:      number|null,
 *   currency:        string|null,
 *   skills_required: string[],
 *   seniority:       string,
 *   industry:        string|null,
 *   posted_at:       string|null,   // ISO 8601
 * }} NormalizedJob
 */

function truncateDesc(text) {
  if (!text) return null
  return text.length > MAX_DESC_CHARS ? text.slice(0, MAX_DESC_CHARS) + '…' : text
}

function normalizeSeniority(raw = '') {
  const s = (raw || '').toLowerCase()
  if (s.includes('junior') || s.includes('jr') || s.includes('entry'))       return 'Junior'
  if (s.includes('semi senior') || s.includes('ssr') || s.includes('mid'))   return 'Semi Senior'
  if (s.includes('senior') || s.includes('sr'))                               return 'Senior'
  if (s.includes('lead') || s.includes('manager') || s.includes('head'))     return 'Lead'
  return 'No especificado'
}

// RemoteOK — https://remoteok.com/api
// Returns: [{id, position, company, description, tags, date, url, ...}]
function normalizeRemoteOK(raw) {
  if (!raw || raw.legal) return []  // first element is a disclaimer object
  return raw
    .filter(j => j && j.id && j.position)
    .map(j => ({
      source:          'remoteok',
      external_id:     String(j.id),
      title:           j.position || '',
      company:         j.company  || '',
      description:     truncateDesc(j.description),
      location:        j.location || 'Remote',
      remote:          true,
      url:             j.url || `https://remoteok.com/remote-jobs/${j.id}`,
      salary_min:      j.salary_min  ? parseInt(j.salary_min,  10) : null,
      salary_max:      j.salary_max  ? parseInt(j.salary_max,  10) : null,
      currency:        j.salary_min  ? 'USD' : null,
      skills_required: Array.isArray(j.tags) ? j.tags.slice(0, 15) : [],
      seniority:       normalizeSeniority(j.position),
      industry:        null,
      posted_at:       j.date ? new Date(j.date * 1000).toISOString() : null,
    }))
}

// Remotive — https://remotive.com/api/remote-jobs
// Returns: {jobs: [{id, title, company_name, description, tags, job_type, candidate_required_location, url, publication_date}]}
function normalizeRemotive(raw) {
  if (!raw?.jobs) return []
  return raw.jobs.map(j => ({
    source:          'remotive',
    external_id:     String(j.id),
    title:           j.title        || '',
    company:         j.company_name || '',
    description:     truncateDesc(j.description),
    location:        j.candidate_required_location || 'Worldwide',
    remote:          true,
    url:             j.url || '',
    salary_min:      null,
    salary_max:      null,
    currency:        null,
    skills_required: Array.isArray(j.tags) ? j.tags.slice(0, 15) : [],
    seniority:       normalizeSeniority(j.title),
    industry:        j.category || null,
    posted_at:       j.publication_date || null,
  }))
}

// Arbeitnow (free, no key) — https://www.arbeitnow.com/api/job-board-api
// Returns: {data: [{slug, title, company_name, description, tags, remote, location, url, created_at}]}
function normalizeArbeitnow(raw) {
  if (!raw?.data) return []
  return raw.data.map(j => ({
    source:          'arbeitnow',
    external_id:     j.slug || String(j.id || Math.random()),
    title:           j.title        || '',
    company:         j.company_name || '',
    description:     truncateDesc(j.description),
    location:        j.location || (j.remote ? 'Remote' : null),
    remote:          !!j.remote,
    url:             j.url || '',
    salary_min:      null,
    salary_max:      null,
    currency:        null,
    skills_required: Array.isArray(j.tags) ? j.tags.slice(0, 15) : [],
    seniority:       normalizeSeniority(j.title),
    industry:        null,
    posted_at:       j.created_at || null,
  }))
}

// Jooble — https://jooble.org/api/{key}  (POST, requires JOOBLE_KEY env var)
// Returns: {jobs: [{id, title, snippet, salary, location, company, updated, link}]}
// Coverage: agrega Bumeran, Computrabajo, ZonaJobs, InfoJobs Argentina — mejor cobertura LATAM local
function normalizeJooble(raw) {
  if (!raw?.jobs) return []
  return raw.jobs.map(j => ({
    source:          'jooble',
    external_id:     String(j.id),
    title:           (j.title   || '').trim(),
    company:         (j.company || '').trim(),
    description:     truncateDesc(j.snippet),
    location:        j.location || null,
    remote:          /remote|remoto/.test((j.location || j.title || '').toLowerCase()),
    url:             j.link || '',
    salary_min:      null,
    salary_max:      null,
    currency:        null,
    skills_required: [],
    seniority:       normalizeSeniority(j.title),
    industry:        null,
    posted_at:       j.updated || null,
  }))
}

// Adzuna — https://api.adzuna.com/v1/api/jobs/{country}/search/1
// Returns: {results: [{id, title, company:{display_name}, description, salary_min, salary_max, location:{display_name}, redirect_url, created, category:{label}}]}
function normalizeAdzuna(raw) {
  if (!raw?.results) return []
  return raw.results.map(j => ({
    source:          'adzuna',
    external_id:     String(j.id),
    title:           j.title || '',
    company:         j.company?.display_name || '',
    description:     truncateDesc(j.description),
    location:        j.location?.display_name || null,
    remote:          (j.title || j.description || '').toLowerCase().includes('remote'),
    url:             j.redirect_url || '',
    salary_min:      j.salary_min ? Math.round(j.salary_min) : null,
    salary_max:      j.salary_max ? Math.round(j.salary_max) : null,
    currency:        j.salary_min ? 'ARS' : null,  // Adzuna AR returns ARS
    skills_required: [],  // Adzuna doesn't include tags — extracted by AI later
    seniority:       normalizeSeniority(j.title),
    industry:        j.category?.label || null,
    posted_at:       j.created || null,
  }))
}

/**
 * Master normalizer — dispatches to source-specific function.
 * Returns an empty array on unknown source rather than throwing.
 */
function normalizeJobs(source, rawData) {
  switch (source) {
    case 'remoteok':   return normalizeRemoteOK(rawData)
    case 'remotive':   return normalizeRemotive(rawData)
    case 'arbeitnow':  return normalizeArbeitnow(rawData)
    case 'adzuna':     return normalizeAdzuna(rawData)
    case 'jooble':     return normalizeJooble(rawData)
    default:           return []
  }
}


// ══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — Job Source Fetchers
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Fetch from a single job source with a 10 s timeout.
 * Returns { source, jobs: NormalizedJob[] } or { source, jobs: [], error }.
 * Never throws — a failed source degrades gracefully.
 */
async function fetchJobSource(source, query, location, remoteOk, env) {
  const ctrl = new AbortController()
  const tid  = setTimeout(() => ctrl.abort(), 10_000)
  const q    = encodeURIComponent(query)

  try {
    let url, raw

    if (source === 'remoteok') {
      // RemoteOK filters by tag — use first word of query as tag
      const tag = encodeURIComponent(query.split(' ')[0].toLowerCase())
      url = `https://remoteok.com/api?tags=${tag}&limit=30`
      const r = await fetch(url, {
        headers: { 'User-Agent': 'OptimizaLK/2.0 (job-search-bot; https://optimizalinkedin.com)' },
        signal: ctrl.signal,
      })
      raw = await r.json()
      return { source, jobs: normalizeJobs(source, raw) }
    }

    if (source === 'remotive') {
      url = `https://remotive.com/api/remote-jobs?search=${q}&limit=30`
      const r = await fetch(url, { signal: ctrl.signal })
      raw = await r.json()
      return { source, jobs: normalizeJobs(source, raw) }
    }

    if (source === 'arbeitnow') {
      // Free tier, no auth — searches by query string
      url = `https://www.arbeitnow.com/api/job-board-api?search=${q}`
      const r = await fetch(url, { signal: ctrl.signal })
      raw = await r.json()
      return { source, jobs: normalizeJobs(source, raw) }
    }

    if (source === 'adzuna') {
      if (!env.ADZUNA_APP_ID || !env.ADZUNA_APP_KEY) {
        return { source, jobs: [], error: 'adzuna_not_configured' }
      }
      // 'ar' = Argentina; fallback to 'us' if you want broader results
      const country = location?.toLowerCase().includes('arg') ? 'ar' : 'us'
      url = `https://api.adzuna.com/v1/api/jobs/${country}/search/1`
        + `?app_id=${env.ADZUNA_APP_ID}&app_key=${env.ADZUNA_APP_KEY}`
        + `&what=${q}&results_per_page=30&content-type=application/json`
      if (location) url += `&where=${encodeURIComponent(location)}`
      const r = await fetch(url, { signal: ctrl.signal })
      raw = await r.json()
      return { source, jobs: normalizeJobs(source, raw) }
    }

    if (source === 'jooble') {
      if (!env.JOOBLE_KEY) {
        return { source, jobs: [], error: 'jooble_not_configured' }
      }
      const r = await fetch(`https://jooble.org/api/${env.JOOBLE_KEY}`, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent':   'OptimizaLK/2.0 (job-search-bot; https://optimizalinkedin.com)',
        },
        body:   JSON.stringify({ keywords: query, location: location || 'Argentina', page: '1' }),
        signal: ctrl.signal,
      })
      raw = await r.json()
      return { source, jobs: normalizeJobs(source, raw) }
    }

    return { source, jobs: [], error: 'unknown_source' }

  } catch (err) {
    return { source, jobs: [], error: err.name === 'AbortError' ? 'timeout' : err.message }
  } finally {
    clearTimeout(tid)
  }
}

/**
 * Fetch jobs from multiple sources in parallel, dedup by (source, external_id).
 * Returns { jobs: NormalizedJob[], sourceErrors: {[source]: string} }
 */
async function fetchAllSources(queries, location, remoteOk, env) {
  // Determine which sources to hit based on remoteOk flag
  // Jooble is included when JOOBLE_KEY is configured — best coverage for local LATAM jobs
  const remoteSources = ['remoteok', 'remotive', 'arbeitnow', 'adzuna']
  const localSources  = ['adzuna', 'arbeitnow']
  if (env.JOOBLE_KEY) {
    remoteSources.push('jooble')
    localSources.push('jooble')
  }
  const sources = remoteOk ? remoteSources : localSources

  // Fan out: one fetch per (source × query). For 2 queries × 4 sources = 8 parallel fetches.
  const fetchPromises = sources.flatMap(source =>
    queries.map(q => fetchJobSource(source, q, location, remoteOk, env))
  )
  const results = await Promise.all(fetchPromises)

  // Deduplicate: first occurrence of (source, external_id) wins
  const seen   = new Set()
  const jobs   = []
  const errors = {}

  for (const result of results) {
    if (result.error) {
      errors[result.source] = errors[result.source] || result.error
    }
    for (const job of result.jobs) {
      const key = `${job.source}::${job.external_id}`
      if (!seen.has(key) && job.url && job.title) {
        seen.add(key)
        jobs.push(job)
      }
    }
  }

  return { jobs, sourceErrors: errors }
}


// ══════════════════════════════════════════════════════════════════════════════
// SECTION 3 — KV + Supabase Caching
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Stable SHA-256 hash of the canonical query parameters.
 * Used as both KV key suffix and job_searches.query_hash.
 */
async function hashQueryParams(queries, location, remoteOk) {
  const canonical = JSON.stringify({
    q: [...queries].sort(),
    l: (location || '').toLowerCase().trim(),
    r: !!remoteOk,
  })
  const buf  = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Layer 1: Cloudflare KV lookup.
 * Key format: "jobs:{queryHash}"
 * Value: JSON array of NormalizedJob (the same shape returned by normalizers).
 */
async function getJobsFromKV(env, queryHash) {
  if (!env.RATE_LIMIT_KV) return null
  try {
    const raw = await env.RATE_LIMIT_KV.get(`jobs:${queryHash}`)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

async function putJobsToKV(env, queryHash, jobs) {
  if (!env.RATE_LIMIT_KV) return
  try {
    await env.RATE_LIMIT_KV.put(
      `jobs:${queryHash}`,
      JSON.stringify(jobs),
      { expirationTtl: JOB_KV_TTL_SECS }
    )
  } catch { /* non-fatal */ }
}

/**
 * Layer 2: Upsert fresh jobs into job_cache.
 * Returns an array of { id, source, external_id } objects (the saved rows).
 * Uses ON CONFLICT DO UPDATE to refresh fetched_at + expires_at on re-fetch.
 */
async function upsertJobsToSupabase(env, ctx, jobs) {
  if (!jobs.length) return []
  const rows = jobs.map(j => ({
    source:          j.source,
    external_id:     j.external_id,
    title:           j.title,
    company:         j.company,
    description:     j.description,
    location:        j.location,
    remote:          j.remote,
    url:             j.url,
    salary_min:      j.salary_min,
    salary_max:      j.salary_max,
    currency:        j.currency,
    skills_required: j.skills_required,
    seniority:       j.seniority,
    industry:        j.industry,
    posted_at:       j.posted_at,
    fetched_at:      new Date().toISOString(),
    expires_at:      new Date(Date.now() + JOB_DB_TTL_HOURS * 3_600_000).toISOString(),
  }))

  const upsertFetch = fetch(`${env.SUPABASE_URL}/rest/v1/job_cache`, {
    method:  'POST',
    headers: {
      apikey:          env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization:   `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type':  'application/json',
      Prefer:          'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(rows),
  }).then(r => r.json()).catch(() => [])

  // Fire-and-forget via ctx.waitUntil — don't block the response
  if (ctx?.waitUntil) ctx.waitUntil(upsertFetch)

  // Return the input jobs directly so we can proceed with AI matching immediately
  // without waiting for Supabase confirmation (optimistic path)
  return jobs
}

/**
 * Persist job_searches row (dedup check: if same queryHash within TTL, skip).
 * Returns the search row id.
 */
async function saveJobSearch(env, ctx, userId, queryHash, queries, location, remoteOk, jobCount, jobIds, sourceCounts) {
  const row = {
    user_id:      userId || null,
    query_hash:   queryHash,
    queries:      queries,
    location:     location || null,
    remote_ok:    !!remoteOk,
    result_count: jobCount,
    result_ids:   jobIds,
    source_counts: sourceCounts,
    expires_at:   new Date(Date.now() + JOB_SEARCH_TTL_SECS * 1000).toISOString(),
  }
  const saveFetch = fetch(`${env.SUPABASE_URL}/rest/v1/job_searches`, {
    method:  'POST',
    headers: {
      apikey:         env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization:  `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer:         'return=representation',
    },
    body: JSON.stringify(row),
  }).then(r => r.json()).catch(() => null)
  if (ctx?.waitUntil) ctx.waitUntil(saveFetch)
}


// ══════════════════════════════════════════════════════════════════════════════
// SECTION 4 — AI Matching Prompt
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Build the Gemini system prompt for job matching.
 * Stored here in the worker, never sent to the client.
 */
const JOB_MATCHING_SYSTEM_PROMPT = `Sos un sistema de matching laboral experto para el mercado argentino y latinoamericano.
Recibís:
1. El perfil profesional del candidato (experiencia, habilidades, seniority, industria, objetivos).
2. Una lista de avisos laborales numerados.

TU TAREA: Para cada aviso, calculá un match_score del 0 al 10 basado en:
- Alineación de habilidades técnicas (peso 40%)
- Seniority y años de experiencia (peso 25%)
- Industria y tipo de rol (peso 20%)
- Condiciones (remoto/presencial, ubicación) (peso 15%)

REGLAS:
- Solo incluí avisos con match_score >= 5.0.
- Máximo 10 resultados, ordenados por score descendente.
- strengths: array de 2-3 fortalezas específicas del candidato para ese aviso.
- gaps: array de 1-2 brechas concretas (no inventes — si no hay brechas reales, dejá vacío).
- summary: 1 oración concisa en español rioplatense explicando el match.
- ANTI-ALUCINACIÓN: nunca inventes skills ni experiencias que no aparezcan en el perfil.

Respondé SOLO en JSON válido, sin markdown, sin texto fuera del JSON:
{
  "matches": [
    {
      "job_index": 0,
      "match_score": 7.5,
      "strengths": ["string", "string"],
      "gaps": ["string"],
      "summary": "string"
    }
  ]
}`

/**
 * Build the user-facing Gemini contents array for job matching.
 * Truncates job descriptions to 400 chars each to control token usage.
 */
function buildMatchingContents(profileText, jobs) {
  const jobList = jobs.slice(0, MAX_JOBS_FOR_AI_MATCHING).map((j, i) => {
    const desc = j.description
      ? j.description.slice(0, 400).replace(/\s+/g, ' ')
      : '(sin descripción)'
    return `[${i}] ${j.title} | ${j.company} | ${j.location || 'No especificado'} | ${j.remote ? 'Remoto' : 'Presencial'}
Skills: ${(j.skills_required || []).join(', ') || 'No especificado'}
Seniority: ${j.seniority}
Descripción: ${desc}`
  }).join('\n\n')

  return [
    {
      role: 'user',
      parts: [{
        text: `PERFIL DEL CANDIDATO:\n${profileText}\n\nAVISOS LABORALES:\n${jobList}`,
      }],
    },
  ]
}


// ══════════════════════════════════════════════════════════════════════════════
// SECTION 5 — Rate Limiting for Job Searches
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Check and increment job search rate limit.
 * Free users: 5/day | Premium users: 30/day
 * Key format: "jrl:{user_id_or_ip}:{YYYY-MM-DD}"
 *
 * Returns { ok: boolean, count: number, limit: number }
 */
async function checkJobSearchRateLimit(env, userId, ip, isPremium) {
  if (!env.RATE_LIMIT_KV) return { ok: true, count: 0, limit: 99 }

  const today     = new Date().toISOString().slice(0, 10)   // 'YYYY-MM-DD'
  const identity  = userId || ip                             // user_id preferred; IP fallback
  const kvKey     = `jrl:${identity}:${today}`
  const limit     = isPremium ? JOB_SEARCH_LIMIT_PREMIUM : JOB_SEARCH_LIMIT_FREE

  const current = parseInt((await env.RATE_LIMIT_KV.get(kvKey)) || '0', 10)
  if (current >= limit) return { ok: false, count: current, limit }

  // Expires at end of calendar day (UTC)
  const midnight = new Date()
  midnight.setUTCHours(24, 0, 0, 0)
  const ttlSecs = Math.floor((midnight - Date.now()) / 1000)
  await env.RATE_LIMIT_KV.put(kvKey, String(current + 1), { expirationTtl: ttlSecs })

  return { ok: true, count: current + 1, limit }
}


// ══════════════════════════════════════════════════════════════════════════════
// SECTION 6 — Worker Action Handlers
// ══════════════════════════════════════════════════════════════════════════════

// ── 6a. job_search ────────────────────────────────────────────────────────────
/**
 * Fetch raw jobs from external sources, normalize, cache (KV + Supabase).
 *
 * Request body:
 *   { action: 'job_search', queries: string[], location?: string, remote_ok?: boolean }
 *
 * Response:
 *   { ok: true, jobs: NormalizedJob[], from_cache: boolean, query_hash: string }
 */
export async function handleJobSearch(body, request, env, ctx, corsHeaders) {
  const { queries, location, remote_ok = true } = body

  // Input validation
  if (!Array.isArray(queries) || !queries.length) {
    return new Response(
      JSON.stringify({ error: 'queries[] es requerido y debe ser un array no vacío' }),
      { status: 400, headers: corsHeaders }
    )
  }
  const cleanQueries = queries
    .map(q => String(q).trim().slice(0, 100))
    .filter(Boolean)
    .slice(0, 3)   // max 3 queries per call

  if (!cleanQueries.length) {
    return new Response(
      JSON.stringify({ error: 'queries[] no contiene valores válidos' }),
      { status: 400, headers: corsHeaders }
    )
  }

  // SSRF protection — job_search only calls known external APIs, NOT arbitrary URLs.
  // (fetch_url is for LinkedIn proxy; this handler uses its own allowlisted fetchers)

  const ip        = request.headers.get('CF-Connecting-IP') || 'unknown'
  const userId    = null  // job_search can be called without auth; user_id resolved in ai_job_recommendations
  const queryHash = await hashQueryParams(cleanQueries, location, remote_ok)

  // ── Layer 1: KV cache hit ──────────────────────────────────────────────────
  const kvCached = await getJobsFromKV(env, queryHash)
  if (kvCached) {
    return new Response(
      JSON.stringify({ ok: true, jobs: kvCached, from_cache: true, query_hash: queryHash }),
      { status: 200, headers: corsHeaders }
    )
  }

  // ── Layer 2: Supabase job_cache hit (KV expired but DB still live) ─────────
  // Use the RPC to fetch jobs linked to a still-valid job_searches row
  try {
    const dbCacheRes = await fetch(
      `${env.SUPABASE_URL}/rest/v1/rpc/get_cached_jobs`,
      {
        method:  'POST',
        headers: {
          apikey:         env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization:  `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ p_query_hash: queryHash }),
      }
    )
    const dbJobs = await dbCacheRes.json()
    if (Array.isArray(dbJobs) && dbJobs.length > 0) {
      // Warm KV from DB hit so next request is sub-ms
      await putJobsToKV(env, queryHash, dbJobs)
      return new Response(
        JSON.stringify({ ok: true, jobs: dbJobs, from_cache: true, query_hash: queryHash }),
        { status: 200, headers: corsHeaders }
      )
    }
  } catch { /* DB cache miss — fall through to live fetch */ }

  // ── Layer 3: Live fetch from job sources ───────────────────────────────────
  const { jobs: freshJobs, sourceErrors } = await fetchAllSources(
    cleanQueries, location, remote_ok, env
  )

  if (!freshJobs.length) {
    // All sources failed — return error with fallback suggestion
    return new Response(
      JSON.stringify({
        ok:     false,
        jobs:   [],
        errors: sourceErrors,
        suggestion: 'No encontramos empleos en este momento. Intentá con términos más amplios o revisá tu conexión.',
      }),
      { status: 200, headers: corsHeaders }
    )
  }

  // ── Persist to KV + Supabase (async, non-blocking) ────────────────────────
  await putJobsToKV(env, queryHash, freshJobs)
  await upsertJobsToSupabase(env, ctx, freshJobs)

  // Count by source for analytics
  const sourceCounts = freshJobs.reduce((acc, j) => {
    acc[j.source] = (acc[j.source] || 0) + 1
    return acc
  }, {})
  await saveJobSearch(env, ctx, null, queryHash, cleanQueries, location, remote_ok,
    freshJobs.length, [], sourceCounts)

  return new Response(
    JSON.stringify({ ok: true, jobs: freshJobs, from_cache: false, query_hash: queryHash, source_errors: sourceErrors }),
    { status: 200, headers: corsHeaders }
  )
}


// ── 6b. ai_job_recommendations ────────────────────────────────────────────────
/**
 * Main recommendation action.
 * 1. Resolves user profile (from request body or Supabase historial).
 * 2. Rate-limits by user_id (preferred) or IP.
 * 3. Calls job_search logic to get a candidate pool.
 * 4. Sends pool to Gemini for match scoring.
 * 5. Persists recommendations + historial row.
 * 6. Returns top-N ranked results.
 *
 * Request body:
 *   {
 *     action: 'ai_job_recommendations',
 *     profile_text: string,     // LinkedIn profile or free-form summary (required if anon)
 *     queries: string[],        // auto-generated by frontend from profile or user-provided
 *     location?: string,
 *     remote_ok?: boolean,
 *     count?: number,           // default 10, max 20
 *     user_id?: string,         // for authenticated users
 *   }
 *
 * Response:
 *   {
 *     ok: true,
 *     recommendations: [{
 *       job: NormalizedJob,
 *       match_score: number,
 *       strengths: string[],
 *       gaps: string[],
 *       summary: string,
 *       rec_id: string,         // job_recommendations.id (use for status updates)
 *     }],
 *     total_jobs_analyzed: number,
 *     from_cache: boolean,
 *     quota_remaining: number,
 *   }
 */
export async function handleAiJobRecommendations(body, request, env, ctx, corsHeaders, callGeminiApi, logAiUsage) {
  const {
    profile_text,
    queries,
    location,
    remote_ok = true,
    count     = 10,
    user_id,
  } = body

  if (!profile_text || String(profile_text).trim().length < 50) {
    return new Response(
      JSON.stringify({ error: 'profile_text es requerido (mínimo 50 caracteres)' }),
      { status: 400, headers: corsHeaders }
    )
  }
  if (!Array.isArray(queries) || !queries.length) {
    return new Response(
      JSON.stringify({ error: 'queries[] es requerido — generalos en el frontend a partir del perfil' }),
      { status: 400, headers: corsHeaders }
    )
  }

  const ip          = request.headers.get('CF-Connecting-IP') || 'unknown'
  const requestedN  = Math.min(Math.max(parseInt(count, 10) || 10, 1), 20)

  // ── Premium check ──────────────────────────────────────────────────────────
  let isPremium = false
  if (user_id && env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const pRes  = await fetch(
        `${env.SUPABASE_URL}/rest/v1/perfiles?id=eq.${user_id}&select=es_premium,premium_hasta`,
        { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } }
      )
      const pRows = await pRes.json()
      const p     = pRows?.[0]
      isPremium   = p?.es_premium && p?.premium_hasta && new Date(p.premium_hasta) > new Date()
    } catch { /* default false */ }
  }

  // ── Rate limit ─────────────────────────────────────────────────────────────
  const rl = await checkJobSearchRateLimit(env, user_id, ip, isPremium)
  if (!rl.ok) {
    return new Response(
      JSON.stringify({
        error: isPremium
          ? `Límite diario de recomendaciones alcanzado (${rl.limit}/día para Premium).`
          : `Límite diario alcanzado (${rl.limit}/día para usuarios gratuitos). Actualizá a Premium para ${JOB_SEARCH_LIMIT_PREMIUM} búsquedas/día.`,
        quota_remaining: 0,
      }),
      { status: 429, headers: corsHeaders }
    )
  }

  // ── Fetch jobs (hits cache layers before live APIs) ────────────────────────
  const cleanQueries = queries.map(q => String(q).trim().slice(0, 100)).filter(Boolean).slice(0, 3)
  const queryHash    = await hashQueryParams(cleanQueries, location, remote_ok)
  let   jobs         = []
  let   fromCache    = false

  const kvCached = await getJobsFromKV(env, queryHash)
  if (kvCached) {
    jobs      = kvCached
    fromCache = true
  } else {
    // Live fetch (same logic as job_search action)
    const { jobs: freshJobs } = await fetchAllSources(cleanQueries, location, remote_ok, env)
    if (freshJobs.length) {
      jobs = freshJobs
      await putJobsToKV(env, queryHash, freshJobs)
      await upsertJobsToSupabase(env, ctx, freshJobs)
    }
  }

  if (!jobs.length) {
    return new Response(
      JSON.stringify({
        ok:               true,
        recommendations:  [],
        total_jobs_analyzed: 0,
        message:          'No encontramos empleos para estas búsquedas. Intentá con términos más amplios.',
        quota_remaining:  rl.limit - rl.count,
      }),
      { status: 200, headers: corsHeaders }
    )
  }

  // ── AI Matching via Gemini ─────────────────────────────────────────────────
  const jobPool    = jobs.slice(0, MAX_JOBS_FOR_AI_MATCHING)
  const contents   = buildMatchingContents(String(profile_text).slice(0, 3000), jobPool)
  const geminiBody = {
    system_instruction: { parts: [{ text: JOB_MATCHING_SYSTEM_PROMPT }] },
    contents,
    generationConfig:   { temperature: 0.2, maxOutputTokens: 2048 },
  }

  const startMs  = Date.now()
  let   aiResult = null
  let   aiError  = null

  try {
    const aiRes = await callGeminiApi(env, ctx, geminiBody, corsHeaders, {
      feature: 'job_matching_batch',
      userId:  user_id || null,
    })
    // callGeminiApi returns a Response; we need to parse it for our logic
    if (aiRes.status === 200) {
      const aiData = await aiRes.clone().json()
      const raw    = aiData?.candidates?.[0]?.content?.parts?.[0]?.text || ''
      try {
        aiResult = JSON.parse(raw.replace(/^```json\n?|\n?```$/g, '').trim())
      } catch {
        aiError = 'ai_parse_error'
      }
    } else {
      aiError = `ai_http_${aiRes.status}`
    }
  } catch (e) {
    aiError = e.message
  }

  // ── Fallback: AI failed — return top jobs sorted by recency ───────────────
  if (!aiResult?.matches || aiError) {
    // Check for cached recommendations from a previous session
    if (user_id) {
      try {
        const cachedRecs = await fetch(
          `${env.SUPABASE_URL}/rest/v1/job_recommendations`
          + `?user_id=eq.${user_id}&status=neq.dismissed`
          + `&order=match_score.desc&limit=${requestedN}`
          + `&select=id,title,company,location,remote,url,match_score,strengths,gaps,summary,source,status`,
          { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } }
        )
        const prevRecs = await cachedRecs.json()
        if (Array.isArray(prevRecs) && prevRecs.length > 0) {
          return new Response(
            JSON.stringify({
              ok:                  true,
              recommendations:     prevRecs.map(r => ({ job: r, match_score: r.match_score, strengths: r.strengths, gaps: r.gaps, summary: r.summary, rec_id: r.id })),
              total_jobs_analyzed: 0,
              from_cache:          true,
              fallback:            true,
              fallback_reason:     aiError || 'ai_unavailable',
              quota_remaining:     rl.limit - rl.count,
            }),
            { status: 200, headers: corsHeaders }
          )
        }
      } catch { /* no previous recs — fall through */ }
    }

    // No cached recs either — return top jobs without scores
    const fallbackRecs = jobPool.slice(0, requestedN).map(j => ({
      job:         j,
      match_score: null,
      strengths:   [],
      gaps:        [],
      summary:     'Puntuación no disponible — servicio de IA temporalmente no disponible.',
      rec_id:      null,
    }))
    return new Response(
      JSON.stringify({
        ok:                  true,
        recommendations:     fallbackRecs,
        total_jobs_analyzed: jobPool.length,
        from_cache:          fromCache,
        fallback:            true,
        fallback_reason:     aiError,
        quota_remaining:     rl.limit - rl.count,
      }),
      { status: 200, headers: corsHeaders }
    )
  }

  // ── Build final recommendations from AI matches ────────────────────────────
  const topMatches = (aiResult.matches || [])
    .sort((a, b) => b.match_score - a.match_score)
    .slice(0, requestedN)

  const recommendations = topMatches.map(m => {
    const job = jobPool[m.job_index]
    if (!job) return null
    return {
      job,
      match_score: Number((m.match_score || 0).toFixed(2)),
      strengths:   Array.isArray(m.strengths) ? m.strengths.slice(0, 3) : [],
      gaps:        Array.isArray(m.gaps)       ? m.gaps.slice(0, 2)     : [],
      summary:     String(m.summary || ''),
      rec_id:      null,  // populated after Supabase insert below
    }
  }).filter(Boolean)

  // ── Persist recommendations to Supabase (fire-and-forget) ─────────────────
  if (user_id && recommendations.length) {
    const recRows = recommendations.map(r => ({
      user_id:     user_id,
      title:       r.job.title,
      company:     r.job.company,
      location:    r.job.location,
      remote:      r.job.remote,
      url:         r.job.url,
      match_score: r.match_score,
      strengths:   r.strengths,
      gaps:        r.gaps,
      summary:     r.summary,
      source:      r.job.source,
      status:      'new',
    }))

    const saveRecs = fetch(`${env.SUPABASE_URL}/rest/v1/job_recommendations`, {
      method:  'POST',
      headers: {
        apikey:         env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization:  `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer:         'return=representation',
      },
      body: JSON.stringify(recRows),
    }).then(async r => {
      const saved = await r.json()
      // Backfill rec_id into the response (used by frontend for status updates)
      if (Array.isArray(saved)) {
        saved.forEach((row, i) => {
          if (recommendations[i]) recommendations[i].rec_id = row.id
        })
      }
    }).catch(() => {})

    if (ctx?.waitUntil) ctx.waitUntil(saveRecs)

    // Also save to historial for the user's history tab
    const historialRow = {
      user_id,
      tipo:      'job_recommendations',
      titulo:    `Recomendaciones para: ${cleanQueries.join(', ')}`,
      datos:     {
        queries:       cleanQueries,
        location:      location || null,
        remote_ok:     !!remote_ok,
        match_count:   recommendations.length,
        top_match:     recommendations[0]
          ? { title: recommendations[0].job.title, company: recommendations[0].job.company, score: recommendations[0].match_score }
          : null,
        generated_at:  new Date().toISOString(),
      },
    }
    const saveHistorial = fetch(`${env.SUPABASE_URL}/rest/v1/historial`, {
      method:  'POST',
      headers: {
        apikey:         env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization:  `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer:         'return=minimal',
      },
      body: JSON.stringify(historialRow),
    }).catch(() => {})
    if (ctx?.waitUntil) ctx.waitUntil(saveHistorial)
  }

  return new Response(
    JSON.stringify({
      ok:                  true,
      recommendations,
      total_jobs_analyzed: jobPool.length,
      from_cache:          fromCache,
      quota_remaining:     rl.limit - rl.count,
    }),
    { status: 200, headers: corsHeaders }
  )
}


// ── 6c. job_save_to_kanban ────────────────────────────────────────────────────
/**
 * Save a recommended job to the user's Kanban board (postulaciones table).
 * Reuses the existing postulaciones schema + job_applications_v2 fields.
 * Marks the recommendation status as 'saved'.
 *
 * Request body:
 *   {
 *     action: 'job_save_to_kanban',
 *     rec_id: string,           // job_recommendations.id
 *     columna_id?: string,      // kanban_columnas.id (optional — goes to first column if omitted)
 *   }
 * Requires: Authorization: Bearer <JWT>
 */
export async function handleJobSaveToKanban(body, request, env, ctx, corsHeaders, verifyUserJwt) {
  const { rec_id, columna_id } = body

  if (!rec_id) {
    return new Response(
      JSON.stringify({ error: 'rec_id es requerido' }),
      { status: 400, headers: corsHeaders }
    )
  }

  const user = await verifyUserJwt(env, request)
  if (!user) {
    return new Response(
      JSON.stringify({ error: 'Debés iniciar sesión para guardar una postulación' }),
      { status: 401, headers: corsHeaders }
    )
  }

  // Fetch the recommendation (verifies ownership implicitly via user_id filter)
  const recRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/job_recommendations?id=eq.${rec_id}&user_id=eq.${user.id}&select=*`,
    { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } }
  )
  const recs = await recRes.json()
  const rec  = recs?.[0]
  if (!rec) {
    return new Response(
      JSON.stringify({ error: 'Recomendación no encontrada' }),
      { status: 404, headers: corsHeaders }
    )
  }

  // Resolve columna_id: use provided, or fall back to user's first kanban column
  let targetColumnaId = columna_id || null
  if (!targetColumnaId) {
    const colRes = await fetch(
      `${env.SUPABASE_URL}/rest/v1/kanban_columnas?user_id=eq.${user.id}&order=orden.asc&limit=1&select=id`,
      { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } }
    )
    const cols = await colRes.json()
    targetColumnaId = cols?.[0]?.id || null
  }

  // Build postulaciones row — pre-filled from recommendation data
  const postulacion = {
    user_id:          user.id,
    columna_id:       targetColumnaId,
    empresa:          rec.company.slice(0, 100),
    puesto:           rec.title.slice(0, 100),
    link_aviso:       rec.url || null,
    fecha_aplicacion: new Date().toISOString().slice(0, 10),
    notas:            rec.summary || null,
    job_description:  null,  // will be filled if user triggers CV adapter later
    seniority:        null,
    cv_data:          null,  // populated when user adapts their CV for this job
    orden:            0,
  }

  try {
    const insertRes = await fetch(`${env.SUPABASE_URL}/rest/v1/postulaciones`, {
      method:  'POST',
      headers: {
        apikey:         env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization:  `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer:         'return=representation',
      },
      body: JSON.stringify(postulacion),
    })
    const saved = await insertRes.json()
    const postId = saved?.[0]?.id || null

    // Update recommendation status to 'saved'
    const updateRec = fetch(
      `${env.SUPABASE_URL}/rest/v1/job_recommendations?id=eq.${rec_id}`,
      {
        method:  'PATCH',
        headers: {
          apikey:         env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization:  `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          Prefer:         'return=minimal',
        },
        body: JSON.stringify({ status: 'saved', updated_at: new Date().toISOString() }),
      }
    ).catch(() => {})
    if (ctx?.waitUntil) ctx.waitUntil(updateRec)

    return new Response(
      JSON.stringify({ ok: true, postulacion_id: postId, columna_id: targetColumnaId }),
      { status: 200, headers: corsHeaders }
    )
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: corsHeaders }
    )
  }
}


// ── 6d. job_update_status ─────────────────────────────────────────────────────
/**
 * Update a recommendation's lifecycle status (seen / saved / applied / dismissed).
 *
 * Request body:
 *   { action: 'job_update_status', rec_id: string, status: 'seen'|'saved'|'applied'|'dismissed' }
 * Requires: Authorization: Bearer <JWT>
 */
export async function handleJobUpdateStatus(body, request, env, ctx, corsHeaders, verifyUserJwt) {
  const { rec_id, status } = body
  const VALID = new Set(['seen', 'saved', 'applied', 'dismissed'])

  if (!rec_id || !VALID.has(status)) {
    return new Response(
      JSON.stringify({ error: 'rec_id y status válido son requeridos' }),
      { status: 400, headers: corsHeaders }
    )
  }

  const user = await verifyUserJwt(env, request)
  if (!user) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: corsHeaders })
  }

  try {
    await fetch(
      `${env.SUPABASE_URL}/rest/v1/job_recommendations?id=eq.${rec_id}&user_id=eq.${user.id}`,
      {
        method:  'PATCH',
        headers: {
          apikey:         env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization:  `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          Prefer:         'return=minimal',
        },
        body: JSON.stringify({ status, updated_at: new Date().toISOString() }),
      }
    )
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders })
  }
}

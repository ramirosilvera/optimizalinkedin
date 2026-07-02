// ── Core worker constants ─────────────────────────────────────────────────────
export const WORKER_VERSION     = '2.6.9'
export const ALLOWED_MODELS     = new Set(['gemini-2.5-flash-lite', 'gemini-2.5-flash'])
export const DEFAULT_MODEL      = 'gemini-2.5-flash-lite'
export const PREMIUM_MATCH_MODEL = 'gemini-2.5-flash'
export const GEMINI_TIMEOUT_MS  = 18_000  // must be < outer race (20s) so inner abort fires first and logAiUsage runs
export const MAX_BODY_BYTES     = 2 * 1024 * 1024
export const GEMINI_MAX_RETRIES = 2
// Single source of truth — was redefined 4× across upsert/filter functions
export const ATS_SOURCE_SET = new Set(['greenhouse','lever','smartrecruiters','ashby','workable','teamtailor','recruitee','personio','workday'])
export const ALLOWED_ORIGINS = new Set([
  'https://optimizalinkedin.com',
  'https://ramirosilvera.github.io',
  'http://localhost:5173',
  'http://localhost:4173',
])
export const WORKER_NOTIFICATION_URL = 'https://linkedin-optimizer-proxy.raa1990-rs.workers.dev/mp-webhook'
export const BACK_URL = 'https://optimizalinkedin.com/?premium=ok'

// ── Gemini quota constants (Paid Tier 1) ─────────────────────────────────────
export const GEMINI_QUOTA = {
  RPD: 10_000,
  RPM: 5_000,
  TPM: 5_000_000,
}

// ── Rate limits per action (requests / hour / IP) ────────────────────────────
export const RATE_LIMITS = {
  analyze_linkedin:    3,
  generate_cv:         3,
  cv_quality:          6,
  cv_pre_questions:    3,
  interview_questions: 4,
  interview_feedback:  5,
  interview_chat:      40,
  star_feedback:       10,
  job_adapter:         3,
  linkedin_growth:     5,
  optimize_cv:         2,
  cv_optimize_consult: 4,
  generate_cv_full:    2,
  _raw_proxy:          5,
  job_search:          10,
  job_save_to_kanban:  20,
  job_update_status:   60,
}

export const DAILY_IP_CAP = 50

// ── Admin validation ──────────────────────────────────────────────────────────
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const ADMIN_ACTION_LIMITS = {
  grant_premium:  50,
  revoke_premium: 50,
  crm_export:     10,
  create_promo:   20,
}

// ── Radar Laboral constants ───────────────────────────────────────────────────
export const JOB_KV_TTL_SECS     = 1_800
export const JOB_DB_TTL_HOURS    = 2
export const JOB_SEARCH_TTL_SECS = 1_800
export const ATS_KV_TTL_SECS     = 79_200
export const ATS_DB_TTL_HOURS    = 40
export const JREC_KV_TTL_SECS    = 3_600
export const JREC_PROMPT_VERSION = 'v25'   // bumped: sanitizeText on job content — strips HTML/URLs/control chars, desc 700→400 chars

export const JOB_SEARCH_LIMIT_FREE    = 1
export const JOB_SEARCH_LIMIT_PREMIUM = 5

export const MAX_JOBS_PREMIUM         = 80
export const MAX_JOBS_FREE            = 80  // same pool as premium — free gets full quality, just 1x/month
export const MAX_JOBS_FOR_AI_MATCHING = MAX_JOBS_FREE

export const MAX_DESC_CHARS = 6_000

export const EXPANSION_THRESHOLD  = 8.0
export const EXPANSION_MIN_HQ     = 3
export const EXPANSION_TIMEOUT_MS = 8_000
export const EXPANSION_GEMINI_MS  = 8_000

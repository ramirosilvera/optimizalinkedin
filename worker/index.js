import {
  WORKER_VERSION, ALLOWED_MODELS, DEFAULT_MODEL, PREMIUM_MATCH_MODEL, GEMINI_TIMEOUT_MS, MAX_BODY_BYTES,
  GEMINI_MAX_RETRIES, ATS_SOURCE_SET, ALLOWED_ORIGINS, WORKER_NOTIFICATION_URL, BACK_URL,
  GEMINI_QUOTA, RATE_LIMITS, DAILY_IP_CAP, UUID_RE, ADMIN_ACTION_LIMITS,
  JOB_KV_TTL_SECS, JOB_DB_TTL_HOURS, JOB_SEARCH_TTL_SECS, ATS_KV_TTL_SECS, ATS_DB_TTL_HOURS,
  JREC_KV_TTL_SECS, JREC_PROMPT_VERSION, JOB_SEARCH_LIMIT_FREE, JOB_SEARCH_LIMIT_PREMIUM,
  MAX_JOBS_PREMIUM, MAX_JOBS_FREE, MAX_JOBS_FOR_AI_MATCHING, MAX_DESC_CHARS,
  EXPANSION_THRESHOLD, EXPANSION_MIN_HQ, EXPANSION_TIMEOUT_MS, EXPANSION_GEMINI_MS,
} from './src/constants.js'
import { BULLET_WRITING_RULES, AI_SYSTEM_PROMPTS } from './src/prompts/cv.js'
import { JOB_MATCHING_SYSTEM_PROMPT, buildMatchingContents } from './src/prompts/jobMatching.js'
import {
  truncateDesc, normalizeSeniority, stripHtml, extractRelevantSection,
  SKILLS_KEYWORDS, extractSkillsFromText, normalizeJobUrl,
  SKILLS_TAXONOMY, SKILL_SYNONYMS, expandProfileSkills,
} from './src/utils/jobHelpers.js'
import { serperGeoConfig, geoCompatibilityScore } from './src/utils/geo.js'
import {
  normalizeRemoteOK, normalizeRemotive, normalizeJobicy, normalizeJooble, normalizeAdzuna,
  normalizeGetOnBoard, normalizeHimalayas, normalizeArbeitnow, normalizeWorkable, normalizeTeamtailor,
  normalizeRecruitee, normalizePersonio, normalizeWorkday, normalizeSerper,
  normalizeGreenhouse, normalizeLever, normalizeSmartRecruiters, normalizeAshby,
  normalizeJobs,
} from './src/jobs/normalizers.js'
import {
  FAMILY_TITLE_SIGNALS, applyPreFilter, deduplicateJobs, canonicalJobHash,
} from './src/jobs/matching.js'
import {
  inferProfessionFamily, extractCandidateLocation,
  detectProfessionFamilySync, buildHeadhunterQueries,
} from './src/jobs/profession.js'
import { extractProfileIntelligence } from './src/radar/profileIntelligence.js'
import { enrichJobs } from './src/radar/enrichment.js'
import { rerankTop10 } from './src/radar/reranking.js'

async function checkRateLimit(env, ip, actionKey) {
  if (!env.RATE_LIMIT_KV) return { ok: true }

  // 1. Per-action hourly limit (existing)
  const limit = RATE_LIMITS[actionKey]
  if (limit) {
    const hourKey = `rl:${ip}:${actionKey}`
    const hourCount = parseInt((await env.RATE_LIMIT_KV.get(hourKey)) || '0', 10)
    if (hourCount >= limit) return { ok: false, count: hourCount, limit, reason: 'hourly' }
    await env.RATE_LIMIT_KV.put(hourKey, String(hourCount + 1), { expirationTtl: 3600 })
  }

  // 2. Daily total cap per IP (all features combined) — blocks budget-drain attacks
  const dayKey = `rl:day:${ip}`
  const dayCount = parseInt((await env.RATE_LIMIT_KV.get(dayKey)) || '0', 10)
  if (dayCount >= DAILY_IP_CAP) return { ok: false, count: dayCount, limit: DAILY_IP_CAP, reason: 'daily' }
  await env.RATE_LIMIT_KV.put(dayKey, String(dayCount + 1), { expirationTtl: 86400 })

  return { ok: true }
}

// ── Gemini API helper ─────────────────────────────────────────────────────────
async function callGeminiApi(env, ctx, geminiBody, corsHeaders, { feature = 'unknown', userId = null, model = null, timeoutMs = null } = {}) {
  const modelName = model || DEFAULT_MODEL
  const startMs = Date.now()
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs || GEMINI_TIMEOUT_MS)
  const geminiKeys = (env.GEMINI_API_KEYS || env.GEMINI_API_KEY || '').split(',').map(k => k.trim()).filter(Boolean)

  let res = null
  let usedKeyIndex = 0
  let retryCount = 0

  try {
    // Phase 1: rotate through keys on 429 (note: all keys share the same GCP project quota)
    for (let i = 0; i < geminiKeys.length; i++) {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiKeys[i]}`,
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(geminiBody), signal: controller.signal }
      )
      if (res.status !== 429) { usedKeyIndex = i; break }
      retryCount++
    }

    // Phase 2: retry on 5xx with exponential backoff
    for (let attempt = 0; attempt < GEMINI_MAX_RETRIES && res.status >= 500; attempt++) {
      await new Promise(r => setTimeout(r, (attempt + 1) * 1500))
      const key = geminiKeys[attempt % geminiKeys.length]
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${key}`,
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(geminiBody), signal: controller.signal }
      )
      retryCount++
    }
  } catch (err) {
    clearTimeout(timeoutId)
    const isTimeout = err.name === 'AbortError'
    logAiUsage(env, ctx, {
      type: 'failure', feature, userId, model: modelName,
      durationMs: Date.now() - startMs, statusCode: 504,
      errorType: isTimeout ? 'timeout' : 'network',
      retryCount, apiKeyAlias: `key_${usedKeyIndex + 1}`,
    })
    const msg = isTimeout ? 'El servicio de IA tardó demasiado. Intentá de nuevo.' : 'Error de conexión con el servicio de IA.'
    return new Response(JSON.stringify({ error: msg }), { status: 504, headers: corsHeaders })
  }

  // Parse body before clearing timeout so abort protection covers the full response
  const data = await res.json().catch(() => ({ error: 'Respuesta inválida del servicio de IA.' }))
  clearTimeout(timeoutId)

  if (res.status === 200) {
    logAiUsage(env, ctx, {
      type: 'success', feature, userId, model: modelName,
      inputTokens:    data.usageMetadata?.promptTokenCount     ?? null,
      outputTokens:   data.usageMetadata?.candidatesTokenCount ?? null,
      thinkingTokens: data.usageMetadata?.thoughtsTokenCount   ?? null,
      durationMs: Date.now() - startMs, statusCode: 200,
      retryCount, apiKeyAlias: `key_${usedKeyIndex + 1}`,
    })
  } else {
    // Parse retryDelay from google.rpc.RetryInfo — distinguishes RPM (seconds) from RPD (hours)
    let retryDelaySecs = null
    let quotaType = null
    if (res.status === 429) {
      try {
        const retryInfo = data?.error?.details?.find(d => d['@type']?.includes('RetryInfo'))
        if (retryInfo?.retryDelay) {
          retryDelaySecs = parseInt(retryInfo.retryDelay.replace('s', ''), 10) || null
        }
        const quotaFailure = data?.error?.details?.find(d => d['@type']?.includes('QuotaFailure'))
        const quotaId = quotaFailure?.violations?.[0]?.quotaId || ''
        quotaType = quotaId.includes('PerDay') ? 'daily' : quotaId.includes('PerMinute') ? 'minute' : null
      } catch { /* non-fatal */ }
    }
    logAiUsage(env, ctx, {
      type: 'failure', feature, userId, model: modelName,
      durationMs: Date.now() - startMs, statusCode: res.status,
      errorType: `http_${res.status}`,
      retryCount, apiKeyAlias: `key_${usedKeyIndex + 1}`,
      retryDelaySecs, quotaType,
    })
    // Surface quota type to client so frontend can show an informative message
    if (res.status === 429 && quotaType === 'daily') {
      return new Response(JSON.stringify({ error: 'Cuota diaria de IA agotada. El servicio se restablece a medianoche (hora de Argentina). Volvé mañana.' }), { status: 429, headers: corsHeaders })
    }
  }
  return new Response(JSON.stringify(data), { status: res.status, headers: corsHeaders })
}

// ── Supabase count helper (no trae filas, solo el total) ─────────────────────
async function getSupabaseCount(env, table, filter) {
  const url = `${env.SUPABASE_URL}/rest/v1/${table}?select=id${filter ? '&' + filter : ''}`
  const res = await fetch(url, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: 'count=exact',
      Range: '0-0',
    },
  })
  const range = res.headers.get('Content-Range') || ''
  const match = range.match(/\/(\d+)$/)
  return match ? parseInt(match[1]) : 0
}

// ── Verificar rol admin desde JWT ─────────────────────────────────────────────
async function verifyAdmin(env, request) {
  const token = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim()
  if (!token) return null
  try {
    const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` },
    })
    if (!userRes.ok) return null
    const userData = await userRes.json()
    const userId = userData?.id
    if (!userId) return null
    const roleRes = await fetch(
      `${env.SUPABASE_URL}/rest/v1/admin_roles?user_id=eq.${userId}&select=role`,
      { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } },
    )
    const roles = await roleRes.json()
    const role = roles?.[0]?.role
    if (!role) return null
    return { userId, role }
  } catch { return null }
}

// ── Admin audit log ───────────────────────────────────────────────────────────
async function logAdminAction(env, adminId, action, targetType, targetId, details = {}) {
  await supabaseServiceFetch(env, 'admin_logs', {
    method: 'POST',
    body: JSON.stringify({ admin_id: adminId, action, target_type: targetType, target_id: targetId ? String(targetId) : null, details }),
    headers: { Prefer: 'return=minimal' },
  }).catch(e => console.error('[ADMIN] audit log failed:', action, e?.message))
}

// ── Admin input validation helpers ───────────────────────────────────────────
function isValidUuid(v) { return typeof v === 'string' && UUID_RE.test(v) }
function clampPage(rawOffset, rawLimit, { maxLimit = 100, maxOffset = 50_000 } = {}) {
  return {
    offset: Math.max(0, Math.min(parseInt(rawOffset) || 0, maxOffset)),
    limit:  Math.max(1, Math.min(parseInt(rawLimit)  || 25, maxLimit)),
  }
}

async function checkAdminActionRate(env, adminId, action) {
  const limit = ADMIN_ACTION_LIMITS[action]
  if (!limit || !env.RATE_LIMIT_KV || !adminId) return true
  const key   = `admin_rl:${adminId}:${action}:${new Date().toISOString().slice(0, 13)}` // hourly bucket
  const count = parseInt(await env.RATE_LIMIT_KV.get(key).catch(() => '0')) || 0
  if (count >= limit) return false
  env.RATE_LIMIT_KV.put(key, String(count + 1), { expirationTtl: 3_600 }).catch(() => {})
  return true
}

// ── AI usage log (fire-and-forget) ───────────────────────────────────────────

/**
 * Fields shared by every AI usage event regardless of outcome.
 * @typedef {{
 *   feature:      string,
 *   userId:       string|null,
 *   durationMs:   number,
 *   statusCode:   number,
 *   retryCount?:  number,
 *   apiKeyAlias?: string|null,
 * }} AiUsageBaseEvent
 */

/**
 * HTTP 200 — Gemini responded. Tokens present if usageMetadata was included.
 * `thinkingTokens` comes from `usageMetadata.thoughtsTokenCount` (Flash Lite: always 0).
 * @typedef {AiUsageBaseEvent & {
 *   type:            'success',
 *   inputTokens:     number|null,
 *   outputTokens:    number|null,
 *   thinkingTokens?: number|null,
 * }} AiUsageSuccessEvent
 */

/**
 * Any failure: HTTP 4xx/5xx, network error, timeout, abort.
 * Token fields are semantically absent — the concept doesn't apply.
 * `retryDelaySecs` is parsed from google.rpc.RetryInfo (429 body); null when absent.
 * `quotaType` distinguishes RPD exhaustion ('daily') from RPM throttle ('minute').
 * @typedef {AiUsageBaseEvent & {
 *   type:             'failure',
 *   errorType:        string,
 *   retryDelaySecs?:  number|null,
 *   quotaType?:       string|null,
 * }} AiUsageFailureEvent
 */

/**
 * @typedef {AiUsageSuccessEvent | AiUsageFailureEvent} AiUsageEvent
 */

/**
 * @param {*} env
 * @param {AiUsageEvent} event
 */
function logAiUsage(env, ctx, event) {
  if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.SUPABASE_URL) return
  // Narrow the discriminated union so TypeScript knows which fields are available
  // in each branch. Fields absent from a branch are set to null explicitly.
  const row = event.type === 'success'
    ? {
        user_id:          event.userId          ?? null,
        feature:          event.feature,
        model:            event.model           ?? DEFAULT_MODEL,
        input_tokens:     event.inputTokens     ?? null,
        output_tokens:    event.outputTokens    ?? null,
        thinking_tokens:  event.thinkingTokens  ?? null,
        duration_ms:      event.durationMs      ?? null,
        status_code:      event.statusCode      ?? null,
        error_type:       null,
        retry_count:      event.retryCount      ?? 0,
        api_key_alias:    event.apiKeyAlias     ?? null,
        retry_delay_secs: null,
        quota_type:       null,
      }
    : {
        user_id:          event.userId          ?? null,
        feature:          event.feature,
        model:            event.model           ?? DEFAULT_MODEL,
        input_tokens:     null,
        output_tokens:    null,
        thinking_tokens:  null,
        duration_ms:      event.durationMs      ?? null,
        status_code:      event.statusCode      ?? null,
        error_type:       event.errorType,
        retry_count:      event.retryCount      ?? 0,
        api_key_alias:    event.apiKeyAlias     ?? null,
        retry_delay_secs: event.retryDelaySecs  ?? null,
        quota_type:       event.quotaType       ?? null,
      }
  const logFetch = fetch(`${env.SUPABASE_URL}/rest/v1/ai_usage_logs`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(row),
  }).catch(() => {})
  if (ctx?.waitUntil) ctx.waitUntil(logFetch)
}

// ── Extract userId from Supabase JWT (best-effort, for analytics only) ────────
function getUserIdFromToken(request) {
  try {
    const token = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim()
    if (!token) return null
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return payload.sub || null
  } catch { return null }
}


// ── GA4 Data API helpers (Web Crypto API — compatible con Cloudflare Workers) ──
async function getGa4AccessToken(creds) {
  const base64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  const enc = new TextEncoder()
  const now = Math.floor(Date.now() / 1000)
  const header  = base64url(enc.encode(JSON.stringify({ alg:'RS256', typ:'JWT' })))
  const payload = base64url(enc.encode(JSON.stringify({
    iss: creds.client_email,
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud: creds.token_uri,
    iat: now, exp: now + 3600,
  })))
  const unsigned = `${header}.${payload}`

  const pemKey = creds.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '')
  const keyBytes = Uint8Array.from(atob(pemKey), c => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', keyBytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  )
  const sigBytes = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, enc.encode(unsigned))
  const jwt = `${unsigned}.${base64url(sigBytes)}`

  const res = await fetch(creds.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(`GA4 auth error: ${data.error_description || JSON.stringify(data)}`)
  return data.access_token
}

async function runGa4FunnelReport(token, propertyId, steps, days = 30) {
  // runFunnelReport only exists in v1alpha (not v1beta)
  const url = `https://analyticsdata.googleapis.com/v1alpha/properties/${propertyId}:runFunnelReport`
  const requestBody = {
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
    funnel: {
      isOpenFunnel: false,
      steps: steps.map(s => ({
        name: s.name,
        filterExpression: { funnelEventFilter: { eventName: s.event } },
      })),
    },
    funnelVisualizationType: 'STANDARD_FUNNEL',
  }
  console.log('[ga4_funnel] POST', url, 'steps:', steps.map(s => s.event).join(' → '))
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  })
  const responseText = await res.text()
  console.log('[ga4_funnel] status:', res.status, 'body:', responseText.slice(0, 500))
  if (!res.ok) {
    let errMsg = `${res.status}: ${res.statusText}`
    try { errMsg = `${res.status}: ${JSON.parse(responseText)?.error?.message || res.statusText}` } catch {}
    throw new Error(`GA4 API ${errMsg}`)
  }
  return JSON.parse(responseText)
}

function parseGa4FunnelResponse(report, stepNames) {
  const diag = {
    has_funnelTable: !!report?.funnelTable,
    row_count: report?.funnelTable?.rows?.length ?? 0,
    dim_headers: (report?.funnelTable?.dimensionHeaders || []).map(h => h.name),
    metric_headers: (report?.funnelTable?.metricHeaders || []).map(h => h.name),
    step_totals_found: {},
  }

  if (!report?.funnelTable?.rows?.length) return { stages: [], diag }

  const dimHeaders = diag.dim_headers
  const metHeaders = diag.metric_headers

  // Look for funnelStepName; fallback to first dimension
  let stepDimIdx = dimHeaders.findIndex(h => h === 'funnelStepName')
  if (stepDimIdx === -1) stepDimIdx = 0

  // activeUsers is the primary count metric
  let usersIdx = metHeaders.findIndex(h => h === 'activeUsers')
  if (usersIdx === -1) usersIdx = 0

  diag.using_dim = dimHeaders[stepDimIdx] || '(index 0)'
  diag.using_metric = metHeaders[usersIdx] || '(index 0)'

  const stepTotals = {}
  for (const row of report.funnelTable.rows) {
    const stepName = row.dimensionValues?.[stepDimIdx]?.value
    const users = parseInt(row.metricValues?.[usersIdx]?.value || '0', 10)
    if (stepName && stepName !== 'RESERVED_TOTAL') {
      stepTotals[stepName] = (stepTotals[stepName] || 0) + users
    }
  }
  diag.step_totals_found = stepTotals

  const first = stepTotals[stepNames[0]] || 0
  const stages = stepNames.map(name => ({
    stage: name,
    count: stepTotals[name] || 0,
    pct: first > 0 ? parseFloat(((stepTotals[name] || 0) / first * 100).toFixed(1)) : 0,
  }))

  return { stages, diag }
}

async function supabaseServiceFetch(env, table, options = {}) {
  const url = `${env.SUPABASE_URL}/rest/v1/${table}`
  const res = await fetch(url, {
    ...options,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
      ...options.headers,
    },
  })
  return res
}

// ── Storage helpers ───────────────────────────────────────────────────────────

function base64ToUint8Array(b64) {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function storageUpload(env, bucket, path, uint8Array, contentType) {
  return fetch(`${env.SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': contentType,
      'x-upsert': 'true',
    },
    body: uint8Array,
  })
}

async function storageDelete(env, bucket, path) {
  return fetch(`${env.SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
    method: 'DELETE',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  })
}

async function storageSignedUrl(env, bucket, path, expiresIn = 86400) {
  const res = await fetch(`${env.SUPABASE_URL}/storage/v1/object/sign/${bucket}/${path}`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ expiresIn }),
  })
  const data = await res.json()
  return data?.signedURL
    ? `${env.SUPABASE_URL}/storage/v1${data.signedURL}`
    : null
}

async function verifyUserJwt(env, request) {
  const token = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim()
  if (!token) return null
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return null
  const user = await res.json()
  return user?.id ? user : null
}

// ── Mercado Pago helper ───────────────────────────────────────────────────────
async function mpFetch(env, path, options = {}) {
  const res = await fetch(`https://api.mercadopago.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  return res.json()
}

// ── Buscar userId en Supabase por email ───────────────────────────────────────
async function findUserIdByEmail(env, email) {
  const res = await fetch(
    `${env.SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}`,
    { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } }
  )
  const data = await res.json()
  return data?.users?.[0]?.id || null
}

// ── Persistir estado de suscripción en Supabase ───────────────────────────────
async function persistSubscription(env, { userId, subId, status, nextPayment, eventType = null, paymentData = null }) {
  const isPremium = status === 'authorized'
  const premiumHasta = isPremium && nextPayment ? nextPayment : null

  // Suscripciones: siempre actualizar el estado del contrato con MP
  const subRes = await supabaseServiceFetch(env, 'suscripciones', {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId,
      mp_subscription_id: subId,
      status,
      next_payment_date: nextPayment,
      updated_at: new Date().toISOString(),
    }),
  })

  // Perfiles: actualizar solo en authorized (activar) o paused (pago fallido → revocar).
  // En cancelled NO tocamos perfiles: el acceso sigue hasta que premium_hasta expire
  // naturalmente — el endpoint subscription_status ya verifica la fecha.
  let perfilRes = null
  if (status === 'authorized') {
    perfilRes = await supabaseServiceFetch(env, 'perfiles', {
      method: 'POST',
      body: JSON.stringify({
        id: userId,
        es_premium: true,
        premium_hasta: premiumHasta,
        mp_subscription_id: subId,
        premium_source: 'mercadopago',
        updated_at: new Date().toISOString(),
      }),
    })
  } else if (status === 'paused') {
    // Pago fallido: revocar acceso de inmediato
    perfilRes = await supabaseServiceFetch(env, 'perfiles', {
      method: 'POST',
      body: JSON.stringify({
        id: userId,
        es_premium: false,
        premium_hasta: null,
        updated_at: new Date().toISOString(),
      }),
    })
  }

  // ── Log subscription event (fire-and-forget) ──────────────────────────────
  const derivedEvent = eventType || (
    status === 'authorized' ? 'renewed' :
    status === 'cancelled'  ? 'cancelled' :
    status === 'paused'     ? 'failed_payment' : 'renewed'
  )
  supabaseServiceFetch(env, 'subscription_events', {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId,
      event_type: derivedEvent,
      origen: 'mp',
      mp_subscription_id: subId,
      metadata: { status, next_payment: nextPayment },
      created_at: new Date().toISOString(),
    }),
  }).catch(() => {})

  // ── Log individual payment (fire-and-forget) ──────────────────────────────
  if (paymentData && paymentData.status === 'approved' && paymentData.id) {
    supabaseServiceFetch(env, 'payments', {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        mp_subscription_id: subId,
        mp_payment_id: String(paymentData.id),
        amount: paymentData.transaction_amount || 3000,
        currency: paymentData.currency_id || 'ARS',
        status: 'approved',
        origen: 'mp',
        payment_date: paymentData.date_approved || new Date().toISOString(),
        metadata: {
          status_detail: paymentData.status_detail,
          payment_method_id: paymentData.payment_method_id,
          payer_email: paymentData.payer?.email,
        },
        created_at: new Date().toISOString(),
      }),
      headers: { Prefer: 'return=minimal,resolution=ignore-duplicates' },
    }).catch(() => {})
  }

  console.log('[persist] suscripciones:', subRes.status, 'perfiles:', perfilRes?.status ?? 'no-update (cancelled)', 'event:', derivedEvent)
  return { isPremium, premiumHasta }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    const reqOrigin = request.headers.get('origin') || ''
    const origin = ALLOWED_ORIGINS.has(reqOrigin) ? reqOrigin : 'https://optimizalinkedin.com'
    const corsHeaders = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-App-Token, Authorization',
        },
      })
    }

    // ── GET /health ───────────────────────────────────────────────────────────
    if (request.method === 'GET' && url.pathname.endsWith('/health')) {
      return new Response(JSON.stringify({
        status: 'ok',
        version: WORKER_VERSION,
        timestamp: new Date().toISOString(),
        env: {
          gemini_keys: (env.GEMINI_API_KEYS || env.GEMINI_API_KEY || '').split(',').filter(Boolean).length,
          rate_limit_kv: !!env.RATE_LIMIT_KV,
          supabase: !!env.SUPABASE_URL,
          supabase_service_role: !!env.SUPABASE_SERVICE_ROLE_KEY,
          mp: !!env.MP_ACCESS_TOKEN,
          app_token: !!env.APP_TOKEN,
        },
      }), { status: 200, headers: corsHeaders })
    }

    // ── GET /subscription-status?user_id=... ─────────────────────────────────
    if (request.method === 'GET' && url.pathname.endsWith('/subscription-status')) {
      const userId = url.searchParams.get('user_id')
      if (!userId) {
        return new Response(JSON.stringify({ error: { message: 'Falta user_id' } }), { status: 400, headers: corsHeaders })
      }
      try {
        const res = await supabaseServiceFetch(env, `perfiles?id=eq.${userId}&select=es_premium,premium_hasta,mp_subscription_id,premium_source`)
        const rows = await res.json()
        const perfil = rows?.[0]
        const ahora = new Date()
        const hastaDate = perfil?.premium_hasta ? new Date(perfil.premium_hasta) : null
        const esPremiumReal = perfil?.es_premium && hastaDate && hastaDate > ahora
        return new Response(JSON.stringify({
          es_premium: esPremiumReal || false,
          premium_hasta: perfil?.premium_hasta || null,
          mp_subscription_id: perfil?.mp_subscription_id || null,
          premium_source: perfil?.premium_source || null,
        }), { status: 200, headers: corsHeaders })
      } catch {
        return new Response(JSON.stringify({ es_premium: false }), { status: 200, headers: corsHeaders })
      }
    }

    // ── MP Webhook ────────────────────────────────────────────────────────────
    if (url.pathname.endsWith('/mp-webhook')) {
      if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })

      let body
      try { body = await request.json() } catch (e) {
        console.error('[mp-webhook] JSON parse error:', e.message)
        return new Response('OK', { status: 200 })
      }

      const eventType = body?.type
      const dataId = body?.data?.id
      console.log('[mp-webhook] type:', eventType, 'data.id:', dataId, 'action:', body?.action)

      // ── Evento: cambio de estado en suscripción (alta, pausa, cancelación) ──
      if (eventType === 'subscription_preapproval' && dataId) {
        try {
          const sub = await mpFetch(env, `/preapproval/${dataId}`)
          const status = sub.status // 'authorized' | 'paused' | 'cancelled'
          const nextPayment = sub.next_payment_date ? new Date(sub.next_payment_date).toISOString() : null
          console.log('[mp-webhook] preapproval status:', status, 'external_ref:', sub.external_reference)

          let userId = sub.external_reference
          if (!userId || userId === 'pending') {
            userId = await findUserIdByEmail(env, sub.payer?.email)
            if (!userId) {
              console.error('[mp-webhook] no user found for sub', dataId)
              return new Response('OK', { status: 200 })
            }
          }

          // Determinar si es suscripción nueva o reactivación
          const existingRows = await supabaseServiceFetch(env, `suscripciones?mp_subscription_id=eq.${dataId}&select=status`)
          const existingStatus = (await existingRows.json())?.[0]?.status
          const derivedEvent = status === 'authorized'
            ? (existingStatus ? 'reactivated' : 'subscribed')
            : status === 'cancelled' ? 'cancelled' : 'paused'

          await persistSubscription(env, { userId, subId: dataId, status, nextPayment, eventType: derivedEvent })
        } catch (e) {
          console.error('[mp-webhook] preapproval error:', e.message)
        }
        return new Response('OK', { status: 200 })
      }

      // ── Evento: pago recurrente procesado (renovación mensual) ──────────────
      if (eventType === 'subscription_authorized_payment' && dataId) {
        try {
          const payment = await mpFetch(env, `/authorized_payments/${dataId}`)
          const subId = payment?.preapproval_id
          console.log('[mp-webhook] authorized_payment for preapproval:', subId, 'status:', payment?.status)
          if (!subId) return new Response('OK', { status: 200 })

          const sub = await mpFetch(env, `/preapproval/${subId}`)
          const nextPayment = sub.next_payment_date ? new Date(sub.next_payment_date).toISOString() : null

          let userId = sub.external_reference
          if (!userId || userId === 'pending') {
            userId = await findUserIdByEmail(env, sub.payer?.email)
            if (!userId) return new Response('OK', { status: 200 })
          }

          // Solo extender premium si el pago fue aprobado
          if (payment?.status === 'approved') {
            await persistSubscription(env, { userId, subId, status: 'authorized', nextPayment, eventType: 'renewed', paymentData: payment })
            console.log('[mp-webhook] renewal extended for userId:', userId, 'until:', nextPayment)
          } else {
            // Pago rechazado — logear evento
            supabaseServiceFetch(env, 'subscription_events', {
              method: 'POST',
              body: JSON.stringify({
                user_id: userId,
                event_type: 'failed_payment',
                origen: 'mp',
                mp_subscription_id: subId,
                metadata: { payment_status: payment?.status, payment_id: payment?.id },
                created_at: new Date().toISOString(),
              }),
            }).catch(() => {})
          }
        } catch (e) {
          console.error('[mp-webhook] authorized_payment error:', e.message)
        }
        return new Response('OK', { status: 200 })
      }

      // Cualquier otro tipo de evento → ignorar silenciosamente
      console.log('[mp-webhook] unhandled event type:', eventType, '— ignoring')
      return new Response('OK', { status: 200 })
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: { message: 'Método no permitido' } }), { status: 405, headers: corsHeaders })
    }

    // Guard: reject oversized payloads before parsing
    const contentLength = parseInt(request.headers.get('content-length') || '0', 10)
    if (contentLength > MAX_BODY_BYTES) {
      return new Response(JSON.stringify({ error: { message: 'Payload demasiado grande (máx 2 MB)' } }), { status: 413, headers: corsHeaders })
    }

    const body = await request.json().catch(() => null)
    if (!body) return new Response(JSON.stringify({ error: { message: 'JSON inválido' } }), { status: 400, headers: corsHeaders })

    // ── Apply promo code (user action, requires JWT) ──────────────────────────
    if (body.action === 'apply_promo_code') {
      const { code } = body
      if (!code) return new Response(JSON.stringify({ error: 'Falta el código' }), { status: 400, headers: corsHeaders })
      const token = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim()
      if (!token) return new Response(JSON.stringify({ error: 'Debés iniciar sesión para usar un código' }), { status: 401, headers: corsHeaders })
      try {
        const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
          headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` },
        })
        if (!userRes.ok) return new Response(JSON.stringify({ error: 'Sesión inválida' }), { status: 401, headers: corsHeaders })
        const userData = await userRes.json()
        const userId = userData?.id
        if (!userId) return new Response(JSON.stringify({ error: 'Sesión inválida' }), { status: 401, headers: corsHeaders })
        const promoRes = await fetch(
          `${env.SUPABASE_URL}/rest/v1/promo_codes?code=eq.${encodeURIComponent(code.toUpperCase().trim())}&select=*`,
          { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } },
        )
        const promos = await promoRes.json()
        const promo = promos?.[0]
        if (!promo) return new Response(JSON.stringify({ error: 'Código no válido' }), { status: 404, headers: corsHeaders })
        if (!promo.is_active) return new Response(JSON.stringify({ error: 'Código inactivo' }), { status: 400, headers: corsHeaders })
        if (promo.expires_at && new Date(promo.expires_at) < new Date()) return new Response(JSON.stringify({ error: 'Código expirado' }), { status: 400, headers: corsHeaders })
        if (promo.max_uses && promo.uses_count >= promo.max_uses) return new Response(JSON.stringify({ error: 'Código agotado' }), { status: 400, headers: corsHeaders })
        const premiumHasta = new Date(Date.now() + promo.duration_days * 24 * 60 * 60 * 1000).toISOString()
        // Atomic optimistic-lock PATCH: only updates if uses_count hasn't changed since we read it
        const patchResp = await fetch(
          `${env.SUPABASE_URL}/rest/v1/promo_codes?id=eq.${promo.id}&uses_count=eq.${promo.uses_count}`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
              'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
              'Prefer': 'return=representation',
            },
            body: JSON.stringify({ uses_count: promo.uses_count + 1 }),
          }
        )
        const updated = await patchResp.json()
        if (!updated || updated.length === 0) {
          return new Response(JSON.stringify({ ok: false, error: 'Código ya fue utilizado' }), { status: 409, headers: corsHeaders })
        }
        await supabaseServiceFetch(env, 'perfiles', {
          method: 'POST',
          body: JSON.stringify({ id: userId, es_premium: true, premium_hasta: premiumHasta, premium_source: 'promo_code', updated_at: new Date().toISOString() }),
          headers: { Prefer: 'resolution=merge-duplicates' },
        })
        // Log subscription event for promo code
        supabaseServiceFetch(env, 'subscription_events', {
          method: 'POST',
          body: JSON.stringify({
            user_id: userId, event_type: 'code_redeemed', origen: 'promo',
            code: code.toUpperCase().trim(),
            metadata: { duration_days: promo.duration_days, premium_hasta: premiumHasta },
            created_at: new Date().toISOString(),
          }),
        }).catch(() => {})
        console.log('[promo] code applied:', code, 'user:', userId, 'until:', premiumHasta)
        return new Response(JSON.stringify({ ok: true, premium_hasta: premiumHasta, duration_days: promo.duration_days }), { status: 200, headers: corsHeaders })
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders })
      }
    }

    // ── Admin actions (requieren JWT con rol admin) ────────────────────────────
    if (typeof body.action === 'string' && body.action.startsWith('admin_')) {
      const admin = await verifyAdmin(env, request)
      if (!admin) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 403, headers: corsHeaders })
      const isReadOnly = admin.role === 'read_only'
      const canWrite = !isReadOnly

      if (body.action === 'admin_stats') {
        try {
          const [totalUsers, premiumUsers, activeSubs, totalAnalysis, totalCvs, totalLeads, newUsers7d] = await Promise.all([
            getSupabaseCount(env, 'perfiles'),
            getSupabaseCount(env, 'perfiles', 'es_premium=eq.true'),
            getSupabaseCount(env, 'suscripciones', 'status=eq.authorized'),
            getSupabaseCount(env, 'historial', 'tipo=eq.analisis'),
            getSupabaseCount(env, 'historial', 'tipo=eq.cv'),
            getSupabaseCount(env, 'leads'),
            getSupabaseCount(env, 'perfiles', `created_at=gt.${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()}`),
          ])
          return new Response(JSON.stringify({ ok: true, stats: {
            total_users: totalUsers, premium_users: premiumUsers,
            active_subs: activeSubs, total_analyses: totalAnalysis,
            total_cvs: totalCvs, total_leads: totalLeads,
            new_users_7d: newUsers7d,
          }, admin_role: admin.role }), { status: 200, headers: corsHeaders })
        } catch (e) {
          return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders })
        }
      }

      if (body.action === 'admin_users') {
        const { search = '', offset: rawOff = 0, limit: rawLim = 20, premium_only } = body
        const { offset, limit } = clampPage(rawOff, rawLim, { maxLimit: 100 })
        let qs = `perfiles?select=id,nombre,email,es_premium,premium_hasta,premium_source,created_at&order=created_at.desc&offset=${offset}&limit=${limit}`
        if (search) qs += `&or=(email.ilike.*${encodeURIComponent(search)}*,nombre.ilike.*${encodeURIComponent(search)}*)`
        if (premium_only) qs += '&es_premium=eq.true'
        try {
          const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${qs}`, {
            headers: {
              apikey: env.SUPABASE_SERVICE_ROLE_KEY,
              Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            },
          })
          const users = await res.json()
          return new Response(JSON.stringify({ ok: true, users: Array.isArray(users) ? users : [], total: Array.isArray(users) ? users.length : 0 }), { status: 200, headers: corsHeaders })
        } catch (e) {
          return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: corsHeaders })
        }
      }

      if (body.action === 'admin_user_detail') {
        const { user_id } = body
        if (!user_id) return new Response(JSON.stringify({ error: 'Falta user_id' }), { status: 400, headers: corsHeaders })
        if (!isValidUuid(user_id)) return new Response(JSON.stringify({ error: 'user_id inválido' }), { status: 400, headers: corsHeaders })
        try {
          const [perfilRes, subRes, histRes, linkedinRes, tagsRes, notesRes] = await Promise.all([
            supabaseServiceFetch(env, `perfiles?id=eq.${user_id}&select=*`),
            supabaseServiceFetch(env, `suscripciones?user_id=eq.${user_id}&select=*&order=updated_at.desc&limit=5`),
            supabaseServiceFetch(env, `historial?user_id=eq.${user_id}&select=id,tipo,titulo,created_at&order=created_at.desc&limit=10`),
            supabaseServiceFetch(env, `linkedin_profiles?user_id=eq.${user_id}&select=nombre,headline,email,fuente,synced_at&order=synced_at.desc&limit=1`),
            supabaseServiceFetch(env, `user_tags?user_id=eq.${user_id}&select=tag,id,created_at&order=created_at.asc`),
            supabaseServiceFetch(env, `admin_notes?user_id=eq.${user_id}&select=id,nota,created_at&order=created_at.desc&limit=20`),
          ])
          const [p, s, h, l, tags, notes] = await Promise.all([perfilRes.json(), subRes.json(), histRes.json(), linkedinRes.json(), tagsRes.json(), notesRes.json()])
          return new Response(JSON.stringify({
            ok: true,
            perfil: p?.[0],
            suscripciones: s,
            historial: h,
            linkedin: l?.[0],
            tags: Array.isArray(tags) ? tags : [],
            notes: Array.isArray(notes) ? notes : [],
            analisis_count: Array.isArray(h) ? h.filter(x => x.tipo === 'analisis').length : 0,
            cv_count: Array.isArray(h) ? h.filter(x => x.tipo === 'cv').length : 0,
            entrevista_count: Array.isArray(h) ? h.filter(x => x.tipo === 'entrevista').length : 0,
          }), { status: 200, headers: corsHeaders })
        } catch (e) {
          return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: corsHeaders })
        }
      }

      // ── CRM endpoints ────────────────────────────────────────────────────────

      if (body.action === 'admin_crm_users') {
        const { search = '', premium_status = 'all', feature_used = '', tag = '', sort = 'created_at_desc', offset: rawOff = 0, limit: rawLim = 25 } = body
        const { offset: off, limit } = clampPage(rawOff, rawLim, { maxLimit: 100 })
        try {
          const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/get_admin_users_crm`, {
            method: 'POST',
            headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ p_search: search, p_premium_status: premium_status, p_feature_used: feature_used, p_tag: tag, p_sort: sort, p_offset: off, p_limit: limit }),
          })
          const data = await res.json()
          return new Response(JSON.stringify({ ok: true, ...data }), { status: 200, headers: corsHeaders })
        } catch (e) {
          return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: corsHeaders })
        }
      }

      if (body.action === 'admin_crm_export') {
        if (!canWrite) return new Response(JSON.stringify({ error: 'Sin permisos' }), { status: 403, headers: corsHeaders })
        if (!await checkAdminActionRate(env, admin.userId, 'crm_export')) return new Response(JSON.stringify({ error: 'Límite de exportaciones por hora alcanzado (10/h)' }), { status: 429, headers: corsHeaders })
        const { search = '', premium_status = 'all', feature_used = '', tag = '', sort = 'created_at_desc' } = body
        try {
          await logAdminAction(env, admin.userId, 'crm_export', 'users', null, { premium_status, feature_used, tag, search })
          const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/get_admin_users_crm`, {
            method: 'POST',
            headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ p_search: search, p_premium_status: premium_status, p_feature_used: feature_used, p_tag: tag, p_sort: sort, p_offset: 0, p_limit: 1000 }),
          })
          const data = await res.json()
          return new Response(JSON.stringify({ ok: true, ...data }), { status: 200, headers: corsHeaders })
        } catch (e) {
          return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: corsHeaders })
        }
      }

      if (body.action === 'admin_user_add_tag') {
        if (!canWrite) return new Response(JSON.stringify({ error: 'Sin permisos' }), { status: 403, headers: corsHeaders })
        const { user_id, tag } = body
        if (!user_id || !tag?.trim()) return new Response(JSON.stringify({ error: 'Faltan user_id y tag' }), { status: 400, headers: corsHeaders })
        if (!isValidUuid(user_id)) return new Response(JSON.stringify({ error: 'user_id inválido' }), { status: 400, headers: corsHeaders })
        if (tag.trim().length > 100) return new Response(JSON.stringify({ error: 'Tag demasiado largo (máx 100 caracteres)' }), { status: 400, headers: corsHeaders })
        try {
          await supabaseServiceFetch(env, 'user_tags', {
            method: 'POST',
            body: JSON.stringify({ user_id, tag: tag.trim().toLowerCase(), created_by: admin.userId }),
            headers: { Prefer: 'return=minimal,resolution=ignore-duplicates' },
          })
          await logAdminAction(env, admin.userId, 'user_add_tag', 'user', user_id, { tag: tag.trim() })
          return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders })
        } catch (e) {
          return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: corsHeaders })
        }
      }

      if (body.action === 'admin_user_remove_tag') {
        if (!canWrite) return new Response(JSON.stringify({ error: 'Sin permisos' }), { status: 403, headers: corsHeaders })
        const { user_id, tag } = body
        if (!user_id || !tag) return new Response(JSON.stringify({ error: 'Faltan user_id y tag' }), { status: 400, headers: corsHeaders })
        try {
          await supabaseServiceFetch(env, `user_tags?user_id=eq.${user_id}&tag=eq.${encodeURIComponent(tag)}`, {
            method: 'DELETE', headers: { Prefer: 'return=minimal' },
          })
          await logAdminAction(env, admin.userId, 'user_remove_tag', 'user', user_id, { tag })
          return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders })
        } catch (e) {
          return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: corsHeaders })
        }
      }

      if (body.action === 'admin_user_add_note') {
        if (!canWrite) return new Response(JSON.stringify({ error: 'Sin permisos' }), { status: 403, headers: corsHeaders })
        const { user_id, nota } = body
        if (!user_id || !nota?.trim()) return new Response(JSON.stringify({ error: 'Faltan user_id y nota' }), { status: 400, headers: corsHeaders })
        if (!isValidUuid(user_id)) return new Response(JSON.stringify({ error: 'user_id inválido' }), { status: 400, headers: corsHeaders })
        if (nota.trim().length > 5000) return new Response(JSON.stringify({ error: 'Nota demasiado larga (máx 5000 caracteres)' }), { status: 400, headers: corsHeaders })
        try {
          await supabaseServiceFetch(env, 'admin_notes', {
            method: 'POST',
            body: JSON.stringify({ user_id, nota: nota.trim(), created_by: admin.userId }),
            headers: { Prefer: 'return=minimal' },
          })
          await logAdminAction(env, admin.userId, 'user_add_note', 'user', user_id)
          return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders })
        } catch (e) {
          return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: corsHeaders })
        }
      }

      if (body.action === 'admin_user_all_tags') {
        try {
          const res = await supabaseServiceFetch(env, 'user_tags?select=tag&order=tag.asc')
          const rows = await res.json()
          const tags = [...new Set((Array.isArray(rows) ? rows : []).map(r => r.tag))].sort()
          return new Response(JSON.stringify({ ok: true, tags }), { status: 200, headers: corsHeaders })
        } catch (e) {
          return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: corsHeaders })
        }
      }

      if (body.action === 'admin_grant_premium') {
        if (!canWrite) return new Response(JSON.stringify({ error: 'Sin permisos de escritura' }), { status: 403, headers: corsHeaders })
        if (!await checkAdminActionRate(env, admin.userId, 'grant_premium')) return new Response(JSON.stringify({ error: 'Límite de acciones por hora alcanzado (50/h)' }), { status: 429, headers: corsHeaders })
        const { user_id, days = 30 } = body
        if (!user_id) return new Response(JSON.stringify({ error: 'Falta user_id' }), { status: 400, headers: corsHeaders })
        if (!isValidUuid(user_id)) return new Response(JSON.stringify({ error: 'user_id inválido' }), { status: 400, headers: corsHeaders })
        const clampedDays = Math.max(1, Math.min(parseInt(days) || 30, 730))
        const premiumHasta = new Date(Date.now() + clampedDays * 24 * 60 * 60 * 1000).toISOString()
        await supabaseServiceFetch(env, 'perfiles', {
          method: 'POST',
          body: JSON.stringify({ id: user_id, es_premium: true, premium_hasta: premiumHasta, premium_source: 'admin_grant', updated_at: new Date().toISOString() }),
          headers: { Prefer: 'resolution=merge-duplicates' },
        })
        await logAdminAction(env, admin.userId, 'grant_premium', 'user', user_id, { days, premium_hasta: premiumHasta })
        supabaseServiceFetch(env, 'subscription_events', {
          method: 'POST',
          body: JSON.stringify({
            user_id, event_type: 'manual_grant', origen: 'manual',
            metadata: { days, premium_hasta: premiumHasta, granted_by: admin.userId },
            created_at: new Date().toISOString(),
          }),
        }).catch(() => {})
        return new Response(JSON.stringify({ ok: true, premium_hasta: premiumHasta }), { status: 200, headers: corsHeaders })
      }

      if (body.action === 'admin_revoke_premium') {
        if (!canWrite) return new Response(JSON.stringify({ error: 'Sin permisos de escritura' }), { status: 403, headers: corsHeaders })
        if (!await checkAdminActionRate(env, admin.userId, 'revoke_premium')) return new Response(JSON.stringify({ error: 'Límite de acciones por hora alcanzado (50/h)' }), { status: 429, headers: corsHeaders })
        const { user_id } = body
        if (!user_id) return new Response(JSON.stringify({ error: 'Falta user_id' }), { status: 400, headers: corsHeaders })
        if (!isValidUuid(user_id)) return new Response(JSON.stringify({ error: 'user_id inválido' }), { status: 400, headers: corsHeaders })
        await supabaseServiceFetch(env, 'perfiles', {
          method: 'POST',
          body: JSON.stringify({ id: user_id, es_premium: false, premium_hasta: null, updated_at: new Date().toISOString() }),
          headers: { Prefer: 'resolution=merge-duplicates' },
        })
        await logAdminAction(env, admin.userId, 'revoke_premium', 'user', user_id)
        supabaseServiceFetch(env, 'subscription_events', {
          method: 'POST',
          body: JSON.stringify({
            user_id, event_type: 'manual_revoke', origen: 'manual',
            metadata: { revoked_by: admin.userId },
            created_at: new Date().toISOString(),
          }),
        }).catch(() => {})
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders })
      }

      if (body.action === 'admin_create_promo') {
        if (!canWrite) return new Response(JSON.stringify({ error: 'Sin permisos de escritura' }), { status: 403, headers: corsHeaders })
        if (!await checkAdminActionRate(env, admin.userId, 'create_promo')) return new Response(JSON.stringify({ error: 'Límite de creación de promos alcanzado (20/h)' }), { status: 429, headers: corsHeaders })
        const { code, description, duration_days = 30, max_uses, expires_at } = body
        if (!code) return new Response(JSON.stringify({ error: 'Falta code' }), { status: 400, headers: corsHeaders })
        if (code.trim().length > 50) return new Response(JSON.stringify({ error: 'Código demasiado largo (máx 50)' }), { status: 400, headers: corsHeaders })
        if (description && description.length > 500) return new Response(JSON.stringify({ error: 'Descripción demasiado larga (máx 500)' }), { status: 400, headers: corsHeaders })
        const safeDays = Math.max(1, Math.min(parseInt(duration_days) || 30, 730))
        const safeMaxUses = max_uses ? Math.max(1, Math.min(parseInt(max_uses) || 1, 10_000)) : null
        try {
          const res = await supabaseServiceFetch(env, 'promo_codes', {
            method: 'POST',
            body: JSON.stringify({
              code: code.toUpperCase().trim(), description,
              duration_days: safeDays, max_uses: safeMaxUses,
              expires_at: expires_at || null, created_by: admin.userId,
            }),
            headers: { Prefer: 'return=representation' },
          })
          const created = await res.json()
          if (res.status === 409) return new Response(JSON.stringify({ error: 'El código ya existe' }), { status: 409, headers: corsHeaders })
          await logAdminAction(env, admin.userId, 'create_promo', 'promo_code', code, { duration_days, max_uses })
          return new Response(JSON.stringify({ ok: true, promo: created?.[0] }), { status: 200, headers: corsHeaders })
        } catch (e) {
          return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders })
        }
      }

      if (body.action === 'admin_list_promos') {
        try {
          const res = await supabaseServiceFetch(env, 'promo_codes?select=*&order=created_at.desc')
          const promos = await res.json()
          return new Response(JSON.stringify({ ok: true, promos: Array.isArray(promos) ? promos : [] }), { status: 200, headers: corsHeaders })
        } catch (e) {
          return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: corsHeaders })
        }
      }

      if (body.action === 'admin_toggle_promo') {
        if (!canWrite) return new Response(JSON.stringify({ error: 'Sin permisos de escritura' }), { status: 403, headers: corsHeaders })
        const { code_id, is_active } = body
        if (!code_id) return new Response(JSON.stringify({ error: 'Falta code_id' }), { status: 400, headers: corsHeaders })
        await supabaseServiceFetch(env, `promo_codes?id=eq.${code_id}`, {
          method: 'PATCH',
          body: JSON.stringify({ is_active }),
          headers: { Prefer: 'return=minimal' },
        })
        await logAdminAction(env, admin.userId, is_active ? 'activate_promo' : 'deactivate_promo', 'promo_code', code_id)
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders })
      }

      if (body.action === 'admin_list_logs') {
        const { offset: rawOff = 0, limit: rawLim = 50 } = body
        const { offset: logsOffset, limit } = clampPage(rawOff, rawLim, { maxLimit: 200 })
        try {
          const res = await supabaseServiceFetch(env, `admin_logs?select=*&order=created_at.desc&offset=${logsOffset}&limit=${limit}`)
          const logs = await res.json()
          return new Response(JSON.stringify({ ok: true, logs: Array.isArray(logs) ? logs : [] }), { status: 200, headers: corsHeaders })
        } catch (e) {
          return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: corsHeaders })
        }
      }

      if (body.action === 'admin_sync_mp') {
        if (!canWrite) return new Response(JSON.stringify({ error: 'Sin permisos de escritura' }), { status: 403, headers: corsHeaders })
        const { user_id, payer_email } = body
        if (!user_id || !payer_email) return new Response(JSON.stringify({ error: 'Faltan user_id y payer_email' }), { status: 400, headers: corsHeaders })
        const search = await mpFetch(env, `/preapproval/search?status=authorized&preapproval_plan_id=${env.MP_PLAN_ID}&payer_email=${encodeURIComponent(payer_email)}&limit=5`)
        const sub = search?.results?.[0]
        if (!sub) return new Response(JSON.stringify({ error: 'No se encontró suscripción autorizada en MP' }), { status: 404, headers: corsHeaders })
        const nextPayment = sub.next_payment_date ? new Date(sub.next_payment_date).toISOString() : null
        const result = await persistSubscription(env, { userId: user_id, subId: sub.id, status: 'authorized', nextPayment })
        await logAdminAction(env, admin.userId, 'sync_mp', 'user', user_id, { mp_sub_id: sub.id })
        return new Response(JSON.stringify({ ok: true, mp_subscription_id: sub.id, ...result }), { status: 200, headers: corsHeaders })
      }

      if (body.action === 'admin_ai_stats') {
        try {
          const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/get_ai_stats`, {
            method: 'POST',
            headers: {
              apikey: env.SUPABASE_SERVICE_ROLE_KEY,
              Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
            },
            body: '{}',
          })
          const data = await res.json()
          // Attach known quota limits so the dashboard can compute % used without hardcoding
          return new Response(JSON.stringify({ ok: true, quota_limits: GEMINI_QUOTA, ...data }), { status: 200, headers: corsHeaders })
        } catch (e) {
          return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: corsHeaders })
        }
      }

      if (body.action === 'admin_ai_logs') {
        const { offset: rawOff = 0, limit: rawLim = 50, feature_filter } = body
        const { offset: logsOffset, limit } = clampPage(rawOff, rawLim, { maxLimit: 100 })
        try {
          let qs = `ai_usage_logs?select=*&order=created_at.desc&offset=${logsOffset}&limit=${limit}`
          if (feature_filter) qs += `&feature=eq.${encodeURIComponent(feature_filter)}`
          const res = await supabaseServiceFetch(env, qs)
          if (!res.ok) throw new Error(`Supabase error ${res.status}`)
          const logs = await res.json()
          const safeLog = Array.isArray(logs) ? logs : []
          return new Response(JSON.stringify({ ok: true, logs: safeLog, has_more: safeLog.length === limit }), { status: 200, headers: corsHeaders })
        } catch (e) {
          return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: corsHeaders })
        }
      }

      // ── Comments moderation ──────────────────────────────────────────────────

      if (body.action === 'admin_comment_stats') {
        try {
          const [pending, approved, rejected, hidden, featured, total] = await Promise.all([
            getSupabaseCount(env, 'comments', 'status=eq.pending'),
            getSupabaseCount(env, 'comments', 'status=eq.approved'),
            getSupabaseCount(env, 'comments', 'status=eq.rejected'),
            getSupabaseCount(env, 'comments', 'status=eq.hidden'),
            getSupabaseCount(env, 'comments', 'featured=eq.true&status=eq.approved'),
            getSupabaseCount(env, 'comments'),
          ])
          return new Response(JSON.stringify({ ok: true, stats: { total, pending, approved, rejected, hidden, featured } }), { status: 200, headers: corsHeaders })
        } catch (e) {
          return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: corsHeaders })
        }
      }

      if (body.action === 'admin_list_comments') {
        const { status_filter = 'all', search = '', featured_only = false, offset: rawOff = 0, limit: rawLim = 30 } = body
        const { offset: off, limit } = clampPage(rawOff, rawLim, { maxLimit: 100 })
        try {
          let qs = `comments?select=*&order=created_at.desc&offset=${off}&limit=${limit}`
          if (status_filter && status_filter !== 'all') qs += `&status=eq.${encodeURIComponent(status_filter)}`
          if (featured_only) qs += '&featured=eq.true'
          if (search) qs += `&or=(nombre.ilike.*${encodeURIComponent(search)}*,comentario.ilike.*${encodeURIComponent(search)}*,titulo.ilike.*${encodeURIComponent(search)}*)`
          const res = await supabaseServiceFetch(env, qs)
          const comments = await res.json()
          return new Response(JSON.stringify({ ok: true, comments: Array.isArray(comments) ? comments : [] }), { status: 200, headers: corsHeaders })
        } catch (e) {
          return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: corsHeaders })
        }
      }

      if (body.action === 'admin_comment_action') {
        if (!canWrite) return new Response(JSON.stringify({ error: 'Sin permisos de escritura' }), { status: 403, headers: corsHeaders })
        const { comment_id, action: commentAction } = body
        if (!comment_id || !commentAction) return new Response(JSON.stringify({ error: 'Faltan comment_id y action' }), { status: 400, headers: corsHeaders })

        const VALID_ACTIONS = ['approve', 'reject', 'hide', 'feature', 'unfeature', 'delete']
        if (!VALID_ACTIONS.includes(commentAction)) return new Response(JSON.stringify({ error: 'Acción inválida' }), { status: 400, headers: corsHeaders })

        try {
          // Fetch current comment for logging
          const curRes = await supabaseServiceFetch(env, `comments?id=eq.${comment_id}&select=status,featured`)
          const curRows = await curRes.json()
          const cur = curRows?.[0]

          if (commentAction === 'delete') {
            await supabaseServiceFetch(env, `comments?id=eq.${comment_id}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
          } else {
            const patch = {}
            if (commentAction === 'approve')   { patch.status = 'approved';  patch.moderated_by = admin.userId; patch.moderated_at = new Date().toISOString() }
            if (commentAction === 'reject')    { patch.status = 'rejected';  patch.moderated_by = admin.userId; patch.moderated_at = new Date().toISOString() }
            if (commentAction === 'hide')      { patch.status = 'hidden';    patch.moderated_by = admin.userId; patch.moderated_at = new Date().toISOString() }
            if (commentAction === 'feature')   { patch.featured = true;  patch.status = 'approved' }
            if (commentAction === 'unfeature') { patch.featured = false }
            await supabaseServiceFetch(env, `comments?id=eq.${comment_id}`, {
              method: 'PATCH', body: JSON.stringify(patch), headers: { Prefer: 'return=minimal' },
            })
          }

          // Log the moderation action
          await supabaseServiceFetch(env, 'comment_moderation_logs', {
            method: 'POST',
            body: JSON.stringify({
              comment_id,
              admin_id: admin.userId,
              action: commentAction,
              old_status: cur?.status ?? null,
              new_status: commentAction === 'delete' ? 'deleted'
                : commentAction === 'approve' || commentAction === 'feature' ? 'approved'
                : commentAction === 'reject'  ? 'rejected'
                : commentAction === 'hide'    ? 'hidden'
                : cur?.status ?? null,
            }),
            headers: { Prefer: 'return=minimal' },
          })
          await logAdminAction(env, admin.userId, `comment_${commentAction}`, 'comment', comment_id)
          return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders })
        } catch (e) {
          return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: corsHeaders })
        }
      }

      if (body.action === 'admin_comment_edit') {
        if (!canWrite) return new Response(JSON.stringify({ error: 'Sin permisos de escritura' }), { status: 403, headers: corsHeaders })
        const { comment_id, nombre, comentario, admin_reply } = body
        if (!comment_id) return new Response(JSON.stringify({ error: 'Falta comment_id' }), { status: 400, headers: corsHeaders })
        try {
          const patch = { moderated_by: admin.userId, moderated_at: new Date().toISOString() }
          if (nombre    !== undefined) patch.edited_nombre     = nombre    || null
          if (comentario !== undefined) patch.edited_comentario = comentario || null
          if (admin_reply !== undefined) {
            patch.admin_reply    = admin_reply || null
            patch.admin_reply_at = admin_reply ? new Date().toISOString() : null
          }
          await supabaseServiceFetch(env, `comments?id=eq.${comment_id}`, {
            method: 'PATCH', body: JSON.stringify(patch), headers: { Prefer: 'return=minimal' },
          })
          await logAdminAction(env, admin.userId, 'comment_edit', 'comment', comment_id, { fields: Object.keys(patch) })
          return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders })
        } catch (e) {
          return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: corsHeaders })
        }
      }

      // ── Flush radar cache for a user (testing / support) ─────────────────────
      if (body.action === 'admin_flush_radar_cache') {
        if (!canWrite) return new Response(JSON.stringify({ error: 'Sin permisos de escritura' }), { status: 403, headers: corsHeaders })
        const { user_id, flush_all_users = false } = body
        if (!flush_all_users && !user_id) return new Response(JSON.stringify({ error: 'Falta user_id o flush_all_users=true' }), { status: 400, headers: corsHeaders })
        if (user_id && !isValidUuid(user_id)) return new Response(JSON.stringify({ error: 'user_id inválido' }), { status: 400, headers: corsHeaders })

        const targetIds = user_id ? [user_id] : null
        const deleted = { kv_keys: [], supabase_radar: 0, supabase_recs: 0 }

        // 1. Supabase: radar_search_history + job_recommendations
        const supaFilter = targetIds ? `?user_id=eq.${targetIds[0]}` : ''
        try {
          await Promise.all([
            supabaseServiceFetch(env, `radar_search_history${supaFilter}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }),
            supabaseServiceFetch(env, `job_recommendations${supaFilter}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }),
          ])
          deleted.supabase_radar = 1
          deleted.supabase_recs  = 1
        } catch (e) { console.warn('[FLUSH] supabase delete failed:', e?.message) }

        // 2. KV: live_fetch + jrec + rate-limit counters for the user
        if (env.RATE_LIMIT_KV && targetIds) {
          const uid      = targetIds[0]
          const today    = new Date().toISOString().slice(0, 10)
          const month    = new Date().toISOString().slice(0, 7)
          const kvKeys   = [
            `live_fetch:${uid}:${today}`,   // premium daily
            `live_fetch:${uid}:${month}`,   // free monthly
            `jobsearch:day:${uid}`,
            `jobsearch:hour:${uid}:${new Date().toISOString().slice(0, 13)}`,
          ]
          await Promise.all(kvKeys.map(k => env.RATE_LIMIT_KV.delete(k).catch(() => {})))
          deleted.kv_keys = kvKeys
        }

        await logAdminAction(env, admin.userId, 'flush_radar_cache', 'user', user_id || 'all', { flush_all_users })
        return new Response(JSON.stringify({ ok: true, deleted }), { status: 200, headers: corsHeaders })
      }

      // ── Revenue stats ─────────────────────────────────────────────────────────
      if (body.action === 'admin_revenue_stats') {
        try {
          const [statsRes, monthlyRes] = await Promise.all([
            supabaseServiceFetch(env, 'rpc/get_revenue_stats', { method: 'POST', body: JSON.stringify({}) }),
            supabaseServiceFetch(env, 'rpc/get_monthly_revenue', { method: 'POST', body: JSON.stringify({ months_back: 12 }) }),
          ])
          const stats = await statsRes.json()
          const monthly = await monthlyRes.json()
          return new Response(JSON.stringify({ ok: true, stats, monthly }), { status: 200, headers: corsHeaders })
        } catch (e) {
          return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: corsHeaders })
        }
      }

      // ── Subscription events log ───────────────────────────────────────────────
      if (body.action === 'admin_subscription_events') {
        const { offset: rawOff = 0, limit: rawLim = 25, event_type = 'all' } = body
        const { offset, limit } = clampPage(rawOff, rawLim, { maxLimit: 100 })
        try {
          const res = await supabaseServiceFetch(env, 'rpc/get_subscription_events_paged', {
            method: 'POST',
            body: JSON.stringify({ p_offset: offset, p_limit: limit, p_event_type: event_type }),
          })
          const rows = await res.json()
          const total = rows?.[0]?.total ?? 0
          return new Response(JSON.stringify({ ok: true, rows, total }), { status: 200, headers: corsHeaders })
        } catch (e) {
          return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: corsHeaders })
        }
      }

      // ── Payments log ─────────────────────────────────────────────────────────
      if (body.action === 'admin_payments_log') {
        const { offset: rawOff = 0, limit: rawLim = 25 } = body
        const { offset, limit } = clampPage(rawOff, rawLim, { maxLimit: 100 })
        try {
          const res = await supabaseServiceFetch(env, 'rpc/get_payments_paged', {
            method: 'POST',
            body: JSON.stringify({ p_offset: offset, p_limit: limit }),
          })
          const rows = await res.json()
          const total = rows?.[0]?.total ?? 0
          return new Response(JSON.stringify({ ok: true, rows, total }), { status: 200, headers: corsHeaders })
        } catch (e) {
          return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: corsHeaders })
        }
      }

      // ── Product Intelligence — overview + funnel + trend + AI breakdown ────────
      if (body.action === 'admin_analytics_overview') {
        const rpcSafe = async (fn, params = {}) => {
          try {
            const res = await supabaseServiceFetch(env, `rpc/${fn}`, { method: 'POST', body: JSON.stringify(params) })
            if (!res.ok) { console.warn(`[ADMIN] RPC ${fn} returned ${res.status}`); return null }
            return res.json()
          } catch (e) { console.warn(`[ADMIN] RPC ${fn} failed:`, e?.message); return null }
        }
        const [overview, funnel, trend, ai_features] = await Promise.all([
          rpcSafe('get_product_overview'),
          rpcSafe('get_product_funnel'),
          rpcSafe('get_weekly_activity_trend', { p_weeks: 8 }),
          rpcSafe('get_ai_feature_breakdown_30d'),
        ])
        return new Response(JSON.stringify({ ok: true, overview, funnel, trend, ai_features }), { status: 200, headers: corsHeaders })
      }

      // ── GA4 Data API — runFunnelReport ───────────────────────────────────────
      if (body.action === 'admin_ga4_funnel') {
        if (!env.GA4_CREDENTIALS_JSON) {
          return new Response(JSON.stringify({ ok: true, not_configured: true }), { status: 200, headers: corsHeaders })
        }
        const { days = 30 } = body
        // 30-min rolling cache window — prevents quota burns on admin refreshes
        const cacheWindow = Math.floor(Date.now() / (30 * 60 * 1000))
        const cacheKey = new Request(`https://cache-internal/ga4_funnel_${days}_${cacheWindow}`)
        try {
          const cached = await caches.default.match(cacheKey)
          if (cached) return cached
        } catch { /* cache miss is silent */ }
        try {
          const creds = JSON.parse(env.GA4_CREDENTIALS_JSON)
          if (!creds?.client_email || !creds?.private_key || !creds?.token_uri)
            return new Response(JSON.stringify({ ok: false, error: 'GA4_CREDENTIALS_JSON falta campos requeridos (client_email, private_key, token_uri)' }), { status: 500, headers: corsHeaders })
          const token = await getGa4AccessToken(creds)
          const GA4_PROPERTY = '534867380'
          // Updated funnel: starts from questionnaire entry so top-of-funnel is always visible
          const FUNNEL_STEPS = [
            { name: 'Inicia cuestionario', event: 'questionnaire_started'    },
            { name: 'Inicia análisis',     event: 'analysis_started'         },
            { name: 'Completa análisis',   event: 'analysis_completed'       },
            { name: 'Inicia CV',           event: 'cv_generation_started'    },
            { name: 'Ve modal premium',    event: 'premium_modal_shown'      },
            { name: 'Abre checkout',       event: 'premium_checkout_opened'  },
          ]
          const report = await runGa4FunnelReport(token, GA4_PROPERTY, FUNNEL_STEPS, days)
          const { stages, diag } = parseGa4FunnelResponse(report, FUNNEL_STEPS.map(s => s.name))
          console.log('[ga4_funnel] parsed stages:', stages.length, 'diag:', JSON.stringify(diag))
          const resp = new Response(
            JSON.stringify({ ok: true, stages, days, diag }),
            { status: 200, headers: { ...corsHeaders, 'Cache-Control': 'max-age=1800' } }
          )
          try { caches.default.put(cacheKey, resp.clone()) } catch { /* non-fatal */ }
          return resp
        } catch (e) {
          return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: corsHeaders })
        }
      }

      return new Response(JSON.stringify({ error: 'Acción admin desconocida' }), { status: 400, headers: corsHeaders })
    }

    // ── Simulate webhook (debug, admin only) ─────────────────────────────────
    if (body.action === 'simulate_webhook') {
      const { admin_key, sub_id } = body
      if (admin_key !== env.ADMIN_KEY) {
        return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: corsHeaders })
      }
      if (!sub_id) {
        return new Response(JSON.stringify({ error: 'Falta sub_id' }), { status: 400, headers: corsHeaders })
      }
      try {
        const sub = await mpFetch(env, `/preapproval/${sub_id}`)
        const status = sub.status
        const nextPayment = sub.next_payment_date ? new Date(sub.next_payment_date).toISOString() : null
        let userId = sub.external_reference
        if (!userId || userId === 'pending') {
          userId = await findUserIdByEmail(env, sub.payer?.email)
          if (!userId) return new Response(JSON.stringify({ error: 'No user found', sub }), { status: 200, headers: corsHeaders })
        }
        const result = await persistSubscription(env, { userId, subId: sub_id, status, nextPayment })
        return new Response(JSON.stringify({ ok: true, userId, status, ...result, sub }), { status: 200, headers: corsHeaders })
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders })
      }
    }

    // ── Check MP plan (debug) ─────────────────────────────────────────────────
    if (body.action === 'check_mp_plan') {
      const isAdmin = await verifyAdmin(env, request)
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders })
      }
      const planData = await mpFetch(env, `/preapproval_plan/${env.MP_PLAN_ID || 'NOT_SET'}`)
      return new Response(JSON.stringify({
        plan_id_in_env: env.MP_PLAN_ID || 'NOT SET',
        token_prefix: (env.MP_ACCESS_TOKEN || '').slice(0, 10) + '...',
        plan: planData,
      }), { status: 200, headers: corsHeaders })
    }

    // ── Profile photo: upload ─────────────────────────────────────────────────
    if (body.action === 'upload_profile_photo') {
      const { photo_base64, mime_type = 'image/jpeg' } = body
      if (!photo_base64) return new Response(JSON.stringify({ error: 'Falta photo_base64' }), { status: 400, headers: corsHeaders })
      const user = await verifyUserJwt(env, request)
      if (!user) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: corsHeaders })

      // Enforce 10-photo limit per user
      const countRes = await supabaseServiceFetch(env, `profile_photos?user_id=eq.${user.id}&select=id`)
      const existingPhotos = await countRes.json()
      if (Array.isArray(existingPhotos) && existingPhotos.length >= 10) {
        return new Response(JSON.stringify({ error: 'Límite de 10 fotos alcanzado. Eliminá una para subir una nueva.' }), { status: 400, headers: corsHeaders })
      }

      try {
        // Deduplication: hash the first 8KB of base64 as a fast content fingerprint
        const hashInput = new TextEncoder().encode(photo_base64.slice(0, 8192))
        const hashBuf = await crypto.subtle.digest('SHA-256', hashInput)
        const contentHash = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('')

        // Check for existing photo with same hash for this user
        const dupRes = await supabaseServiceFetch(env, `profile_photos?user_id=eq.${user.id}&content_hash=eq.${contentHash}&select=id,storage_path`)
        const dupRows = await dupRes.json()
        if (dupRows?.[0]) {
          const signedUrl = await storageSignedUrl(env, 'profile-photos', dupRows[0].storage_path, 86400)
          return new Response(JSON.stringify({ ok: true, photo_id: dupRows[0].id, storage_path: dupRows[0].storage_path, signed_url: signedUrl, deduplicated: true }), { status: 200, headers: corsHeaders })
        }

        const photoId = crypto.randomUUID()
        const ext = mime_type === 'image/png' ? 'png' : mime_type === 'image/webp' ? 'webp' : 'jpg'
        const storagePath = `${user.id}/${photoId}.${ext}`
        const bytes = base64ToUint8Array(photo_base64)
        const uploadRes = await storageUpload(env, 'profile-photos', storagePath, bytes, mime_type)
        if (!uploadRes.ok) {
          const err = await uploadRes.text()
          console.error('[upload_photo] storage error:', err)
          return new Response(JSON.stringify({ error: 'Error al subir la imagen' }), { status: 500, headers: corsHeaders })
        }
        await supabaseServiceFetch(env, 'profile_photos', {
          method: 'POST',
          body: JSON.stringify({ id: photoId, user_id: user.id, storage_path: storagePath, mime_type, content_hash: contentHash, es_default: false }),
          headers: { Prefer: 'return=minimal' },
        })
        const signedUrl = await storageSignedUrl(env, 'profile-photos', storagePath, 86400)
        return new Response(JSON.stringify({ ok: true, photo_id: photoId, storage_path: storagePath, signed_url: signedUrl }), { status: 200, headers: corsHeaders })
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders })
      }
    }

    // ── Profile photo: list ───────────────────────────────────────────────────
    if (body.action === 'get_profile_photos') {
      const user = await verifyUserJwt(env, request)
      if (!user) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: corsHeaders })
      try {
        const res = await supabaseServiceFetch(env, `profile_photos?user_id=eq.${user.id}&order=created_at.desc&select=id,storage_path,mime_type,es_default,ai_score,ai_feedback,created_at`)
        const rows = await res.json()
        if (!Array.isArray(rows)) return new Response(JSON.stringify({ ok: true, photos: [] }), { status: 200, headers: corsHeaders })
        const photos = await Promise.all(rows.map(async (row) => ({
          ...row,
          signed_url: await storageSignedUrl(env, 'profile-photos', row.storage_path, 86400),
        })))
        return new Response(JSON.stringify({ ok: true, photos }), { status: 200, headers: corsHeaders })
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders })
      }
    }

    // ── Profile photo: delete ─────────────────────────────────────────────────
    if (body.action === 'delete_profile_photo') {
      const { photo_id } = body
      if (!photo_id) return new Response(JSON.stringify({ error: 'Falta photo_id' }), { status: 400, headers: corsHeaders })
      const user = await verifyUserJwt(env, request)
      if (!user) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: corsHeaders })
      try {
        const res = await supabaseServiceFetch(env, `profile_photos?id=eq.${photo_id}&user_id=eq.${user.id}&select=storage_path`)
        const rows = await res.json()
        if (!rows?.[0]) return new Response(JSON.stringify({ error: 'Foto no encontrada' }), { status: 404, headers: corsHeaders })
        await storageDelete(env, 'profile-photos', rows[0].storage_path)
        await supabaseServiceFetch(env, `profile_photos?id=eq.${photo_id}&user_id=eq.${user.id}`, { method: 'DELETE' })
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders })
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders })
      }
    }

    // ── Profile photo: set default ────────────────────────────────────────────
    if (body.action === 'set_default_photo') {
      const { photo_id } = body
      if (!photo_id) return new Response(JSON.stringify({ error: 'Falta photo_id' }), { status: 400, headers: corsHeaders })
      const user = await verifyUserJwt(env, request)
      if (!user) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: corsHeaders })
      try {
        // Clear existing default, then set new one
        await supabaseServiceFetch(env, `profile_photos?user_id=eq.${user.id}&es_default=eq.true`, {
          method: 'PATCH',
          body: JSON.stringify({ es_default: false }),
          headers: { Prefer: 'return=minimal' },
        })
        await supabaseServiceFetch(env, `profile_photos?id=eq.${photo_id}&user_id=eq.${user.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ es_default: true }),
          headers: { Prefer: 'return=minimal' },
        })
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders })
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders })
      }
    }

    // ── Create subscription ───────────────────────────────────────────────────
    if (body.action === 'create_subscription') {
      const { user_id, user_email } = body
      if (!user_id || !user_email) {
        return new Response(JSON.stringify({ error: 'Faltan user_id y user_email' }), { status: 400, headers: corsHeaders })
      }
      const callerUser = await verifyUserJwt(env, request)
      if (!callerUser || callerUser.id !== user_id) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
      }
      if (!env.MP_PLAN_ID) {
        return new Response(JSON.stringify({ error: 'MP_PLAN_ID no está configurado' }), { status: 500, headers: corsHeaders })
      }

      const preapprovalRes = await mpFetch(env, '/preapproval', {
        method: 'POST',
        body: JSON.stringify({
          preapproval_plan_id: env.MP_PLAN_ID,
          reason: 'Optimiza LK Premium',
          external_reference: user_id,
          payer_email: user_email,
          back_url: BACK_URL,
          // Explícitamente en el preapproval individual, no solo en el plan
          notification_url: WORKER_NOTIFICATION_URL,
        }),
      })

      if (preapprovalRes?.init_point) {
        return new Response(JSON.stringify({ init_point: preapprovalRes.init_point }), { status: 200, headers: corsHeaders })
      }

      // Fallback: URL directa al checkout (external_reference viaja en query param)
      const params = new URLSearchParams({
        preapproval_plan_id: env.MP_PLAN_ID,
        external_reference: user_id,
        payer_email: user_email,
      })
      return new Response(JSON.stringify({
        init_point: `https://www.mercadopago.com.ar/subscriptions/checkout?${params}`,
      }), { status: 200, headers: corsHeaders })
    }

    // ── Cancel subscription ───────────────────────────────────────────────────
    if (body.action === 'cancel_subscription') {
      const { user_id } = body
      if (!user_id) {
        return new Response(JSON.stringify({ error: 'Falta user_id' }), { status: 400, headers: corsHeaders })
      }
      const callerUser = await verifyUserJwt(env, request)
      if (!callerUser || callerUser.id !== user_id) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
      }
      try {
        const perfilRes = await supabaseServiceFetch(env, `perfiles?id=eq.${user_id}&select=mp_subscription_id,premium_hasta`)
        const rows = await perfilRes.json()
        const subId = rows?.[0]?.mp_subscription_id
        const premiumHasta = rows?.[0]?.premium_hasta || null
        if (!subId) {
          return new Response(JSON.stringify({ error: 'No hay suscripción activa vinculada' }), { status: 404, headers: corsHeaders })
        }
        const cancelRes = await mpFetch(env, `/preapproval/${subId}`, {
          method: 'PUT',
          body: JSON.stringify({ status: 'cancelled' }),
        })
        console.log('[cancel_subscription] MP response:', cancelRes?.status)
        // Registrar cancelación en suscripciones; perfiles NO se toca (acceso hasta premium_hasta)
        await persistSubscription(env, { userId: user_id, subId, status: 'cancelled', nextPayment: premiumHasta })
        return new Response(JSON.stringify({ ok: true, premium_hasta: premiumHasta }), { status: 200, headers: corsHeaders })
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders })
      }
    }

    // ── Grant premium manually ────────────────────────────────────────────────
    if (body.action === 'grant_premium') {
      const { admin_key, email, months } = body
      if (admin_key !== env.ADMIN_KEY) {
        return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: corsHeaders })
      }
      if (!email) {
        return new Response(JSON.stringify({ error: 'Falta email' }), { status: 400, headers: corsHeaders })
      }
      const userId = await findUserIdByEmail(env, email)
      if (!userId) {
        return new Response(JSON.stringify({ error: `No se encontró usuario con email ${email}` }), { status: 404, headers: corsHeaders })
      }
      const premiumHasta = new Date(Date.now() + (months || 1) * 30 * 24 * 60 * 60 * 1000).toISOString()
      await supabaseServiceFetch(env, 'perfiles', {
        method: 'POST',
        body: JSON.stringify({ id: userId, es_premium: true, premium_hasta: premiumHasta, premium_source: 'legacy', updated_at: new Date().toISOString() }),
      })
      return new Response(JSON.stringify({ ok: true, user_id: userId, premium_hasta: premiumHasta }), { status: 200, headers: corsHeaders })
    }

    // ── Check subscription status ─────────────────────────────────────────────
    if (body.action === 'subscription_status') {
      const { user_id } = body
      if (!user_id) {
        return new Response(JSON.stringify({ error: 'Falta user_id' }), { status: 400, headers: corsHeaders })
      }
      try {
        const res = await supabaseServiceFetch(env, `perfiles?id=eq.${user_id}&select=es_premium,premium_hasta,mp_subscription_id,premium_source`)
        const rows = await res.json()
        const perfil = rows?.[0]
        // Si premium_hasta ya venció, considerar no-premium aunque el flag diga true
        const ahora = new Date()
        const hastaDate = perfil?.premium_hasta ? new Date(perfil.premium_hasta) : null
        const esPremiumReal = perfil?.es_premium && hastaDate && hastaDate > ahora
        return new Response(JSON.stringify({
          es_premium: esPremiumReal || false,
          premium_hasta: perfil?.premium_hasta || null,
          mp_subscription_id: perfil?.mp_subscription_id || null,
          premium_source: perfil?.premium_source || null,
        }), { status: 200, headers: corsHeaders })
      } catch {
        return new Response(JSON.stringify({ es_premium: false }), { status: 200, headers: corsHeaders })
      }
    }

    // ── Sync MP subscription by email (admin repair) ──────────────────────────
    if (body.action === 'sync_mp_subscription') {
      const { admin_key, payer_email, user_id } = body
      if (admin_key !== env.ADMIN_KEY) {
        return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: corsHeaders })
      }
      if (!payer_email || !user_id) {
        return new Response(JSON.stringify({ error: 'Faltan payer_email y user_id' }), { status: 400, headers: corsHeaders })
      }
      const search = await mpFetch(env,
        `/preapproval/search?status=authorized&preapproval_plan_id=${env.MP_PLAN_ID}&payer_email=${encodeURIComponent(payer_email)}&limit=5`
      )
      const sub = search?.results?.[0]
      if (!sub) {
        return new Response(JSON.stringify({ error: 'No se encontró suscripción autorizada en MP' }), { status: 404, headers: corsHeaders })
      }
      const nextPayment = sub.next_payment_date ? new Date(sub.next_payment_date).toISOString() : null
      const result = await persistSubscription(env, { userId: user_id, subId: sub.id, status: 'authorized', nextPayment })
      return new Response(JSON.stringify({ ok: true, mp_subscription_id: sub.id, ...result }), { status: 200, headers: corsHeaders })
    }

    // ── Fetch LinkedIn URL ────────────────────────────────────────────────────
    if (body.action === 'fetch_url') {
      const { url: fetchUrl } = body
      if (!fetchUrl || !String(fetchUrl).startsWith('https://www.linkedin.com/in/')) {
        return new Response(JSON.stringify({ blocked: true }), { status: 200, headers: corsHeaders })
      }
      const ctrl = new AbortController()
      setTimeout(() => ctrl.abort(), 5000)
      try {
        const r = await fetch(fetchUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
          signal: ctrl.signal,
          redirect: 'follow',
        })
        const html = await r.text()
        const isBlocked = r.url.includes('login') || r.url.includes('authwall') || html.includes('authwall')
        if (isBlocked) return new Response(JSON.stringify({ blocked: true }), { status: 200, headers: corsHeaders })
        return new Response(JSON.stringify({ html: html.slice(0, 60000) }), { status: 200, headers: corsHeaders })
      } catch {
        return new Response(JSON.stringify({ blocked: true }), { status: 200, headers: corsHeaders })
      }
    }

    // ── LinkedIn OAuth ────────────────────────────────────────────────────────
    if (body.action === 'linkedin_auth') {
      const { code, redirect_uri } = body
      if (!code || !redirect_uri) {
        return new Response(JSON.stringify({ error: 'Faltan parámetros: code y redirect_uri son requeridos.' }), { status: 400, headers: corsHeaders })
      }
      try {
        const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri,
            client_id: env.LINKEDIN_CLIENT_ID || '',
            client_secret: env.LINKEDIN_CLIENT_SECRET || '',
          }),
        })
        const tokenData = await tokenRes.json()
        if (!tokenData.access_token) {
          return new Response(JSON.stringify({ error: tokenData.error_description || 'Error al obtener el token de LinkedIn.' }), { status: 400, headers: corsHeaders })
        }
        const userRes = await fetch('https://api.linkedin.com/v2/userinfo', {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        })
        const user = await userRes.json()
        return new Response(JSON.stringify({
          name: user.name || [user.given_name, user.family_name].filter(Boolean).join(' '),
          email: user.email,
          picture: user.picture,
          headline: user.headline,
          summary: user.summary,
        }), { status: 200, headers: corsHeaders })
      } catch {
        return new Response(JSON.stringify({ error: 'Error de conexión con LinkedIn. Intentá de nuevo.' }), { status: 502, headers: corsHeaders })
      }
    }

    // ── Gemini API diagnostic endpoint ───────────────────────────────────────────
    if (body.action === 'ping_gemini') {
      const geminiKeys = (env.GEMINI_API_KEYS || env.GEMINI_API_KEY || '').split(',').map(k => k.trim()).filter(Boolean)
      if (!geminiKeys.length) {
        return new Response(JSON.stringify({ ok: false, error: 'NO_KEYS' }), { status: 200, headers: corsHeaders })
      }
      const key = geminiKeys[0]
      const maskedKey = key.slice(0, 8) + '...' + key.slice(-4)
      const model = 'gemini-2.5-flash-lite'
      const TIMEOUT = 15_000

      // Fake job list that mimics the real matching payload size (3 jobs × ~700 chars)
      const fakeSystemPrompt = `Sos un headhunter digital senior. Evaluá el fit de cada aviso laboral para el candidato y respondé SOLO JSON: {"matches":[{"job_index":0,"match_score":7.5,"match_type":"Directo","strengths":["str"],"gaps":[],"summary":"str"}]}`
      const fakeJobContent = `PERFIL DEL CANDIDATO:\nGerente de RRHH, 10 años de experiencia en empresas de tecnología. Especialidad en talent acquisition y desarrollo organizacional. Buenos Aires, Argentina.\nPROFESIÓN DOMINANTE DETECTADA: Gerente RRHH | FAMILIA: HR/Personas | SENIORITY: nivel 5\n\nAVISOS LABORALES:\n[0] HR Manager | Empresa Tech | Buenos Aires | Presencial/Híbrido\nSkills: HRIS, Excel, liderazgo\nSeniority: Senior\nDescripción: Buscamos HR Manager para liderar el equipo de personas. Responsable de talent acquisition, desarrollo organizacional, cultura y clima laboral. Experiencia mínima 5 años en posiciones similares.\n\n[1] Head of People | Startup SaaS | Remoto | Remoto 100%\nSkills: Workday, cultura organizacional\nSeniority: Senior/Lead\nDescripción: Startup de 80 personas busca su primera Head of People. Construirás el área desde cero: procesos, políticas, estructura de seniority. Ideal candidato con background en scale-ups.\n\n[2] Data Analyst | Empresa de datos | Buenos Aires | Presencial\nSkills: Python, SQL, Tableau\nSeniority: Semi Senior\nDescripción: Analista de datos para equipo de BI. Construcción de dashboards y modelos predictivos. Experiencia en Python y SQL requerida.`

      const scenarios = [
        {
          label: 'A_tiny_no_system_no_thinking',
          body: {
            contents: [{ role: 'user', parts: [{ text: 'respond with the single word: ok' }] }],
            generationConfig: { temperature: 0, maxOutputTokens: 10 },
          },
        },
        {
          label: 'B_tiny_with_thinkingBudget0_inside_genConfig',
          body: {
            contents: [{ role: 'user', parts: [{ text: 'respond with the single word: ok' }] }],
            generationConfig: { temperature: 0, maxOutputTokens: 10, thinkingConfig: { thinkingBudget: 0 } },
          },
        },
        {
          label: 'C_tiny_with_system_instruction',
          body: {
            system_instruction: { parts: [{ text: fakeSystemPrompt }] },
            contents: [{ role: 'user', parts: [{ text: 'respond with the single word: ok' }] }],
            generationConfig: { temperature: 0, maxOutputTokens: 10 },
          },
        },
        {
          label: 'D_medium_system_plus_jobs_no_thinking',
          body: {
            system_instruction: { parts: [{ text: fakeSystemPrompt }] },
            contents: [{ role: 'user', parts: [{ text: fakeJobContent }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 512 },
          },
        },
        {
          label: 'E_medium_system_plus_jobs_with_thinkingBudget0',
          body: {
            system_instruction: { parts: [{ text: fakeSystemPrompt }] },
            contents: [{ role: 'user', parts: [{ text: fakeJobContent }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 512, thinkingConfig: { thinkingBudget: 0 } },
          },
        },
        {
          label: 'F_REAL_system_prompt_fake_jobs',
          body: {
            system_instruction: { parts: [{ text: JOB_MATCHING_SYSTEM_PROMPT }] },
            contents: [{ role: 'user', parts: [{ text: fakeJobContent }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 512 },
          },
        },
        {
          label: 'G_REAL_system_10_fake_jobs_4096tokens',
          body: {
            system_instruction: { parts: [{ text: JOB_MATCHING_SYSTEM_PROMPT }] },
            contents: [{ role: 'user', parts: [{ text: `PERFIL DEL CANDIDATO:\nGerente de RRHH, 10 años, tecnología, Buenos Aires.\nPROFESIÓN DOMINANTE DETECTADA: Gerente RRHH | FAMILIA: HR/Personas | SENIORITY: nivel 5\n\nAVISOS LABORALES:\n[0] HR Manager | TechCo | Buenos Aires | Presencial\nSkills: HRIS, liderazgo\nSeniority: Senior\nDescripción: Responsable del área de personas, gestión de equipos, reclutamiento y cultura organizacional.\n\n[1] Head of People | Startup | Remoto | Remoto 100%\nSkills: Workday\nSeniority: Lead\nDescripción: Liderar el equipo de HR desde cero en startup de 80 personas.\n\n[2] Talent Manager | Fintech | CABA | Híbrido\nSkills: LinkedIn Recruiter\nSeniority: Senior\nDescripción: Gestión de procesos de selección end-to-end para perfiles tech y no-tech.\n\n[3] HRBP Senior | Empresa industrial | GBA | Presencial\nSkills: SAP HCM\nSeniority: Senior\nDescripción: Socio estratégico de negocio para unidades industriales, gestión de conflictos y clima.\n\n[4] Gerente RRHH | Retail | CABA | Presencial\nSkills: Nómina, RRHH generalista\nSeniority: Gerente\nDescripción: Gestión integral del área de personas en empresa retail de 500 empleados.\n\n[5] L&D Manager | Consultora | Remoto | Remoto 100%\nSkills: LMS, e-learning\nSeniority: Manager\nDescripción: Diseñar e implementar programas de aprendizaje y desarrollo para clientes corporativos.\n\n[6] Data Analyst | Empresa de datos | Buenos Aires | Presencial\nSkills: Python, SQL\nSeniority: Semi Senior\nDescripción: Análisis de datos para equipos de negocio.\n\n[7] Product Manager | SaaS | Remoto | Remoto 100%\nSkills: Roadmap, Agile\nSeniority: Senior\nDescripción: Gestionar el roadmap de producto para plataforma B2B.\n\n[8] Compensation & Benefits Analyst | Multinacional | CABA | Híbrido\nSkills: Beneficios, compensaciones\nSeniority: Analista\nDescripción: Administración de esquemas de compensación y beneficios para 300 empleados.\n\n[9] HR Operations Specialist | Tech | CABA | Híbrido\nSkills: HRIS, procesos\nSeniority: Semi Senior\nDescripción: Gestión de procesos administrativos de HR, onboarding y sistemas de RRHH.` }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
          },
        },
      ]

      const results = []
      for (const scenario of scenarios) {
        const t0 = Date.now()
        try {
          const ctrl = new AbortController()
          const tid = setTimeout(() => ctrl.abort(), TIMEOUT)
          const r = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
            { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(scenario.body), signal: ctrl.signal }
          )
          clearTimeout(tid)
          const respText = await r.text()
          let respJson = null
          try { respJson = JSON.parse(respText) } catch {}
          // Extract text from first non-thinking part
          const parts = respJson?.candidates?.[0]?.content?.parts || []
          const textPart = parts.find(p => !p.thought)
          results.push({
            scenario: scenario.label,
            http_status: r.status,
            ok: r.ok,
            latency_ms: Date.now() - t0,
            gemini_text: textPart?.text?.slice(0, 100) || null,
            thinking_tokens: respJson?.usageMetadata?.thoughtsTokenCount || 0,
            output_tokens: respJson?.usageMetadata?.candidatesTokenCount || 0,
            error_message: respJson?.error?.message || null,
          })
        } catch (err) {
          results.push({
            scenario: scenario.label,
            http_status: null, ok: false,
            latency_ms: Date.now() - t0,
            error_message: err.name === 'AbortError' ? `AbortError after ${TIMEOUT}ms` : err.message,
          })
        }
      }
      return new Response(JSON.stringify({ masked_key: maskedKey, model, results }), { status: 200, headers: corsHeaders })
    }

    // ── Radar Laboral — Job Recommendations ──────────────────────────────────────
    if (body.action === 'job_search') {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown'
      const rl = await checkRateLimit(env, ip, 'job_search')
      if (!rl.ok) return new Response(
        JSON.stringify({ error: { message: `Límite de búsqueda alcanzado (${rl.limit}/hora). Intentá en 60 minutos.` } }),
        { status: 429, headers: corsHeaders }
      )
      return handleJobSearch(body, request, env, ctx, corsHeaders)
    }

    if (body.action === 'ai_job_recommendations') {
      if (env.APP_TOKEN) {
        const appToken = request.headers.get('X-App-Token')
        if (appToken !== env.APP_TOKEN) return new Response(JSON.stringify({ error: { message: 'Unauthorized' } }), { status: 401, headers: corsHeaders })
      }
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown'
      const rl = await checkRateLimit(env, ip, 'job_search')
      if (!rl.ok) return new Response(
        JSON.stringify({ error: { message: `Límite de búsqueda alcanzado (${rl.limit}/hora). Intentá en 60 minutos.` } }),
        { status: 429, headers: corsHeaders }
      )
      return handleAiJobRecommendations(body, request, env, ctx, corsHeaders, callGeminiApi, logAiUsage)
    }

    if (body.action === 'job_save_to_kanban') {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown'
      const rl = await checkRateLimit(env, ip, 'job_save_to_kanban')
      if (!rl.ok) return new Response(
        JSON.stringify({ error: { message: 'Límite alcanzado. Intentá en 60 minutos.' } }),
        { status: 429, headers: corsHeaders }
      )
      return handleJobSaveToKanban(body, request, env, ctx, corsHeaders, verifyUserJwt)
    }

    if (body.action === 'job_update_status') {
      return handleJobUpdateStatus(body, request, env, ctx, corsHeaders, verifyUserJwt)
    }

    // ── Named AI actions (system prompts stored in Worker, not in client bundle) ─
    if (typeof body.action === 'string' && body.action.startsWith('ai_')) {
      if (env.APP_TOKEN) {
        const appToken = request.headers.get('X-App-Token')
        if (appToken !== env.APP_TOKEN) {
          return new Response(JSON.stringify({ error: { message: 'Unauthorized' } }), { status: 401, headers: corsHeaders })
        }
      }
      const promptKey = body.action.slice(3) // 'ai_analyze_linkedin' → 'analyze_linkedin'
      const promptEntry = AI_SYSTEM_PROMPTS[promptKey]
      // interview_chat uses a function that receives interview_meta from the request body
      const systemPrompt = typeof promptEntry === 'function'
        ? promptEntry(body.interview_meta || {})
        : promptEntry
      if (!systemPrompt) {
        return new Response(JSON.stringify({ error: 'Unknown AI action: ' + body.action }), { status: 400, headers: corsHeaders })
      }
      if (!body.contents) {
        return new Response(JSON.stringify({ error: 'Missing contents' }), { status: 400, headers: corsHeaders })
      }
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown'
      const rl = await checkRateLimit(env, ip, promptKey)
      if (!rl.ok) {
        const rlMsg = rl.reason === 'daily'
          ? `Límite diario de uso alcanzado (${rl.limit} requests/día). Volvé mañana.`
          : `Límite de uso alcanzado (${rl.limit} por hora). Volvé a intentarlo en 60 minutos.`
        return new Response(JSON.stringify({ error: { message: rlMsg } }), { status: 429, headers: corsHeaders })
      }
      const userId = getUserIdFromToken(request)
      return callGeminiApi(env, ctx, {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: body.contents,
        generationConfig: body.generationConfig,
      }, corsHeaders, { feature: promptKey, userId })
    }

    // ── Gemini raw proxy (PDF extraction only) ────────────────────────────────
    if (!body.contents) return new Response(JSON.stringify({ error: { message: 'Falta el campo requerido: contents' } }), { status: 400, headers: corsHeaders })

    // APP_TOKEN is required on this path — fail hard if not configured
    if (!env.APP_TOKEN) {
      return new Response(JSON.stringify({ error: { message: 'Raw proxy disabled: APP_TOKEN not configured' } }), { status: 503, headers: corsHeaders })
    }
    const appToken = request.headers.get('X-App-Token')
    if (appToken !== env.APP_TOKEN) {
      return new Response(JSON.stringify({ error: { message: 'Unauthorized' } }), { status: 401, headers: corsHeaders })
    }

    // Rate limit raw proxy at 5 req/hour/IP (PDF uploads are large — protect quota)
    const proxyIp = request.headers.get('CF-Connecting-IP') || 'unknown'
    const proxyRl = await checkRateLimit(env, proxyIp, '_raw_proxy')
    if (!proxyRl.ok) {
      return new Response(JSON.stringify({ error: { message: 'Límite de uso alcanzado. Intentá en 60 minutos.' } }), { status: 429, headers: corsHeaders })
    }

    const { model: modelField, ...geminiBody } = body
    return callGeminiApi(env, ctx, geminiBody, corsHeaders, { feature: 'pdf_extraction' })
  },
}

// ══════════════════════════════════════════════════════════════════════════════
// RADAR LABORAL — Inlined from job_recommendations.js
// ══════════════════════════════════════════════════════════════════════════════



// ══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — Job Source Fetchers
// ══════════════════════════════════════════════════════════════════════════════

// ── ATS Company Registry ─────────────────────────────────────────────────────
// Companies with confirmed public ATS boards. Slugs verified at 2026-05.
// To fix a slug without redeploying: set KV["ats:registry:overrides"] =
//   JSON.stringify({ greenhouse: { "bad-slug": "correct-slug" } })
const ATS_COMPANIES = {
  greenhouse: [
    { slug: 'mercadolibre', name: 'Mercado Libre',  country: 'AR', families: ['Tecnología','Marketing/Growth','Operaciones','Finanzas'],  tags: ['backend','frontend','data','mobile','devops'] },
    { slug: 'auth0',        name: 'Auth0 / Okta',   country: 'US', families: ['Tecnología'],                                               tags: ['backend','devops','security'] },
    { slug: 'rappi',        name: 'Rappi',           country: 'CO', families: ['Tecnología','Operaciones','Marketing/Growth'],              tags: ['backend','data','mobile','devops'] },
    { slug: 'etermax',      name: 'Etermax',         country: 'AR', families: ['Tecnología'],                                              tags: ['backend','mobile','data'] },
    { slug: 'pomelo',       name: 'Pomelo',          country: 'AR', families: ['Tecnología','Finanzas'],                                   tags: ['backend','mobile','data','security'] },
    { slug: 'bitso',        name: 'Bitso',           country: 'MX', families: ['Tecnología','Finanzas'],                                   tags: ['backend','security','data'] },
    { slug: 'globant',      name: 'Globant',         country: 'AR', families: ['Tecnología'],                                              tags: ['backend','frontend','data','devops','qa'] },
    { slug: 'wellhub',      name: 'Wellhub',         country: 'BR', families: ['HR/Personas','Marketing/Growth','Tecnología'],             tags: ['backend','frontend','data','hr'] },
    { slug: 'dlocal',       name: 'dLocal',          country: 'UY', families: ['Tecnología','Finanzas'],                                   tags: ['backend','data','security','fintech'] },
    { slug: 'nuvemshop',    name: 'Nuvemshop',       country: 'AR', families: ['Tecnología','Marketing/Growth','Operaciones'],             tags: ['backend','frontend','data','mobile'] },
    { slug: 'brex',         name: 'Brex',            country: 'US', families: ['Finanzas','Tecnología','Ventas/BD'],                       tags: ['backend','data','fintech'] },
  ],
  lever: [
    { slug: 'despegar',    name: 'Despegar',     country: 'AR', families: ['Tecnología','Marketing/Growth','Operaciones'],  tags: ['backend','frontend','data'] },
    { slug: 'mural',       name: 'MURAL',        country: 'AR', families: ['Tecnología'],                                  tags: ['frontend','backend','design','product'] },
    { slug: 'ripio',       name: 'Ripio',        country: 'AR', families: ['Tecnología','Finanzas'],                       tags: ['backend','mobile'] },
    { slug: 'tiendanube',  name: 'Tienda Nube',  country: 'AR', families: ['Tecnología','Marketing/Growth'],               tags: ['backend','frontend','data'] },
    { slug: 'satellogic',  name: 'Satellogic',   country: 'AR', families: ['Tecnología'],                                  tags: ['backend','data','ml','python'] },
    { slug: 'lemon',       name: 'Lemon',        country: 'AR', families: ['Tecnología','Finanzas'],                       tags: ['backend','mobile'] },
    { slug: 'kavak',       name: 'Kavak',        country: 'MX', families: ['Tecnología','Operaciones','Ventas/BD'],        tags: ['backend','data','mobile','devops'] },
  ],
  smartrecruiters: [
    { slug: 'globant',       name: 'Globant',         country: 'AR', families: ['Tecnología'],                                   tags: ['backend','frontend','data','devops','qa'] },
    { slug: 'deliveryhero',  name: 'PedidosYa / DH',  country: 'AR', families: ['Tecnología','Operaciones','Marketing/Growth'], tags: ['backend','data','mobile','devops'] },
  ],
  ashby: [
    { slug: 'linear',    name: 'Linear',    country: 'US', families: ['Tecnología'],                                        tags: ['backend','frontend'] },
    { slug: 'vercel',    name: 'Vercel',    country: 'US', families: ['Tecnología'],                                        tags: ['backend','devops','frontend'] },
    { slug: 'remote',    name: 'Remote.com',country: 'US', families: ['HR/Personas','Operaciones','Ventas/BD','Tecnología'], tags: ['backend','frontend','hr','sales'] },
    { slug: 'rippling',  name: 'Rippling',  country: 'US', families: ['HR/Personas','Finanzas','Tecnología'],               tags: ['backend','frontend','hr','fintech'] },
    { slug: 'deel',      name: 'Deel',      country: 'US', families: ['HR/Personas','Finanzas','Legal/Compliance','Tecnología'], tags: ['backend','frontend','hr','legal','fintech'] },
  ],
  workable: [
    { slug: 'uala',      name: 'Ualá',      country: 'AR', families: ['Finanzas','Tecnología','Operaciones'],              tags: ['backend','mobile','data','security'] },
    { slug: 'aivo',      name: 'Aivo',      country: 'AR', families: ['Tecnología','Ventas/BD'],                           tags: ['backend','frontend','ml','data'] },
    { slug: 'lemontech', name: 'Lemontech', country: 'CL', families: ['Tecnología','Legal/Compliance'],                    tags: ['backend','frontend','devops'] },
    { slug: 'modo',      name: 'MODO',      country: 'AR', families: ['Finanzas','Tecnología'],                            tags: ['backend','mobile'] },
    { slug: 'mango-dsp', name: 'Mango DSP', country: 'AR', families: ['Marketing/Growth','Tecnología'],                    tags: ['backend','data','devops'] },
  ],
  teamtailor: [
    { slug: 'global66',            name: 'Global66',         country: 'CL', families: ['Finanzas','Tecnología'],               tags: ['backend','mobile','data'] },
    { slug: 'knauf-south-america', name: 'Knauf South Am.',  country: 'AR', families: ['Operaciones','Tecnología'],            tags: ['backend','data','devops'] },
    { slug: 'quala',               name: 'Quala',            country: 'CO', families: ['Operaciones','Marketing/Growth'],      tags: ['data','backend','marketing'] },
  ],
  recruitee: [
    { slug: 'baufest',    name: 'Baufest',  country: 'AR', families: ['Tecnología'],            tags: ['backend','frontend','qa','devops'] },
    { slug: 'n5now',      name: 'N5',       country: 'AR', families: ['Finanzas','Tecnología'], tags: ['backend','data','mobile'] },
    { slug: 'practia',    name: 'Practia',  country: 'AR', families: ['Tecnología'],            tags: ['backend','devops','data','frontend'] },
  ],
  personio: [
    { slug: 'factorial',    name: 'Factorial HR',  country: 'ES', families: ['HR/Personas','Tecnología'],         tags: ['backend','frontend','devops','data','hr'] },
    { slug: 'typeform',     name: 'Typeform',      country: 'ES', families: ['Tecnología','Marketing/Growth'],    tags: ['backend','frontend','data'] },
    { slug: 'jobandtalent', name: 'Job&Talent',    country: 'ES', families: ['HR/Personas','Operaciones'],        tags: ['backend','data','mobile','hr'] },
  ],
  workday: [
    { slug: 'accenture', name: 'Accenture', country: 'AR', families: ['all'],                                  tags: ['backend','frontend','data','devops','qa'],    cxsUrl: 'https://accenture.wd3.myworkdayjobs.com/wday/cxs/accenture/AccentureCareers/jobs' },
    { slug: 'sap',       name: 'SAP',       country: 'AR', families: ['Tecnología','Ventas/BD','Finanzas'],     tags: ['backend','data','devops','frontend'],         cxsUrl: 'https://sap.wd3.myworkdayjobs.com/wday/cxs/sap/SAP_Global/jobs' },
    { slug: 'pwc-ar',    name: 'PwC',       country: 'AR', families: ['Finanzas','Legal/Compliance','all'],     tags: ['data','backend','fintech'],                  cxsUrl: 'https://pwc.wd3.myworkdayjobs.com/wday/cxs/pwc/Global_Campus_Experienced/jobs' },
  ],
}

// Score companies against user profile and select top N per ATS type
function selectAtsCompanies(userProfile, maxPerAts = 5, professionFamily = null) {
  const profileLower = (userProfile || '').toLowerCase()
  const tagSignals = {
    fintech:   ['fintech','payments','banking','crypto','blockchain'],
    ecommerce: ['ecommerce','marketplace','retail'],
    data:      ['data','sql','python','analytics','ml','machine learning','bi'],
    backend:   ['backend','api','node','java','python','golang','microservices'],
    frontend:  ['frontend','react','vue','angular','javascript','typescript'],
    mobile:    ['mobile','ios','android','swift','kotlin','react native','flutter'],
    devops:    ['devops','kubernetes','docker','aws','gcp','azure','terraform'],
    design:    ['ux','ui','design','figma','product design'],
    ml:        ['machine learning','ml','nlp','pytorch','tensorflow','data science'],
    security:  ['security','ciberseguridad','cybersecurity','infosec'],
    hr:        ['rrhh','recursos humanos','talent','people','hr','nómina','payroll','recruiting'],
    finance:   ['finanzas','controller','fp&a','tesorería','contable','auditor','presupuesto'],
    marketing: ['marketing','growth','brand','performance','seo','sem','community','content'],
    sales:     ['ventas','sales','comercial','account executive','business development'],
    operations:['operaciones','operations','supply chain','logística','logistics','procurement'],
    legal:     ['legal','compliance','abogado','counsel','contratos','regulatory'],
  }
  const activeSignals = Object.entries(tagSignals)
    .filter(([, kws]) => kws.some(kw => profileLower.includes(kw)))
    .map(([tag]) => tag)

  const selected = {}
  for (const [atsType, companies] of Object.entries(ATS_COMPANIES)) {
    const scored = companies.map(c => {
      let score = activeSignals.length
        ? (c.tags || []).filter(t => activeSignals.includes(t)).length
        : 1

      // Family-aware boost/penalty
      if (professionFamily && c.families) {
        if (c.families.includes('all') || c.families.includes(professionFamily)) {
          score += 5
        } else {
          score -= 2  // mild penalty (don't zero out — may still have cross-functional roles)
        }
      }

      return { ...c, _score: Math.max(0, score) }
    })
    .filter(c => c._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, maxPerAts)
    if (scored.length) selected[atsType] = scored
  }
  return selected
}

// KV slug-override (fix a broken slug without redeploying)
async function getAtsSlugOverride(atsType, slug, env) {
  if (!env.RATE_LIMIT_KV) return null
  try {
    const raw = await env.RATE_LIMIT_KV.get('ats:registry:overrides')
    if (!raw) return null
    return JSON.parse(raw)?.[atsType]?.[slug] || null
  } catch { return null }
}

// ATS board KV cache — single stable key per board, refreshed daily via 24h TTL
async function getAtsBoardFromKV(env, atsType, slug) {
  if (!env.RATE_LIMIT_KV) return null
  try {
    const raw = await env.RATE_LIMIT_KV.get(`ats:${atsType}:${slug}`)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

async function putAtsBoardToKV(env, atsType, slug, jobs) {
  if (!env.RATE_LIMIT_KV || !jobs.length) return
  try {
    await env.RATE_LIMIT_KV.put(`ats:${atsType}:${slug}`, JSON.stringify(jobs), { expirationTtl: 86_400 })
  } catch (e) { console.warn(`[KV] putAtsBoardToKV failed for ${atsType}:${slug}: ${e?.message}`) }
}

// Fetch a single ATS company board (KV-cached, date-keyed)
async function fetchAtsCompanyBoard(atsType, company, env) {
  const cached = await getAtsBoardFromKV(env, atsType, company.slug)
  if (cached) return cached

  const slugOverride = await getAtsSlugOverride(atsType, company.slug, env)
  const slug = slugOverride || company.slug
  const ctrl = new AbortController()
  const tid  = setTimeout(() => ctrl.abort(), 4_000)
  const UA   = 'OptimizaLK/2.0 (job-aggregator; https://optimizalinkedin.com)'

  let jobs = []
  try {
    let r, raw
    if (atsType === 'greenhouse') {
      r = await fetch(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`, {
        headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: ctrl.signal,
      })
      if (r.ok) { raw = await r.json(); jobs = normalizeGreenhouse(raw.jobs || [], { ...company, slug }) }
      else console.warn(`[greenhouse] HTTP ${r.status} for ${slug}`)
    }
    else if (atsType === 'lever') {
      r = await fetch(`https://api.lever.co/v0/postings/${slug}?mode=json`, {
        headers: { 'User-Agent': UA }, signal: ctrl.signal,
      })
      if (r.ok) { raw = await r.json(); jobs = normalizeLever(Array.isArray(raw) ? raw : [], { ...company, slug }) }
      else console.warn(`[lever] HTTP ${r.status} for ${slug}`)
    }
    else if (atsType === 'smartrecruiters') {
      r = await fetch(`https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=100`, {
        headers: { 'User-Agent': UA }, signal: ctrl.signal,
      })
      if (r.ok) { raw = await r.json(); jobs = normalizeSmartRecruiters(raw, { ...company, slug }) }
      else console.warn(`[smartrecruiters] HTTP ${r.status} for ${slug}`)
    }
    else if (atsType === 'ashby') {
      r = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`, {
        headers: { 'User-Agent': UA }, signal: ctrl.signal,
      })
      if (r.ok) { raw = await r.json(); jobs = normalizeAshby(raw, { ...company, slug }) }
      else console.warn(`[ashby] HTTP ${r.status} for ${slug}`)
    }
    else if (atsType === 'workable') {
      r = await fetch(`https://apply.workable.com/api/v1/widget/accounts/${slug}`, {
        headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: ctrl.signal,
      })
      if (r.ok) { raw = await r.json(); jobs = normalizeWorkable(raw, { ...company, slug }) }
      else console.warn(`[workable] HTTP ${r.status} for ${slug}`)
    }
    else if (atsType === 'teamtailor') {
      r = await fetch(`https://${slug}.teamtailor.com/jobs.json`, {
        headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: ctrl.signal,
      })
      if (r.ok) { raw = await r.json(); jobs = normalizeTeamtailor(raw, { ...company, slug }) }
      else console.warn(`[teamtailor] HTTP ${r.status} for ${slug}`)
    }
    else if (atsType === 'recruitee') {
      r = await fetch(`https://${slug}.recruitee.com/api/offers/`, {
        headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: ctrl.signal,
      })
      if (r.ok) { raw = await r.json(); jobs = normalizeRecruitee(raw, { ...company, slug }) }
      else console.warn(`[recruitee] HTTP ${r.status} for ${slug}`)
    }
    else if (atsType === 'personio') {
      const tld = company.personioTld || 'com'
      r = await fetch(`https://${slug}.jobs.personio.${tld}/search.json`, {
        headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: ctrl.signal,
      })
      if (r.ok) { raw = await r.json(); jobs = normalizePersonio(raw, { ...company, slug }) }
      else console.warn(`[personio] HTTP ${r.status} for ${slug}`)
    }
    else if (atsType === 'workday') {
      const cxsUrl = company.cxsUrl
      if (!cxsUrl) { console.warn(`[workday] missing cxsUrl for ${slug}`) }
      else {
        r = await fetch(cxsUrl, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
          body:    JSON.stringify({ appliedFacets: {}, limit: 50, offset: 0, searchText: '' }),
          signal:  ctrl.signal,
        })
        if (r.ok) { raw = await r.json(); jobs = normalizeWorkday(raw, { ...company, slug, cxsUrl }) }
        else console.warn(`[workday] HTTP ${r.status} for ${slug}`)
      }
    }
    if (jobs.length) await putAtsBoardToKV(env, atsType, slug, jobs)
  } catch (err) {
    console.warn(`[ats:${atsType}:${slug}] ${err.name === 'AbortError' ? 'timeout' : err.message}`)
  } finally { clearTimeout(tid) }

  return jobs
}

// Fetch all relevant ATS company boards based on user profile, filter by query relevance
async function fetchAtsCompanies(queries, userProfile, env, professionFamily = null) {
  const selected = selectAtsCompanies(userProfile, 3, professionFamily)  // 3/type × 9 types = 27 max uncached fetches
  const allFetches = []
  for (const [atsType, companies] of Object.entries(selected)) {
    for (const company of companies) {
      allFetches.push(
        fetchAtsCompanyBoard(atsType, company, env)
          .then(jobs => ({ atsType, company: company.name, jobs }))
          .catch(() => ({ atsType, company: '', jobs: [] }))
      )
    }
  }
  const results = await Promise.allSettled(allFetches)
  const allJobs = []
  for (const r of results) {
    if (r.status === 'fulfilled') allJobs.push(...(r.value.jobs || []))
  }
  if (!allJobs.length) return []

  // Local keyword filter — only keep jobs matching at least one query keyword
  const queryKws = queries.join(' ').toLowerCase().split(/\s+/).filter(w => w.length > 3)
  return allJobs.filter(job => {
    const jobText = [job.title, job.description, ...(job.skills_required || [])].join(' ').toLowerCase()
    return queryKws.length === 0 || queryKws.some(kw => jobText.includes(kw))
  })
}


/**
 * Fetch from a single aggregator source with a 10 s timeout.
 * Returns { source, jobs: NormalizedJob[] } or { source, jobs: [], error }.
 */
async function fetchJobSource(source, query, location, remoteOk, env, candidateLocation = null) {
  const ctrl = new AbortController()
  const tid  = setTimeout(() => ctrl.abort(), 10_000)
  const q    = encodeURIComponent(query)
  const UA   = 'OptimizaLK/2.0 (job-search-bot; https://optimizalinkedin.com)'

  try {
    let url, raw

    if (source === 'remoteok') {
      const tag = encodeURIComponent(query.split(' ').slice(0, 2).join('-').toLowerCase())
      url = `https://remoteok.com/api?tags=${tag}&limit=50`
      const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: ctrl.signal })
      raw = await r.json()
      return { source, jobs: normalizeJobs(source, raw) }
    }

    if (source === 'remotive') {
      url = `https://remotive.com/api/remote-jobs?search=${q}&limit=50`
      const r = await fetch(url, { signal: ctrl.signal })
      raw = await r.json()
      return { source, jobs: normalizeJobs(source, raw) }
    }

    if (source === 'jobicy') {
      // LATAM-focused remote jobs (replaces arbeitnow which was European)
      url = `https://jobicy.com/api/v2/remote-jobs?geo=latam&tag=${q}&count=100`
      const r = await fetch(url, { signal: ctrl.signal })
      raw = await r.json()
      return { source, jobs: normalizeJobs(source, raw) }
    }

    if (source === 'adzuna') {
      if (!env.ADZUNA_APP_ID || !env.ADZUNA_APP_KEY) {
        return { source, jobs: [], error: 'adzuna_not_configured' }
      }
      // Adzuna doesn't support 'ar' (Argentina) — closest LATAM coverage is 'br' (Brazil)
      // Fallback to 'us' for remote-only searches where geo doesn't matter
      const country = location?.toLowerCase().includes('arg') ? 'br' : 'us'
      url = `https://api.adzuna.com/v1/api/jobs/${country}/search/1`
        + `?app_id=${env.ADZUNA_APP_ID}&app_key=${env.ADZUNA_APP_KEY}`
        + `&what=${q}&results_per_page=30&content-type=application/json`
      if (location) url += `&where=${encodeURIComponent(location)}`
      const r = await fetch(url, { signal: ctrl.signal })
      raw = await r.json()
      return { source, jobs: normalizeJobs(source, raw) }
    }

    if (source === 'jooble') {
      if (!env.JOOBLE_KEY) return { source, jobs: [], error: 'jooble_not_configured' }
      const r = await fetch(`https://jooble.org/api/${env.JOOBLE_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
        body:   JSON.stringify({ keywords: query, location: location || 'Argentina', page: '1' }),
        signal: ctrl.signal,
      })
      raw = await r.json()
      return { source, jobs: normalizeJobs(source, raw) }
    }

    if (source === 'getonboard') {
      url = `https://www.getonbrd.com/api/v0/jobs?query=${q}&per_page=50`
      const r = await fetch(url, { headers: { 'Accept': 'application/json' }, signal: ctrl.signal })
      raw = await r.json()
      return { source, jobs: normalizeJobs(source, raw) }
    }

    if (source === 'himalayas') {
      const base = `https://himalayas.app/jobs/api?q=${q}&limit=50`
      url = remoteOk ? base : `${base}&countries=argentina`
      const r = await fetch(url, { headers: { 'Accept': 'application/json', 'User-Agent': UA }, signal: ctrl.signal })
      raw = await r.json()
      return { source, jobs: normalizeJobs(source, raw) }
    }

    if (source === 'arbeitnow') {
      const page = Math.ceil(Math.random() * 2)  // Randomly alternate pages 1-2 for variety
      url = `https://www.arbeitnow.com/api/job-board-api?page=${page}${remoteOk ? '&remote=true' : ''}`
      const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' }, signal: ctrl.signal })
      raw = await r.json()
      return { source, jobs: normalizeJobs(source, raw) }
    }

    if (source === 'serper') {
      if (!env.SERPER_API_KEY) {
        console.log('[SERPER] skipped — SERPER_API_KEY not configured in this environment')
        return { source, jobs: [], error: 'serper_not_configured' }
      }
      const geoParams = serperGeoConfig(candidateLocation)
      const serperT0 = Date.now()
      console.log(`[SERPER] START query="${query}" geo=${geoParams.gl}/${geoParams.location}`)

      // Try /jobs endpoint first; if 404 (plan doesn't include jobs endpoint), fall back to
      // /search which returns a `jobs` field when Google shows the jobs SERP block.
      let r = await fetch('https://google.serper.dev/jobs', {
        method:  'POST',
        headers: { 'X-API-KEY': env.SERPER_API_KEY, 'Content-Type': 'application/json', 'User-Agent': UA },
        body:    JSON.stringify({ q: query, ...geoParams, num: 30 }),
        signal:  ctrl.signal,
      })
      let usedSearch = false
      if (r.status === 404) {
        console.warn('[SERPER] /jobs returned 404 — plan may not include jobs endpoint, falling back to /search')
        r = await fetch('https://google.serper.dev/search', {
          method:  'POST',
          headers: { 'X-API-KEY': env.SERPER_API_KEY, 'Content-Type': 'application/json', 'User-Agent': UA },
          body:    JSON.stringify({ q: `${query} empleos`, ...geoParams, num: 30 }),
          signal:  ctrl.signal,
        })
        usedSearch = true
      }

      raw = await r.json()
      const latency = Date.now() - serperT0
      if (!r.ok) {
        const errCode = r.status === 401 ? 'serper_unauthorized'
          : r.status === 429 || r.status === 402 ? 'serper_quota_exceeded'
          : `serper_http_${r.status}`
        console.warn(`[SERPER] HTTP ${r.status} — ${errCode} endpoint=${usedSearch?'/search':'/jobs'} latency=${latency}ms body=${JSON.stringify(raw).slice(0, 200)}`)
        return { source, jobs: [], error: errCode }
      }
      const serperJobs = normalizeJobs(source, raw)
      console.log(`[SERPER] status=${r.status} results=${serperJobs.length} latency=${latency}ms endpoint=${usedSearch?'/search':'/jobs'}`)
      if (serperJobs.length === 0) {
        console.warn(`[SERPER] 0 jobs for query="${query}" endpoint=${usedSearch?'/search':'/jobs'} raw keys: ${Object.keys(raw || {}).join(',')}`)
      }
      return { source, jobs: serperJobs }
    }

    return { source, jobs: [], error: 'unknown_source' }

  } catch (err) {
    return { source, jobs: [], error: err.name === 'AbortError' ? 'timeout' : err.message }
  } finally {
    clearTimeout(tid)
  }
}


/**
 * Fetch from all aggregators + ATS company boards in parallel.
 * Deduplicates with 3-level strategy; ATS version wins over aggregator on URL match.
 * @param {string} userProfile - Used to select relevant ATS companies (no AI cost)
 * @param {string|null} candidateLocation - Auto-detected from profile text; drives Serper geo
 */
async function fetchAllSources(queries, location, remoteOk, env, userProfile = '', candidateLocation = null, professionFamily = null) {
  // Curated sources — Serper (Google Jobs) gets the top 2 headhunter queries (highest ROI
  // per subrequest, returns Google Jobs results that vary by query). Other LATAM-focused
  // sources each get 1 query. himalayas added for remote-only (English remote board).
  // Removed: remoteok/remotive (US-centric), arbeitnow (European), adzuna/jooble (low LATAM).
  const nonSerperSources = remoteOk ? ['getonboard', 'jobicy', 'himalayas'] : ['getonboard', 'jobicy']
  const serperQueries    = env.SERPER_API_KEY ? queries.slice(0, 3) : []
  const sources = [...(env.SERPER_API_KEY ? ['serper'] : []), ...nonSerperSources]

  console.log(`[RADAR:sources] remoteOk=${!!remoteOk} active=[${sources.join(',')}] serperQueries=${serperQueries.length} queries=${JSON.stringify(queries.slice(0,3))}`)

  // Build parallel fetch calls: Serper × 3 queries, each other source × 1 query
  // Worst-case: 3 + 4 sources = 7 aggregator fetches (well within 50-subrequest budget).
  const [aggregatorResults, atsJobs] = await Promise.all([
    Promise.all([
      ...serperQueries.map(q => fetchJobSource('serper', q, location, remoteOk, env, candidateLocation)),
      ...nonSerperSources.map(source => fetchJobSource(source, queries[0], location, remoteOk, env, candidateLocation)),
    ]),
    fetchAtsCompanies(queries, userProfile, env, professionFamily),
  ])

  // Collect aggregator jobs + per-source result counts
  const errors         = {}
  const sourceCounts   = {}
  const rawAggregatorJobs = []
  for (const result of aggregatorResults) {
    if (result.error) errors[result.source] = errors[result.source] || result.error
    if (result.jobs.length) sourceCounts[result.source] = (sourceCounts[result.source] || 0) + result.jobs.length
    for (const job of result.jobs) {
      if (job.url && job.title) rawAggregatorJobs.push(job)
    }
  }
  if (atsJobs.length) sourceCounts['ats'] = atsJobs.length

  // Serper fallback: if headhunter queries returned 0 and there's no quota/auth error,
  // retry with the base user query (queries[2]+) — headhunter titles can miss Google Jobs index.
  const serperError = errors['serper']
  if (serperQueries.length && !sourceCounts['serper'] && !serperError) {
    const fallbackQuery = queries.find(q => !serperQueries.includes(q))
    if (fallbackQuery) {
      console.log(`[SERPER] fallback query="${fallbackQuery}" — headhunter queries returned 0`)
      const fallback = await fetchJobSource('serper', fallbackQuery, location, remoteOk, env, candidateLocation)
      if (fallback.error) {
        errors['serper'] = fallback.error
      } else if (fallback.jobs.length) {
        sourceCounts['serper'] = fallback.jobs.length
        for (const job of fallback.jobs) {
          if (job.url && job.title) rawAggregatorJobs.push(job)
        }
        console.log(`[SERPER] fallback returned ${fallback.jobs.length} jobs`)
      }
    }
  }

  // Merge and 3-level dedup (ATS takes priority over aggregator on URL collision)
  const allJobs = deduplicateJobs([...rawAggregatorJobs, ...atsJobs])

  console.log(`[RADAR:sources] aggregator=${rawAggregatorJobs.length} ats=${atsJobs.length} deduped=${allJobs.length} perSource=${JSON.stringify(sourceCounts)}`)
  if (sources.includes('serper') && !sourceCounts['serper']) {
    console.log(`[SERPER] returned 0 jobs — error=${errors['serper'] || 'none'} — check quota, API key validity, or search terms`)
  }
  if (Object.keys(errors).length) console.warn('[RADAR:sources] errors:', JSON.stringify(errors))

  return { jobs: allJobs, sourceErrors: errors, sourcesUsed: sources, sourceCounts }
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
  } catch (err) {
    console.warn(`[KV] getJobsFromKV parse error for hash ${queryHash}: ${err.message}`)
    return null
  }
}

async function putJobsToKV(env, queryHash, jobs) {
  if (!env.RATE_LIMIT_KV) return
  try {
    await env.RATE_LIMIT_KV.put(
      `jobs:${queryHash}`,
      JSON.stringify(jobs),
      { expirationTtl: JOB_KV_TTL_SECS }
    )
  } catch (err) {
    console.warn(`[KV] putJobsToKV failed for hash ${queryHash}: ${err.message}`)
  }
}

// ── jrec: per-user AI score cache ─────────────────────────────────────────────
// Key: "jrec:{userId}:{queryHash}" — personalised scores keyed by user + query.
// Prevents repeat Gemini calls when the same user re-runs the same search within 2 h.
// Stores: { recommendations, total_jobs_analyzed }
// Live-fetch period tracking: guarantees all sources (Serper + Jooble + ATS) are called
// exactly once per period — daily for premium, monthly for free.
// When the flag is absent the first search bypasses ALL caches (radarCache, jrecCache, jobsKV)
// and triggers a full live fetch. Subsequent searches within the same period use cache normally.
function _liveFetchKey(userId, isPremium) {
  return isPremium
    ? `live_fetch:${userId}:${new Date().toISOString().slice(0, 10)}`   // daily key  YYYY-MM-DD
    : `live_fetch:${userId}:${new Date().toISOString().slice(0, 7)}`    // monthly key YYYY-MM
}
async function hasLiveFetchedThisPeriod(env, userId, isPremium) {
  if (!env.RATE_LIMIT_KV || !userId) return false
  return !!(await env.RATE_LIMIT_KV.get(_liveFetchKey(userId, isPremium)).catch(() => null))
}
function markLiveFetchedThisPeriod(env, userId, isPremium) {
  if (!env.RATE_LIMIT_KV || !userId) return
  const key = _liveFetchKey(userId, isPremium)
  let ttlSecs
  if (isPremium) {
    const midnight = new Date(); midnight.setUTCHours(24, 0, 0, 0)
    ttlSecs = Math.max(60, Math.floor((midnight.getTime() - Date.now()) / 1000) + 300)
  } else {
    const firstNextMonth = new Date()
    firstNextMonth.setUTCMonth(firstNextMonth.getUTCMonth() + 1, 1)
    firstNextMonth.setUTCHours(0, 0, 0, 0)
    ttlSecs = Math.max(60, Math.floor((firstNextMonth.getTime() - Date.now()) / 1000) + 300)
  }
  env.RATE_LIMIT_KV.put(key, '1', { expirationTtl: ttlSecs }).catch(() => {})
}

async function getJrecFromKV(env, userId, queryHash) {
  if (!env.RATE_LIMIT_KV || !userId) return null
  try {
    const raw = await env.RATE_LIMIT_KV.get(`jrec:${userId}:${queryHash}:${JREC_PROMPT_VERSION}`)
    return raw ? JSON.parse(raw) : null
  } catch (err) {
    console.warn(`[KV] getJrecFromKV parse error for user ${userId}: ${err.message}`)
    return null
  }
}

async function putJrecToKV(env, userId, queryHash, payload, ttlSecs = JREC_KV_TTL_SECS) {
  if (!env.RATE_LIMIT_KV || !userId) return
  try {
    await env.RATE_LIMIT_KV.put(
      `jrec:${userId}:${queryHash}:${JREC_PROMPT_VERSION}`,
      JSON.stringify(payload),
      { expirationTtl: ttlSecs }
    )
  } catch (err) {
    console.warn(`[KV] putJrecToKV failed for user ${userId}: ${err.message}`)
  }
}

// ── Profile hash — identifies same profile across searches (16 hex chars) ────
async function computeProfileHash(profileText) {
  const normalized = (profileText || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3)
    .sort()
    .join('|')
    .slice(0, 2000)
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16)
}

// ── radar_search_history helpers ─────────────────────────────────────────────
async function getRadarCache(env, userId, profileHash, queryHash) {
  if (!userId || !env.SUPABASE_SERVICE_ROLE_KEY) return null
  try {
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/radar_search_history`
      + `?user_id=eq.${userId}&profile_hash=eq.${profileHash}&query_hash=eq.${queryHash}`
      + `&expires_at=gte.${new Date().toISOString()}`
      + `&prompt_version=eq.${JREC_PROMPT_VERSION}`
      + `&select=results,top_score,match_count,created_at&limit=1`,
      { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } }
    )
    const rows = await res.json().catch(() => [])
    return Array.isArray(rows) && rows[0]?.results ? rows[0] : null
  } catch (err) {
    console.warn(`[DB] getRadarCache error for user ${userId}: ${err.message}`)
    return null
  }
}

async function putRadarCache(env, ctx, userId, profileHash, queryHash, recommendations, isPremium) {
  if (!userId || !recommendations.length || !env.SUPABASE_SERVICE_ROLE_KEY) return
  const ttlMs   = isPremium ? 25 * 3_600_000 : 7 * 86_400_000  // premium: 25h | free: 7d
  const expires = new Date(Date.now() + ttlMs).toISOString()
  const row = {
    user_id:        userId,
    profile_hash:   profileHash,
    query_hash:     queryHash,
    results:        recommendations,
    top_score:      Math.max(...recommendations.map(r => r.match_score || 0)),
    match_count:    recommendations.length,
    search_type:    'fresh',
    expires_at:     expires,
    prompt_version: JREC_PROMPT_VERSION,
  }
  const upsert = fetch(`${env.SUPABASE_URL}/rest/v1/radar_search_history`, {
    method:  'POST',
    headers: {
      apikey:          env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization:   `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type':  'application/json',
      Prefer:          'resolution=merge-duplicates',
    },
    body: JSON.stringify(row),
  }).catch(() => {})
  if (ctx?.waitUntil) ctx.waitUntil(upsert)
  else upsert.catch(err => console.warn('[RADAR] putRadarCache: ctx missing, upsert fire-and-forget:', err?.message))
}

// Fetch the user's most recent radar search, ignoring query hash and expiry.
// Used to silently serve stale-but-valid results when premium daily limit is reached.
async function getLatestRadarHistory(env, userId) {
  if (!userId || !env.SUPABASE_SERVICE_ROLE_KEY) return null
  try {
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/radar_search_history`
      + `?user_id=eq.${userId}&results=not.is.null`
      + `&order=created_at.desc&limit=1`
      + `&select=results,top_score,match_count,created_at`,
      { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } }
    )
    const rows = await res.json().catch(() => [])
    return Array.isArray(rows) && rows[0]?.results?.length ? rows[0] : null
  } catch (err) {
    console.warn(`[DB] getLatestRadarHistory error for user ${userId}: ${err.message}`)
    return null
  }
}

/**
 * Layer 2: Upsert fresh jobs into job_cache.
 * Returns an array of { id, source, external_id } objects (the saved rows).
 * Uses ON CONFLICT DO UPDATE to refresh fetched_at + expires_at on re-fetch.
 */
// ── Sprint 5: Adaptive Expansion helpers ─────────────────────────────────────

// Returns true when initial results are too weak to satisfy a user.
function shouldTriggerExpansion(recommendations) {
  if (!recommendations.length) return true
  const topScore = recommendations[0]?.match_score ?? 0
  const hqCount  = recommendations.filter(r => (r.match_score ?? 0) >= 7.0).length
  return topScore < EXPANSION_THRESHOLD || hqCount < EXPANSION_MIN_HQ
}

// Lightweight Gemini call (50–80 output tokens) that suggests 1–2 alternative
// search terms not covered by the user's initial queries.
async function expandSearchTerms(env, profileText, existingQueries, professionInfo = null) {
  const geminiKeys = (env.GEMINI_API_KEYS || env.GEMINI_API_KEY || '')
    .split(',').map(k => k.trim()).filter(Boolean)
  if (!geminiKeys.length) return []

  const familyCtx = professionInfo?.family
    ? `DETECTED FAMILY: ${professionInfo.family} | SENIORITY LEVEL: ${professionInfo.seniority_level}\nIMPORTANT: Generate ONLY titles within the ${professionInfo.family} family. Do NOT cross into other professional families.`
    : 'Step 1: Identify the professional family. Step 2: Stay STRICTLY within that family.'
  const seniorityCtx = (professionInfo?.seniority_level || 0) >= 5
    ? 'SENIORITY: Management/Director level — titles must reflect this seniority.'
    : ''

  const prompt = `Profile: "${(profileText || '').slice(0, 600)}"
Existing searches (DO NOT repeat or use close variations): ${JSON.stringify(existingQueries)}

${familyCtx}
${seniorityCtx}

Generate 5 DIFFERENT alternative job titles WITHIN the same professional family that:
- Are NOT semantic duplicates of the existing searches above
- Mix languages: if existing = Spanish → include English equivalents, and vice versa
- Cover different sub-specialties within the family (e.g. for HR: compensation, L&D, HRBP, talent, ops)
- Are realistic and searchable on LinkedIn/Bumeran LATAM

Respond ONLY with JSON (no markdown): {"family":"HR/Personas","terms":["HRBP","People Operations Lead","Talent Partner","Compensation Manager","HR Generalist"]}`

  try {
    const controller = new AbortController()
    const tid = setTimeout(() => controller.abort(), 5_000)
    let res = null
    for (let ki = 0; ki < geminiKeys.length; ki++) {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_MODEL}:generateContent?key=${geminiKeys[ki]}`,
        {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 300 } }),
          signal: controller.signal,
        }
      )
      if (res.status !== 429) break
      console.warn(`[RADAR:expansion] expandSearchTerms key_${ki+1} returned 429 — trying next key`)
    }
    clearTimeout(tid)
    if (!res.ok) {
      console.warn(`[RADAR:expansion] expandSearchTerms Gemini HTTP ${res.status}`)
      return []
    }
    const d      = await res.json()
    const raw    = d?.candidates?.[0]?.content?.parts?.[0]?.text || ''
    const parsed = JSON.parse(raw.replace(/^```json\n?|\n?```$/g, '').trim())
    const arr    = parsed?.terms || (Array.isArray(parsed) ? parsed : [])
    return Array.isArray(arr) ? arr.slice(0, 5).filter(s => typeof s === 'string' && s.trim()) : []
  } catch (err) {
    console.warn(`[RADAR:expansion] expandSearchTerms failed: ${err.message}`)
    return []
  }
}

// Full expansion pass: generate new terms → fetch jobs → deduplicate → AI score.
// Returns { recommendations: [...], count: N } or null if nothing new found.
async function expandWithSearch(env, ctx, cleanQueries, location, remoteOk, profileText, existingHashes, requestedN, candidateLocation = null, professionInfo = null) {
  const newTerms = await expandSearchTerms(env, profileText, cleanQueries, professionInfo)
  if (!newTerms.length) return null

  // Use 2 expansion terms: Serper gets up to 2 queries — broader coverage when main search
  // didn't find enough high-scoring matches (topScore < EXPANSION_THRESHOLD).
  const { jobs: rawExpanded } = await fetchAllSources(
    newTerms.slice(0, 2), location, remoteOk, env, String(profileText), candidateLocation
  )
  const newJobs = rawExpanded
    .filter(j => !existingHashes.has(canonicalJobHash(j)))
    .slice(0, 15)
  if (!newJobs.length) return null

  const batchJobs  = newJobs.slice(0, 12)
  const contents   = buildMatchingContents(String(profileText).slice(0, 2000), batchJobs, candidateLocation, professionInfo, 12)
  const geminiKeys = (env.GEMINI_API_KEYS || env.GEMINI_API_KEY || '')
    .split(',').map(k => k.trim()).filter(Boolean)
  if (!geminiKeys.length) return null

  let aiResult = null
  try {
    const controller = new AbortController()
    const tid = setTimeout(() => controller.abort(), EXPANSION_GEMINI_MS)
    // Rotate through keys on 429 so a rate-limited first key doesn't kill expansion scoring.
    let aiRes = null
    for (let ki = 0; ki < geminiKeys.length; ki++) {
      aiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_MODEL}:generateContent?key=${geminiKeys[ki]}`,
        {
          method:  'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: JOB_MATCHING_SYSTEM_PROMPT }] },
            contents,
            generationConfig:   { temperature: 0.2, maxOutputTokens: 1024 },
          }),
          signal: controller.signal,
        }
      )
      if (aiRes.status !== 429) break
      console.warn(`[RADAR:expansion] scoring key_${ki+1} returned 429 — trying next key`)
    }
    clearTimeout(tid)
    if (aiRes.ok) {
      const d   = await aiRes.json()
      const raw = d?.candidates?.[0]?.content?.parts?.[0]?.text || ''
      aiResult = JSON.parse(raw.replace(/^```json\n?|\n?```$/g, '').trim())
    } else {
      console.warn(`[RADAR:expansion] scoring Gemini HTTP ${aiRes.status}`)
    }
  } catch (err) {
    console.warn(`[RADAR:expansion] scoring failed: ${err.message}`)
    return null
  }

  if (!aiResult?.matches) return null

  const expandedRecs = (aiResult.matches || [])
    .map(m => {
      const job = batchJobs[m.job_index]
      if (!job) return null
      const gs = geoCompatibilityScore(job.location, job.remote, candidateLocation)
      const geoPenalty = (!candidateLocation || job.remote || gs >= 0.9) ? 0 : Math.min(0.5, (0.9 - gs) * 1.25)
      return { ...m, _adjusted: (m.match_score || 0) - geoPenalty, _geo_score: gs }
    })
    .filter(Boolean)
    .sort((a, b) => b._adjusted - a._adjusted)
    .slice(0, requestedN)
    .map(m => {
      const job = batchJobs[m.job_index]
      if (!job) return null
      return {
        job,
        match_score:    Number((m.match_score || 0).toFixed(2)),
        match_type:     m.match_type || null,
        strengths:      Array.isArray(m.strengths) ? m.strengths.slice(0, 3) : [],
        gaps:           Array.isArray(m.gaps)       ? m.gaps.slice(0, 2)     : [],
        summary:        String(m.summary || ''),
        rec_id:         null,
        from_expansion: true,
        geo_score:      m._geo_score,
      }
    }).filter(Boolean)

  if (batchJobs.length) {
    upsertJobsRaw(env, ctx, batchJobs)
    upsertJobsNormalized(env, ctx, batchJobs)
    upsertJobsAiEnriched(env, ctx, aiResult.matches || [], batchJobs)
  }

  return { recommendations: expandedRecs, count: expandedRecs.length }
}


async function upsertJobsToSupabase(env, ctx, jobs) {
  if (!jobs.length) return []
  const ATS_SOURCES = ATS_SOURCE_SET
  const now = new Date()
  const rows = jobs.map(j => {
    const isAts   = ATS_SOURCES.has(j.source)
    const ttlHours = isAts ? ATS_DB_TTL_HOURS : JOB_DB_TTL_HOURS
    return {
      source:          j.source,
      external_id:     j.external_id,
      canonical_hash:  canonicalJobHash(j),
      title:           j.title,
      company:         j.company,
      description:     j.description,
      location:        j.location,
      remote:          j.remote,
      url:             j.url,
      apply_url:       j.apply_url || null,
      company_slug:    j.company_slug || null,
      ats_type:        j.ats_type || null,
      salary_min:      j.salary_min,
      salary_max:      j.salary_max,
      currency:        j.currency,
      skills_required: j.skills_required,
      seniority:       j.seniority,
      industry:        j.industry,
      posted_at:       j.posted_at,
      fetched_at:      now.toISOString(),
      expires_at:      new Date(now.getTime() + ttlHours * 3_600_000).toISOString(),
    }
  })

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


// ── Sprint 4: write to jobs_raw (source provenance) ──────────────────────────
async function upsertJobsRaw(env, ctx, jobs) {
  if (!jobs.length) return
  const now = new Date().toISOString()
  const rows = jobs.map(j => ({
    source:         j.source,
    source_id:      String(j.external_id || j.id || ''),
    company_slug:   j.company_slug || null,
    canonical_hash: canonicalJobHash(j),
    title:          j.title,
    company:        j.company,
    location:       j.location || null,
    remote_ok:      j.remote || false,
    url:            j.url,
    posted_at:      j.posted_at || null,
    fetched_at:     now,
  })).filter(r => r.source_id)
  if (!rows.length) return
  const p = fetch(`${env.SUPABASE_URL}/rest/v1/jobs_raw`, {
    method:  'POST',
    headers: {
      apikey:         env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization:  `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer:         'resolution=ignore-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  }).catch(() => null)
  if (ctx?.waitUntil) ctx.waitUntil(p)
}

// ── Sprint 4: upsert to jobs_normalized (deduplicated index) ─────────────────
async function upsertJobsNormalized(env, ctx, jobs) {
  if (!jobs.length) return
  const now = new Date()
  const ATS_SOURCES = ATS_SOURCE_SET
  const rows = jobs.map(j => {
    const ttlHours = ATS_SOURCES.has(j.source) ? ATS_DB_TTL_HOURS : JOB_DB_TTL_HOURS
    return {
      canonical_hash:  canonicalJobHash(j),
      title:           j.title,
      company:         j.company,
      location:        j.location || null,
      remote_ok:       j.remote   || false,
      description_md:  (j.description || '').slice(0, 1000),
      url:             j.url,
      apply_url:       j.apply_url || null,
      salary_min:      j.salary_min      || null,
      salary_max:      j.salary_max      || null,
      salary_currency: j.currency        || null,
      source:          j.source,
      posted_at:       j.posted_at       || null,
      last_seen_at:    now.toISOString(),
      expires_at:      new Date(now.getTime() + ttlHours * 3_600_000).toISOString(),
      active:          true,
    }
  })
  const p = fetch(`${env.SUPABASE_URL}/rest/v1/jobs_normalized`, {
    method:  'POST',
    headers: {
      apikey:         env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization:  `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer:         'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  }).catch(() => null)
  if (ctx?.waitUntil) ctx.waitUntil(p)
}

// ── Sprint 4: upsert AI enrichment after scoring ──────────────────────────────
async function upsertJobsAiEnriched(env, ctx, topMatches, jobPool) {
  if (!topMatches.length) return
  const now = new Date().toISOString()
  const rows = topMatches.map(m => {
    const job = jobPool[m.job_index]
    if (!job) return null
    const family = inferProfessionFamily(job.title)
    if (!family && !job.seniority && !job.industry && !(job.skills_required?.length)) return null
    return {
      canonical_hash:    canonicalJobHash(job),
      seniority:         job.seniority   || null,
      profession_family: family          || null,
      industry:          job.industry    || null,
      skills_required:   job.skills_required || [],
      skills_nice:       [],
      enriched_at:       now,
      model_version:     JREC_PROMPT_VERSION,
    }
  }).filter(Boolean)
  if (!rows.length) return
  const p = fetch(`${env.SUPABASE_URL}/rest/v1/jobs_ai_enriched`, {
    method:  'POST',
    headers: {
      apikey:         env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization:  `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer:         'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  }).catch(() => null)
  if (ctx?.waitUntil) ctx.waitUntil(p)
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
// SECTION 5 — Rate Limiting for Job Searches
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Check and increment job search rate limit.
 * Premium users: 1 fresh search/day (cached re-visits bypass this entirely)
 * Free/anonymous: 1 fresh search/month
 * Key format:
 *   premium → "jrl:p:{identity}:{YYYY-MM-DD}"
 *   free    → "jrl:f:{identity}:{YYYY-MM}"
 *
 * Returns { ok: boolean, count: number, limit: number, nextReset: string }
 */
async function checkJobSearchRateLimit(env, userId, ip, isPremium) {
  if (!env.RATE_LIMIT_KV) return { ok: true, count: 0, limit: 99, nextReset: null }

  const identity = userId || ip
  const now      = new Date()

  if (isPremium) {
    const day    = now.toISOString().slice(0, 10)
    const kvKey  = `jrl:p:${identity}:${day}`
    const current = parseInt((await env.RATE_LIMIT_KV.get(kvKey)) || '0', 10)
    if (current >= JOB_SEARCH_LIMIT_PREMIUM) {
      const midnight = new Date(); midnight.setUTCHours(24, 0, 0, 0)
      return { ok: false, count: current, limit: JOB_SEARCH_LIMIT_PREMIUM, nextReset: midnight.toISOString() }
    }
    const midnight = new Date(); midnight.setUTCHours(24, 0, 0, 0)
    const ttlSecs = Math.floor((midnight.getTime() - Date.now()) / 1000)
    await env.RATE_LIMIT_KV.put(kvKey, String(current + 1), { expirationTtl: ttlSecs })
    return { ok: true, count: current + 1, limit: JOB_SEARCH_LIMIT_PREMIUM, nextReset: midnight.toISOString() }
  } else {
    // Free users: 1/month
    const month   = now.toISOString().slice(0, 7)  // 'YYYY-MM'
    const kvKey   = `jrl:f:${identity}:${month}`
    const current = parseInt((await env.RATE_LIMIT_KV.get(kvKey)) || '0', 10)
    if (current >= JOB_SEARCH_LIMIT_FREE) {
      const firstNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      return { ok: false, count: current, limit: JOB_SEARCH_LIMIT_FREE, nextReset: firstNextMonth.toISOString() }
    }
    const firstNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const ttlSecs = Math.floor((firstNextMonth.getTime() - Date.now()) / 1000)
    await env.RATE_LIMIT_KV.put(kvKey, String(current + 1), { expirationTtl: ttlSecs })
    return { ok: true, count: current + 1, limit: JOB_SEARCH_LIMIT_FREE, nextReset: firstNextMonth.toISOString() }
  }
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
async function handleJobSearch(body, request, env, ctx, corsHeaders) {
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
async function handleAiJobRecommendations(body, request, env, ctx, corsHeaders, callGeminiApi, logAiUsage) {
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

  const ip               = request.headers.get('CF-Connecting-IP') || 'unknown'
  const requestedN       = Math.min(Math.max(parseInt(count, 10) || 10, 1), 20)
  const candidateLocation = extractCandidateLocation(String(profile_text))
  // Synchronous profession detection — instant, no Gemini needed for query building
  const professionInfoSync = detectProfessionFamilySync(String(profile_text))
  if (professionInfoSync) console.log(`[RADAR] professionSync: family=${professionInfoSync.family} seniority=${professionInfoSync.seniority_level} isSenior=${professionInfoSync.is_senior}`)

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
    } catch (e) { console.warn(`[RADAR] premium check failed for user ${user_id}: ${e?.message} — defaulting to free`) }
  }

  // ── Build queries — headhunter mode for premium (built here so all hashes use same queries) ──
  const baseQueriesRaw = queries
    .map(q => String(q).trim().replace(/[|;()\[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100))
    .filter(Boolean)
    .slice(0, 5)
  const headhunterActive = !!professionInfoSync  // enabled for all — free gets full quality, just 1x/month
  // Build cleanQueries here (before ALL cache lookups) so every cache layer uses the same hash.
  const cleanQueries = headhunterActive
    ? buildHeadhunterQueries(professionInfoSync, baseQueriesRaw, true)
    : baseQueriesRaw
  if (headhunterActive) console.log(`[RADAR] headhunterQueries: ${JSON.stringify(cleanQueries)}`)

  console.log(`[RADAR] START user=${user_id||'anon'} premium=${isPremium} remoteOk=${!!remote_ok} queries=${JSON.stringify(baseQueriesRaw)} location=${location||'—'}`)

  // ── Live-fetch gate: guarantees ALL sources are called once per period ─────
  // liveFetched=false → first search of period → bypass ALL caches → full live fetch
  // liveFetched=true  → period already fetched → caches serve normally
  // Premium: once/day | Free: once/month
  const liveFetchKey = user_id || ip
  const liveFetched = await hasLiveFetchedThisPeriod(env, liveFetchKey, isPremium)
  console.log(`[RADAR] liveFetched=${liveFetched} period=${isPremium?'daily':'monthly'} user=${user_id||'anon(ip)'}`)

  const profileHash = user_id ? await computeProfileHash(String(profile_text)) : null
  const queryHash = user_id ? await hashQueryParams(cleanQueries, location, remote_ok) : null

  if (liveFetched && user_id && profileHash && queryHash) {
    const radarCache = await getRadarCache(env, user_id, profileHash, queryHash)
    if (radarCache?.results?.length) {
      console.log(`[RADAR] radarCache HIT — returning ${radarCache.results.length} cached recs`)
      // Recover sourcesUsed from the KV metadata written at fetch time.
      let radarCachedSources = []
      try {
        const metaRaw = env.RATE_LIMIT_KV ? await env.RATE_LIMIT_KV.get(`jobs_meta:${queryHash}`) : null
        if (metaRaw) radarCachedSources = JSON.parse(metaRaw)
      } catch (e) { console.warn('[RADAR] radarCache: failed to recover sourcesUsed from KV:', e?.message) }
      // Derive expansion fields from cached results so the frontend shows correct badges
      const cachedExpansionCount = radarCache.results.filter(r => r.from_expansion).length
      return new Response(
        JSON.stringify({
          ok:                  true,
          recommendations:     radarCache.results,
          total_jobs_analyzed: radarCache.match_count || radarCache.results.length,
          from_cache:          true,
          cached_today:        true,
          cache_timestamp:     radarCache.created_at,
          quota_remaining:     0,
          expansion_used:      cachedExpansionCount > 0,
          expansion_count:     cachedExpansionCount,
          expansion_available: false,
          candidate_location:  null,
          pipeline_stats: {
            cache_hit:      'radar',
            premium_mode:   isPremium,
            sources_used:   radarCachedSources,
            expansion_used: cachedExpansionCount > 0,
          },
        }),
        { status: 200, headers: corsHeaders }
      )
    }
  }

  // ── Rate limit ─────────────────────────────────────────────────────────────
  const rl = await checkJobSearchRateLimit(env, user_id, ip, isPremium)
  console.log(`[RADAR] rateLimit ok=${rl.ok} count=${rl.count}/${rl.limit} isPremium=${isPremium} identity=${user_id||ip}`)
  if (!rl.ok) {
    if (isPremium && user_id) {
      // Premium users over limit: silently serve most recent search from history.
      // This preserves the "radar is always working" UX — no wall, no "volvé mañana".
      const historyRow = await getLatestRadarHistory(env, user_id)
      if (historyRow?.results?.length) {
        const histExpansionCount = historyRow.results.filter(r => r.from_expansion).length
        console.log(`[RADAR] daily limit hit — serving history for premium ${user_id}, ${historyRow.results.length} results from ${historyRow.created_at}`)
        return new Response(
          JSON.stringify({
            ok:                  true,
            recommendations:     historyRow.results,
            total_jobs_analyzed: historyRow.match_count || historyRow.results.length,
            from_cache:          true,
            cached_today:        false,
            served_from_history: true,
            cache_timestamp:     historyRow.created_at,
            quota_remaining:     0,
            expansion_used:      histExpansionCount > 0,
            expansion_count:     histExpansionCount,
            expansion_available: false,
            pipeline_stats:      { cache_hit: 'history', premium_mode: true },
          }),
          { status: 200, headers: corsHeaders }
        )
      }
    }
    // Free users, or premium with no history at all — return 429
    return new Response(
      JSON.stringify({
        error: isPremium
          ? `Exploraste todo lo disponible hoy. Volvé mañana para una nueva búsqueda.`
          : `Usaste tu búsqueda de este mes. Se renueva el 1 del próximo mes.`,
        quota_remaining: 0,
        next_reset:      rl.nextReset,
      }),
      { status: 429, headers: corsHeaders }
    )
  }

  // Kick off deep profession extraction async — runs in parallel with job fetch (~2-4s each)
  const professionMetaPromise = extractProfileIntelligence(String(profile_text), user_id, env, ctx)

  // ── Fetch jobs (hits cache layers before live APIs) ────────────────────────
  let   jobs         = []
  let   fromCache    = false

  // KV_SOURCES_KEY stores the sourcesUsed alongside jobs so cache hits can report it accurately.
  // Format stored in KV: { jobs: NormalizedJob[], sourcesUsed: string[] }
  const KV_SOURCES_KEY = `jobs_meta:${queryHash}`

  let sourcesUsed  = []
  let sourceCounts = {}
  let sourceErrors = {}
  // Skip job KV cache when period hasn't been live-fetched yet → all sources called live.
  const kvCached = liveFetched ? await getJobsFromKV(env, queryHash) : null
  if (kvCached) {
    jobs      = kvCached
    fromCache = true
    // Attempt to recover persisted sourcesUsed so pipeline_stats is not empty on cache hits.
    try {
      const metaRaw = env.RATE_LIMIT_KV ? await env.RATE_LIMIT_KV.get(KV_SOURCES_KEY) : null
      if (metaRaw) sourcesUsed = JSON.parse(metaRaw)
    } catch (e) { console.warn(`[RADAR] sourcesUsed KV recovery failed: ${e?.message} — reporting [] for pipeline_stats`) }
    console.log(`[RADAR] jobsCache HIT — ${jobs.length} jobs from KV, sources=[${sourcesUsed.join(',')}] (Serper NOT called — served from cache)`)
  } else {
    // Live fetch — pass profile_text so ATS companies are selected by relevance
    const fetchResult = await fetchAllSources(cleanQueries, location, remote_ok, env, String(profile_text), candidateLocation, professionInfoSync?.family || null)
    sourcesUsed  = fetchResult.sourcesUsed || []
    sourceCounts = fetchResult.sourceCounts || {}
    sourceErrors = fetchResult.sourceErrors || {}
    if (fetchResult.jobs.length) {
      jobs = fetchResult.jobs
      await putJobsToKV(env, queryHash, jobs)
      // Persist sourcesUsed alongside the job TTL so future cache hits can report it.
      if (env.RATE_LIMIT_KV && sourcesUsed.length) {
        env.RATE_LIMIT_KV.put(KV_SOURCES_KEY, JSON.stringify(sourcesUsed), { expirationTtl: JOB_KV_TTL_SECS }).catch(() => {})
      }
      await upsertJobsToSupabase(env, ctx, jobs)
      upsertJobsRaw(env, ctx, jobs)
      upsertJobsNormalized(env, ctx, jobs)
    } else if (fetchResult.sourceErrors && Object.keys(fetchResult.sourceErrors).length) {
      console.warn(`[RADAR] live fetch returned 0 jobs. Source errors: ${JSON.stringify(fetchResult.sourceErrors)}`)
    }
    console.log(`[RADAR] jobsCache MISS — fetched ${jobs.length} live jobs, sources=[${sourcesUsed.join(',')}]`)
    // Live fetch completed — all sources were called. Mark period so subsequent searches use cache.
    if (user_id) markLiveFetchedThisPeriod(env, user_id, isPremium)
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

  // Phase 3: Enrich jobs — clean HTML, infer industry, refine seniority
  jobs = enrichJobs(jobs)

  // ── Pre-filter: family-aware (zero tokens) → top N candidates ──────────────
  // 10 jobs × 700 chars = ~7KB — reduced to fit within 30s Gemini timeout
  const maxJobsForGemini = MAX_JOBS_FOR_AI_MATCHING
  const preFiltered = applyPreFilter(jobs, String(profile_text), maxJobsForGemini, professionInfoSync)
  const jobPool     = preFiltered.length > 0 ? preFiltered : jobs.slice(0, maxJobsForGemini)
  console.log(`[RADAR] preFilter ${jobs.length} → ${jobPool.length} jobs to Gemini (maxJobs=${maxJobsForGemini} premium=${isPremium})`)

  // ── jrec: per-user AI score cache — skipped until period live-fetch is done ──
  if (liveFetched && user_id) {
    const jrecCached = await getJrecFromKV(env, user_id, queryHash)
    if (jrecCached?.recommendations?.length) {
      console.log(`[RADAR] jrecCache HIT — ${jrecCached.recommendations.length} recs, skipping Gemini`)
      // sourcesUsed is already populated above (either from KV_SOURCES_KEY or live fetch path)
      const jrecExpansionCount = jrecCached.recommendations.filter(r => r.from_expansion).length
      return new Response(
        JSON.stringify({
          ok:                  true,
          recommendations:     jrecCached.recommendations,
          total_jobs_analyzed: jrecCached.total_jobs_analyzed || 0,
          from_cache:          true,
          quota_remaining:     rl.limit - rl.count,
          expansion_used:      jrecExpansionCount > 0,
          expansion_count:     jrecExpansionCount,
          expansion_available: false,
          candidate_location:  null,
          pipeline_stats: {
            cache_hit:       'jrec',
            premium_mode:    isPremium,
            sources_used:    sourcesUsed,
            from_jobs_cache: fromCache,
            expansion_used:  jrecExpansionCount > 0,
          },
        }),
        { status: 200, headers: corsHeaders }
      )
    }
  }

  // ── AI Matching via Gemini ─────────────────────────────────────────────────
  const startMs      = Date.now()
  // Await async profession metadata — should be done by now (ran in parallel with job fetch)
  const professionMeta = await professionMetaPromise.catch(() => null)
  const profInfo     = professionMeta || professionInfoSync  // prefer richer Gemini metadata
  if (professionMeta) console.log(`[RADAR] professionMeta resolved: ${professionMeta.profession} | ${professionMeta.family} | lvl=${professionMeta.seniority_level}`)

  const contents   = buildMatchingContents(String(profile_text).slice(0, 3000), jobPool, candidateLocation, profInfo, maxJobsForGemini)
  const geminiBody = {
    system_instruction: { parts: [{ text: JOB_MATCHING_SYSTEM_PROMPT }] },
    contents,
    generationConfig:   { temperature: 0.3, maxOutputTokens: 4096 },
  }

  let aiResult    = null
  let aiError     = null
  let aiErrorBody = null  // full Gemini error body — surfaced in pipeline_stats for debugging

  // Direct fetch — same pattern as ping scenario G (all 7 pass).
  // Bypasses callGeminiApi retry-on-5xx to eliminate cumulative timeout risk and capture raw errors.
  {
    const geminiKeys = (env.GEMINI_API_KEYS || env.GEMINI_API_KEY || '').split(',').map(k => k.trim()).filter(Boolean)
    if (!geminiKeys.length) {
      aiError = 'no_gemini_keys'
    } else {
      const t0   = Date.now()
      const ctrl = new AbortController()
      const tid  = setTimeout(() => ctrl.abort(), 28_000)
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_MODEL}:generateContent?key=${geminiKeys[0]}`,
          { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(geminiBody), signal: ctrl.signal }
        )
        clearTimeout(tid)
        console.log(`[RADAR] Gemini direct — latency=${Date.now()-t0}ms status=${res.status}`)
        if (res.status === 200) {
          const aiData = await res.json()
          const raw    = aiData?.candidates?.[0]?.content?.parts?.[0]?.text || ''
          const jsonIdx = raw.indexOf('{"matches"')
          const clean   = jsonIdx >= 0
            ? raw.slice(jsonIdx)
            : raw.replace(/^```json\n?|\n?```$/g, '').trim()
          try {
            aiResult = JSON.parse(clean)
            console.log(`[RADAR] Gemini direct — result=ok matches=${aiResult?.matches?.length||0}`)
          } catch {
            const lastComma = clean.lastIndexOf('},')
            if (lastComma > 10) {
              try {
                const partial = JSON.parse(clean.slice(0, lastComma + 1) + ']}')
                if (partial?.matches?.length) {
                  aiResult = partial
                  console.log(`[RADAR] Gemini direct — result=partial_recovery matches=${aiResult.matches.length}`)
                }
              } catch { /* ignore */ }
            }
            if (!aiResult) {
              aiError = 'ai_parse_error'
              console.warn(`[RADAR] Gemini direct — parse_error raw="${raw.slice(0, 300)}"`)
            }
          }
        } else {
          const errBody = await res.json().catch(() => null)
          aiError     = `ai_http_${res.status}`
          aiErrorBody = errBody
          console.warn(`[RADAR] Gemini direct — HTTP ${res.status}: ${JSON.stringify(errBody)?.slice(0, 500)}`)
        }
      } catch (err) {
        clearTimeout(tid)
        aiError = err.name === 'AbortError' ? 'ai_timeout_28s' : err.message
        console.warn(`[RADAR] Gemini direct — fetch error: ${aiError}`)
      }
    }
  }

  console.log(`[RADAR] Gemini done — aiError=${aiError||'none'} matchesReturned=${aiResult?.matches?.length||0} profFamily=${profInfo?.family||'unknown'} profSrc=${profInfo?.extraction_method||'none'}`)

  // ── Fallback: Gemini had a real error (timeout / HTTP 4xx-5xx / parse failure) ──
  // NOTE: empty matches (Gemini ran OK but scored all jobs < 5.0) is NOT a failure —
  // in that case we fall through so expansion can try alternative search terms.
  if (aiError) {
    // Tier 2: heuristic keyword scoring — always yields a visible score on cards
    const LATAM_RE = /argentina|brasil|chile|colombia|m[eé]xico|per[uú]|uruguay|paraguay|bolivia|ecuador|venezuela|latinoam[eé]rica|latam|remoto|remote/i
    const profileWords = new Set(
      String(profile_text).toLowerCase().split(/\W+/).filter(w => w.length > 3)
    )
    const fallbackRecs = jobPool
      .filter(j => {
        // Drop presencial non-LATAM jobs (e.g. Berlin in-office) when we know candidate location
        if (!j.remote && candidateLocation && !LATAM_RE.test(j.location || '')) return false
        return true
      })
      .slice(0, requestedN)
      .map(j => {
        const jobWords = `${j.title} ${(j.skills_required || []).join(' ')}`.toLowerCase().split(/\W+/)
        const overlap  = jobWords.filter(w => w.length > 3 && profileWords.has(w)).length
        const daysOld  = j.posted_at ? (Date.now() - new Date(j.posted_at).getTime()) / 86_400_000 : 30
        const score    = Math.round(Math.min(6.5, 4.5 + Math.min(overlap, 10) * 0.2 + (daysOld < 7 ? 0.3 : 0) + (daysOld < 1 ? 0.2 : 0)) * 10) / 10
        // Heuristic match_type based on keyword overlap (no AI — approximate only)
        const matchType = overlap >= 8 ? 'Directo' : overlap >= 5 ? 'Adyacente' : overlap >= 3 ? 'Transferible' : 'Exploratorio'
        const co       = j.company || 'esta empresa'
        return {
          job:            j,
          match_score:    score,
          match_type:     matchType,
          strengths:      [],
          gaps:           [],
          summary:        `Oportunidad en ${co} — análisis detallado en la próxima búsqueda.`,
          rec_id:         null,
          ai_fallback:    true,
        }
      }).sort((a, b) => b.match_score - a.match_score)
    console.log(`[RADAR] Gemini fallback tier2 — heuristic scoring ${fallbackRecs.length} recs, aiError=${aiError}`)
    return new Response(
      JSON.stringify({
        ok:                  true,
        recommendations:     fallbackRecs,
        total_jobs_analyzed: jobPool.length,
        from_cache:          fromCache,
        fallback:            true,
        fallback_reason:     aiError,
        quota_remaining:     rl.limit - rl.count,
        pipeline_stats: {
          worker_version:       WORKER_VERSION,
          premium_mode:         isPremium,
          sources_used:         sourcesUsed,
          sources_count:        sourcesUsed.length,
          jobs_fetched:         jobs.length,
          jobs_to_gemini:       jobPool.length,
          from_jobs_cache:      fromCache,
          kv_configured:        !!env.RATE_LIMIT_KV,
          ai_error:             aiError,
          ai_error_body:        aiErrorBody,
          profession_family:    profInfo?.family || null,
          profession_seniority: profInfo?.seniority_level || null,
          profession_source:    profInfo?.extraction_method || (professionInfoSync ? 'sync_v1' : null),
          total_ms:             Date.now() - startMs,
        },
      }),
      { status: 200, headers: corsHeaders }
    )
  }

  // ── Build final recommendations from AI matches ────────────────────────────
  // geo_score blends into the ranking when candidateLocation is known.
  // Gemini already applies geo penalties via the system prompt, but it can miss nuances
  // when the location signal is weak. We apply a conservative JS-side geo adjustment
  // (max ±0.5) as a tiebreaker — not a full re-score — to surface geographically
  // viable jobs higher within similar score bands.
  const geoAdjust = (job, geminiScore) => {
    if (!candidateLocation || job.remote) return geminiScore
    const gs = geoCompatibilityScore(job.location, job.remote, candidateLocation)
    // gs=1.0 → +0, gs=0.95 → +0, gs=0.6 → -0.2, gs=0.45 → -0.35, gs=0.15 → -0.5
    if (gs >= 0.9) return geminiScore
    const penalty = Math.min(0.5, (0.9 - gs) * 1.25)
    return Math.max(0, geminiScore - penalty)
  }

  const minQualityScore = 4.0
  const topMatches = (aiResult.matches || [])
    .map(m => {
      const job = jobPool[m.job_index]
      if (!job) return null
      const geoScore = geoCompatibilityScore(job.location, job.remote, candidateLocation)
      const adjustedScore = geoAdjust(job, m.match_score || 0)
      return { ...m, _adjusted_score: adjustedScore, _geo_score: geoScore }
    })
    .filter(Boolean)
    .filter(m => m._adjusted_score >= minQualityScore)
    .sort((a, b) => b._adjusted_score - a._adjusted_score)
    .slice(0, requestedN)

  let recommendations = topMatches.map(m => {
    const job = jobPool[m.job_index]
    if (!job) return null
    return {
      job,
      match_score: Number((m.match_score || 0).toFixed(2)),
      match_type:  m.match_type || null,
      strengths:   Array.isArray(m.strengths) ? m.strengths.slice(0, 3) : [],
      gaps:        Array.isArray(m.gaps)       ? m.gaps.slice(0, 2)     : [],
      summary:     String(m.summary || ''),
      rec_id:      null,
      geo_score:   m._geo_score,
    }
  }).filter(Boolean)

  // Phase 5: Re-rank top-10 from top-50 when enough high-quality candidates exist
  let rerankingStats = { triggered: false, candidates_eligible: recommendations.length, selected: recommendations.length, alta_count: 0 }
  if (recommendations.length >= 15 && profInfo) {
    try {
      const reranked = await rerankTop10(recommendations, profInfo, env, ctx)
      if (reranked.length >= 5) {
        recommendations = reranked
        rerankingStats = {
          triggered:           true,
          candidates_eligible: rerankingStats.candidates_eligible,
          selected:            reranked.length,
          alta_count:          reranked.filter(r => r.priority === 'alta').length,
        }
      }
    } catch (err) {
      console.warn(`[RADAR] reranking failed (non-fatal): ${err.message}`)
    }
  }

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
      match_type:  r.match_type || null,
      strengths:   r.strengths,
      gaps:        r.gaps,
      summary:     r.summary,
      source:      r.job.source,
      status:      'new',
    }))

    // Fire-and-forget: rec_ids will be null on first render (save-to-kanban falls back to createCard)
    if (ctx?.waitUntil) {
      ctx.waitUntil(
        fetch(`${env.SUPABASE_URL}/rest/v1/job_recommendations`, {
          method:  'POST',
          headers: {
            apikey:         env.SUPABASE_SERVICE_ROLE_KEY,
            Authorization:  `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            Prefer:         'return=minimal',
          },
          body: JSON.stringify(recRows),
        }).catch(() => {})
      )
    }

  }

  // Sprint 4: persist initial AI enrichment (fire-and-forget)
  upsertJobsAiEnriched(env, ctx, topMatches, jobPool)

  // Sprint 5: Adaptive Expansion — Premium-only second-pass search
  let expansionAvailable = false
  let expansionUsed      = false
  let expansionCount     = 0

  // Expansion runs for all users — free gets full quality on their 1x/month search
  const needsExpansion = shouldTriggerExpansion(recommendations)
  console.log(`[RADAR] expansion needsExpansion=${needsExpansion} isPremium=${isPremium} topScore=${recommendations[0]?.match_score?.toFixed(1)||0}`)
  if (needsExpansion) {
    try {
      const expStartMs      = Date.now()
      const _expTimedOut    = {}  // sentinel to distinguish timeout from null result
      console.log(`[RADAR] expansion START — generating alternative terms... serperConfigured=${!!env.SERPER_API_KEY}`)
      const existingHashes = new Set(jobPool.map(j => canonicalJobHash(j)))
      const expandResult   = await Promise.race([
        expandWithSearch(env, ctx, cleanQueries, location, remote_ok, String(profile_text), existingHashes, requestedN, candidateLocation, profInfo),
        new Promise(r => setTimeout(() => r(_expTimedOut), EXPANSION_TIMEOUT_MS)),
      ])
      const expMs = Date.now() - expStartMs
      if (expandResult === _expTimedOut) {
        console.warn(`[RADAR] expansion TIMEOUT — exceeded ${EXPANSION_TIMEOUT_MS}ms (expMs=${expMs})`)
      } else if (expandResult?.recommendations?.length) {
        // Merge: union of original + expansion, re-rank by match_score
        const seenHashes = new Set()
        const merged = [...recommendations, ...expandResult.recommendations]
          .sort((a, b) => (b.match_score || 0) - (a.match_score || 0))
          .filter(r => {
            const h = canonicalJobHash(r.job)
            if (seenHashes.has(h)) return false
            seenHashes.add(h)
            return true
          })
          .slice(0, requestedN)
        recommendations  = merged
        expansionUsed    = true
        expansionCount   = expandResult.count
        console.log(`[RADAR] expansion OK — +${expansionCount} new jobs merged, final=${recommendations.length} expansionMs=${expMs}`)
      } else {
        console.log(`[RADAR] expansion returned 0 new results expansionMs=${expMs}`)
      }
    } catch (err) {
      console.warn(`[RADAR] expansion error: ${err.message}`)
    }
  }

  // Build historialRow here — after expansion — so needsExpansion + expansionUsed are final
  const historialRow = {
    user_id,
    tipo:   'job_recommendations',
    titulo: `Recomendaciones para: ${cleanQueries.join(', ')}`,
    datos:  {
      queries:             cleanQueries,
      location:            location || null,
      remote_ok:           !!remote_ok,
      match_count:         recommendations.length,
      top_match:           recommendations[0]
        ? { title: recommendations[0].job.title, company: recommendations[0].job.company, score: recommendations[0].match_score }
        : null,
      candidate_location:  candidateLocation || null,
      expansion_triggered: needsExpansion,
      expansion_applied:   expansionUsed,
      geo_filter_applied:  !!candidateLocation,
      total_jobs_analyzed: jobPool.length,
      generated_at:        new Date().toISOString(),
    },
  }

  // Persist historial (dedup: patch today's row if exists, else insert)
  if (user_id && ctx?.waitUntil) {
    const saveHistorial = (async () => {
      try {
        const today = new Date().toISOString().slice(0, 10)
        const existRes = await fetch(
          `${env.SUPABASE_URL}/rest/v1/historial`
          + `?user_id=eq.${user_id}&tipo=eq.job_recommendations`
          + `&created_at=gte.${today}T00:00:00Z`
          + `&order=created_at.desc&limit=1&select=id`,
          { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } }
        )
        const existing = await existRes.json().catch(() => [])
        if (Array.isArray(existing) && existing[0]?.id) {
          await fetch(
            `${env.SUPABASE_URL}/rest/v1/historial?id=eq.${existing[0].id}`,
            {
              method: 'PATCH',
              headers: {
                apikey: env.SUPABASE_SERVICE_ROLE_KEY,
                Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
                'Content-Type': 'application/json',
                Prefer: 'return=minimal',
              },
              body: JSON.stringify({ titulo: historialRow.titulo, datos: historialRow.datos }),
            }
          )
        } else {
          await fetch(`${env.SUPABASE_URL}/rest/v1/historial`, {
            method:  'POST',
            headers: {
              apikey: env.SUPABASE_SERVICE_ROLE_KEY,
              Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
              Prefer: 'return=minimal',
            },
            body: JSON.stringify(historialRow),
          })
        }
      } catch (err) {
        console.warn(`[RADAR] saveHistorial failed for user ${user_id}: ${err.message}`)
      }
    })()
    ctx.waitUntil(saveHistorial)
  }

  // Cache AI scores in KV and radar_search_history (Supabase, cross-device)
  // TTL: 25h for premium (daily refresh), 7 days for free
  const jrecTtlSecs = isPremium ? 25 * 3_600 : 7 * 86_400
  if (user_id && ctx?.waitUntil) {
    ctx.waitUntil(putJrecToKV(env, user_id, queryHash, {
      recommendations,
      total_jobs_analyzed: jobPool.length,
    }, jrecTtlSecs))
    if (profileHash) {
      putRadarCache(env, ctx, user_id, profileHash, queryHash, recommendations, isPremium)
    }
  }

  console.log(`[RADAR] DONE recs=${recommendations.length} totalAnalyzed=${jobPool.length} expansionUsed=${expansionUsed} expansionCount=${expansionCount} totalMs=${Date.now()-startMs}`)

  return new Response(
    JSON.stringify({
      ok:                  true,
      recommendations,
      total_jobs_analyzed: jobPool.length,
      from_cache:          fromCache,
      cached_today:        false,
      cache_timestamp:     new Date().toISOString(),
      quota_remaining:     rl.limit - rl.count,
      expansion_available: expansionAvailable,
      expansion_used:      expansionUsed,
      expansion_count:     expansionCount,
      expansion_searched:  needsExpansion,
      candidate_location:  candidateLocation || null,
      profession_context:  profInfo ? { family: profInfo.family, seniority_level: profInfo.seniority_level, profession: profInfo.profession || profInfo.family } : null,
      pipeline_stats: {
        worker_version:      WORKER_VERSION,
        premium_mode:        isPremium,
        sources_used:        sourcesUsed,
        sources_count:       sourcesUsed.length,    // frontend reads this for "N fuentes"
        total_evaluated:     jobPool.length,         // frontend reads this for "N avisos evaluados"
        source_counts:       sourceCounts,          // per-source job counts (empty on cache hit)
        serper_configured:   !!env.SERPER_API_KEY,  // env var present
        serper_in_sources:   sourcesUsed.includes('serper'),  // actually attempted this run
        serper_returned:     sourceCounts['serper'] || 0,     // jobs returned by Serper
        serper_error:        sourceErrors?.['serper'] || null, // error code if Serper failed (e.g. quota_exceeded)
        jobs_fetched:        jobs.length,
        jobs_to_gemini:      jobPool.length,
        from_jobs_cache:     fromCache,
        expansion_triggered: needsExpansion,
        expansion_used:      expansionUsed,
        expansion_count:     expansionCount,
        candidate_location:  candidateLocation || null,
        kv_configured:        !!env.RATE_LIMIT_KV,
        ai_error:             aiError || null,
        ai_error_body:        aiErrorBody,
        total_ms:             Date.now() - startMs,
        reranking_stats:      rerankingStats,
        profession_family:    profInfo?.family || null,
        profession_seniority: profInfo?.seniority_level || null,
        profession_source:    profInfo?.extraction_method || (professionInfoSync ? 'sync_v1' : null),
        gemini_matched:       aiResult?.matches?.length || 0,
      },
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
async function handleJobSaveToKanban(body, request, env, ctx, corsHeaders, verifyUserJwt) {
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

  // Resolve columna_id: prefer "Radar Laboral" column, fallback to first by orden
  let targetColumnaId = columna_id || null
  if (!targetColumnaId) {
    const colRes = await fetch(
      `${env.SUPABASE_URL}/rest/v1/kanban_columnas?user_id=eq.${user.id}&order=orden.asc&select=id,nombre`,
      { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } }
    )
    const cols = await colRes.json()
    const radarCol = Array.isArray(cols) ? cols.find(c => c.nombre === 'Radar Laboral') : null
    targetColumnaId = radarCol?.id || cols?.[0]?.id || null
  }

  // Dedup: check by URL first, fall back to company+title for URL-less jobs
  {
    const normalizedEmpresa = (rec.company || '').slice(0, 100).trim()
    const normalizedPuesto  = (rec.title   || '').slice(0, 100).trim()
    const dupQuery = rec.url
      ? `user_id=eq.${user.id}&link_aviso=eq.${encodeURIComponent(rec.url)}&select=id&limit=1`
      : `user_id=eq.${user.id}&empresa=eq.${encodeURIComponent(normalizedEmpresa)}&puesto=eq.${encodeURIComponent(normalizedPuesto)}&select=id&limit=1`
    const dupRes = await fetch(
      `${env.SUPABASE_URL}/rest/v1/postulaciones?${dupQuery}`,
      { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } }
    )
    const dups = await dupRes.json().catch(() => [])
    if (Array.isArray(dups) && dups[0]?.id) {
      return new Response(
        JSON.stringify({ ok: true, already_exists: true, postulacion_id: dups[0].id, columna_id: targetColumnaId }),
        { status: 200, headers: corsHeaders }
      )
    }
  }

  // Build postulaciones row — pre-filled from recommendation data
  const atsKeywords = Array.isArray(rec.strengths) && rec.strengths.length
    ? rec.strengths.slice(0, 10).join(', ')
    : null
  const adaptationNotes = Array.isArray(rec.gaps) && rec.gaps.length
    ? rec.gaps.join(' | ')
    : null

  const postulacion = {
    user_id:           user.id,
    columna_id:        targetColumnaId,
    empresa:           (rec.company || '').slice(0, 100),
    puesto:            (rec.title   || '').slice(0, 100),
    link_aviso:        rec.url || null,
    fecha_aplicacion:  new Date().toISOString().slice(0, 10),
    notas:             rec.summary || null,
    job_description:   null,
    seniority:         null,
    ats_keywords:      atsKeywords,
    adaptation_notes:  adaptationNotes,
    cv_data:           null,
    orden:             0,
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
      JSON.stringify({ ok: true, already_exists: false, postulacion_id: postId, columna_id: targetColumnaId }),
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
async function handleJobUpdateStatus(body, request, env, ctx, corsHeaders, verifyUserJwt) {
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

// worker/src/radar/profileIntelligence.js
// Phase 1: Profile Intelligence — converts raw profile text into structured professional context
// Cache layers: KV (7d, device-local) → Supabase (permanent, cross-device) → AI extraction

import { detectProfessionFamilySync, extractCandidateLocation } from '../jobs/profession.js'
import { extractSkillsFromText } from '../utils/jobHelpers.js'
import { DEFAULT_MODEL } from '../constants.js'

const PROF_KV_TTL_SECS = 7 * 86_400  // 7 days
const PROF_KV_PREFIX   = 'profv2'
const PROF_AI_TIMEOUT  = 8_000

const SENIORITY_LABELS = {
  1: 'Junior/Trainee',
  2: 'Semi Senior/Analista',
  3: 'Senior/Especialista',
  4: 'Lead/Jefe/Coordinador',
  5: 'Gerente/Manager/Director',
  6: 'VP/C-Level/Head of',
}

async function hashProfileText(text) {
  const normalized = (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3)
    .sort()
    .join('|')
    .slice(0, 2000)
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 12)
}

function detectModalidad(text) {
  const t = (text || '').toLowerCase()
  if (/\b(remoto|remote|trabajo desde casa|home office|100%\s*remoto|full\s*remote)\b/.test(t)) return 'remoto'
  if (/\b(híbrido|hibrido|hybrid)\b/.test(t)) return 'hibrido'
  if (/\b(presencial|on.?site|oficina)\b/.test(t)) return 'presencial'
  return null
}

function rowToResult(row) {
  return {
    family:              row.family,
    subfamilies:         row.subfamilies  || [],
    industries:          row.industries   || [],
    seniority_level:     row.seniority_level,
    seniority_label:     row.seniority_label,
    is_senior:           row.is_senior,
    profession:          row.profession,
    familia:             row.family,
    subfamilias:         row.subfamilies  || [],
    industrias:          row.industries   || [],
    skills_tecnicas:     row.skills_tecnicas    || [],
    ubicacion:           row.ubicacion,
    modalidad_preferida: row.modalidad_preferida,
    objetivo_carrera:    row.objetivo_carrera,
    confidence:          row.confidence,
    extraction_method:   row.extraction_method,
    from_cache:          true,
  }
}

const EXTRACTION_PROMPT = `Analyze this professional profile and extract the dominant professional classification.

PROFILE:
"{PROFILE}"

PROFESSIONAL FAMILIES: HR/Personas | Finanzas | Tecnología | Marketing/Growth | Operaciones | Ventas/BD | Legal/Compliance | Management General

SENIORITY LEVELS: 1=Junior/Trainee | 2=Semi Senior/Analista | 3=Senior/Especialista | 4=Lead/Jefe/Coordinador | 5=Gerente/Manager/Director | 6=VP/C-Level/Head of

Respond ONLY with valid JSON (no markdown, no extra text):
{"profession":"Gerente de RRHH","family":"HR/Personas","subfamilies":["Talent Acquisition","HRBP","L&D"],"seniority_label":"Gerencial","seniority_level":5,"industries":["Fintech","Retail"],"skills_tecnicas":["SAP HCM","Workday","Nómina"],"ubicacion":"CABA","modalidad_preferida":"remoto","objetivo_carrera":"Roles de Head of People o HR Director en empresas tech LATAM","is_senior":true}`

/**
 * Extract structured professional intelligence from a profile text.
 * Cache layers: KV (7d) → Supabase profile_intelligence table → Gemini AI → sync fallback
 *
 * @returns {{ familia, subfamilias, seniority_level, seniority_label, is_senior,
 *             industrias, skills_tecnicas, ubicacion, modalidad_preferida,
 *             objetivo_carrera, profession, confidence, extraction_method, from_cache }}
 */
export async function extractProfileIntelligence(profileText, userId, env, ctx) {
  const profileHash = await hashProfileText(profileText)
  const kvKey = `${PROF_KV_PREFIX}:${userId || 'anon'}:${profileHash}`

  // Layer 1: KV cache — fastest, device-local (7 days)
  if (env.RATE_LIMIT_KV) {
    try {
      const cached = await env.RATE_LIMIT_KV.get(kvKey)
      if (cached) {
        const parsed = JSON.parse(cached)
        if (parsed?.familia || parsed?.extraction_method) {
          return { ...parsed, from_cache: true }
        }
      }
    } catch { /* cache miss — fall through */ }
  }

  // Layer 2: Supabase cross-device cache — permanent, survives device/session changes
  if (userId && env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const sbRes = await fetch(
        `${env.SUPABASE_URL}/rest/v1/profile_intelligence?user_id=eq.${userId}&profile_hash=eq.${profileHash}&select=*&limit=1`,
        {
          headers: {
            apikey:        env.SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          },
        }
      )
      if (sbRes.ok) {
        const rows = await sbRes.json()
        if (rows?.[0]) {
          const sbResult = rowToResult(rows[0])
          // Backfill KV so next request hits layer 1
          if (env.RATE_LIMIT_KV) {
            const kvSave = env.RATE_LIMIT_KV.put(kvKey, JSON.stringify(sbResult), { expirationTtl: PROF_KV_TTL_SECS })
            ctx?.waitUntil ? ctx.waitUntil(kvSave) : kvSave.catch(() => {})
          }
          return sbResult
        }
      }
    } catch { /* Supabase miss — fall through */ }
  }

  // Layer 3: Sync detection (instant, 0 tokens)
  const sync     = detectProfessionFamilySync(profileText)
  const location = extractCandidateLocation(profileText)
  const skills   = extractSkillsFromText(profileText)

  // Layer 4: AI extraction — runs in parallel with job fetch, so adds ~0 wall time
  const geminiKeys = (env.GEMINI_API_KEYS || env.GEMINI_API_KEY || '').split(',').map(k => k.trim()).filter(Boolean)
  let aiResult = null

  if (geminiKeys.length) {
    try {
      const prompt = EXTRACTION_PROMPT.replace('{PROFILE}', (profileText || '').slice(0, 1500))
      const ctrl = new AbortController()
      const tid  = setTimeout(() => ctrl.abort(), PROF_AI_TIMEOUT)
      let res = null
      for (let ki = 0; ki < geminiKeys.length; ki++) {
        res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_MODEL}:generateContent?key=${geminiKeys[ki]}`,
          {
            method:  'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.1, maxOutputTokens: 400 },
              thinkingConfig:   { thinkingBudget: 0 },
            }),
            signal: ctrl.signal,
          }
        )
        if (res.status !== 429) break
      }
      clearTimeout(tid)
      if (res?.ok) {
        const d      = await res.json()
        const raw    = d?.candidates?.[0]?.content?.parts?.[0]?.text || ''
        const parsed = JSON.parse(raw.replace(/^```json\n?|\n?```$/g, '').trim())
        if (parsed?.family) aiResult = parsed
      }
    } catch (err) {
      console.warn(`[RADAR:profile] AI extraction failed: ${err.message}`)
    }
  }

  const familyVal      = aiResult?.family      || sync?.family   || null
  const subFamilyVal   = aiResult?.subfamilies  || []
  const industriesVal  = aiResult?.industries   || []
  const seniorityLevel = aiResult?.seniority_level ?? sync?.seniority_level ?? 3

  const result = {
    // English-named fields — used by buildMatchingContents, applyPreFilter, expandWithSearch
    family:              familyVal,
    subfamilies:         subFamilyVal,
    industries:          industriesVal,
    seniority_level:     seniorityLevel,
    seniority_label:     aiResult?.seniority_label   || SENIORITY_LABELS[seniorityLevel] || 'Senior/Especialista',
    is_senior:           aiResult?.is_senior         ?? (sync?.is_senior || false),
    profession:          aiResult?.profession         || null,
    // Spanish-named aliases — for re-ranking and premium experience display
    familia:             familyVal,
    subfamilias:         subFamilyVal,
    industrias:          industriesVal,
    skills_tecnicas:     aiResult?.skills_tecnicas    || skills.slice(0, 15),
    ubicacion:           aiResult?.ubicacion          || location,
    modalidad_preferida: aiResult?.modalidad_preferida || detectModalidad(profileText),
    objetivo_carrera:    aiResult?.objetivo_carrera   || null,
    confidence:          aiResult?.family ? 'ai' : (sync?.family ? 'sync' : 'low'),
    extraction_method:   aiResult?.family ? 'gemini_v2' : 'sync_v1',
    from_cache:          false,
  }

  // Persist to KV (device-local, 7 days)
  if (env.RATE_LIMIT_KV) {
    const kvSave = env.RATE_LIMIT_KV.put(kvKey, JSON.stringify(result), { expirationTtl: PROF_KV_TTL_SECS })
    ctx?.waitUntil ? ctx.waitUntil(kvSave) : kvSave.catch(() => {})
  }

  // Persist to Supabase (cross-device, permanent) — fire-and-forget via waitUntil
  if (userId && env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    const sbSave = fetch(`${env.SUPABASE_URL}/rest/v1/profile_intelligence`, {
      method:  'POST',
      headers: {
        apikey:          env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization:   `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'content-type':  'application/json',
        Prefer:          'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        user_id:             userId,
        profile_hash:        profileHash,
        family:              result.family,
        subfamilies:         result.subfamilies,
        industries:          result.industries,
        seniority_level:     result.seniority_level,
        seniority_label:     result.seniority_label,
        is_senior:           result.is_senior,
        skills_tecnicas:     result.skills_tecnicas,
        ubicacion:           result.ubicacion,
        modalidad_preferida: result.modalidad_preferida,
        objetivo_carrera:    result.objetivo_carrera,
        profession:          result.profession,
        confidence:          result.confidence,
        extraction_method:   result.extraction_method,
      }),
    }).catch(e => console.warn('[RADAR:profile] Supabase persist failed:', e.message))
    ctx?.waitUntil ? ctx.waitUntil(sbSave) : void sbSave
  }

  return result
}

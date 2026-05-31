import { ATS_SOURCE_SET } from '../constants.js'
import { expandProfileSkills, normalizeJobUrl } from '../utils/jobHelpers.js'

export const FAMILY_TITLE_SIGNALS = {
  'HR/Personas':        ['hr ', ' hr', 'rrhh', 'people ', 'talent', 'recursos humanos', 'human resource', 'hrbp', 'payroll', 'nómina', 'nomina', 'recruiting', 'reclut', 'capital humano', 'compensaci'],
  'Finanzas':           ['financ', 'fp&a', 'controller', 'tesor', 'contab', 'auditor', 'impuesto', 'tax ', 'presupuesto', 'budget'],
  'Tecnología':         ['engineer', 'developer', 'desarrollador', 'devops', 'frontend', 'backend', 'fullstack', 'full stack', 'software ', 'cloud ', 'sre ', 'data engineer', 'data labeling', 'data annotation', 'labeling specialist', 'annotation specialist', 'ai trainer', 'ml data', 'prompt engineer'],
  'Marketing/Growth':   ['marketing', 'growth ', 'brand ', 'performance mkt', 'community', 'content mkt', 'seo ', 'sem ', 'digital ads'],
  'Ventas/BD':          ['sales ', 'ventas', 'comercial', 'account exec', 'business dev', 'revenue ops', 'key account'],
  'Operaciones':        ['operations', 'operaciones', 'supply chain', 'logística', 'logistics', 'procurement', 'compras'],
  'Legal/Compliance':   ['legal ', 'abogad', 'compliance', 'counsel', 'contratos', 'juridic'],
  'Management General': ['country manager', 'general manager', 'director general', 'gerente general'],
}

export function applyPreFilter(jobs, profileText, maxCandidates = 25, professionInfo = null) {
  if (!jobs.length) return jobs
  const profileLower = (profileText || '').toLowerCase()
  const expanded = expandProfileSkills(profileLower)

  const ATS_SOURCES = ATS_SOURCE_SET

  const myFamily          = professionInfo?.family || null
  const mySignals         = myFamily ? (FAMILY_TITLE_SIGNALS[myFamily] || []) : []
  const otherFamilySigs   = myFamily
    ? Object.entries(FAMILY_TITLE_SIGNALS).filter(([f]) => f !== myFamily).flatMap(([, sigs]) => sigs)
    : []

  function score(job) {
    const jobText  = `${job.title} ${job.description || ''} ${(job.skills_required || []).join(' ')}`.toLowerCase()
    const titleText = job.title.toLowerCase()
    let s = 0
    for (const skill of expanded) {
      if (titleText.includes(skill)) s += 3
      else if (jobText.includes(skill)) s += 1
    }
    if (ATS_SOURCES.has(job.source)) s += 2
    if (job.posted_at) {
      const daysOld = (Date.now() - new Date(job.posted_at).getTime()) / 86_400_000
      if (daysOld > 90) return -999  // hard exclude: stale listing unlikely still open
      if (daysOld <= 1) s += 2
      else if (daysOld <= 7) s += 1
      else if (daysOld > 30) s -= 2
    }
    const descLen = (job.description || '').length
    if (descLen > 300) s += 1
    else if (descLen < 50) s -= 3
    if (job.salary_min || job.salary_max) s += 2
    if (job.apply_url && job.apply_url !== job.url) s += 1
    if (job.company_slug) s += 1

    // Family-aware boost/penalty — the biggest lever for matching quality.
    // Jobs in the candidate's professional family get a large boost to reach Gemini.
    // Jobs clearly in incompatible families get a large penalty to stay OUT of Gemini.
    if (myFamily) {
      const isFamilyMatch = mySignals.some(sig => titleText.includes(sig))
      if (isFamilyMatch) {
        s += 8  // family title match → ensure this job reaches Gemini
      } else {
        const isClearMismatch = otherFamilySigs.some(sig => titleText.includes(sig))
        if (isClearMismatch) s -= 12  // clearly wrong family → exclude from Gemini pool
      }
    }

    return s
  }

  const scored   = jobs.map(j => ({ job: j, s: score(j) }))
  const positive = scored.filter(x => x.s > 0)
  const base     = positive.length >= Math.ceil(maxCandidates / 2) ? positive : scored
  return base
    .sort((a, b) => b.s - a.s)
    .slice(0, maxCandidates)
    .map(x => x.job)
}


// 3-level deduplication: (source,id) → URL normalize → fuzzy title+company
export function deduplicateJobs(allJobs) {
  // Level 1: exact source+id
  const byKey = new Map()
  for (const job of allJobs) {
    const k = `${job.source}::${job.external_id}`
    if (!byKey.has(k)) byKey.set(k, job)
  }
  let deduped = [...byKey.values()]

  // Level 2: URL dedup — ATS version wins over aggregator version
  const ATS_SOURCES = ATS_SOURCE_SET
  const byUrl = new Map()
  for (const job of deduped) {
    const url = normalizeJobUrl(job.url)
    if (!url) { byUrl.set(job.external_id, job); continue }
    if (!byUrl.has(url)) { byUrl.set(url, job) }
    else {
      const existing = byUrl.get(url)
      if (ATS_SOURCES.has(job.source) && !ATS_SOURCES.has(existing.source)) byUrl.set(url, job)
    }
  }
  deduped = [...byUrl.values()]

  // Level 3: fuzzy title+company (only if >30 jobs to avoid O(n²) on small sets)
  if (deduped.length > 30) {
    const byCompanyTitle = new Map()
    for (const job of deduped) {
      const normTitle = (job.title || '').toLowerCase()
        .replace(/\b(sr|jr|senior|junior|semi senior|ssr|lead)\b/g, '')
        .replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
      const normCompany = (job.company || '').toLowerCase().replace(/\s+/g, '')
      const k = `${normCompany}::${normTitle}`
      if (!byCompanyTitle.has(k)) byCompanyTitle.set(k, job)
    }
    deduped = [...byCompanyTitle.values()]
  }
  return deduped
}

// ── Sprint 3: canonical hash for cross-source deduplication ──────────────────
// Normalizes company + title + location → stable key regardless of source.
export function canonicalJobHash(job) {
  const norm = s => (s || '')
    .toLowerCase()
    .replace(/\b(sr|jr|senior|junior|semi\s*senior|ssr|lead|staff|principal)\b/gi, '')
    .replace(/\b(s\.a\.|s\.r\.l\.|inc\.?|corp\.?|ltd\.?|gmbh)\b/gi, '')
    .replace(/[^a-z0-9]/g, '')
  // Include normalized URL path so cross-source duplicates (same job on Serper + Jooble) collide.
  const normUrl = (job.url || '')
    .replace(/^https?:\/\/(www\.)?/, '')
    .replace(/[?#].*$/, '')   // strip query params and fragments
    .replace(/[^a-z0-9/]/gi, '')
    .toLowerCase()
    .slice(0, 80)
  return normUrl || `${norm(job.company)}|${norm(job.title)}|${norm(job.location || 'remote')}`
}

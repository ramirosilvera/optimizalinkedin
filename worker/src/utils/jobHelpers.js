import { MAX_DESC_CHARS } from '../constants.js'

export function truncateDesc(text) {
  if (!text) return null
  return text.length > MAX_DESC_CHARS ? text.slice(0, MAX_DESC_CHARS) + '…' : text
}

export function normalizeSeniority(raw = '') {
  const s = (raw || '').toLowerCase()
  if (/junior|jr\b|entry|trainee|pasante|aprendiz/.test(s))                    return 'Junior'
  if (/analista\s+(jr|i\b)/.test(s))                                           return 'Junior'
  if (/semi.?senior|ssr\b|mid.?level|pleno|analista\s+(sr|ii\b)/.test(s))     return 'Semi Senior'
  if (/senior|sr\b/.test(s))                                                   return 'Senior'
  if (/jefe|coordinador|team.?lead|lead\b|supervisor/.test(s))                 return 'Lead'
  if (/gerente|manager|head\s+of|director|vp\b|vice\s+president|cto|cfo|coo|ceo/.test(s)) return 'Management'
  if (/analista(?!\s*(jr|sr|i{1,3}))/.test(s))                                 return 'Semi Senior'
  if (/intern|practice/.test(s))                                               return 'Junior'
  return 'No especificado'
}

// Strip HTML tags from ATS descriptions (Greenhouse/Lever return HTML)
export function stripHtml(html) {
  if (!html) return null
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<li>/gi, '\n- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n').trim()
}

// Extract the requirements section from a job description instead of slicing from start
// ATS descriptions typically have "About Us" first — requirements are at char 800+
export function extractRelevantSection(rawText, maxChars = 500) {
  if (!rawText) return '(sin descripción)'
  const text = rawText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  const ANCHORS = [
    /requisi?tos?\s*:?/i, /requirements?\s*:?/i, /qualifications?\s*:?/i,
    /you (should|must|will|have)/i, /we (need|are looking|require)/i,
    /buscamos\s*(a\s*)?una?\s*persona/i, /el\s*candidato\s*(ideal|deberá)/i,
    /perfil\s*buscado/i, /experiencia\s*requerida/i,
  ]
  for (const anchor of ANCHORS) {
    const idx = text.search(anchor)
    if (idx !== -1 && idx < text.length * 0.75) {
      return text.slice(idx, idx + maxChars).replace(/\s+/g, ' ')
    }
  }
  const skip = Math.min(200, Math.floor(text.length * 0.2))
  return text.slice(skip, skip + maxChars)
}

// Extract known skills from free text using taxonomy keywords
export const SKILLS_KEYWORDS = new Set([
  'python','javascript','typescript','java','kotlin','swift','golang','rust','ruby','php','scala','c#',
  'react','vue','angular','nextjs','html','css','tailwind','graphql',
  'nodejs','django','fastapi','spring','rails','laravel','express','nestjs','grpc',
  'sql','postgresql','mysql','mongodb','redis','elasticsearch','kafka','spark','airflow','dbt','snowflake','bigquery',
  'aws','gcp','azure','kubernetes','docker','terraform','ci/cd','github actions','jenkins',
  'machine learning','deep learning','nlp','pytorch','tensorflow','scikit-learn','langchain',
  'ios','android','react native','flutter','expo',
  'git','jira','figma','postman','datadog','sentry',
  'excel','power bi','tableau','looker','sql server',
  'sap','sap fico','sap hcm','erp',
  'fintech','ecommerce','logistics','supply chain',
])

export function extractSkillsFromText(text) {
  if (!text) return []
  const lower = text.toLowerCase()
  return [...SKILLS_KEYWORDS].filter(skill => {
    try { return new RegExp(`\\b${skill.replace(/[+#./]/g, '\\$&')}\\b`).test(lower) } catch { return lower.includes(skill) }
  }).slice(0, 20)
}

// Normalize a job URL for deduplication (strip tracking params)
export function normalizeJobUrl(url) {
  if (!url) return null
  try {
    const u = new URL(url)
    ;['utm_source','utm_medium','utm_campaign','ref','source','gh_src','lever-source'].forEach(p => u.searchParams.delete(p))
    return u.origin + u.pathname.replace(/\/$/, '').toLowerCase()
  } catch { return null }
}

// ── Skills taxonomy for pre-filter (no AI needed) ────────────────────────────
export const SKILLS_TAXONOMY = {
  python:       ['python','django','flask','fastapi','pandas','numpy','scikit-learn'],
  javascript:   ['javascript','js','node','nodejs','react','vue','angular','next.js','nextjs','typescript'],
  java:         ['java','spring','spring boot','kotlin','jvm'],
  sql:          ['sql','postgresql','postgres','mysql','oracle','sql server','t-sql','plsql'],
  dotnet:       ['.net','c#','asp.net','dotnet'],
  mobile:       ['ios','android','swift','kotlin','react native','flutter','expo'],
  devops:       ['docker','kubernetes','k8s','ci/cd','jenkins','gitlab ci','github actions','terraform','ansible'],
  aws:          ['aws','amazon web services','ec2','s3','lambda','rds'],
  gcp:          ['gcp','google cloud','bigquery','cloud run'],
  azure:        ['azure','microsoft azure'],
  datos:        ['data','datos','analytics','analítica','análisis de datos','bi','business intelligence'],
  ml:           ['machine learning','ml','deep learning','nlp','inteligencia artificial','ia','ai','pytorch','tensorflow'],
  finanzas:     ['finanzas','finance','fp&a','financial planning','presupuesto','budget'],
  contabilidad: ['contabilidad','accounting','contador','accountant','cpa','niif','ifrs'],
  rrhh:         ['rrhh','hr','recursos humanos','human resources','people','talent','talento'],
  marketing:    ['marketing','seo','sem','google ads','paid media','performance','growth','community manager'],
  ventas:       ['ventas','sales','comercial','business development','b2b','account executive'],
  liderazgo:    ['liderazgo','leadership','team lead','jefatura','gerencia','management','people management'],
  ingles:       ['inglés','english','bilingual','b2','c1','fluent english'],
  sap:          ['sap','sap fico','sap fi','sap co','sap hr','sap hcm','erp'],
}

export const SKILL_SYNONYMS = {
  'desarrollador':    ['developer','engineer','programador'],
  'analista':         ['analyst','specialist','associate'],
  'gerente':          ['manager','director','head of','vp'],
  'coordinador':      ['coordinator','lead','senior analyst'],
  'semi senior':      ['ssr','mid-level','mid level','pleno'],
  'consultor':        ['consultant','advisor','specialist'],
  'datos':            ['data','analytics','bi'],
  'rrhh':             ['hr','people','talent','human resources','recursos humanos'],
  'contable':         ['accountant','accounting','contador'],
  'finanzas':         ['finance','fp&a','financial planning'],
  'full stack':       ['fullstack','full-stack'],
  'nube':             ['cloud','aws','azure','gcp'],
  'agile':            ['scrum','kanban','sprint'],
}

// Expand profile skills using taxonomy + synonyms
export function expandProfileSkills(profileText) {
  const text = profileText.toLowerCase()
  const found = new Set()
  for (const [, variants] of Object.entries(SKILLS_TAXONOMY)) {
    for (const v of variants) {
      if (text.includes(v)) { variants.forEach(s => found.add(s)); break }
    }
  }
  for (const [term, expansions] of Object.entries(SKILL_SYNONYMS)) {
    if (text.includes(term)) expansions.forEach(e => found.add(e))
    else if (expansions.some(e => text.includes(e))) found.add(term)
  }
  return found
}

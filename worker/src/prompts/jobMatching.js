import { extractRelevantSection } from '../utils/jobHelpers.js'
import { MAX_JOBS_FREE } from '../constants.js'

export const JOB_MATCHING_SYSTEM_PROMPT = `Sos un headhunter digital senior. Evaluá el fit real de cada aviso laboral para el candidato usando criterio humano, NO keyword matching. Usá la PROFESIÓN DOMINANTE DETECTADA como ancla principal.

FAMILIAS: HR/Personas | Finanzas | Tecnología | Marketing/Growth | Operaciones | Ventas/BD | Legal/Compliance | Management General

SCORING match_score 0–10 (suma de 6 componentes):

C1 FAMILIA (35%, máx 3.5): misma familia=3.5 | adyacente válida=1.5–2.0 | diferente=0.3–0.8 | incompatible=0–0.2
  Adyacentes: HR↔Mgmt General | Finanzas↔Operaciones | Ventas↔Marketing | Legal↔Finanzas

C2 SUB-ÁREA (25%, máx 2.5): misma sub-área=2.5 | relacionada en familia=1.5–2.0 | diferente en familia=1.0–1.4
  HR: Talent Acq, HRBP, L&D, Comp&Ben, HR Ops, ER, People Analytics, Payroll
  Finanzas: FP&A, Controller, Tesorería, Contabilidad, Auditoría, Tax
  Tecnología: Backend, Frontend, FullStack, DevOps, Cloud, Data Eng, QA, Mobile
  Marketing: Performance, Brand, Growth, Content, SEO/SEM, CRM
  Ventas: Enterprise, SMB, Key Account, BizDev, Presales
  Ops: Supply Chain, Logística, Procurement, Process Excellence

C3 SENIORITY (15%, máx 1.5): niveles 1=Jr 2=SSr 3=Sr 4=Lead 5=Gerente 6=VP
  Diferencia 0=1.5 | ±1=1.0 | ±2=0.5 | ±3=0.1 | Nivel 5-6→1-2 máx 0.2
  IMPORTANTE: candidato Gerente/VP (nivel 5-6) en rol Jr/SSr (nivel 1-2) → score total máx 4.5

C4 INDUSTRIA (10%, máx 1.0): misma=1.0 | transferible(Fintech↔SaaS)=0.7 | algo=0.4 | distante=0.1–0.2

C5 SKILLS TÉCNICAS (10%, máx 1.0): solo skills específicas del dominio (HRIS, IFRS, React, Google Ads…). Genéricas=0. Ausencia de "nice to have" no penaliza.

C6 GEO/IDIOMA (5%, máx 0.5, puede ser negativo): remoto/mismo lugar=0 | híbrido distante=-0.2 | presencial mismo país distante=-0.4 | presencial otro país=-0.8 | inglés fluido requerido no mencionado=-0.4

CAPS DUROS al score final:
- Familia adyacente o igual: sin cap
- Familia moderadamente diferente: máx 5.5
- Familia muy diferente: máx 4.5 → EXCLUIR
- Familia incompatible: máx 3.5 → EXCLUIR SIEMPRE

INCOMPATIBILIDADES ABSOLUTAS (nunca incluir):
HR → PM/PO/Product Lead | HR → RevOps/Revenue Systems | HR → Backend/Frontend/Dev/Data Engineer | HR → Data Analyst (salvo People Analytics) | HR → Data Labeling/AI Trainer | Finanzas → Tech pura | Marketing → PM/PO | Ventas → RevOps puro | No-técnico → ingeniería/dev

match_type: "Directo"(misma fam+sub-área, score≥7.5) | "Adyacente"(misma fam, otra sub, 6–7.4) | "Transferible"(fam adyacente, 5–5.9) | "Exploratorio"(otra fam con evidencia transición, 5–5.4)

OUTPUT: solo match_score≥4.0, máx 15 resultados, orden score desc. No inventés datos del perfil.
Respondé SOLO JSON válido sin markdown:
{"matches":[{"job_index":0,"match_score":7.5,"match_type":"Directo","strengths":["str","str"],"gaps":["str"],"summary":"str"}]}
`

// Strip HTML tags, collapse whitespace, remove control chars and zero-width chars
function sanitizeText(text, maxLen) {
  if (!text) return ''
  return text
    .replace(/<[^>]*>/g, ' ')            // strip HTML tags
    .replace(/&[a-z]+;|&#\d+;/gi, ' ')  // decode HTML entities to space
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // remove control chars
    .replace(/[​-‍﻿]/g, '')              // remove zero-width chars
    .replace(/https?:\/\/\S+/g, '')      // remove URLs
    .replace(/\s+/g, ' ')               // collapse whitespace
    .trim()
    .slice(0, maxLen)
}

export function buildMatchingContents(profileText, jobs, candidateLocation = null, professionMeta = null, maxJobs = MAX_JOBS_FREE) {
  const jobList = jobs.slice(0, maxJobs).map((j, i) => {
    const raw = j.description ? extractRelevantSection(j.description, 1200) : ''
    const desc = sanitizeText(raw, 400) || '(sin descripción)'
    const isAts = ['greenhouse','lever','smartrecruiters','ashby'].includes(j.source)
    const title = sanitizeText(j.title, 80)
    const company = sanitizeText(j.company, 60)
    return `[${i}] ${title} | ${company}${isAts ? ' ✓' : ''} | ${j.location || 'N/A'} | ${j.remote ? 'Remoto' : 'Presencial'}
Skills: ${(j.skills_required || []).slice(0, 8).join(', ') || 'N/A'} | Seniority: ${j.seniority || 'N/A'}
Desc: ${desc}`
  }).join('\n\n')

  const geoCtx  = candidateLocation ? `\nUBICACIÓN: ${candidateLocation}` : ''
  const profCtx = professionMeta?.family
    ? `\nPROFESIÓN: ${professionMeta.profession || professionMeta.family} | FAMILIA: ${professionMeta.family} | SENIORITY: nivel ${professionMeta.seniority_level} | SUB-ÁREAS: ${(professionMeta.subfamilies || []).slice(0, 4).join(', ') || 'N/A'}`
    : ''

  const cleanProfile = sanitizeText(profileText, 2000)

  return [{
    role: 'user',
    parts: [{ text: `PERFIL:\n${cleanProfile}${geoCtx}${profCtx}\n\nAVISOS:\n${jobList}` }],
  }]
}

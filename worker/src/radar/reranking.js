// worker/src/radar/reranking.js
// Phase 5: Re-ranking — curate top-10 from top-50 AI-scored candidates
// Adds headhunter_note (1-sentence expert justification) and priority (alta/media) per result

import { DEFAULT_MODEL } from '../constants.js'

const RERANKING_MIN_CANDIDATES = 15  // minimum scored jobs to trigger re-ranking pass
const RERANKING_TIMEOUT_MS     = 12_000

const RERANKING_SYSTEM_PROMPT = `Sos un headhunter senior realizando la selección final de oportunidades laborales para un candidato.

Tu misión: de las oportunidades pre-evaluadas, seleccioná las 10 MEJORES considerando:
1. Fit profesional genuino (no solo el score numérico)
2. Potencial de éxito real del candidato en ese rol específico
3. Diversidad de empleadores: no incluyas 5 variantes del mismo rol/empresa
4. Calidad del puesto (empresa conocida, datos salariales, descripción completa)
5. Viabilidad real (seniority compatible, idioma, ubicación)

Para cada oportunidad seleccionada, escribí:
- headhunter_note: 1 oración en español rioplatense de un headhunter justificando por qué ES la oportunidad correcta para ESTE candidato. Debe ser específica al candidato y al puesto, no genérica.
- priority: "alta" (aplicar en las próximas 48h — rol muy relevante) | "media" (aplicar esta semana)

REGLAS CRÍTICAS:
- Máximo 10 resultados
- Orden: prioridad "alta" primero, luego por score descendente
- original_index debe referenciar EXACTAMENTE el índice de la lista de entrada (0-based)
- Si hay menos de 10 candidatos válidos, incluí todos los válidos
- NO inventes información que no esté en los datos

Respondé SOLO JSON válido (sin markdown, sin texto extra):
{"top10":[{"original_index":0,"headhunter_note":"Esta empresa fintech busca exactamente el perfil de Gerente RRHH con experiencia en nómina que tenés — es un match casi perfecto.","priority":"alta"}]}`

/**
 * Re-rank top-50 AI-scored candidates to curate the best top-10.
 * Only runs when there are enough candidates to justify a second pass.
 * Falls back to simple slice(0,10) if AI fails.
 *
 * @param {Array} scoredJobs - Array of { job, match_score, match_type, strengths, gaps, summary }
 * @param {Object|null} profileIntelligence - Structured profile from extractProfileIntelligence
 * @param {Object} env - Worker env bindings
 * @param {Object|null} ctx - Execution context
 * @returns {Array} Top-10 curated recommendations with headhunter_note + priority
 */
export async function rerankTop10(scoredJobs, profileIntelligence, env, ctx) {
  const candidates = scoredJobs
    .filter(j => (j.match_score || 0) >= 5.0)
    .sort((a, b) => (b.match_score || 0) - (a.match_score || 0))
    .slice(0, 50)

  if (candidates.length < RERANKING_MIN_CANDIDATES) return candidates.slice(0, 10)

  const geminiKeys = (env.GEMINI_API_KEYS || env.GEMINI_API_KEY || '')
    .split(',').map(k => k.trim()).filter(Boolean)
  if (!geminiKeys.length) return candidates.slice(0, 10)

  const profCtx = profileIntelligence?.familia
    ? `CANDIDATO: ${profileIntelligence.profession || profileIntelligence.familia} | ${profileIntelligence.seniority_label || ''} | Industrias objetivo: ${(profileIntelligence.industrias || []).join(', ') || 'diversas'} | Ubicación: ${profileIntelligence.ubicacion || 'no especificada'} | Modalidad preferida: ${profileIntelligence.modalidad_preferida || 'flexible'}`
    : 'CANDIDATO: perfil no especificado'

  const jobList = candidates
    .map((r, i) => {
      const j = r.job || {}
      return `[${i}] score=${(r.match_score || 0).toFixed(1)} type=${r.match_type || '?'} | ${j.title || '?'} @ ${j.company || '?'} | ${j.location || 'N/A'} | ${j.remote ? 'Remoto 🌐' : 'Presencial 🏢'} | ${j.seniority || '?'} | Industria: ${j.industry || '?'} | Salario: ${j.salary_min ? `$${j.salary_min}k` : 'no publicado'}`
    })
    .join('\n')

  const userPrompt = `${profCtx}

OPORTUNIDADES PRE-EVALUADAS (${candidates.length} en total, ya filtradas score≥5):
${jobList}

Seleccioná el TOP 10 más relevante para este candidato específico.`

  try {
    const ctrl = new AbortController()
    const tid  = setTimeout(() => ctrl.abort(), RERANKING_TIMEOUT_MS)
    let res = null
    for (let ki = 0; ki < geminiKeys.length; ki++) {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_MODEL}:generateContent?key=${geminiKeys[ki]}`,
        {
          method:  'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: RERANKING_SYSTEM_PROMPT }] },
            contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } },
          }),
          signal: ctrl.signal,
        }
      )
      if (res.status !== 429) break
    }
    clearTimeout(tid)

    if (!res?.ok) {
      console.warn(`[RADAR:rerank] Gemini HTTP ${res?.status} — falling back to score-sorted top-10`)
      return candidates.slice(0, 10)
    }

    const d      = await res.json()
    const raw    = d?.candidates?.[0]?.content?.parts?.[0]?.text || ''
    const parsed = JSON.parse(raw.replace(/^```json\n?|\n?```$/g, '').trim())

    if (!Array.isArray(parsed?.top10) || parsed.top10.length < 3) {
      console.warn('[RADAR:rerank] insufficient results — falling back to score-sorted top-10')
      return candidates.slice(0, 10)
    }

    const reranked = parsed.top10
      .filter(item => Number.isInteger(item.original_index) && item.original_index >= 0 && candidates[item.original_index])
      .slice(0, 10)
      .map(item => ({
        ...candidates[item.original_index],
        headhunter_note: typeof item.headhunter_note === 'string' ? item.headhunter_note.trim() : null,
        priority:        item.priority === 'alta' ? 'alta' : 'media',
        from_reranking:  true,
      }))

    console.log(`[RADAR:rerank] OK — ${candidates.length} candidates → ${reranked.length} curated`)
    return reranked

  } catch (err) {
    console.warn(`[RADAR:rerank] failed: ${err.message} — falling back to score-sorted top-10`)
    return candidates.slice(0, 10)
  }
}

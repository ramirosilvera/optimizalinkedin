export const AI_DEFAULTS = {
  analyze_linkedin: {
    puntaje_general: null, nivel_seo: null, resumen_diagnostico: '',
    titular_actual: '', resumen_actual: '', titular_propuesto: '', resumen_propuesto: '',
    palabras_clave_sugeridas: [], fortalezas: [], areas_de_mejora: [],
    recomendaciones: [], analisis_foto: '',
  },
  generate_cv: {
    nombreCompleto: '', titular: '', resumen: '', experiencias: [],
    educacion: [], habilidades: [], experiencias_anteriores: [],
  },
  cv_quality: {
    score: 0, nivel: 'Básico', aprobado: false, nota_consultor: '',
    riesgo_ats: 'Medio', fortalezas: [], gaps: [],
  },
  cv_pre_questions: { preguntas: [] },
  generate_cv_full: {
    cv: { nombreCompleto: '', titular: '', resumen: '', experiencias: [], educacion: [], habilidades: [], experiencias_anteriores: [] },
    quality: { score: 0, nivel: 'Básico', aprobado: false, nota_consultor: '', riesgo_ats: 'Medio', fortalezas: [], gaps: [] },
  },
  interview_feedback: {
    puntaje_entrevista: 0, feedback_general: '', puntos_fuertes: [],
    areas_de_mejora: [], recomendaciones: [],
  },
  star_feedback: {
    puntaje: 0,
    situacion: { presente: false, comentario: '' },
    tarea:     { presente: false, comentario: '' },
    accion:    { presente: false, comentario: '' },
    resultado: { presente: false, comentario: '' },
    sugerencia_clave: '',
  },
  job_adapter: {
    cv_adaptado: null, carta_de_presentacion: '',
    palabras_clave_incorporadas: [], ajustes_principales: [],
  },
  linkedin_growth: {
    banner_ideas: [],
    plan_networking: { objetivo_resumido: '', acciones_semanales: [], contenido_sugerido: [], metrica_90dias: '' },
  },
}

export const extractAIText = (data) => data?.candidates?.[0]?.content?.parts?.[0]?.text || ''

export const parseAIJson = (raw, defaults, errorMsg = 'No se pudo procesar la respuesta. Intentá de nuevo.') => {
  const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
  let parsed
  try {
    parsed = JSON.parse(stripped)
  } catch {
    const m = stripped.match(/(\{[\s\S]*\}|\[[\s\S]*\])/)
    if (m) {
      try { parsed = JSON.parse(m[0]) } catch { throw new Error(errorMsg) }
    } else {
      throw new Error(errorMsg)
    }
  }
  if (!defaults) return parsed
  const result = { ...defaults }
  for (const key of Object.keys(parsed)) {
    if (parsed[key] !== null && parsed[key] !== undefined) result[key] = parsed[key]
  }
  return result
}

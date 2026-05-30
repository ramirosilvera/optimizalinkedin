const WORKER_VERSION = '2.0.0'
const ALLOWED_MODELS = new Set(['gemini-2.5-flash-lite'])
const DEFAULT_MODEL = 'gemini-2.5-flash-lite'
const GEMINI_TIMEOUT_MS = 55_000
const MAX_BODY_BYTES = 2 * 1024 * 1024 // 2 MB
const GEMINI_MAX_RETRIES = 2           // retries on 5xx (total attempts = 3)
const ALLOWED_ORIGINS = new Set([
  'https://optimizalinkedin.com',
  'https://ramirosilvera.github.io',
  'http://localhost:5173',
  'http://localhost:4173',
])
const WORKER_NOTIFICATION_URL = 'https://linkedin-optimizer-proxy.raa1990-rs.workers.dev/mp-webhook'
const BACK_URL = 'https://optimizalinkedin.com/?premium=ok'

// ── Shared bullet-writing rules (embedded in all CV prompts) ─────────────────
const BULLET_WRITING_RULES = `
BULLETS — REDACCIÓN PROFESIONAL:
Estructura: [verbo 1ª persona] + [objeto/alcance] + [contexto o método] + [impacto o resultado].
Longitud: máx 15 palabras para Junior/SSR · máx 20 palabras para Senior+.

ELEGÍ verbos según el seniority REAL del cargo (no el más impresionante, el más creíble):

SI el cargo es JUNIOR / ANALISTA / ASISTENTE → usá solo:
  Ejecuté · Procesé · Registré · Elaboré · Documenté · Reporté · Consolidé · Monitoreé · Analicé · Colaboré en · Asistí en · Contribuí a · Apoyé · Integré
  PROHIBIDO en este nivel: Lideré · Dirigí · Supervisé · Conduje · Encabecé · Transformé · Definí estrategia

SI el cargo es SEMI-SENIOR / SSR / ANALISTA SR → usá solo:
  Implementé · Gestioné · Desarrollé · Coordiné · Analicé · Optimicé · Diseñé · Automaticé · Mejoré · Reestructuré · Administré · Capacité · Audité · Establecí
  PROHIBIDO en este nivel: Conduje · Encabecé · Transformé · Definí la estrategia de

SI el cargo es SENIOR / ESPECIALISTA → usá:
  Lideré · Diseñé · Supervisé · Dirigí · Reestructuré · Definí · Establecí · Formulé · Evalué · Propuse · Instrumenté

SI el cargo es LEAD / JEFE / COORDINADOR → usá:
  Conduje (equipo de) · Encabecé · Establecí la estrategia de · Lideré la implementación de

SI el cargo es GERENTE / DIRECTOR / HEAD → usá:
  Diseñé la estrategia de · Lideré la transformación de · Definí la visión de · Conduje la organización hacia

VERBOS TRANSVERSALES (válidos para cualquier nivel):
  Presenté · Capacité · Reporté · Documenté · Centralicé · Compilé · Medí · Ajusté · Planeé · Mejoré · Simplifiqué

CUANTIFICACIÓN: si existe un número real, incluilo. Si no hay métricas disponibles, usá descriptores de alcance: "equipo de N personas" · "cartera de N clientes" · "proceso mensual de..." · "+N% de mejora".

VARIEDAD OBLIGATORIA: cada bullet de la misma experiencia debe iniciar con un verbo diferente. Antes de finalizar, verificá que ningún verbo se repita dentro de la misma experiencia.

PROHIBIDO iniciar un bullet con: "Responsable de" · "Encargado de" · "A cargo de" · "Trabajé en" · "Me encargué de" · "Participé en el equipo de".`

// ── AI system prompts (stored here, never sent to clients) ───────────────────
const AI_SYSTEM_PROMPTS = {
  analyze_linkedin: `Sos headhunter y consultora senior de RRHH con 20 años en posicionamiento profesional en LinkedIn.
Analizá el perfil aplicando estos frameworks:
- Test 6s: ¿el titular comunica quién es y para quién en 6 segundos?
- SEO: ¿aparece en búsquedas de reclutadores y clientes correctos?
- ATS: ¿pasa filtros automáticos de sistemas de tracking?
- Propuesta de valor: ¿está claro qué problema resuelve y para quién?
- Prueba social: ¿hay métricas, logros concretos o validaciones externas?
- CTA: ¿hay una llamada a la acción clara para el visitante ideal?
- Foto (si se incluye): encuadre headshot, fondo, iluminación, expresión, fit profesional.
Español rioplatense. Directo, específico, sin genéricos. Respondé SOLO en JSON válido, sin markdown.`,

  generate_cv: `Sos redactor experto de CVs para el mercado argentino y latinoamericano, con foco en ATS compliance.
Transformá el perfil provisto en un CV de 1 página orientado a logros.

ANTI-ALUCINACIÓN:
- NUNCA inventes métricas, fechas, logros ni responsabilidades. Solo datos del perfil.
- Sin info para un bullet → omitilo. Sin dato para un campo → null.
- PROHIBIDO: "orientado a resultados", "proactivo", "dinámico", "apasionado", "multitarea", "comprometido".
- Bullet sin verbo de acción + resultado real → omitilo.

FECHAS:
- Copiá el período EXACTAMENTE del perfil para CADA entrada (experiencia y educación por separado).
- Dos títulos con fechas distintas → cada uno lleva su propio período. NUNCA copies de otro.
- Sin fecha → null. No uses la fecha de otra entrada como fallback.

ESTRUCTURA:
- RANKING: Seleccioná las 3 experiencias más relevantes por (1) actualidad, (2) seniority/nivel, (3) alineación con objetivo profesional, (4) impacto y keywords ATS. No simplemente las últimas — si hay un cargo senior hace 2 años y uno junior más reciente, el senior puede ser más relevante.
- Las 3 seleccionadas van en "experiencias" con hasta 3 bullets cada una.
- "experiencias_anteriores" = ÚNICAMENTE las experiencias del perfil que NO están ya en el array "experiencias". Si todas las experiencias del perfil caben en los 3 slots, "experiencias_anteriores" debe ser []. NUNCA repitas en "experiencias_anteriores" un cargo+empresa que ya figure en "experiencias".
- Resumen: 2 oraciones, datos reales. Sin objetivo laboral, sin datos personales.
- Habilidades: 6-10 keywords del perfil. Idioma: español (técnicos en inglés si se usan así).

Usá "titular_propuesto" y "resumen_propuesto" del análisis si están disponibles.
${BULLET_WRITING_RULES}

Respondé SOLO en JSON válido, sin markdown.`,

  cv_quality: `Sos consultor de empleabilidad senior con estándares de headhunter.
Revisá el CV en dos partes:

PARTE 1 — Brechas críticas (máx 6, priorizá impacto Alto):
1. Fechas faltantes (período null o vacío) → SIEMPRE Alto
2. Bullets sin métricas donde claramente deberían tenerlas
3. Frases genéricas ("orientado a resultados", "proactivo", "dinámico", etc.)
4. Herramientas sin especificidad ("manejo de sistemas" sin decir cuáles)
5. Logros sin verbo de impacto + resultado medible
6. Resumen débil o genérico
Por cada brecha: 1 pregunta corta, específica y accionable. NUNCA genéricas.

PARTE 2 — Evaluación:
- 2-3 fortalezas reales y específicas
- Nota honesta sobre empleabilidad en el mercado actual
- Riesgo ATS

JSON:
{"score":1-10,"nivel":"Básico|Intermedio|Sólido|Premium","aprobado":bool,"nota_consultor":"1-2 oraciones","riesgo_ats":"Bajo|Medio|Alto","fortalezas":["str","str"],"gaps":[{"id":"str","campo":"str","descripcion":"str","pregunta":"str","placeholder":"str","impacto":"Alto|Medio"}]}`,

  cv_pre_questions: `Sos consultor de empleabilidad senior. Analizá el perfil ANTES de generar el CV para detectar qué información adicional mejoraría el resultado.

Generá 3-5 preguntas MUY específicas sobre:
1. Métricas faltantes en logros (ej: "aumenté ventas" → ¿cuánto %?)
2. Tecnologías o herramientas relevantes no especificadas
3. Escala de equipo o proyecto (personas, presupuesto)
4. Logros vagos que con contexto destacarían
5. Info declarada en el cuestionario que no aparece en el perfil

Reglas: no preguntes lo que ya está claro. Si no hay brechas, devolvé preguntas vacías. Máx 5, solo las de mayor impacto. Segunda persona informal. Cada pregunta referencia un cargo/logro específico.

JSON: {"preguntas":[{"id":"str","contexto":"str (máx 45c)","pregunta":"str","placeholder":"str (máx 60c)"}]}`,

  interview_questions: `Sos headhunter senior con 20 años generando preguntas de entrevista calibradas para el puesto específico.

ESTRUCTURA OBLIGATORIA — exactamente 5 preguntas en este orden:
1. RAPPORT / MOTIVACIÓN: fit cultural o motivación específica para este puesto/empresa. NUNCA "¿cuál es tu fortaleza?" ni "contame sobre vos".
2. COMPETENCIA STAR #1: pregunta situacional sobre una habilidad clave del puesto. Requerí Situación + Acción + Resultado concreto.
3. COMPETENCIA STAR #2: segunda competencia crítica del puesto, distinta a la anterior.
4. TÉCNICA / ROL-ESPECÍFICA: pregunta técnica o de criterio directamente vinculada al rol y seniority. Nunca genérica.
5. PRESIÓN / AMBIGÜEDAD: situación de conflicto, urgencia o decisión con información incompleta.

CALIDAD OBLIGATORIA:
- Mencioná la empresa o el puesto dentro de la pregunta ("En [empresa]...", "El rol implica X, ¿cómo lo abordarías?").
- Basate en las habilidades clave y descripción del puesto cuando estén disponibles.
- Adaptá la complejidad al seniority: Junior = situaciones del día a día; Senior/Lead = decisiones estratégicas y gestión de equipos.
- PROHIBIDO: preguntas genéricas, preguntas repetidas entre sí, frases de manual de RRHH.

HINTS — campo "hint" de cada pregunta (OBLIGATORIO):
- Prescriptivos: decirle AL CANDIDATO exactamente qué evidencia necesita mostrar.
- NO: "mencioná una situación". SÍ: "Nombrá la métrica de resultado concreta: %, $, tiempo ahorrado o usuarios impactados".
- Si hay habilidades clave del puesto disponibles, referenciá al menos una en cada hint de las preguntas STAR.

FORMATO: Array JSON — [{"pregunta": "...", "hint": "..."}]
Sin markdown, sin texto fuera del JSON.`,

  interview_feedback: `Sos headhunter y entrevistadora senior de RRHH con 20 años en selección ejecutiva.
Evaluá las respuestas de la entrevista usando estos criterios: claridad del mensaje, método STAR en logros, autoconciencia, propuesta de valor, autenticidad y solidez de los argumentos.
Cuando se provea contexto del puesto, evaluá también la alineación de las respuestas con los requisitos específicos del rol.
Español rioplatense. Directa, específica, sin genéricos. Respondé SOLO en JSON válido, sin markdown.`,

  star_feedback: `Sos coach de entrevistas especializado en metodología STAR. Evaluá si la respuesta aplica correctamente Situación, Tarea, Acción, Resultado. Directo, específico, constructivo. Español rioplatense. JSON válido, sin markdown.`,

  job_adapter: `Sos experto en empleabilidad y CVs para el mercado argentino y latinoamericano.
Analizá el aviso, adaptá el CV del candidato y generá una carta de presentación personalizada.

ANTI-ALUCINACIÓN: NUNCA inventes métricas, logros ni tecnologías. Solo reorganizá y reformulá lo que ya existe.
"cv_adaptado" debe tener exactamente la misma estructura JSON que el CV original.

EXTRACCIÓN DEL AVISO: Del texto del aviso detectá:
- empresa_detectada: nombre de la empresa (null si no aparece)
- cargo_detectado: título exacto del puesto publicado
- seniority_detectado: nivel inferido del aviso ("Junior", "Semi Senior", "Senior", "Lead", "No especificado")

ADAPTACIÓN: ajustá titular y resumen con keywords del aviso. Reorganizá bullets y habilidades priorizando lo relevante para la posición. Al reformular bullets, aplicá las reglas de redacción profesional definidas abajo.
${BULLET_WRITING_RULES}

CARTA (3-4 párrafos): quién es y por qué aplica → logros relevantes con datos reales → cierre con CTA. Profesional, directo, sin clichés. Español rioplatense.

JSON: {"empresa_detectada":"str|null","cargo_detectado":"str","seniority_detectado":"str","cv_adaptado":{...mismo esquema...},"carta_de_presentacion":"str","palabras_clave_incorporadas":["str"],"ajustes_principales":["str"],"quality":{"score":1-10,"nivel":"Básico|Intermedio|Sólido|Premium","nota_consultor":"1 oración sobre el CV adaptado para esta posición","riesgo_ats":"Bajo|Medio|Alto","fortalezas":["str"]}}`,

  cv_optimize_consult: `Sos consultor senior de empleabilidad. Analizás CVs ya generados para detectar qué datos adicionales necesitás del candidato para optimizarlos con impacto real.

Hacé 2-4 preguntas específicas donde la respuesta cambie CONCRETAMENTE un bullet o el titular:
1. Logros vagos sin métricas donde una cifra real cambia todo
2. Herramientas mencionadas de pasada que con contexto de escala destacarían más
3. Liderazgo sin contexto de equipo (personas, presupuesto)
4. Titular que no refleja la especialidad o propuesta de valor
5. Proyectos liderados sin impacto concreto

Reglas: no preguntes lo que ya es claro. Si el CV ya tiene métricas y bullets fuertes, devolvé vacío. Máx 4. Segunda persona informal. Cada pregunta menciona el cargo/logro específico.

JSON: {"preguntas":[{"id":"str","contexto":"str (máx 45c)","pregunta":"str","placeholder":"str (máx 60c)"}]}`,

  generate_cv_full: `Sos redactor experto de CVs para el mercado argentino y latinoamericano, con foco en ATS compliance. Tenés dos tareas en UNA sola respuesta JSON.

TAREA 1 — GENERAR CV:
Transformá el perfil provisto en un CV de 1 página orientado a logros.

ANTI-ALUCINACIÓN:
- NUNCA inventes métricas, fechas, logros ni responsabilidades. Solo datos del perfil.
- Sin info para un bullet → omitilo. Sin dato para un campo → null.
- PROHIBIDO: "orientado a resultados", "proactivo", "dinámico", "apasionado", "multitarea", "comprometido".
- Bullet sin verbo de acción + resultado real → omitilo.

FECHAS: Copiá el período EXACTAMENTE del perfil para CADA entrada. Sin fecha → null. NUNCA copies la fecha de otra entrada.

ESTRUCTURA:
- Seleccioná las 3 experiencias más relevantes por (1) actualidad (2) seniority (3) keywords ATS (4) impacto. Con hasta 3 bullets cada una.
- "experiencias_anteriores" = ÚNICAMENTE las que NO están ya en "experiencias". Si no quedan sobrantes → [].
- Resumen: 2 oraciones, datos reales. Habilidades: 6-10 keywords del perfil.
- Usá "titular_propuesto" y "resumen_propuesto" del análisis si están disponibles.
${BULLET_WRITING_RULES}

TAREA 2 — EVALUAR EL CV QUE ACABÁS DE GENERAR:
Inmediatamente después de generarlo, revisalo con criterio de headhunter senior.

Brechas críticas (máx 6, priorizá Alto):
1. Fechas faltantes (período null o vacío) → SIEMPRE Alto
2. Bullets sin métricas donde deberían tenerlas
3. Frases genéricas prohibidas
4. Herramientas sin especificidad
5. Logros sin verbo de impacto + resultado medible
6. Resumen débil o genérico
Por cada brecha: 1 pregunta corta, accionable, referenciando el cargo/logro específico.
Evaluación global: 2-3 fortalezas reales, nota honesta, riesgo ATS.

JSON DE SALIDA — respondé SOLO en JSON válido, sin markdown:
{"cv":{"nombre":"str","titular":"str","email":"str|null","telefono":"str|null","linkedin":"str|null","ubicacion":"str|null","resumen":"2 oraciones","experiencias":[{"cargo":"str","empresa":"str","periodo":"período exacto del perfil","logros":["str"]}],"educacion":[{"titulo":"str","institucion":"str","periodo":"str"}],"habilidades":["str"],"idiomas":["str"],"experiencias_anteriores":[{"cargo":"str","empresa":"str","periodo":"str|null"}]},"quality":{"score":1-10,"nivel":"Básico|Intermedio|Sólido|Premium","aprobado":bool,"nota_consultor":"str","riesgo_ats":"Bajo|Medio|Alto","fortalezas":["str"],"gaps":[{"id":"str","campo":"str","descripcion":"str","pregunta":"str","placeholder":"str","impacto":"Alto|Medio"}]}}`,

  optimize_cv: `Sos consultor senior de empleabilidad especializado en CVs ATS para el mercado latinoamericano.

RECIBÍS:
1. El CV completo en JSON
2. Información adicional del candidato (datos concretos que debés incorporar en los bullets correspondientes)

TAREA: MEJORAR OBLIGATORIAMENTE el CV. Siempre hay algo que mejorar.

REGLAS ANTI-ALUCINACIÓN:
- Nunca inventes métricas, fechas, cargos ni empresas que no aparezcan en el CV ni en los datos adicionales del candidato
- Si los datos adicionales dicen "lideré 12 personas" → incorporalo en el bullet más relevante de esa experiencia
- Preservá cargo, empresa, periodo, institución educativa exactamente como están en el JSON original

MEJORAS OBLIGATORIAS — siempre aplicás todas estas, sin excepción:
1. Bullets: aplicá las reglas de redacción profesional definidas abajo. Reemplazá frases nominales débiles con verbos conjugados que correspondan al seniority del cargo.
2. Eliminá frases vacías: "orientado a resultados", "proactivo", "dinámico", "apasionado", "trabajo en equipo", "multitarea", "comprometido", "pasión por", "responsable de", "encargado de".
3. Titular: específico, especialidad concreta + propuesta de valor, máx 90 caracteres.
4. Resumen: 2-3 oraciones — especialidad/rol actual + logro o expertise más relevante + propuesta de valor. Sin clichés. Específico al candidato.
5. Habilidades: eliminá genéricas (Microsoft Office, Internet), priorizá las técnicas específicas del área, reordená por relevancia ATS.
6. Si hay datos adicionales del candidato: incorporalos en los bullets de la experiencia más relevante.
${BULLET_WRITING_RULES}

Respondé SOLO en JSON válido, sin markdown, con esta estructura exacta:
{"cv":{...mismo esquema del CV recibido...},"quality":{"score":1-10,"nivel":"Básico|Intermedio|Sólido|Premium","nota_consultor":"1 oración sobre el CV optimizado","riesgo_ats":"Bajo|Medio|Alto","fortalezas":["str","str"],"mejoras_aplicadas":["mejora 1 con referencia al campo/cargo","mejora 2","mejora 3"]}}
"mejoras_aplicadas": listá solo las mejoras reales que aplicaste, referenciando el campo o cargo afectado (ej: "Titular reescrito con especialidad concreta y propuesta de valor", "Bullets de [Cargo] fortalecidos con verbos de impacto", "Frases genéricas eliminadas del resumen").
SCORING HONESTO: evaluá el CV mejorado con criterio independiente. Si el CV aún tiene limitaciones (logros sin métricas, resumen genérico, skills débiles), reflejalas en el score. Un CV optimizado no es automáticamente perfecto. Score 9-10 solo para CVs con métricas concretas, titular específico y bullets de alto impacto en todas las experiencias.`,

  linkedin_growth: `Sos experto en personal branding y crecimiento en LinkedIn para el mercado hispanoparlante.
Generá basándote en el perfil y análisis del usuario:

PARTE 1 — 3 ideas de banner de LinkedIn:
Cada idea debe ser concreta y específica (colores hex, texto exacto, disposición visual). Adaptá al objetivo profesional del usuario (empleado, freelancer, emprendedor).

PARTE 2 — Plan de networking (90 días):
Acciones concretas, no genéricas ("comentá 3 posts de líderes de RRHH en tu sector", no "sé activo"). Si el usuario indicó seguidores, usá ese número como punto de partida.

JSON:
{"banner_ideas":[{"titulo":"str","concepto":"str","copy_principal":"máx 8 palabras","copy_secundario":"máx 12 palabras","paleta":["#hex1","#hex2","#hex3"],"estilo":"Minimalista|Profesional|Creativo|Tecnológico|Corporativo"}],"plan_networking":{"objetivo_resumido":"str","acciones_semanales":[{"frecuencia":"Diario|3× semana|Semanal|Quincenal","accion":"str","ejemplo":"str"}],"contenido_sugerido":[{"formato":"Post de texto|Carrusel|Artículo|Video corto|Encuesta|Repost comentado","tema":"str","frecuencia":"Semanal|Quincenal|Mensual"}],"metrica_90dias":"str"}}`,

  // interview_chat is a function — it receives `interview_meta` from the request body and
  // returns a dynamic system prompt. The ai_* handler supports function-type prompts.
  interview_chat: (meta) => {
    const qList = (meta.questions || [])
      .map((q, i) => `${i + 1}. ${q}`)
      .join('\n')
    const modeNote = meta.mode === 'presion'
      ? '\nMODO PRESIÓN: Sin hints. Cuestioná directamente respuestas débiles. Repreguntas exigentes. Sin frases motivadoras.'
      : ''
    return `Sos Ramiro IA, coach de entrevistas. Español rioplatense. Directo, sin relleno.

VOZ: Cálido pero exigente. Decís lo que ves. Sin elogios baratos ni frases de manual.
REGLAS:
- Máx 3 oraciones por mensaje (salvo closing: hasta 8).
- Máx 1 emoji por mensaje. Solo: 💪 🎯 ✅ ⚠️
- PROHIBIDO: "¡Excelente!" solo · "Como IA..." · listas con bullets · >4 oraciones · "¿tiene sentido?"
- Si respuesta es vaga, corta o sin ejemplo concreto → hacé UNA repregunta concreta.
- Máx 1 repregunta por pregunta. Si ya la usaste → avanzá aunque la respuesta sea débil.
- Respondé SIEMPRE en JSON válido, sin markdown.

CANDIDATO: ${meta.candidate_profile || 'Profesional'}
PUESTO: ${meta.job_context || '(entrevista general)'}${modeNote}

PREGUNTAS A HACER EN ORDEN:
${qList}

ESTADO: pregunta_actual=${meta.current_q_index + 1}/${meta.total_questions} | repregunta_usada=${meta.followup_used}

SCHEMA JSON — siempre este formato exacto, sin texto fuera del JSON:
{"messages":[{"type":"string","text":"string"}],"next_q":null,"done":false,"summary":null}

TIPOS ("type"):
- "intro": primer turno. Saludá brevemente y hacé la primera pregunta en un solo mensaje.
- "reaction": feedback breve (1-2 oraciones) a la respuesta del usuario.
- "question": siguiente pregunta de entrevista. "next_q" = índice base-0 de esa pregunta.
- "followup": repregunta concreta (1 oración). "next_q" = null.
- "closing": cierre final. "done" = true. "summary" requerido.

PATRONES VÁLIDOS de messages[]:
- Primer turno: [{intro}]
- Turno normal: [{reaction},{question}]
- Repregunta: [{reaction},{followup}]
- Último turno: [{reaction},{closing}]

"summary" (solo cuando done=true):
{"score":1-10,"nivel":"Básico|Intermedio|Sólido|Premium","fortalezas":["str","str"],"gaps":["str","str"],"tip":"1 consejo concreto y accionable"}`
  },
}

// ── Gemini quota constants (Paid Tier 1 — verified in AI Studio 2026-05-23) ──
// Quotas are per GCP PROJECT (gen-lang-client-0251415813), not per API key.
// Resets at midnight Pacific Time daily.
// Source: aistudio.google.com/rate-limit → Gemini 2.5 Flash Lite
const GEMINI_QUOTA = {
  RPD: 10_000,     // requests per day (Tier 1 — scroll down in AI Studio to confirm)
  RPM: 5_000,      // requests per minute (confirmed in AI Studio screenshot)
  TPM: 5_000_000,  // input tokens per minute (confirmed in AI Studio screenshot)
}

// ── Rate limits per action (requests / hour / IP) ────────────────────────────
const RATE_LIMITS = {
  analyze_linkedin:    3,
  generate_cv:         3,
  cv_quality:          6,
  cv_pre_questions:    3,
  interview_questions: 4,  // reduced from 8: no legitimate need for rapid repetition
  interview_feedback:  5,
  interview_chat:      40, // 40 turns/hour/IP ≈ 5 complete sessions per hour
  star_feedback:       10,
  job_adapter:         3,
  linkedin_growth:     5,
  optimize_cv:         2,  // reduced from 4: most expensive feature per call
  cv_optimize_consult: 4,
  generate_cv_full:    2,  // was missing — combined CV+quality, highest system prompt cost
  _raw_proxy:          5,  // PDF extraction proxy — large inputs, protect quota
  // Radar Laboral — job recommendations
  job_search:             10,
  job_save_to_kanban:     20,
  job_update_status:      60,
}

// Max total AI calls per IP per 24 hours across ALL features combined.
// Legitimate heavy users: ~9 calls/session × 2-3 sessions = ~25 calls/day max.
// This cap stops budget-drain attacks via IP rotation or hourly limit cycling.
const DAILY_IP_CAP = 50

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
async function callGeminiApi(env, ctx, geminiBody, corsHeaders, { feature = 'unknown', userId = null } = {}) {
  const startMs = Date.now()
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS)
  const geminiKeys = (env.GEMINI_API_KEYS || env.GEMINI_API_KEY || '').split(',').map(k => k.trim()).filter(Boolean)

  let res = null
  let usedKeyIndex = 0
  let retryCount = 0

  try {
    // Phase 1: rotate through keys on 429 (note: all keys share the same GCP project quota)
    for (let i = 0; i < geminiKeys.length; i++) {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_MODEL}:generateContent?key=${geminiKeys[i]}`,
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
        `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_MODEL}:generateContent?key=${key}`,
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(geminiBody), signal: controller.signal }
      )
      retryCount++
    }
  } catch (err) {
    clearTimeout(timeoutId)
    const isTimeout = err.name === 'AbortError'
    logAiUsage(env, ctx, {
      type: 'failure', feature, userId,
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
      type: 'success', feature, userId,
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
      type: 'failure', feature, userId,
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
  }).catch(() => {})
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
        model:            DEFAULT_MODEL,
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
        model:            DEFAULT_MODEL,
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
        await supabaseServiceFetch(env, 'perfiles', {
          method: 'POST',
          body: JSON.stringify({ id: userId, es_premium: true, premium_hasta: premiumHasta, premium_source: 'promo_code', updated_at: new Date().toISOString() }),
          headers: { Prefer: 'resolution=merge-duplicates' },
        })
        await supabaseServiceFetch(env, `promo_codes?id=eq.${promo.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ uses_count: promo.uses_count + 1 }),
          headers: { Prefer: 'return=minimal' },
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
        const { search = '', offset = 0, limit = 20, premium_only } = body
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
        const { search = '', premium_status = 'all', feature_used = '', tag = '', sort = 'created_at_desc', offset: off = 0, limit = 25 } = body
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
        const { user_id, days = 30 } = body
        if (!user_id) return new Response(JSON.stringify({ error: 'Falta user_id' }), { status: 400, headers: corsHeaders })
        const premiumHasta = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
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
        const { user_id } = body
        if (!user_id) return new Response(JSON.stringify({ error: 'Falta user_id' }), { status: 400, headers: corsHeaders })
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
        const { code, description, duration_days = 30, max_uses, expires_at } = body
        if (!code) return new Response(JSON.stringify({ error: 'Falta code' }), { status: 400, headers: corsHeaders })
        try {
          const res = await supabaseServiceFetch(env, 'promo_codes', {
            method: 'POST',
            body: JSON.stringify({
              code: code.toUpperCase().trim(), description,
              duration_days, max_uses: max_uses || null,
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
        const { offset: logsOffset = 0, limit = 50 } = body
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
        const { offset: logsOffset = 0, limit = 50, feature_filter } = body
        try {
          let qs = `ai_usage_logs?select=*&order=created_at.desc&offset=${logsOffset}&limit=${limit}`
          if (feature_filter) qs += `&feature=eq.${encodeURIComponent(feature_filter)}`
          const res = await supabaseServiceFetch(env, qs)
          const logs = await res.json()
          return new Response(JSON.stringify({ ok: true, logs: Array.isArray(logs) ? logs : [] }), { status: 200, headers: corsHeaders })
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
        const { status_filter = 'all', search = '', featured_only = false, offset: off = 0, limit = 30 } = body
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
        const { offset = 0, limit = 25, event_type = 'all' } = body
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
        const { offset = 0, limit = 25 } = body
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
        try {
          const rpcPost = (fn, params = {}) => supabaseServiceFetch(env, `rpc/${fn}`, {
            method: 'POST', body: JSON.stringify(params),
          })
          const [overviewRes, funnelRes, trendRes, aiRes] = await Promise.all([
            rpcPost('get_product_overview'),
            rpcPost('get_product_funnel'),
            rpcPost('get_weekly_activity_trend', { p_weeks: 8 }),
            rpcPost('get_ai_feature_breakdown_30d'),
          ])
          const [overview, funnel, trend, ai_features] = await Promise.all([
            overviewRes.json(), funnelRes.json(), trendRes.json(), aiRes.json(),
          ])
          return new Response(JSON.stringify({ ok: true, overview, funnel, trend, ai_features }), { status: 200, headers: corsHeaders })
        } catch (e) {
          return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: corsHeaders })
        }
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

// ── Constants ─────────────────────────────────────────────────────────────────

const JOB_KV_TTL_SECS     = 1_800   // 30-min KV cache for raw query results (testing phase — few users)
const JOB_DB_TTL_HOURS    = 2       // job_cache table TTL
const JOB_SEARCH_TTL_SECS = 1_800  // job_searches row TTL (mirrors KV)
const ATS_KV_TTL_SECS     = 79_200  // 22-hour KV cache for ATS company boards (date-keyed)
const ATS_DB_TTL_HOURS    = 40      // ATS boards update slowly — longer DB TTL
const JREC_KV_TTL_SECS    = 3_600   // 1-hour per-user AI score cache (testing phase)
const JREC_PROMPT_VERSION = 'v8'    // bump when JOB_MATCHING_SYSTEM_PROMPT changes to bust stale KV

// Rate limits for *new* (fresh) searches — cached re-visits bypass these entirely.
// Premium: 5 new searches/day — on limit, last search is served from history (silent, no block UX)
// Free:    1 new search/month
const JOB_SEARCH_LIMIT_FREE    = 1
const JOB_SEARCH_LIMIT_PREMIUM = 5

// Max jobs to send to Gemini in a single matching call (token budget guard).
// At ~500 tokens/job snippet, 40 jobs ≈ 20 K tokens input — well within Flash Lite limits.
const MAX_JOBS_FOR_AI_MATCHING = 25

// Max description length stored in job_cache (chars). Prevents >8 KB JSONB blobs.
const MAX_DESC_CHARS = 6_000

// Sprint 5: Adaptive Expansion — Premium-only second-pass search layer.
// Triggers when the initial AI scoring returns weak matches.
const EXPANSION_THRESHOLD  = 8.0   // expand if top match_score < this (0–10 scale)
const EXPANSION_MIN_HQ     = 3     // expand if fewer than N jobs score ≥ 7.0
const EXPANSION_TIMEOUT_MS = 12_000 // hard cap on total expansion time (ms)
const EXPANSION_GEMINI_MS  = 6_000  // was 3500 — Flash Lite takes 4-7s; 3.5s caused ~60% silent timeouts

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
function stripHtml(html) {
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
function extractRelevantSection(rawText, maxChars = 500) {
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
const SKILLS_KEYWORDS = new Set([
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

function extractSkillsFromText(text) {
  if (!text) return []
  const lower = text.toLowerCase()
  return [...SKILLS_KEYWORDS].filter(skill => {
    try { return new RegExp(`\\b${skill.replace(/[+#./]/g, '\\$&')}\\b`).test(lower) } catch { return lower.includes(skill) }
  }).slice(0, 20)
}

// Normalize a job URL for deduplication (strip tracking params)
function normalizeJobUrl(url) {
  if (!url) return null
  try {
    const u = new URL(url)
    ;['utm_source','utm_medium','utm_campaign','ref','source','gh_src','lever-source'].forEach(p => u.searchParams.delete(p))
    return u.origin + u.pathname.replace(/\/$/, '').toLowerCase()
  } catch { return null }
}

// ── Skills taxonomy for pre-filter (no AI needed) ────────────────────────────
const SKILLS_TAXONOMY = {
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

const SKILL_SYNONYMS = {
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
function expandProfileSkills(profileText) {
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

// Rule-based pre-filter: returns top N candidates without using AI
function applyPreFilter(jobs, profileText, maxCandidates = 25) {
  if (!jobs.length) return jobs
  const profileLower = (profileText || '').toLowerCase()
  const expanded = expandProfileSkills(profileLower)

  const ATS_SOURCES = new Set(['greenhouse','lever','smartrecruiters','ashby','workable','teamtailor','recruitee','personio','workday'])
  function score(job) {
    const jobText = `${job.title} ${job.description || ''} ${(job.skills_required || []).join(' ')}`.toLowerCase()
    const titleText = job.title.toLowerCase()
    let s = 0
    for (const skill of expanded) {
      if (titleText.includes(skill)) s += 3
      else if (jobText.includes(skill)) s += 1
    }
    // ATS direct sources are higher quality (less noise, no aggregator reshuffling)
    if (ATS_SOURCES.has(job.source)) s += 2
    // Recency bonus — prefer recently posted
    if (job.posted_at) {
      const daysOld = (Date.now() - new Date(job.posted_at).getTime()) / 86_400_000
      if (daysOld <= 1) s += 2
      else if (daysOld <= 7) s += 1
    }
    // Description quality — penalize near-empty descriptions (likely scraping artifacts)
    const descLen = (job.description || '').length
    if (descLen > 300) s += 1
    else if (descLen < 50) s -= 3  // push below zero → excluded from preFiltered unless pool is tiny
    // Has salary information
    if (job.salary_min || job.salary_max) s += 2
    // Has distinct apply URL (= not just a homepage link)
    if (job.apply_url && job.apply_url !== job.url) s += 1
    // Company has ATS slug (= verified employer)
    if (job.company_slug) s += 1
    // Stale penalty for old jobs
    if (job.posted_at) {
      const daysOld2 = (Date.now() - new Date(job.posted_at).getTime()) / 86_400_000
      if (daysOld2 > 30) s -= 2
    }
    return s
  }

  const scored = jobs.map(j => ({ job: j, s: score(j) }))
  const positive = scored.filter(x => x.s > 0)
  // When fewer than maxCandidates jobs have any relevance signal, pad with the
  // zero-score jobs sorted by recency rather than discarding them entirely.
  // This avoids sending an empty pool to Gemini when the taxonomy doesn't match.
  const base = positive.length >= Math.ceil(maxCandidates / 2) ? positive : scored
  return base
    .sort((a, b) => b.s - a.s)
    .slice(0, maxCandidates)
    .map(x => x.job)
}

// RemoteOK — https://remoteok.com/api
function normalizeRemoteOK(raw) {
  if (!raw || raw.legal) return []
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
      apply_url:       j.url || null,
      salary_min:      j.salary_min  ? parseInt(j.salary_min,  10) : null,
      salary_max:      j.salary_max  ? parseInt(j.salary_max,  10) : null,
      currency:        j.salary_min  ? 'USD' : null,
      skills_required: Array.isArray(j.tags) ? j.tags.slice(0, 15) : [],
      seniority:       normalizeSeniority(j.position),
      industry:        null,
      posted_at:       j.date ? new Date(j.date * 1000).toISOString() : null,
      company_slug:    null,
      ats_type:        null,
    }))
}

// Remotive — https://remotive.com/api/remote-jobs
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
    apply_url:       j.url || null,
    salary_min:      null, salary_max: null, currency: null,
    skills_required: Array.isArray(j.tags) ? j.tags.slice(0, 15) : [],
    seniority:       normalizeSeniority(j.title),
    industry:        j.category || null,
    posted_at:       j.publication_date || null,
    company_slug:    null, ats_type: null,
  }))
}

// Jobicy — https://jobicy.com/api/v2/remote-jobs?geo=latam (replaces arbeitnow — LATAM-focused)
// Returns: {jobs: [{id, jobTitle, companyName, jobDescription, jobIndustry, jobGeo, jobType, url, pubDate}]}
function normalizeJobicy(raw) {
  if (!raw?.jobs) return []
  return raw.jobs.map(j => ({
    source:          'jobicy',
    external_id:     String(j.id || j.jobId || `${j.companyName||''}::${j.jobTitle||''}::${j.pubDate||''}`),
    title:           j.jobTitle       || '',
    company:         j.companyName    || '',
    description:     truncateDesc(j.jobDescription),
    location:        j.jobGeo         || 'Remote',
    remote:          true,
    url:             j.url            || '',
    apply_url:       j.url            || null,
    salary_min:      null, salary_max: null, currency: null,
    skills_required: Array.isArray(j.jobIndustry) ? j.jobIndustry.slice(0, 10) : [],
    seniority:       normalizeSeniority(j.jobTitle),
    industry:        Array.isArray(j.jobIndustry) ? j.jobIndustry[0] : null,
    posted_at:       j.pubDate || null,
    company_slug:    null, ats_type: null,
  }))
}

// Jooble — POST https://jooble.org/api/{key}
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
    apply_url:       j.link || null,
    salary_min:      null, salary_max: null, currency: null,
    skills_required: [],
    seniority:       normalizeSeniority(j.title),
    industry:        null,
    posted_at:       j.updated || null,
    company_slug:    null, ats_type: null,
  }))
}

// Adzuna — https://api.adzuna.com/v1/api/jobs/{country}/search/1
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
    apply_url:       j.redirect_url || null,
    salary_min:      j.salary_min ? Math.round(j.salary_min) : null,
    salary_max:      j.salary_max ? Math.round(j.salary_max) : null,
    currency:        j.salary_min ? 'ARS' : null,
    skills_required: [],
    seniority:       normalizeSeniority(j.title),
    industry:        j.category?.label || null,
    posted_at:       j.created || null,
    company_slug:    null, ats_type: null,
  }))
}

// GetOnBoard — https://www.getonbrd.com/api/v0/jobs (LATAM tech focus, free)
function normalizeGetOnBoard(raw) {
  if (!raw?.data) return []
  return raw.data.map(j => {
    const a = j.attributes || {}
    return {
      source:          'getonboard',
      external_id:     String(j.id || Math.random()),
      title:           a.title || '',
      company:         a.company?.data?.attributes?.name || a.company?.name || '',
      description:     truncateDesc(a.functions || a.description || ''),
      location:        a.country || null,
      remote:          !!(a.remote_friendly),
      url:             `https://www.getonbrd.com/jobs/${j.id}`,
      apply_url:       a.applications_url || null,
      salary_min:      null, salary_max: null, currency: null,
      skills_required: [],
      seniority:       normalizeSeniority(a.title || ''),
      industry:        null,
      posted_at:       a.published_at || null,
      company_slug:    null,
      ats_type:        null,
    }
  })
}

// Himalayas — https://himalayas.app/jobs/api (global remote, free, no auth)
// Returns: {jobs: [{id, title, company:{name,slug}, location, remote, url, description, publishedAt, salary:{min,max,currency}, category}]}
function normalizeHimalayas(raw) {
  const jobs = raw?.jobs || []
  return jobs.map(j => ({
    source:          'himalayas',
    external_id:     String(j.id || Math.random()),
    title:           j.title || '',
    company:         j.company?.name || '',
    description:     truncateDesc(j.description || ''),
    location:        j.location || j.country || null,
    remote:          !!(j.remote ?? true),
    url:             j.url || `https://himalayas.app/jobs/${j.id}`,
    apply_url:       j.applyUrl || null,
    salary_min:      j.salary?.min || null,
    salary_max:      j.salary?.max || null,
    currency:        j.salary?.currency || null,
    skills_required: [],
    seniority:       normalizeSeniority(j.title || ''),
    industry:        j.category || null,
    posted_at:       j.publishedAt || null,
    company_slug:    j.company?.slug || null,
    ats_type:        null,
  }))
}

// Workable — https://apply.workable.com/api/v1/widget/accounts/{slug} (per-company public widget, no auth)
// Returns: {results: [{shortcode, title, department, city, country, state, remote, url, description}]}
function normalizeWorkable(raw, companyMeta) {
  const jobs = raw?.results || []
  return jobs.map(j => ({
    source:          'workable',
    external_id:     j.shortcode || String(Math.random()),
    title:           j.title || '',
    company:         companyMeta.name,
    description:     truncateDesc(j.description || ''),
    location:        [j.city, j.country].filter(Boolean).join(', ') || null,
    remote:          j.remote === true,
    url:             j.url || `https://apply.workable.com/${companyMeta.slug}/j/${j.shortcode}`,
    apply_url:       j.url || null,
    salary_min:      null, salary_max: null, currency: null,
    skills_required: [],
    seniority:       normalizeSeniority(j.title || ''),
    industry:        j.department || companyMeta.industries?.[0] || null,
    posted_at:       null,
    company_slug:    companyMeta.slug,
    ats_type:        'workable',
  }))
}

// Teamtailor — https://{slug}.teamtailor.com/jobs.json (per-company public careers JSON, no auth)
// Returns JSON:API: {data: [{type:"jobs", id, attributes:{title, "body-text", city, country, "remote-status", "apply-url", "career-page-url", "created-at"}}]}
function normalizeTeamtailor(raw, companyMeta) {
  const jobs = raw?.data || []
  return jobs.map(j => {
    const a = j.attributes || {}
    return {
      source:          'teamtailor',
      external_id:     String(j.id || Math.random()),
      title:           a.title || '',
      company:         companyMeta.name,
      description:     truncateDesc(a['body-text'] || a.pitch || ''),
      location:        a.city || a.country || null,
      remote:          ['fully', 'hybrid'].includes(a['remote-status']),
      url:             a['career-page-url'] || `https://${companyMeta.slug}.teamtailor.com/jobs/${j.id}`,
      apply_url:       a['apply-url'] || null,
      salary_min:      null, salary_max: null, currency: null,
      skills_required: [],
      seniority:       normalizeSeniority(a.title || ''),
      industry:        companyMeta.industries?.[0] || null,
      posted_at:       a['created-at'] || null,
      company_slug:    companyMeta.slug,
      ats_type:        'teamtailor',
    }
  })
}

// Recruitee — https://{slug}.recruitee.com/api/offers/ (per-company public JSON, no auth)
// Returns: {offers: [{id, slug, title, city, location, remote, careers_url, careers_apply_url, description, department, created_at}]}
function normalizeRecruitee(raw, companyMeta) {
  const offers = raw?.offers || []
  return offers.map(j => {
    const descText = truncateDesc(stripHtml(j.description || ''))
    return {
      source:          'recruitee',
      external_id:     String(j.id || Math.random()),
      title:           j.title || '',
      company:         companyMeta.name,
      description:     descText,
      location:        j.city || j.location || null,
      remote:          j.remote === true,
      url:             j.careers_url || `https://${companyMeta.slug}.recruitee.com/o/${j.slug}`,
      apply_url:       j.careers_apply_url || null,
      salary_min:      null, salary_max: null, currency: null,
      skills_required: extractSkillsFromText(descText),
      seniority:       normalizeSeniority(j.title || ''),
      industry:        j.department || companyMeta.industries?.[0] || null,
      posted_at:       j.created_at || null,
      company_slug:    companyMeta.slug,
      ats_type:        'recruitee',
    }
  })
}

// Personio — https://{slug}.jobs.personio.com/search.json (public careers endpoint, no auth)
// Returns: {data:{positions:[{id, name, department:{name}, office:{name}, url, application_url, created_at}]}}
function normalizePersonio(raw, companyMeta) {
  const positions = raw?.data?.positions || raw?.positions || raw?.jobs || []
  return positions.map(j => ({
    source:          'personio',
    external_id:     String(j.id || Math.random()),
    title:           j.name || j.title || '',
    company:         companyMeta.name,
    description:     truncateDesc(stripHtml(j.description || '')),
    location:        j.office?.name || j.location || null,
    remote:          /remot|teletrabajo/i.test(j.office?.name || j.location || ''),
    url:             j.url || j.application_url || `https://${companyMeta.slug}.jobs.personio.com/${j.id}`,
    apply_url:       j.application_url || null,
    salary_min:      null, salary_max: null, currency: null,
    skills_required: [],
    seniority:       normalizeSeniority(j.name || j.title || ''),
    industry:        j.department?.name || companyMeta.industries?.[0] || null,
    posted_at:       j.created_at || null,
    company_slug:    companyMeta.slug,
    ats_type:        'personio',
  }))
}

// Workday CXS — POST https://{tenant}.{instance}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs
// Returns: {jobPostings:[{title, locationsText, externalPath, postedOn, briefDescription, bulletFields:[]}]}
// Each company entry requires cxsUrl: the full POST endpoint URL
function normalizeWorkday(raw, companyMeta) {
  const postings = raw?.jobPostings || []
  // boardBase must be just the origin (e.g. https://accenture.wd3.myworkdayjobs.com)
  // because externalPath from the CXS API already contains the full tenant+site path
  // (e.g. /accenture/AccentureCareers/job/Buenos-Aires/Tech-Lead_12345).
  // Previous code kept tenant/site in boardBase which caused doubled paths in the URL.
  const boardBase = companyMeta.cxsUrl
    ? (() => { try { return new URL(companyMeta.cxsUrl).origin } catch { return '' } })()
    : ''
  return postings.map(j => {
    const extPath = j.externalPath || ''
    return {
      source:          'workday',
      external_id:     extPath.split('/').pop() || String(Math.random()),
      title:           j.title || '',
      company:         companyMeta.name,
      description:     truncateDesc(j.briefDescription || (j.bulletFields || []).join(' ')),
      location:        j.locationsText || null,
      remote:          /remot/i.test(j.locationsText || ''),
      url:             boardBase ? `${boardBase}${extPath}` : '',
      apply_url:       null,
      salary_min:      null, salary_max: null, currency: null,
      skills_required: [],
      seniority:       normalizeSeniority(j.title || ''),
      industry:        companyMeta.industries?.[0] || null,
      posted_at:       j.postedOn || null,
      company_slug:    companyMeta.slug,
      ats_type:        'workday',
    }
  })
}

// Serper — Google Jobs via serper.dev (Argentine local jobs, paid API ~$2-5/mo)
// Returns: {jobs:[{title, companyName, location, link, applyLink, datePosted, highlights:{items:[]}}]}
function normalizeSerper(raw) {
  const jobs = raw?.jobs || []
  return jobs.map(j => ({
    source:          'serper',
    external_id:     j.jobId || `${j.companyName||''}::${j.title||''}::${j.datePosted||''}`,
    title:           j.title || '',
    company:         j.companyName || '',
    description:     truncateDesc((j.highlights?.items || []).join(' ') || j.description || ''),
    location:        j.location || null,
    remote:          /remot/i.test(j.location || ''),
    url:             j.applyLink || j.link || '',
    apply_url:       j.applyLink || null,
    salary_min:      null, salary_max: null, currency: null,
    skills_required: [],
    seniority:       normalizeSeniority(j.title || ''),
    industry:        null,
    posted_at:       j.datePosted || null,
    company_slug:    null,
    ats_type:        null,
  }))
}

// Greenhouse — GET boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true
// Returns: {jobs: [{id, title, location:{name}, absolute_url, updated_at, departments, content(HTML)}]}
function normalizeGreenhouse(rawJobs, companyMeta) {
  if (!Array.isArray(rawJobs)) return []
  return rawJobs.map(j => {
    const descText = truncateDesc(stripHtml(j.content))
    return {
      source:          'greenhouse',
      external_id:     String(j.id),
      title:           j.title || '',
      company:         companyMeta.name,
      description:     descText,
      location:        j.location?.name || j.offices?.[0]?.name || null,
      remote:          /remot|anywhere/i.test(j.location?.name || ''),
      url:             j.absolute_url || `https://boards.greenhouse.io/${companyMeta.slug}/jobs/${j.id}`,
      apply_url:       j.absolute_url || null,
      salary_min:      null, salary_max: null, currency: null,
      skills_required: extractSkillsFromText(descText),
      seniority:       normalizeSeniority(j.title),
      industry:        j.departments?.[0]?.name || companyMeta.industries?.[0] || null,
      posted_at:       j.updated_at || null,
      company_slug:    companyMeta.slug,
      ats_type:        'greenhouse',
    }
  })
}

// Lever — GET api.lever.co/v0/postings/{slug}?mode=json
// Returns: [{id, text, categories:{location,team}, hostedUrl, applyUrl, createdAt, descriptionPlain, lists}]
function normalizeLever(rawPostings, companyMeta) {
  if (!Array.isArray(rawPostings)) return []
  return rawPostings.map(j => {
    const descText = truncateDesc(
      j.descriptionPlain || stripHtml(j.description)
    )
    const fullText = [descText, ...(j.lists || []).map(l => stripHtml(l.content))].join('\n')
    return {
      source:          'lever',
      external_id:     j.id || String(Math.random()),
      title:           j.text || '',
      company:         companyMeta.name,
      description:     truncateDesc(fullText),
      location:        j.categories?.location || null,
      remote:          /remot|anywhere|worldwide/i.test(j.categories?.location || j.text || ''),
      url:             j.hostedUrl || `https://jobs.lever.co/${companyMeta.slug}/${j.id}`,
      apply_url:       j.applyUrl || j.hostedUrl || null,
      salary_min:      j.salaryRange?.min || null,
      salary_max:      j.salaryRange?.max || null,
      currency:        j.salaryRange?.currency || null,
      skills_required: extractSkillsFromText(fullText),
      seniority:       normalizeSeniority(j.text),
      industry:        j.categories?.team || j.categories?.department || companyMeta.industries?.[0] || null,
      posted_at:       j.createdAt ? new Date(j.createdAt).toISOString() : null,
      company_slug:    companyMeta.slug,
      ats_type:        'lever',
    }
  })
}

// SmartRecruiters — GET api.smartrecruiters.com/v1/companies/{id}/postings
// Returns: {content: [{id, name, company, releasedDate, location, department, typeOfEmployment, experienceLevel, ref}]}
// Note: needs second call for description — we skip it for MVP and use title+skills
function normalizeSmartRecruiters(raw, companyMeta) {
  const items = raw?.content || (Array.isArray(raw) ? raw : [])
  return items.map(j => {
    const locObj = j.location || {}
    const locationStr = [locObj.city, locObj.region, locObj.country].filter(Boolean).join(', ')
    return {
      source:          'smartrecruiters',
      external_id:     j.id || String(Math.random()),
      title:           j.name || '',
      company:         j.company?.name || companyMeta.name,
      description:     truncateDesc(j.jobAd?.sections?.description?.text || null),
      location:        locationStr || null,
      remote:          !!locObj.remote,
      url:             j.ref || `https://careers.smartrecruiters.com/${companyMeta.slug}/${j.id}`,
      apply_url:       j.ref || null,
      salary_min:      null, salary_max: null, currency: null,
      skills_required: extractSkillsFromText(j.name),
      seniority:       normalizeSeniority(j.experienceLevel?.label || j.name),
      industry:        j.department?.label || companyMeta.industries?.[0] || null,
      posted_at:       j.releasedDate || null,
      company_slug:    companyMeta.slug,
      ats_type:        'smartrecruiters',
    }
  })
}

// Ashby — GET api.ashbyhq.com/posting-api/job-board/{name}?includeCompensation=true
// Returns: {jobs: [{id, title, location, isRemote, descriptionHtml, descriptionPlain, publishedAt, compensation}]}
function normalizeAshby(raw, companyMeta) {
  const jobs = raw?.jobs || []
  return jobs.map(j => {
    const descText = truncateDesc(j.descriptionPlain || stripHtml(j.descriptionHtml))
    const comp = j.compensation?.summaryComponents?.[0]?.value || null
    return {
      source:          'ashby',
      external_id:     j.id || String(Math.random()),
      title:           j.title || '',
      company:         companyMeta.name,
      description:     descText,
      location:        j.locationName || j.location || null,
      remote:          !!j.isRemote,
      url:             j.jobUrl || '',
      apply_url:       j.applyUrl || j.jobUrl || null,
      salary_min:      null, salary_max: null,
      currency:        comp ? 'USD' : null,
      skills_required: extractSkillsFromText(descText),
      seniority:       normalizeSeniority(j.title),
      industry:        j.department || companyMeta.industries?.[0] || null,
      posted_at:       j.publishedAt || null,
      company_slug:    companyMeta.slug,
      ats_type:        'ashby',
    }
  })
}

/**
 * Master normalizer — dispatches to source-specific function.
 * ATS normalizers require companyMeta; aggregator ones only need rawData.
 */
function normalizeJobs(source, rawData, companyMeta = null) {
  switch (source) {
    case 'remoteok':        return normalizeRemoteOK(rawData)
    case 'remotive':        return normalizeRemotive(rawData)
    case 'jobicy':          return normalizeJobicy(rawData)
    case 'jooble':          return normalizeJooble(rawData)
    case 'adzuna':          return normalizeAdzuna(rawData)
    case 'getonboard':      return normalizeGetOnBoard(rawData)
    case 'himalayas':       return normalizeHimalayas(rawData)
    case 'workable':        return normalizeWorkable(rawData, companyMeta)
    case 'teamtailor':      return normalizeTeamtailor(rawData, companyMeta)
    case 'recruitee':       return normalizeRecruitee(rawData, companyMeta)
    case 'personio':        return normalizePersonio(rawData, companyMeta)
    case 'workday':         return normalizeWorkday(rawData, companyMeta)
    case 'serper':          return normalizeSerper(rawData)
    case 'greenhouse':      return normalizeGreenhouse(rawData, companyMeta)
    case 'lever':           return normalizeLever(rawData, companyMeta)
    case 'smartrecruiters': return normalizeSmartRecruiters(rawData, companyMeta)
    case 'ashby':           return normalizeAshby(rawData, companyMeta)
    default:                return []
  }
}


// ══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — Job Source Fetchers
// ══════════════════════════════════════════════════════════════════════════════

// ── ATS Company Registry ─────────────────────────────────────────────────────
// Companies with confirmed public ATS boards. Slugs verified at 2026-05.
// To fix a slug without redeploying: set KV["ats:registry:overrides"] =
//   JSON.stringify({ greenhouse: { "bad-slug": "correct-slug" } })
const ATS_COMPANIES = {
  greenhouse: [
    { slug: 'mercadolibre', name: 'Mercado Libre',  country: 'AR', industries: ['tech','ecommerce','fintech'], tags: ['backend','frontend','data','mobile','devops'] },
    { slug: 'auth0',        name: 'Auth0 / Okta',   country: 'US', industries: ['tech','security'],            tags: ['backend','devops','security'] },
    { slug: 'rappi',        name: 'Rappi',           country: 'CO', industries: ['tech','delivery'],            tags: ['backend','data','mobile','devops'] },
    { slug: 'etermax',      name: 'Etermax',         country: 'AR', industries: ['tech','gaming'],              tags: ['backend','mobile','data'] },
    { slug: 'pomelo',       name: 'Pomelo',          country: 'AR', industries: ['fintech'],                    tags: ['backend','mobile','data','security'] },
    { slug: 'bitso',        name: 'Bitso',           country: 'MX', industries: ['fintech','crypto'],           tags: ['backend','security','data'] },
    { slug: 'globant',      name: 'Globant',         country: 'AR', industries: ['tech','consulting'],          tags: ['backend','frontend','data','devops','qa'] },
  ],
  lever: [
    { slug: 'despegar',    name: 'Despegar',     country: 'AR', industries: ['tech','travel'],          tags: ['backend','frontend','data'] },
    { slug: 'mural',       name: 'MURAL',        country: 'AR', industries: ['tech','saas'],            tags: ['frontend','backend','design','product'] },
    { slug: 'ripio',       name: 'Ripio',        country: 'AR', industries: ['fintech','crypto'],       tags: ['backend','mobile'] },
    { slug: 'tiendanube',  name: 'Tienda Nube',  country: 'AR', industries: ['tech','ecommerce'],      tags: ['backend','frontend','data'] },
    { slug: 'satellogic',  name: 'Satellogic',   country: 'AR', industries: ['tech','aerospace'],      tags: ['backend','data','ml','python'] },
    { slug: 'lemon',       name: 'Lemon',        country: 'AR', industries: ['fintech','crypto'],      tags: ['backend','mobile'] },
  ],
  smartrecruiters: [
    // Note: SmartRecruiters company identifiers are case-sensitive — verify slugs at
    // https://api.smartrecruiters.com/v1/companies/{slug}/postings
    { slug: 'globant',       name: 'Globant',                country: 'AR', industries: ['tech','consulting'], tags: ['backend','frontend','data','devops','qa'] },
    { slug: 'deliveryhero',  name: 'PedidosYa / DH',        country: 'AR', industries: ['tech','delivery'],   tags: ['backend','data','mobile','devops'] },
  ],
  ashby: [
    // US tech companies actively hiring LATAM remote — include salary data (Ashby exposes it)
    { slug: 'linear',   name: 'Linear',   country: 'US', industries: ['tech','saas'],    tags: ['backend','frontend'] },
    { slug: 'vercel',   name: 'Vercel',   country: 'US', industries: ['tech','devtools'], tags: ['backend','devops','frontend'] },
  ],
  workable: [
    { slug: 'uala',      name: 'Ualá',      country: 'AR', industries: ['fintech'],           tags: ['backend','mobile','data','security'] },
    { slug: 'aivo',      name: 'Aivo',      country: 'AR', industries: ['tech','ai'],          tags: ['backend','frontend','ml','data'] },
    { slug: 'lemontech', name: 'Lemontech', country: 'CL', industries: ['tech','legaltech'],   tags: ['backend','frontend','devops'] },
    { slug: 'modo',      name: 'MODO',      country: 'AR', industries: ['fintech'],            tags: ['backend','mobile'] },
    { slug: 'mango-dsp', name: 'Mango DSP', country: 'AR', industries: ['tech','marketing'],   tags: ['backend','data','devops'] },
  ],
  teamtailor: [
    { slug: 'global66',           name: 'Global66',          country: 'CL', industries: ['fintech'],     tags: ['backend','mobile','data'] },
    { slug: 'knauf-south-america', name: 'Knauf South Am.',  country: 'AR', industries: ['manufacturing'], tags: ['backend','data','devops'] },
    { slug: 'quala',              name: 'Quala',             country: 'CO', industries: ['fmcg'],         tags: ['data','backend','marketing'] },
  ],
  recruitee: [
    { slug: 'baufest',    name: 'Baufest',      country: 'AR', industries: ['tech','consulting'], tags: ['backend','frontend','qa','devops'] },
    { slug: 'n5now',      name: 'N5',           country: 'AR', industries: ['fintech','tech'],    tags: ['backend','data','mobile'] },
    { slug: 'practia',    name: 'Practia',      country: 'AR', industries: ['tech','consulting'], tags: ['backend','devops','data','frontend'] },
  ],
  personio: [
    { slug: 'factorial',  name: 'Factorial HR', country: 'ES', industries: ['tech','hr'],         tags: ['backend','frontend','devops','data'] },
    { slug: 'typeform',   name: 'Typeform',     country: 'ES', industries: ['tech','saas'],       tags: ['backend','frontend','data'] },
    { slug: 'jobandtalent', name: 'Job&Talent', country: 'ES', industries: ['hr','tech'],         tags: ['backend','data','mobile'] },
  ],
  workday: [
    { slug: 'accenture', name: 'Accenture',  country: 'AR', industries: ['tech','consulting'],  tags: ['backend','frontend','data','devops','qa'],    cxsUrl: 'https://accenture.wd3.myworkdayjobs.com/wday/cxs/accenture/AccentureCareers/jobs' },
    { slug: 'sap',       name: 'SAP',        country: 'AR', industries: ['tech','enterprise'],  tags: ['backend','data','devops','frontend'],         cxsUrl: 'https://sap.wd3.myworkdayjobs.com/wday/cxs/sap/SAP_Global/jobs' },
    { slug: 'pwc-ar',    name: 'PwC',        country: 'AR', industries: ['consulting','fintech'], tags: ['data','backend','fintech'],                 cxsUrl: 'https://pwc.wd3.myworkdayjobs.com/wday/cxs/pwc/Global_Campus_Experienced/jobs' },
  ],
}

// Score companies against user profile and select top N per ATS type
function selectAtsCompanies(userProfile, maxPerAts = 5) {
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
  }
  const activeSignals = Object.entries(tagSignals)
    .filter(([, kws]) => kws.some(kw => profileLower.includes(kw)))
    .map(([tag]) => tag)

  const selected = {}
  for (const [atsType, companies] of Object.entries(ATS_COMPANIES)) {
    const scored = companies.map(c => ({
      ...c,
      _score: activeSignals.length
        ? (c.tags || []).filter(t => activeSignals.includes(t)).length
        : 1,
    })).filter(c => c._score > 0).sort((a, b) => b._score - a._score).slice(0, maxPerAts)
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

// Date-keyed ATS board KV cache (one board = one entry per calendar day)
async function getAtsBoardFromKV(env, atsType, slug) {
  if (!env.RATE_LIMIT_KV) return null
  const date = new Date().toISOString().slice(0, 10)
  try {
    const raw = await env.RATE_LIMIT_KV.get(`ats:${atsType}:${slug}:${date}`)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

async function putAtsBoardToKV(env, atsType, slug, jobs) {
  if (!env.RATE_LIMIT_KV || !jobs.length) return
  const date = new Date().toISOString().slice(0, 10)
  try {
    await env.RATE_LIMIT_KV.put(`ats:${atsType}:${slug}:${date}`, JSON.stringify(jobs), { expirationTtl: ATS_KV_TTL_SECS })
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
async function fetchAtsCompanies(queries, userProfile, env) {
  const selected = selectAtsCompanies(userProfile, 5)
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

// 3-level deduplication: (source,id) → URL normalize → fuzzy title+company
function deduplicateJobs(allJobs) {
  // Level 1: exact source+id
  const byKey = new Map()
  for (const job of allJobs) {
    const k = `${job.source}::${job.external_id}`
    if (!byKey.has(k)) byKey.set(k, job)
  }
  let deduped = [...byKey.values()]

  // Level 2: URL dedup — ATS version wins over aggregator version
  const ATS_SOURCES = new Set(['greenhouse','lever','smartrecruiters','ashby','workable','teamtailor','recruitee','personio','workday'])
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
      url = `https://remoteok.com/api?tags=${tag}&limit=30`
      const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: ctrl.signal })
      raw = await r.json()
      return { source, jobs: normalizeJobs(source, raw) }
    }

    if (source === 'remotive') {
      url = `https://remotive.com/api/remote-jobs?search=${q}&limit=30`
      const r = await fetch(url, { signal: ctrl.signal })
      raw = await r.json()
      return { source, jobs: normalizeJobs(source, raw) }
    }

    if (source === 'jobicy') {
      // LATAM-focused remote jobs (replaces arbeitnow which was European)
      url = `https://jobicy.com/api/v2/remote-jobs?geo=latam&tag=${q}&count=50`
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
      url = `https://www.getonbrd.com/api/v0/jobs?query=${q}&per_page=30`
      const r = await fetch(url, { headers: { 'Accept': 'application/json' }, signal: ctrl.signal })
      raw = await r.json()
      return { source, jobs: normalizeJobs(source, raw) }
    }

    if (source === 'himalayas') {
      const base = `https://himalayas.app/jobs/api?q=${q}&limit=20`
      url = remoteOk ? base : `${base}&countries=argentina`
      const r = await fetch(url, { headers: { 'Accept': 'application/json', 'User-Agent': UA }, signal: ctrl.signal })
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
      const r = await fetch('https://google.serper.dev/jobs', {
        method:  'POST',
        headers: { 'X-API-KEY': env.SERPER_API_KEY, 'Content-Type': 'application/json', 'User-Agent': UA },
        body:    JSON.stringify({ q: query, ...geoParams, num: 20 }),
        signal:  ctrl.signal,
      })
      raw = await r.json()
      const serperJobs = normalizeJobs(source, raw)
      console.log(`[SERPER] status=${r.status} results=${serperJobs.length} latency=${Date.now()-serperT0}ms`)
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
 * Map the auto-detected candidateLocation string to Serper geo params.
 * Keeps Serper relevance high without increasing call frequency.
 * Falls back to Argentina (primary market) when location is unknown.
 */
function serperGeoConfig(candidateLocation) {
  if (!candidateLocation) return { gl: 'ar', location: 'Argentina', hl: 'es' }
  const loc = candidateLocation.toLowerCase()
  if (/argentina|caba|buenos aires|córdoba|cordoba|rosario|mendoza|tucumán|tucuman|santa fe|mar del plata/.test(loc)) {
    return { gl: 'ar', location: 'Argentina', hl: 'es' }
  }
  if (/colombia/.test(loc))           return { gl: 'co', location: 'Colombia', hl: 'es' }
  if (/chile/.test(loc))              return { gl: 'cl', location: 'Chile', hl: 'es' }
  if (/m[eé]xico|mexico/.test(loc))  return { gl: 'mx', location: 'México', hl: 'es' }
  if (/per[uú]/.test(loc))           return { gl: 'pe', location: 'Perú', hl: 'es' }
  if (/uruguay/.test(loc))           return { gl: 'uy', location: 'Uruguay', hl: 'es' }
  if (/venezuela/.test(loc))         return { gl: 've', location: 'Venezuela', hl: 'es' }
  if (/ecuador/.test(loc))           return { gl: 'ec', location: 'Ecuador', hl: 'es' }
  if (/bolivia/.test(loc))           return { gl: 'bo', location: 'Bolivia', hl: 'es' }
  if (/paraguay/.test(loc))          return { gl: 'py', location: 'Paraguay', hl: 'es' }
  if (/brasil|brazil/.test(loc))     return { gl: 'br', location: 'Brasil', hl: 'pt' }
  return { gl: 'ar', location: 'Argentina', hl: 'es' }  // default
}

/**
 * Fetch from all aggregators + ATS company boards in parallel.
 * Deduplicates with 3-level strategy; ATS version wins over aggregator on URL match.
 * @param {string} userProfile - Used to select relevant ATS companies (no AI cost)
 * @param {string|null} candidateLocation - Auto-detected from profile text; drives Serper geo
 */
async function fetchAllSources(queries, location, remoteOk, env, userProfile = '', candidateLocation = null) {
  const remoteSources = ['remoteok', 'remotive', 'jobicy', 'adzuna', 'getonboard', 'himalayas']
  const localSources  = ['adzuna', 'jobicy', 'getonboard', 'himalayas']
  if (env.JOOBLE_KEY)     { remoteSources.push('jooble');  localSources.push('jooble')  }
  if (env.SERPER_API_KEY) { remoteSources.push('serper');  localSources.push('serper')  }
  const sources = remoteOk ? remoteSources : localSources

  console.log(`[RADAR:sources] remoteOk=${!!remoteOk} active=[${sources.join(',')}] queries=${JSON.stringify(queries)}`)

  // Run aggregators + ATS boards in parallel
  const [aggregatorResults, atsJobs] = await Promise.all([
    Promise.all(sources.flatMap(source => queries.map(q => fetchJobSource(source, q, location, remoteOk, env, candidateLocation)))),
    fetchAtsCompanies(queries, userProfile, env),
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

  // Merge and 3-level dedup (ATS takes priority over aggregator on URL collision)
  const allJobs = deduplicateJobs([...rawAggregatorJobs, ...atsJobs])

  console.log(`[RADAR:sources] aggregator=${rawAggregatorJobs.length} ats=${atsJobs.length} deduped=${allJobs.length} perSource=${JSON.stringify(sourceCounts)}`)
  if (sources.includes('serper') && !sourceCounts['serper']) {
    console.log('[SERPER] returned 0 jobs — check quota, API key validity, or search terms')
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

async function putJrecToKV(env, userId, queryHash, payload) {
  if (!env.RATE_LIMIT_KV || !userId) return
  try {
    await env.RATE_LIMIT_KV.put(
      `jrec:${userId}:${queryHash}:${JREC_PROMPT_VERSION}`,
      JSON.stringify(payload),
      { expirationTtl: JREC_KV_TTL_SECS }
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
      + `&expires_at=gte.${new Date().toISOString()}&select=results,top_score,match_count,created_at&limit=1`,
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
  const ttlMs   = isPremium ? 3_600_000 : 7 * 86_400_000  // testing phase: 1h premium / 7d free
  const expires = new Date(Date.now() + ttlMs).toISOString()
  const row = {
    user_id:      userId,
    profile_hash: profileHash,
    query_hash:   queryHash,
    results:      recommendations,
    top_score:    Math.max(...recommendations.map(r => r.match_score || 0)),
    match_count:  recommendations.length,
    search_type:  'fresh',
    expires_at:   expires,
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
  else upsert
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
async function expandSearchTerms(env, profileText, existingQueries) {
  const geminiKeys = (env.GEMINI_API_KEYS || env.GEMINI_API_KEY || '')
    .split(',').map(k => k.trim()).filter(Boolean)
  if (!geminiKeys.length) return []

  const prompt =
    `Profile: "${(profileText || '').slice(0, 600)}"\nExisting searches (DO NOT repeat these or close variations): ${JSON.stringify(existingQueries)}\n\nThe candidate belongs to one of these 8 families:\nHR/Personas | Finanzas | Tecnología | Marketing/Growth | Operaciones | Ventas/BD | Legal/Compliance | Management General\n\nStep 1: Identify which family best matches this profile.\nStep 2: Generate 3 DIFFERENT alternative job titles WITHIN that same family that:\n- Are NOT semantic duplicates of the existing searches listed above\n- If existing searches are in Spanish → provide English equivalents, and vice versa\n- Explore lateral titles: if existing = "HR Manager" → try "People Operations Lead", "Talent Partner", "HRBP"\n- Cover adjacent sub-specialties within the family (e.g., compensation, L&D, recruiting for HR)\n- Are searchable on LinkedIn/Bumeran Argentina\n\nRespond ONLY with JSON: {"family":"HR/Personas","terms":["HRBP","People Operations Lead","Talent Partner"]}`

  try {
    const controller = new AbortController()
    const tid = setTimeout(() => controller.abort(), 3_500)  // was 2500 — tight for Flash Lite cold start
    // Rotate through keys on 429 (same as callGeminiApi) so a rate-limited first key
    // doesn't silently kill the expansion pass.
    let res = null
    for (let ki = 0; ki < geminiKeys.length; ki++) {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_MODEL}:generateContent?key=${geminiKeys[ki]}`,
        {
          method:  'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            contents:          [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig:  { temperature: 0.4, maxOutputTokens: 200 },  // was 120 — need room for 3 terms
          }),
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
    const d   = await res.json()
    const raw = d?.candidates?.[0]?.content?.parts?.[0]?.text || ''
    const parsed = JSON.parse(raw.replace(/^```json\n?|\n?```$/g, '').trim())
    const arr = parsed?.terms || (Array.isArray(parsed) ? parsed : [])
    return Array.isArray(arr) ? arr.slice(0, 3).filter(s => typeof s === 'string' && s.trim()) : []
  } catch (err) {
    console.warn(`[RADAR:expansion] expandSearchTerms failed: ${err.message}`)
    return []
  }
}

// Full expansion pass: generate new terms → fetch jobs → deduplicate → AI score.
// Returns { recommendations: [...], count: N } or null if nothing new found.
async function expandWithSearch(env, ctx, cleanQueries, location, remoteOk, profileText, existingHashes, requestedN, candidateLocation = null) {
  const newTerms = await expandSearchTerms(env, profileText, cleanQueries)
  if (!newTerms.length) return null

  const { jobs: rawExpanded } = await fetchAllSources(
    newTerms.slice(0, 2), location, remoteOk, env, String(profileText), candidateLocation
  )
  const newJobs = rawExpanded
    .filter(j => !existingHashes.has(canonicalJobHash(j)))
    .slice(0, 15)
  if (!newJobs.length) return null

  const batchJobs  = newJobs.slice(0, 12)
  const contents   = buildMatchingContents(String(profileText).slice(0, 2000), batchJobs, candidateLocation)
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

// ── Sprint 3: canonical hash for cross-source deduplication ──────────────────
// Normalizes company + title + location → stable key regardless of source.
function canonicalJobHash(job) {
  const norm = s => (s || '')
    .toLowerCase()
    .replace(/\b(sr|jr|senior|junior|semi\s*senior|ssr|lead|staff|principal)\b/gi, '')
    .replace(/\b(s\.a\.|s\.r\.l\.|inc\.?|corp\.?|ltd\.?|gmbh)\b/gi, '')
    .replace(/[^a-z0-9]/g, '')
  return `${norm(job.company)}|${norm(job.title)}|${norm(job.location || 'remote')}`
}

async function upsertJobsToSupabase(env, ctx, jobs) {
  if (!jobs.length) return []
  const ATS_SOURCES = new Set(['greenhouse','lever','smartrecruiters','ashby','workable','teamtailor','recruitee','personio','workday'])
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

// ── Sprint 4: profession family inference (no AI call needed) ────────────────
function inferProfessionFamily(title) {
  const t = (title || '').toLowerCase()
  if (/\b(rrhh|hrbp|recursos humanos|talent|people ops|hr |learning|capacitac|relaciones laborales|compensaciones|beneficios|cultura organizacional)\b/.test(t)) return 'HR/Personas'
  if (/\b(financ|finanzas|contabilidad|contador|tesoreria|treasury|fp.a|controller|cfo|presupuesto|auditoria|impuestos|tax)\b/.test(t)) return 'Finanzas'
  if (/\b(developer|engineer|frontend|backend|full.?stack|devops|data |cloud|mobile|software|ios|android|qa |testing|sre|platform|machine learning|data scien|analytics engineer|mlops|infra)\b/.test(t)) return 'Tecnología'
  if (/\b(marketing|brand|growth|seo|sem|performance|social media|content|crm |digital|ecommerce|e-commerce|paid media|influencer|community)\b/.test(t)) return 'Marketing/Growth'
  if (/\b(operat|operaciones|supply chain|logistic|logística|procurement|compras|produccion|manufactura|lean|calidad|quality|warehouse|almacen|distribucion)\b/.test(t)) return 'Operaciones'
  if (/\b(sales|ventas|account executive|business development|comercial|key account|channel|revenue|inside sales|preventa)\b/.test(t)) return 'Ventas/BD'
  if (/\b(legal|counsel|abogado|compliance|regulatory|juridic|contrato|contratos|privacidad|gdpr)\b/.test(t)) return 'Legal/Compliance'
  if (/\b(country manager|general manager|director general|gm |ceo|coo|president|head of|vp |vice president|gerente general|managing director)\b/.test(t)) return 'Management General'
  return null
}

// ── Geo-contextual helpers ────────────────────────────────────────────────────
// Extracts the most specific location mentioned in the profile text.
// Used as geo context when scoring jobs — helps Gemini penalize inviable on-site roles.
function extractCandidateLocation(profileText) {
  const t = (profileText || '').slice(0, 2000).toLowerCase()
  /** @type {[RegExp, string][]} */
  const PATTERNS = [
    [/\b(caba|capital federal|ciudad de buenos aires|ciudad aut[oó]noma)\b/, 'CABA'],
    [/\b(palermo|belgrano|villa crespo|san telmo|recoleta|microcentro|barracas|flores|villa urquiza)\b/, 'CABA'],
    [/\b(quilmes|mor[oó]n|tigre|lom[aá]s de zamora|avellaneda|bernal|vicente l[oó]pez)\b/, 'Gran Buenos Aires'],
    [/\b(gran buenos aires|gba)\b/, 'Gran Buenos Aires'],
    [/\b(buenos aires|provincia de buenos aires)\b/, 'Buenos Aires'],
    [/\b(c[oó]rdoba)\b/, 'Córdoba'],
    [/\b(rosario)\b/, 'Rosario'],
    [/\b(mendoza)\b/, 'Mendoza'],
    [/\b(tucum[aá]n)\b/, 'Tucumán'],
    [/\b(mar del plata)\b/, 'Mar del Plata'],
    [/\b(salta)\b/, 'Salta'],
    [/\b(santa fe)\b/, 'Santa Fe'],
    [/\b(la plata)\b/, 'La Plata'],
    [/\b(bah[ií]a blanca)\b/, 'Bahía Blanca'],
    [/\b(neuqu[eé]n)\b/, 'Neuquén'],
    [/\b(argentina)\b/, 'Argentina'],
    [/\b(colombia)\b/, 'Colombia'],
    [/\b(chile)\b/, 'Chile'],
    [/\b(m[eé]xico)\b/, 'México'],
    [/\b(per[uú])\b/, 'Perú'],
    [/\b(brasil|brazil)\b/, 'Brasil'],
    [/\b(uruguay)\b/, 'Uruguay'],
    [/\b(paraguay)\b/, 'Paraguay'],
    [/\b(bolivia)\b/, 'Bolivia'],
    [/\b(ecuador)\b/, 'Ecuador'],
  ]
  for (const [re, canonical] of PATTERNS) {
    if (re.test(t)) return canonical
  }
  return null
}

// Returns a 0.0–1.0 geo compatibility score for a job vs. the candidate's detected location.
// Only meaningful for on-site / hybrid jobs — remote jobs always score 1.0.
function geoCompatibilityScore(jobLocation, jobRemote, candidateLocation) {
  if (jobRemote)          return 1.0   // remote = geo-neutral
  if (!candidateLocation) return 0.55  // unknown → benefit of doubt

  const jl = (jobLocation || '').toLowerCase()
  const cl = candidateLocation.toLowerCase()

  // Exact/substring match
  if (jl.includes(cl) || cl.includes(jl.split(',')[0].trim())) return 1.0

  // Buenos Aires metro = CABA + Gran Buenos Aires (same commuting zone)
  const BSAS = ['caba','capital federal','buenos aires','gran buenos aires','palermo','belgrano','quilmes','morón','tigre']
  const jlBA = BSAS.some(c => jl.includes(c))
  const clBA = BSAS.some(c => cl.includes(c))
  if (jlBA && clBA) return 0.95

  // Both in Argentina (different cities)
  const AR = ['córdoba','rosario','mendoza','tucumán','mar del plata','salta','santa fe',
               'la plata','bahía blanca','neuquén','argentina']
  const jlAR = jlBA || AR.some(c => jl.includes(c))
  const clAR = clBA || AR.some(c => cl.includes(c))
  if (jlAR && clAR) return 0.60   // different Argentine cities (hybrid is a stretch)

  // Both LATAM, different countries
  const LATAM = ['colombia','chile','méxico','perú','brasil','uruguay','paraguay','bolivia','ecuador']
  const jlLATAM = jlAR || LATAM.some(c => jl.includes(c))
  const clLATAM = clAR || LATAM.some(c => cl.includes(c))
  if (jlLATAM && clLATAM) return 0.45

  // Cross-region on-site = rarely viable
  return 0.15
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
  const ATS_SOURCES = new Set(['greenhouse','lever','smartrecruiters','ashby','workable','teamtailor','recruitee','personio','workday'])
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
// SECTION 4 — AI Matching Prompt
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Build the Gemini system prompt for job matching.
 * Stored here in the worker, never sent to the client.
 */
const JOB_MATCHING_SYSTEM_PROMPT = `Sos un sistema experto de matching laboral para profesionales argentinos y latinoamericanos.

CONTEXTO:
Los avisos provienen de ATS (Greenhouse, Lever, SmartRecruiters, Ashby, Workday) y bolsas globales. Las descripciones pueden venir:
- parcialmente en inglés
- con HTML
- incompletas
- infladas con keywords irrelevantes
- mezclando requisitos obligatorios y deseables

Interpretá los avisos con criterio HUMANO de recruiter senior.
NO hagas matching solo por coincidencia de skills.

━━━━━━━━━━━━━━━━━━━━━━━
OBJETIVO PRINCIPAL
━━━━━━━━━━━━━━━━━━━━━━━

Producir scores DISCRIMINATIVOS. La distribución esperada debe ser amplia: pocos jobs en rango 8-10, varios en 6-8, muchos descartados por debajo de 5.0. Si todos los scores quedan entre 6 y 8.5, el matching no es útil — revisá los caps.

Priorizar la COHERENCIA PROFESIONAL REAL. La mayoría de las personas quieren seguir trabajando en su profesión, especialidad y área de incumbencia.

El matching debe priorizar:
✅ función principal y familia profesional
✅ trayectoria y continuidad de carrera
✅ seniority real (penalizar desfasajes grandes)
✅ tipo de rol e identidad laboral

ANTES que coincidencias aisladas de skills.

━━━━━━━━━━━━━━━━━━━━━━━
EJEMPLO CRÍTICO
━━━━━━━━━━━━━━━━━━━━━━━

Candidato: Gerente de RRHH con skills de liderazgo, analytics, transformación digital, gestión de proyectos.

❌ NO recomendar: Product Manager, Operations Manager, Data Analyst, Scrum Master
→ Aunque comparte skills transferibles, SON FAMILIAS DISTINTAS. Score máximo: 3.5. EXCLUIR del output.

✅ SÍ recomendar: HR Business Partner, Talent Manager, People Operations Lead, Compensaciones, DO
→ Misma familia. Score puede llegar a 9-10 si el seniority y condiciones alinean.

━━━━━━━━━━━━━━━━━━━━━━━
RECIBÍS
━━━━━━━━━━━━━━━━━━━━━━━

1. Perfil candidato: experiencia, habilidades, seniority, trayectoria, objetivo profesional, rubros, idiomas.
2. Lista numerada de avisos laborales.

━━━━━━━━━━━━━━━━━━━━━━━
TU TAREA
━━━━━━━━━━━━━━━━━━━━━━━

PASO 1 — CLASIFICAR AL CANDIDATO:
Identificá la familia profesional basándote en el rol más reciente y la trayectoria completa.

FAMILIAS PROFESIONALES (8):
HR/Personas: RRHH, HRBP, Talent Manager, People Lead, Compensaciones, DO, Recruiting, HR Operations
Finanzas: Finance Manager, FP&A, Controller, Tesorería, Contabilidad, CFO, Cost Analyst
Tecnología: Backend, Frontend, Full Stack, DevOps, QA, Data Engineer, Tech Lead, CTO, Platform
Marketing/Growth: Brand Manager, Performance, Growth, Community, Content, Marketing Manager
Operaciones: Operations Manager, Supply Chain, Logística, Procurement, Facilities, Process
Ventas/BD: Sales Manager, Account Executive, BD Manager, Key Account, Sales Engineer
Legal/Compliance: Counsel, Compliance Officer, Legal Manager, Paralegal
Management General: Country Manager, GM, BU Head, CEO, Dirección General, Regional Director

━━━━━━━━━━━━━━━━━━━━━━━
PASO 2 — CALCULAR match_score (0-10):
━━━━━━━━━━━━━━━━━━━━━━━

COMPONENTE 1 — FAMILIA PROFESIONAL / FUNCIÓN (peso 40%, máx 4.0 puntos)

Misma familia exacta: 4.0 puntos
Familia adyacente con transferencia real documentada: 2.0–2.5 puntos
  Adyacentes válidos: HR↔Management General | Finanzas↔Operaciones | Ventas↔Marketing | Legal↔Finanzas
Familia diferente: 0.5–1.0 puntos
Familia completamente incompatible: 0.0–0.3 puntos
  Incompatibles ejemplos: HR↔Tecnología | Finanzas↔Diseño | RRHH↔Product Manager | Marketing↔Backend

Ejemplos de misma familia:
✅ HR/Personas → HRBP / Talent / People / HR Manager / Compensaciones / DO
✅ Finanzas → FP&A / Controller / Finance Manager / Tesorería / Contabilidad
✅ Marketing → Brand / Growth / Performance / Community / Content
✅ Legal → Compliance / Corporate Legal / Regulatory / Paralegal
✅ Tecnología → Backend / Full Stack / DevOps / Data Eng / QA / Mobile

━━━━━━━━━━━━━━━━━━━━━━━

COMPONENTE 2 — SENIORITY Y EXPERIENCIA (peso 20%, máx 2.0 puntos)

Escala de seniority (de menor a mayor):
  Nivel 1: Junior / Trainee / Pasante / Entry Level
  Nivel 2: Semi Senior / SSR / Analista / Mid-Level
  Nivel 3: Senior / Especialista / Analista Sr
  Nivel 4: Lead / Jefe / Coordinador / Team Lead / Supervisor
  Nivel 5: Gerente / Manager / Director de área
  Nivel 6: VP / C-Level / Head of / Country Manager / Director General

Coherencia de seniority — puntaje sobre 2.0:
  Diferencia 0 niveles (match exacto): 2.0
  Diferencia 1 nivel (±1): 1.5 — aceptable (SSR aplica Senior, Gerente aplica Head of pequeño equipo)
  Diferencia 2 niveles (±2): 0.8 — brecha significativa, penalizar
  Diferencia 3+ niveles (±3 o más): 0.2 — muy poco realista

CASOS DUROS:
- Director/Gerente (Nivel 5-6) aplicando a Junior/SSR (Nivel 1-2): puntaje máximo 0.3 en este componente. No tiene sentido operativo.
- Junior/Trainee (Nivel 1) aplicando a Director/Gerente (Nivel 5-6): puntaje máximo 0.3 en este componente.
- Estos casos deben reflejarse en el score final bajo (6.0 o menos aunque la familia coincida).

━━━━━━━━━━━━━━━━━━━━━━━

COMPONENTE 3 — HABILIDADES TÉCNICAS Y FUNCIONALES (peso 12%, máx 1.2 puntos)

Evaluar skills ESPECÍFICAS del dominio profesional.
NO sobreponderar skills genéricas: liderazgo, Excel, comunicación, analytics, gestión de proyectos.
Solo pesan las skills técnicas y funcionales específicas del área (ej: para HR: HRIS, SAP HCM, Workday, gestión de nómina; para Finanzas: IFRS, consolidación, SAP FI, cash flow modeling).
"Nice to have" ausente NO penaliza. Solo penalizar si un requisito MANDATORIO clave está ausente.

━━━━━━━━━━━━━━━━━━━━━━━

COMPONENTE 4 — INDUSTRIA Y CONTEXTO (peso 8%, máx 0.8 puntos)

Transferibilidad razonable entre industrias afines.
HR en Fintech puede transferir a HR en SaaS o Ecommerce sin penalización.
Finanzas en industria puede transferir a Finanzas en servicios con penalización mínima.
Distancia muy grande (ej: Finanzas en sector público → startup tecnológica) penalizar 0.3-0.5.

━━━━━━━━━━━━━━━━━━━━━━━

COMPONENTE 5 — CONDICIONES LABORALES Y GEO (peso 8%, máx 0.8 puntos, puede ser negativo)

Idioma:
- Rol 100% remoto internacional que requiere inglés fluido y el candidato no lo menciona: -0.5

Viabilidad geográfica (usar UBICACIÓN DETECTADA DEL CANDIDATO si está disponible):
- Mismo lugar o remoto 100%: 0 (sin penalización)
- Híbrido ciudad distinta mismo país: -0.3 a -0.5
- Presencial ciudad distinta mismo país: -0.5 a -0.7
- Presencial u híbrido otro país: -0.6 a -0.8 (salvo que el aviso indique relocalización provista)
- Dirección Regional / Country Manager: reducir penalización geo a la mitad

━━━━━━━━━━━━━━━━━━━━━━━
CAPS DUROS POR INCOMPATIBILIDAD DE FAMILIA
━━━━━━━━━━━━━━━━━━━━━━━

Estos caps se aplican INDEPENDIENTEMENTE de los puntajes de componentes individuales:

Misma familia o adyacente directa con evidencia clara:
→ Sin cap (score libre hasta 10.0)

Familia moderadamente diferente (ej: Marketing↔Operaciones, HR↔Finanzas sin evidencia de transferencia):
→ Score MÁXIMO: 5.5

Familia muy diferente (ej: HR→Marketing sin evidencia, Finanzas→Ventas, Operaciones→Marketing):
→ Score MÁXIMO: 4.5 → EXCLUIR del output (está por debajo del umbral mínimo de 5.0)

Familia completamente incompatible (ej: HR→Backend, Finanzas→Diseño, RRHH→Product Manager, no-tech→Tecnología sin evidencia, Tecnología→HR sin evidencia):
→ Score MÁXIMO: 3.5 → EXCLUIR del output obligatoriamente

Excepción: si el perfil muestra evidencia EXPLÍCITA de transición de carrera (bootcamp reciente, portfolio técnico demostrable, múltiples experiencias híbridas documentadas, objetivo profesional explícito de cambio de área), el cap puede subir hasta 1.5 puntos sobre lo indicado.

━━━━━━━━━━━━━━━━━━━━━━━
REGLAS CRÍTICAS
━━━━━━━━━━━━━━━━━━━━━━━

❌ NO hacer keyword matching superficial.
❌ NO recomendar roles fuera de incumbencia principal solo por skills transferibles (liderazgo, Excel, analytics NO son suficientes para cruzar familias).
❌ NO priorizar skills blandas sobre profesión real.
❌ NO asumir que alguien quiere cambiar radicalmente de carrera si el perfil no lo indica.
❌ NO asignar scores entre 6.0 y 8.5 a jobs claramente fuera de la familia — eso es matching no discriminativo.

━━━━━━━━━━━━━━━━━━━━━━━
ESCALA DE SCORING Y DISTRIBUCIÓN ESPERADA
━━━━━━━━━━━━━━━━━━━━━━━

9-10: Excelente fit funcional, seniority y condiciones. Candidato claramente apto. (Esperado: 1-2 jobs de 30)
8-8.9: Muy buen fit con brechas menores tolerables. (Esperado: 2-4 jobs de 30)
7-7.9: Buen fit razonable. Alguna brecha real pero lógica profesional sólida. (Esperado: 3-6 jobs de 30)
6-6.9: Fit parcial. Familia correcta pero brecha notable de seniority o skills. (Esperado: 2-5 jobs de 30)
5-5.9: Solo incluir si hay lógica profesional clara. Familia adyacente con transferencia documentada.
<5: NO incluir. Familia diferente, seniority incompatible o ambos.

━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT
━━━━━━━━━━━━━━━━━━━━━━━

- Solo incluir: match_score >= 5.0
- Máximo: 12 resultados
- Orden: score descendente

strengths: 2-3 fortalezas ESPECÍFICAS para ESE aviso. NO genéricas.

gaps: 1-2 brechas reales y accionables. Framing positivo:
✅ "Sumar experiencia en X fortalecería la candidatura."
❌ "No tiene X."
Si no hay gaps reales: array vacío.

summary: 1 oración en español rioplatense, natural, profesional. Mencioná empresa o rol cuando sea posible.

━━━━━━━━━━━━━━━━━━━━━━━
ANTI-ALUCINACIÓN
━━━━━━━━━━━━━━━━━━━━━━━

❌ Nunca inventes skills, experiencias, idiomas, seniority, objetivos ni certificaciones ausentes del perfil.

━━━━━━━━━━━━━━━━━━━━━━━
RESPUESTA
━━━━━━━━━━━━━━━━━━━━━━━

Respondé SOLO JSON válido. Sin markdown. Sin explicación. Sin texto adicional.

Formato exacto:

{"matches":[{"job_index":0,"match_score":7.5,"strengths":["str","str"],"gaps":["str"],"summary":"str"}]}
`

/**
 * Build the Gemini contents array for job matching.
 * Uses extractRelevantSection() to get the requirements section (not just first 400 chars).
 */
function buildMatchingContents(profileText, jobs, candidateLocation = null) {
  const jobList = jobs.slice(0, MAX_JOBS_FOR_AI_MATCHING).map((j, i) => {
    const desc = j.description
      ? extractRelevantSection(j.description, 350)
      : '(sin descripción)'
    const isAts = ['greenhouse','lever','smartrecruiters','ashby'].includes(j.source)
    return `[${i}] ${j.title} | ${j.company}${isAts ? ' ✓' : ''} | ${j.location || 'No especificado'} | ${j.remote ? 'Remoto 100%' : 'Presencial/Híbrido'}
Skills: ${(j.skills_required || []).join(', ') || 'No especificado'}
Seniority: ${j.seniority}
Descripción: ${desc}`
  }).join('\n\n')

  const geoCtx = candidateLocation
    ? `\nUBICACIÓN DETECTADA DEL CANDIDATO: ${candidateLocation}`
    : ''

  return [{
    role: 'user',
    parts: [{ text: `PERFIL DEL CANDIDATO:\n${profileText}${geoCtx}\n\nAVISOS LABORALES:\n${jobList}` }],
  }]
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

  console.log(`[RADAR] START user=${user_id||'anon'} premium=${isPremium} remoteOk=${!!remote_ok} queries=${JSON.stringify(queries.slice(0,3))} location=${location||'—'}`)

  // ── radar_search_history: daily persistence check ────────────────────────
  // If the user already ran a fresh search today (premium) or this month (free),
  // serve the stored results immediately — no Gemini call, no rate limit decrement.
  const profileHash = user_id ? await computeProfileHash(String(profile_text)) : null
  const cleanQueriesForHash = queries.map(q => String(q).trim().slice(0, 100)).filter(Boolean).slice(0, 3)
  const queryHashEarly = user_id ? await hashQueryParams(cleanQueriesForHash, location, remote_ok) : null

  if (user_id && profileHash && queryHashEarly) {
    const radarCache = await getRadarCache(env, user_id, profileHash, queryHashEarly)
    if (radarCache?.results?.length) {
      console.log(`[RADAR] radarCache HIT — returning ${radarCache.results.length} cached recs`)
      // Recover sourcesUsed from the KV metadata written at fetch time.
      let radarCachedSources = []
      try {
        const metaRaw = env.RATE_LIMIT_KV ? await env.RATE_LIMIT_KV.get(`jobs_meta:${queryHashEarly}`) : null
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

  // ── Fetch jobs (hits cache layers before live APIs) ────────────────────────
  const cleanQueries = queries.map(q => String(q).trim().slice(0, 100)).filter(Boolean).slice(0, 3)
  const queryHash    = await hashQueryParams(cleanQueries, location, remote_ok)
  let   jobs         = []
  let   fromCache    = false

  // KV_SOURCES_KEY stores the sourcesUsed alongside jobs so cache hits can report it accurately.
  // Format stored in KV: { jobs: NormalizedJob[], sourcesUsed: string[] }
  const KV_SOURCES_KEY = `jobs_meta:${queryHash}`

  let sourcesUsed  = []
  let sourceCounts = {}  // per-source job counts from live fetch (empty on cache hit)
  const kvCached = await getJobsFromKV(env, queryHash)
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
    const fetchResult = await fetchAllSources(cleanQueries, location, remote_ok, env, String(profile_text), candidateLocation)
    sourcesUsed  = fetchResult.sourcesUsed || []
    sourceCounts = fetchResult.sourceCounts || {}
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

  // ── Pre-filter: rule-based (zero tokens) → top 25 candidates ─────────────
  const preFiltered = applyPreFilter(jobs, String(profile_text), MAX_JOBS_FOR_AI_MATCHING)
  const jobPool     = preFiltered.length > 0 ? preFiltered : jobs.slice(0, MAX_JOBS_FOR_AI_MATCHING)
  console.log(`[RADAR] preFilter ${jobs.length} → ${jobPool.length} jobs to Gemini`)

  // ── jrec: per-user AI score cache (skip Gemini on re-run within 2 h) ──────
  if (user_id) {
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
  const startMs    = Date.now()
  const contents   = buildMatchingContents(String(profile_text).slice(0, 3000), jobPool, candidateLocation)
  const geminiBody = {
    system_instruction: { parts: [{ text: JOB_MATCHING_SYSTEM_PROMPT }] },
    contents,
    // 4096 tokens: 25 jobs × ~150 chars/match output = ~6KB, leaves headroom for variance
    generationConfig:   { temperature: 0.2, maxOutputTokens: 4096 },
  }

  let aiResult = null
  let aiError  = null

  // Two attempts with decreasing timeouts — Flash Lite typically responds in 3-6s.
  // Second attempt reuses the same body; if the first timed out the second often succeeds.
  const GEMINI_ATTEMPTS = [{ ms: 12_000 }, { ms: 8_000 }]
  for (let attempt = 0; attempt < GEMINI_ATTEMPTS.length; attempt++) {
    if (aiResult?.matches?.length) break
    const t0 = Date.now()
    try {
      const aiRes = await Promise.race([
        callGeminiApi(env, ctx, geminiBody, corsHeaders, { feature: 'job_matching_batch', userId: user_id || null }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('gemini_match_timeout')), GEMINI_ATTEMPTS[attempt].ms)),
      ])
      if (aiRes.status === 200) {
        const aiData = await aiRes.clone().json()
        const raw    = aiData?.candidates?.[0]?.content?.parts?.[0]?.text || ''
        const clean  = raw.replace(/^```json\n?|\n?```$/g, '').trim()
        try {
          aiResult = JSON.parse(clean)
          aiError  = null
          console.log(`[RADAR] Gemini attempt ${attempt+1}/${GEMINI_ATTEMPTS.length} — latency=${Date.now()-t0}ms result=ok matches=${aiResult?.matches?.length||0}`)
        } catch {
          // Partial parse recovery: strip the truncated last object by cutting at the last complete },
          const lastComma = clean.lastIndexOf('},')
          if (lastComma > 10) {
            try {
              const partial = JSON.parse(clean.slice(0, lastComma + 1) + ']}')
              if (partial?.matches?.length) {
                aiResult = partial
                aiError  = null
                console.log(`[RADAR] Gemini attempt ${attempt+1}/${GEMINI_ATTEMPTS.length} — latency=${Date.now()-t0}ms result=partial_recovery matches=${aiResult.matches.length}`)
                break
              }
            } catch { /* ignore */ }
          }
          aiError = 'ai_parse_error'
          console.warn(`[RADAR] Gemini attempt ${attempt+1}/${GEMINI_ATTEMPTS.length} — latency=${Date.now()-t0}ms result=parse_error preview="${raw.slice(0, 200)}"`)
        }
      } else {
        aiError = `ai_http_${aiRes.status}`
        console.warn(`[RADAR] Gemini attempt ${attempt+1}/${GEMINI_ATTEMPTS.length} — latency=${Date.now()-t0}ms result=http_${aiRes.status}`)
      }
    } catch (e) {
      aiError = e.message
      console.warn(`[RADAR] Gemini attempt ${attempt+1}/${GEMINI_ATTEMPTS.length} — latency=${Date.now()-t0}ms result=${e.message}`)
    }
  }

  // ── Fallback: AI failed — heuristic scoring so cards always show a score ──
  if (!aiResult?.matches?.length || aiError) {
    // Tier 1: try cached recommendations from a previous session
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
          console.log(`[RADAR] Gemini fallback tier1 — serving ${prevRecs.length} cached recs from job_recommendations`)
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
      } catch (err) {
        console.warn(`[RADAR] fallback prev-recs fetch failed: ${err.message}`)
      }
    }

    // Tier 2: heuristic keyword scoring — always yields a visible score on cards
    const profileWords = new Set(
      String(profile_text).toLowerCase().split(/\W+/).filter(w => w.length > 3)
    )
    const fallbackRecs = jobPool.slice(0, requestedN).map(j => {
      const jobWords = `${j.title} ${(j.skills_required || []).join(' ')}`.toLowerCase().split(/\W+/)
      const overlap  = jobWords.filter(w => w.length > 3 && profileWords.has(w)).length
      const daysOld  = j.posted_at ? (Date.now() - new Date(j.posted_at).getTime()) / 86_400_000 : 30
      const score    = Math.round(Math.min(7.5, 5.5 + Math.min(overlap, 10) * 0.15 + (daysOld < 7 ? 0.3 : 0)) * 10) / 10
      const co       = j.company || 'esta empresa'
      return {
        job:         j,
        match_score: score,
        strengths:   [],
        gaps:        [],
        summary:     `Priorizando oportunidades relevantes para tu perfil en ${co}.`,
        rec_id:      null,
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

  const topMatches = (aiResult.matches || [])
    .map(m => {
      const job = jobPool[m.job_index]
      if (!job) return null
      const geoScore = geoCompatibilityScore(job.location, job.remote, candidateLocation)
      const adjustedScore = geoAdjust(job, m.match_score || 0)
      return { ...m, _adjusted_score: adjustedScore, _geo_score: geoScore }
    })
    .filter(Boolean)
    .sort((a, b) => b._adjusted_score - a._adjusted_score)
    .slice(0, requestedN)

  let recommendations = topMatches.map(m => {
    const job = jobPool[m.job_index]
    if (!job) return null
    return {
      job,
      match_score: Number((m.match_score || 0).toFixed(2)),
      strengths:   Array.isArray(m.strengths) ? m.strengths.slice(0, 3) : [],
      gaps:        Array.isArray(m.gaps)       ? m.gaps.slice(0, 2)     : [],
      summary:     String(m.summary || ''),
      rec_id:      null,  // populated after Supabase insert below
      geo_score:   m._geo_score,
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

  // Premium always expands; free expands only when threshold not met (shows upsell)
  const needsExpansion = isPremium || shouldTriggerExpansion(recommendations)
  console.log(`[RADAR] expansion needsExpansion=${needsExpansion} isPremium=${isPremium} topScore=${recommendations[0]?.match_score?.toFixed(1)||0}`)
  if (needsExpansion) {
    if (isPremium) {
      try {
        const expStartMs      = Date.now()
        const _expTimedOut    = {}  // sentinel to distinguish timeout from null result
        console.log(`[RADAR] expansion START — generating alternative terms... serperConfigured=${!!env.SERPER_API_KEY}`)
        const existingHashes = new Set(jobPool.map(j => canonicalJobHash(j)))
        const expandResult   = await Promise.race([
          expandWithSearch(env, ctx, cleanQueries, location, remote_ok, String(profile_text), existingHashes, requestedN, candidateLocation),
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
    } else {
      expansionAvailable = true   // tells frontend to show upsell
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

  // Cache AI scores in KV (24h) and radar_search_history (Supabase, cross-device)
  if (user_id && ctx?.waitUntil) {
    ctx.waitUntil(putJrecToKV(env, user_id, queryHash, {
      recommendations,
      total_jobs_analyzed: jobPool.length,
    }))
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
      expansion_searched:  needsExpansion && isPremium,  // true = deep search ran for this user
      candidate_location:  candidateLocation || null,
      pipeline_stats: {
        premium_mode:        isPremium,
        sources_used:        sourcesUsed,
        sources_count:       sourcesUsed.length,    // frontend reads this for "N fuentes"
        total_evaluated:     jobPool.length,         // frontend reads this for "N avisos evaluados"
        source_counts:       sourceCounts,          // per-source job counts (empty on cache hit)
        serper_configured:   !!env.SERPER_API_KEY,  // env var present
        serper_in_sources:   sourcesUsed.includes('serper'),  // actually attempted this run
        serper_returned:     sourceCounts['serper'] || 0,     // jobs returned by Serper
        jobs_fetched:        jobs.length,
        jobs_to_gemini:      jobPool.length,
        from_jobs_cache:     fromCache,
        expansion_triggered: needsExpansion,
        expansion_used:      expansionUsed,
        expansion_count:     expansionCount,
        candidate_location:  candidateLocation || null,
        total_ms:            Date.now() - startMs,
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

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
const BACK_URL = 'https://ramirosilvera.github.io/optimizalinkedin/?premium=ok'

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

  interview_feedback: `Sos headhunter y entrevistadora senior de RRHH con 20 años en selección ejecutiva.
Evaluá las respuestas de la entrevista usando estos criterios: claridad del mensaje, método STAR en logros, autoconciencia, propuesta de valor, autenticidad y solidez de los argumentos.
Español rioplatense. Directa, específica, sin genéricos. Respondé SOLO en JSON válido, sin markdown.`,

  star_feedback: `Sos coach de entrevistas especializado en metodología STAR. Evaluá si la respuesta aplica correctamente Situación, Tarea, Acción, Resultado. Directo, específico, constructivo. Español rioplatense. JSON válido, sin markdown.`,

  job_adapter: `Sos experto en empleabilidad y CVs para el mercado argentino y latinoamericano.
Analizá el aviso, adaptá el CV del candidato y generá una carta de presentación personalizada.

ANTI-ALUCINACIÓN: NUNCA inventes métricas, logros ni tecnologías. Solo reorganizá y reformulá lo que ya existe.
"cv_adaptado" debe tener exactamente la misma estructura JSON que el CV original.

ADAPTACIÓN: ajustá titular y resumen con keywords del aviso. Reorganizá bullets y habilidades priorizando lo relevante para la posición.

CARTA (3-4 párrafos): quién es y por qué aplica → logros relevantes con datos reales → cierre con CTA. Profesional, directo, sin clichés. Español rioplatense.

JSON: {"cv_adaptado":{...mismo esquema...},"carta_de_presentacion":"str","palabras_clave_incorporadas":["str"],"ajustes_principales":["str"]}`,

  cv_optimize_consult: `Sos consultor senior de empleabilidad. Analizás CVs ya generados para detectar qué datos adicionales necesitás del candidato para optimizarlos con impacto real.

Hacé 2-4 preguntas específicas donde la respuesta cambie CONCRETAMENTE un bullet o el titular:
1. Logros vagos sin métricas donde una cifra real cambia todo
2. Herramientas mencionadas de pasada que con contexto de escala destacarían más
3. Liderazgo sin contexto de equipo (personas, presupuesto)
4. Titular que no refleja la especialidad o propuesta de valor
5. Proyectos liderados sin impacto concreto

Reglas: no preguntes lo que ya es claro. Si el CV ya tiene métricas y bullets fuertes, devolvé vacío. Máx 4. Segunda persona informal. Cada pregunta menciona el cargo/logro específico.

JSON: {"preguntas":[{"id":"str","contexto":"str (máx 45c)","pregunta":"str","placeholder":"str (máx 60c)"}]}`,

  optimize_cv: `Sos consultor senior de empleabilidad con 20 años optimizando CVs para el mercado latinoamericano.
MEJORÁ el CV provisto — no lo reescribas desde cero.

REGLAS:
- NUNCA inventes métricas, fechas, cargos, empresas ni logros que no estén en el CV original.
- Si un bullet dice "aumenté ventas" sin número → reformulá el verbo, NO agregues ningún número inventado.
- Respetá TODAS las fechas, cargos, empresas y títulos exactamente como están.
- Sin datos suficientes para mejorar algo → dejalo igual.

PODÉS:
- Reemplazar verbos débiles por verbos de acción fuertes ("trabajé en" → "lideré", "hice" → "implementé")
- Eliminar frases prohibidas: "orientado a resultados", "proactivo", "dinámico", "apasionado"
- Reformular bullets: verbo fuerte + impacto con datos que ya existen
- Reorganizar bullets por impacto dentro de cada experiencia
- Fortalecer titular y resumen con cargo y especialidad reales
- Reordenar habilidades por relevancia

Devolvé el CV completo en exactamente el mismo JSON que recibiste. Respondé SOLO en JSON válido, sin markdown.`,

  linkedin_growth: `Sos experto en personal branding y crecimiento en LinkedIn para el mercado hispanoparlante.
Generá basándote en el perfil y análisis del usuario:

PARTE 1 — 3 ideas de banner de LinkedIn:
Cada idea debe ser concreta y específica (colores hex, texto exacto, disposición visual). Adaptá al objetivo profesional del usuario (empleado, freelancer, emprendedor).

PARTE 2 — Plan de networking (90 días):
Acciones concretas, no genéricas ("comentá 3 posts de líderes de RRHH en tu sector", no "sé activo"). Si el usuario indicó seguidores, usá ese número como punto de partida.

JSON:
{"banner_ideas":[{"titulo":"str","concepto":"str","copy_principal":"máx 8 palabras","copy_secundario":"máx 12 palabras","paleta":["#hex1","#hex2","#hex3"],"estilo":"Minimalista|Profesional|Creativo|Tecnológico|Corporativo"}],"plan_networking":{"objetivo_resumido":"str","acciones_semanales":[{"frecuencia":"Diario|3× semana|Semanal|Quincenal","accion":"str","ejemplo":"str"}],"contenido_sugerido":[{"formato":"Post de texto|Carrusel|Artículo|Video corto|Encuesta|Repost comentado","tema":"str","frecuencia":"Semanal|Quincenal|Mensual"}],"metrica_90dias":"str"}}`,
}

// ── Rate limits per action (requests / hour / IP) ────────────────────────────
const RATE_LIMITS = {
  analyze_linkedin:   3,
  generate_cv:        3,
  cv_quality:         6,
  cv_pre_questions:   3,
  interview_feedback: 5,
  star_feedback:      10,
  job_adapter:        3,
  linkedin_growth:    5,
  optimize_cv:        4,
  cv_optimize_consult: 4,
}

async function checkRateLimit(env, ip, actionKey) {
  if (!env.RATE_LIMIT_KV) return { ok: true }
  const limit = RATE_LIMITS[actionKey]
  if (!limit) return { ok: true }
  const key = `rl:${ip}:${actionKey}`
  const current = await env.RATE_LIMIT_KV.get(key)
  const count = parseInt(current || '0', 10)
  if (count >= limit) return { ok: false, count, limit }
  await env.RATE_LIMIT_KV.put(key, String(count + 1), { expirationTtl: 3600 })
  return { ok: true, count: count + 1, limit }
}

// ── Gemini API helper ─────────────────────────────────────────────────────────
async function callGeminiApi(env, geminiBody, corsHeaders, { feature = 'unknown', userId = null } = {}) {
  const startMs = Date.now()
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS)
  const geminiKeys = (env.GEMINI_API_KEYS || env.GEMINI_API_KEY || '').split(',').map(k => k.trim()).filter(Boolean)

  let res = null
  try {
    // Phase 1: rotate through keys on 429
    for (const key of geminiKeys) {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_MODEL}:generateContent?key=${key}`,
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(geminiBody), signal: controller.signal }
      )
      if (res.status !== 429) break
    }

    // Phase 2: retry on 5xx with exponential backoff
    for (let attempt = 0; attempt < GEMINI_MAX_RETRIES && res.status >= 500; attempt++) {
      await new Promise(r => setTimeout(r, (attempt + 1) * 1500))
      const key = geminiKeys[attempt % geminiKeys.length]
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_MODEL}:generateContent?key=${key}`,
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(geminiBody), signal: controller.signal }
      )
    }
  } catch (err) {
    clearTimeout(timeoutId)
    const isTimeout = err.name === 'AbortError'
    logAiUsage(env, { feature, userId, durationMs: Date.now() - startMs, statusCode: 504, errorType: isTimeout ? 'timeout' : 'network' })
    const msg = isTimeout ? 'El servicio de IA tardó demasiado. Intentá de nuevo.' : 'Error de conexión con el servicio de IA.'
    return new Response(JSON.stringify({ error: { message: msg } }), { status: 504, headers: corsHeaders })
  }

  clearTimeout(timeoutId)
  const data = await res.json().catch(() => ({ error: { message: 'Respuesta inválida del servicio de IA.' } }))
  logAiUsage(env, {
    feature,
    userId,
    inputTokens: data.usageMetadata?.promptTokenCount ?? null,
    outputTokens: data.usageMetadata?.candidatesTokenCount ?? null,
    durationMs: Date.now() - startMs,
    statusCode: res.status,
    errorType: res.status !== 200 ? `http_${res.status}` : null,
  })
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
function logAiUsage(env, { feature, userId, inputTokens, outputTokens, durationMs, statusCode, errorType }) {
  if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.SUPABASE_URL) return
  const row = {
    user_id: userId || null,
    feature,
    model: DEFAULT_MODEL,
    input_tokens: inputTokens ?? null,
    output_tokens: outputTokens ?? null,
    duration_ms: durationMs ?? null,
    status_code: statusCode ?? null,
    error_type: errorType || null,
  }
  fetch(`${env.SUPABASE_URL}/rest/v1/ai_usage_logs`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(row),
  }).catch(() => {})
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
async function persistSubscription(env, { userId, subId, status, nextPayment }) {
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

  console.log('[persist] suscripciones:', subRes.status, 'perfiles:', perfilRes?.status ?? 'no-update (cancelled)')
  return { isPremium, premiumHasta }
}

export default {
  async fetch(request, env) {
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
        const res = await supabaseServiceFetch(env, `perfiles?id=eq.${userId}&select=es_premium,premium_hasta,mp_subscription_id`)
        const rows = await res.json()
        const perfil = rows?.[0]
        const ahora = new Date()
        const hastaDate = perfil?.premium_hasta ? new Date(perfil.premium_hasta) : null
        const esPremiumReal = perfil?.es_premium && hastaDate && hastaDate > ahora
        return new Response(JSON.stringify({
          es_premium: esPremiumReal || false,
          premium_hasta: perfil?.premium_hasta || null,
          mp_subscription_id: perfil?.mp_subscription_id || null,
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

          await persistSubscription(env, { userId, subId: dataId, status, nextPayment })
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
            await persistSubscription(env, { userId, subId, status: 'authorized', nextPayment })
            console.log('[mp-webhook] renewal extended for userId:', userId, 'until:', nextPayment)
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
          body: JSON.stringify({ id: userId, es_premium: true, premium_hasta: premiumHasta, updated_at: new Date().toISOString() }),
          headers: { Prefer: 'resolution=merge-duplicates' },
        })
        await supabaseServiceFetch(env, `promo_codes?id=eq.${promo.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ uses_count: promo.uses_count + 1 }),
          headers: { Prefer: 'return=minimal' },
        })
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
            getSupabaseCount(env, 'analisis'),
            getSupabaseCount(env, 'cv_generados'),
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
        let qs = `perfiles?select=id,nombre,email,es_premium,premium_hasta,created_at&order=created_at.desc&offset=${offset}&limit=${limit}`
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
          const [perfilRes, subRes, histRes, linkedinRes] = await Promise.all([
            supabaseServiceFetch(env, `perfiles?id=eq.${user_id}&select=*`),
            supabaseServiceFetch(env, `suscripciones?user_id=eq.${user_id}&select=*&order=updated_at.desc&limit=5`),
            supabaseServiceFetch(env, `historial?user_id=eq.${user_id}&select=id,tipo,titulo,created_at&order=created_at.desc&limit=10`),
            supabaseServiceFetch(env, `linkedin_profiles?user_id=eq.${user_id}&select=nombre,headline,email,fuente,synced_at&order=synced_at.desc&limit=1`),
          ])
          const [p, s, h, l] = await Promise.all([perfilRes.json(), subRes.json(), histRes.json(), linkedinRes.json()])
          return new Response(JSON.stringify({
            ok: true,
            perfil: p?.[0],
            suscripciones: s,
            historial: h,
            linkedin: l?.[0],
            analisis_count: Array.isArray(h) ? h.filter(x => x.tipo === 'analisis').length : 0,
            cv_count: Array.isArray(h) ? h.filter(x => x.tipo === 'cv').length : 0,
            entrevista_count: Array.isArray(h) ? h.filter(x => x.tipo === 'entrevista').length : 0,
          }), { status: 200, headers: corsHeaders })
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
          body: JSON.stringify({ id: user_id, es_premium: true, premium_hasta: premiumHasta, updated_at: new Date().toISOString() }),
          headers: { Prefer: 'resolution=merge-duplicates' },
        })
        await logAdminAction(env, admin.userId, 'grant_premium', 'user', user_id, { days, premium_hasta: premiumHasta })
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
          return new Response(JSON.stringify({ ok: true, ...data }), { status: 200, headers: corsHeaders })
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
        body: JSON.stringify({ id: userId, es_premium: true, premium_hasta: premiumHasta, updated_at: new Date().toISOString() }),
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
        const res = await supabaseServiceFetch(env, `perfiles?id=eq.${user_id}&select=es_premium,premium_hasta,mp_subscription_id`)
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

    // ── Named AI actions (system prompts stored in Worker, not in client bundle) ─
    if (typeof body.action === 'string' && body.action.startsWith('ai_')) {
      if (env.APP_TOKEN) {
        const appToken = request.headers.get('X-App-Token')
        if (appToken !== env.APP_TOKEN) {
          return new Response(JSON.stringify({ error: { message: 'Unauthorized' } }), { status: 401, headers: corsHeaders })
        }
      }
      const promptKey = body.action.slice(3) // 'ai_analyze_linkedin' → 'analyze_linkedin'
      const systemPrompt = AI_SYSTEM_PROMPTS[promptKey]
      if (!systemPrompt) {
        return new Response(JSON.stringify({ error: 'Unknown AI action: ' + body.action }), { status: 400, headers: corsHeaders })
      }
      if (!body.contents) {
        return new Response(JSON.stringify({ error: 'Missing contents' }), { status: 400, headers: corsHeaders })
      }
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown'
      const rl = await checkRateLimit(env, ip, promptKey)
      if (!rl.ok) {
        return new Response(JSON.stringify({ error: { message: `Límite de uso alcanzado (${rl.limit} por hora). Volvé a intentarlo en 60 minutos.` } }), { status: 429, headers: corsHeaders })
      }
      const userId = getUserIdFromToken(request)
      return callGeminiApi(env, {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: body.contents,
        generationConfig: body.generationConfig,
      }, corsHeaders, { feature: promptKey, userId })
    }

    // ── Gemini raw proxy (PDF extraction only) ────────────────────────────────
    if (!body.contents) return new Response(JSON.stringify({ error: { message: 'Falta el campo requerido: contents' } }), { status: 400, headers: corsHeaders })

    if (env.APP_TOKEN) {
      const appToken = request.headers.get('X-App-Token')
      if (appToken !== env.APP_TOKEN) {
        return new Response(JSON.stringify({ error: { message: 'Unauthorized' } }), { status: 401, headers: corsHeaders })
      }
    }

    const { model: modelField, ...geminiBody } = body
    return callGeminiApi(env, geminiBody, corsHeaders)
  },
}

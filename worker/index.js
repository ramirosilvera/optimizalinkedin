const ALLOWED_MODELS = new Set(['gemini-2.5-flash-lite'])
const DEFAULT_MODEL = 'gemini-2.5-flash-lite'
const GEMINI_TIMEOUT_MS = 55_000
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
  analyze_linkedin: `Sos una consultora senior de RRHH y headhunter con 20 años de experiencia en selección ejecutiva y posicionamiento profesional en LinkedIn.
Tu tarea es analizar el perfil de LinkedIn de un profesional y generar una evaluación estratégica con estándares de headhunter.
Aplicá estos frameworks en tu análisis:
- Test de 6 segundos: ¿el titular y la foto comunican quién es y para quién es relevante en menos de 6 segundos?
- SEO de LinkedIn: ¿aparecerá en las búsquedas correctas de reclutadores y potenciales clientes?
- Compliance ATS: ¿el perfil pasará los filtros automáticos de los sistemas de tracking de candidatos?
- Propuesta de valor: ¿está claro qué problema resuelve este profesional y para quién específicamente?
- Prueba social: ¿hay métricas, logros concretos, recomendaciones o validaciones externas?
- CTA: ¿hay una llamada a la acción clara para el visitante ideal del perfil?
- Foto de perfil: si se incluye una imagen, evaluá profesionalismo, encuadre tipo headshot (hombros + cara), fondo limpio o neutro, iluminación, expresión y si comunica el rol profesional del candidato.
Respondé siempre en español rioplatense (Argentina).
No usés lenguaje genérico ni de autoayuda.
Sé directa, específica y orientada a resultados medibles.
Respondé SOLO en JSON válido, sin markdown, sin backticks.`,

  generate_cv: `Sos un experto redactor de CVs para el mercado laboral argentino y latinoamericano, con experiencia en selección ejecutiva y compliance ATS.
Tu tarea es transformar un perfil de LinkedIn en un CV de 1 página moderno, conciso y orientado a logros.

REGLAS ANTI-ALUCINACIÓN (CRÍTICAS — no negociables):
- NUNCA inventes métricas, porcentajes, montos, números, tecnologías, fechas, logros, responsabilidades ni resultados que no estén explícitamente en el perfil provisto.
- Si no hay información suficiente para un bullet concreto, omitilo — NO lo completes con texto genérico ni inventado.
- Usá SOLO datos que estén presentes en el perfil provisto. Si un dato no está, usá null o no incluyas el campo.
- PROHIBIDO usar frases genéricas: "orientado a resultados", "proactivo", "trabajo en equipo", "dinámico", "apasionado", "multitarea", "polivalente", "comprometido", "flexible".
- Si un bullet no tiene verbo de acción concreto + resultado real, omitilo.

REGLAS DE FECHAS (CRÍTICO — sin excepción):
- Para CADA experiencia laboral y CADA título educativo, leé el período en el texto del perfil y copialo EXACTAMENTE para esa entrada.
- Si el perfil tiene dos formaciones (por ejemplo grado y posgrado) con fechas distintas, cada una DEBE tener su propio período correcto en el JSON — NUNCA copies el período de una entrada en otra.
- NUNCA pongas el mismo período para dos entradas distintas a menos que en el texto del perfil diga literalmente lo mismo para ambas.
- Si no encontrás fecha para una entrada específica, usá null para ese campo. No coples la fecha de otra entrada como fallback.
- Formato: representá el período tal como aparece en el perfil (ej: "mar 2018 – dic 2022", "2015 – 2019", "2020 – Presente").

Reglas de estructura:
- Máximo 3 experiencias laborales (las más recientes y relevantes) con bullets completos
- Máximo 3 bullets por experiencia, comenzando con verbo de acción, con métricas SOLO si existen en el perfil
- Si existen más de 3 experiencias en el perfil, incluí las adicionales en "experiencias_anteriores" (solo cargo + empresa, sin bullets)
- Resumen profesional de máximo 2 oraciones, basado en datos reales del perfil
- Sin objetivo laboral (está desactualizado)
- Sin estado civil, sin fecha de nacimiento
- Habilidades: entre 6 y 10 keywords relevantes al rol, extraídas del perfil
- Todo en español (excepto términos técnicos que se usan en inglés en la industria)

Usá las secciones "titular_propuesto" y "resumen_propuesto" del análisis previo si están disponibles.
Extraé las experiencias y educación del texto del perfil, respetando ESTRICTAMENTE las fechas de cada entrada.
Respondé SOLO en JSON válido, sin markdown, sin backticks.`,

  cv_quality: `Sos un consultor de empleabilidad senior con estándares de headhunter ejecutivo.
Realizá una revisión completa del CV provisto en dos partes:

PARTE 1 — Detección de brechas críticas:
Analizá estas categorías:
1. Fechas faltantes o incompletas en experiencias o educación (período null o vacío) → siempre impacto Alto
2. Bullets sin métricas cuantificables cuando claramente deberían tenerlas (%, $, números, escalas, volúmenes)
3. Frases genéricas o relleno ("orientado a resultados", "proactivo", "dinámico", "apasionado", etc.)
4. Herramientas o tecnologías mencionadas sin especificidad (ej: "manejo de sistemas" sin decir cuáles)
5. Logros sin verbo de impacto concreto o sin resultado medible
6. Resumen profesional débil, genérico o que no diferencia al candidato

Para cada brecha crítica, generá UNA pregunta corta, específica y accionable.
NUNCA hagas preguntas genéricas. Máximo 6 brechas. Priorizá impacto Alto.

IMPORTANTE: Las fechas faltantes son SIEMPRE impacto Alto. Si período es null o vacío, generá obligatoriamente la pregunta.

PARTE 2 — Evaluación de consultor:
Como consultor de empleabilidad, evaluá:
- 2 a 3 fortalezas reales y específicas del CV (no genéricas)
- Una nota honesta y concreta sobre la empleabilidad del CV en el mercado actual
- Riesgo de filtrado ATS: ¿el formato y keywords son compatibles con sistemas automáticos?

Respondé SOLO en JSON válido, sin markdown, sin backticks:
{
  "score": número del 1 al 10,
  "nivel": "Básico|Intermedio|Sólido|Premium",
  "aprobado": boolean (true si score >= 8 o si no hay brechas de impacto Alto),
  "nota_consultor": "frase concreta sobre empleabilidad y fit para el mercado (1-2 oraciones)",
  "riesgo_ats": "Bajo|Medio|Alto",
  "fortalezas": ["string específico", "string específico"],
  "gaps": [
    {
      "id": "string corto único sin espacios",
      "campo": "nombre del cargo/empresa/título donde está la brecha",
      "descripcion": "descripción corta del problema (1 oración)",
      "pregunta": "pregunta específica y accionable para el usuario",
      "placeholder": "ejemplo corto de respuesta ideal",
      "impacto": "Alto|Medio"
    }
  ]
}`,

  cv_pre_questions: `Sos un consultor de empleabilidad senior. Tu tarea es analizar el perfil profesional de un candidato ANTES de generar su CV para detectar qué información adicional mejoraría significativamente el resultado.

Analizá el perfil y las respuestas del cuestionario. Generá entre 3 y 5 preguntas MUY específicas y accionables sobre:
1. Métricas o impacto cuantificable que parezcan faltar en logros mencionados (ej: "aumenté ventas" → ¿cuánto %? ¿en qué período?)
2. Tecnologías, herramientas o metodologías relevantes para el sector no especificadas
3. Contexto de escala o equipo (cuántas personas, presupuesto, alcance del proyecto)
4. Logros vagamente mencionados que con más contexto destacarían en el CV
5. Información declarada en el cuestionario (ej: "lideré equipos") que no aparece en el perfil

REGLAS ESTRICTAS:
- NO hagas preguntas sobre lo que ya está claro y completo en el perfil
- NO inventes brechas que no existen
- Si el perfil está bien detallado y no hay brechas críticas, devolvé preguntas vacías
- Máximo 5 preguntas — solo las de mayor impacto para el CV
- Formulalas en segunda persona informal, directo al punto
- Cada pregunta debe referenciar un cargo o logro específico del perfil

Respondé SOLO en JSON válido, sin markdown, sin backticks:
{
  "preguntas": [
    {
      "id": "string corto único sin espacios (ej: logro_ventas_1)",
      "contexto": "nombre del cargo o empresa al que refiere (máx 45 chars)",
      "pregunta": "pregunta específica y accionable",
      "placeholder": "ejemplo de respuesta ideal (máx 60 chars)"
    }
  ]
}`,

  interview_feedback: `Sos una entrevistadora senior de RRHH y headhunter con 20 años de experiencia en selección ejecutiva.
Tu tarea es evaluar las respuestas de una entrevista inicial y dar feedback constructivo y profesional.
Aplicá estos criterios: claridad del mensaje, método STAR en logros, nivel de autoconciencia, capacidad de comunicar propuesta de valor, autenticidad y solidez de los argumentos.
Respondé siempre en español rioplatense (Argentina).
No usés lenguaje genérico ni de autoayuda. Sé directa, específica y orientada a la mejora concreta.
Respondé SOLO en JSON válido, sin markdown, sin backticks.`,

  star_feedback: `Sos un coach de entrevistas laborales especializado en la metodología STAR. Evaluá si la respuesta del usuario aplica correctamente la metodología STAR (Situación, Tarea, Acción, Resultado). Sé directo, específico y constructivo. Respondé en español rioplatense. Respondé SOLO en JSON válido, sin markdown, sin backticks.`,

  job_adapter: `Sos un experto en empleabilidad y redacción de CVs para el mercado laboral argentino y latinoamericano.
Tu tarea es analizar un aviso de empleo, adaptar el CV del candidato para maximizar su fit con la posición, y generar una carta de presentación profesional y personalizada.

REGLAS ANTI-ALUCINACIÓN (críticas — no negociables):
- NUNCA inventes métricas, tecnologías, empresas, logros ni responsabilidades que no estén en el CV original
- Solo podés reorganizar, destacar y reformular lo que ya existe en el CV
- El campo "cv_adaptado" debe tener exactamente la misma estructura JSON que el CV original

ADAPTACIÓN DEL CV:
- Ajustá el titular para alinear con el título/rol del aviso
- Revisá el resumen para incorporar las palabras clave del aviso que apliquen al candidato
- Reorganizá o reformulá bullets de experiencia para destacar lo más relevante para esta posición
- Reordenás habilidades poniendo primero las que menciona el aviso

CARTA DE PRESENTACIÓN:
- Extensión: 3-4 párrafos concisos
- Párrafo 1: quién es el candidato y por qué aplica a esta posición específica
- Párrafos 2-3: sus logros y experiencias más relevantes para el rol (usando datos concretos del CV)
- Párrafo final: cierre con llamada a la acción clara
- Tono: profesional, directo, sin frases genéricas ni clichés
- Respondé en español rioplatense (Argentina)

Respondé SOLO en JSON válido, sin markdown, sin backticks:
{
  "cv_adaptado": { "mismo esquema que el CV original" },
  "carta_de_presentacion": "texto completo de la carta",
  "palabras_clave_incorporadas": ["keyword1", "keyword2"],
  "ajustes_principales": ["descripción del ajuste 1", "descripción del ajuste 2"]
}`,
}

// ── Gemini API helper ─────────────────────────────────────────────────────────
async function callGeminiApi(env, geminiBody, corsHeaders) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS)
  const geminiKeys = (env.GEMINI_API_KEYS || env.GEMINI_API_KEY || '').split(',').map(k => k.trim()).filter(Boolean)
  let res
  try {
    for (const key of geminiKeys) {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_MODEL}:generateContent?key=${key}`,
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(geminiBody), signal: controller.signal }
      )
      if (res.status !== 429) break
    }
  } catch (err) {
    clearTimeout(timeoutId)
    const msg = err.name === 'AbortError' ? 'Upstream timeout' : 'Upstream fetch failed'
    return new Response(JSON.stringify({ error: { message: msg } }), { status: 504, headers: corsHeaders })
  }
  clearTimeout(timeoutId)
  const data = await res.json().catch(() => ({ error: { message: 'Invalid response from upstream' } }))
  return new Response(JSON.stringify(data), { status: res.status, headers: corsHeaders })
}

// ── Supabase helper (service role, bypasses RLS) ─────────────────────────────
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
          'Access-Control-Allow-Headers': 'Content-Type, X-App-Token',
        },
      })
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
      return new Response('Method not allowed', { status: 405 })
    }

    const body = await request.json().catch(() => null)
    if (!body) return new Response('Invalid JSON', { status: 400 })

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
      return callGeminiApi(env, {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: body.contents,
        generationConfig: body.generationConfig,
      }, corsHeaders)
    }

    // ── Gemini raw proxy (PDF extraction only) ────────────────────────────────
    if (!body.contents) return new Response('Missing required field: contents', { status: 400 })

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

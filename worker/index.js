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

  const [subRes, perfilRes] = await Promise.all([
    supabaseServiceFetch(env, 'suscripciones', {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        mp_subscription_id: subId,
        status,
        next_payment_date: nextPayment,
        updated_at: new Date().toISOString(),
      }),
    }),
    supabaseServiceFetch(env, 'perfiles', {
      method: 'POST',
      body: JSON.stringify({
        id: userId,
        es_premium: isPremium,
        premium_hasta: premiumHasta,
        mp_subscription_id: subId,
        updated_at: new Date().toISOString(),
      }),
    }),
  ])

  console.log('[persist] suscripciones:', subRes.status, 'perfiles:', perfilRes.status)
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
          'Access-Control-Allow-Headers': 'Content-Type',
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
        const perfilRes = await supabaseServiceFetch(env, `perfiles?id=eq.${user_id}&select=mp_subscription_id`)
        const rows = await perfilRes.json()
        const subId = rows?.[0]?.mp_subscription_id
        if (!subId) {
          return new Response(JSON.stringify({ error: 'No hay suscripción activa vinculada' }), { status: 404, headers: corsHeaders })
        }
        const cancelRes = await mpFetch(env, `/preapproval/${subId}`, {
          method: 'PUT',
          body: JSON.stringify({ status: 'cancelled' }),
        })
        console.log('[cancel_subscription] MP response status:', cancelRes?.status)
        // Actualizar Supabase inmediatamente (el webhook también llegará luego)
        await persistSubscription(env, { userId: user_id, subId, status: 'cancelled', nextPayment: null })
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders })
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

    // ── Gemini proxy ──────────────────────────────────────────────────────────
    if (!body.contents) return new Response('Missing required field: contents', { status: 400 })

    const { model: modelField, ...geminiBody } = body
    const model = ALLOWED_MODELS.has(modelField) ? modelField : DEFAULT_MODEL

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS)

    const geminiKeys = (env.GEMINI_API_KEYS || env.GEMINI_API_KEY || '').split(',').map(k => k.trim()).filter(Boolean)
    let res
    try {
      for (const key of geminiKeys) {
        res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(geminiBody),
            signal: controller.signal,
          }
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
  },
}

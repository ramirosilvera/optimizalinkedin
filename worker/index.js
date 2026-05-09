const ALLOWED_MODELS = new Set(['gemini-2.5-flash-lite'])
const DEFAULT_MODEL = 'gemini-2.5-flash-lite'
const GEMINI_TIMEOUT_MS = 55_000
const ALLOWED_ORIGINS = new Set([
  'https://optimizalinkedin.com',
  'https://ramirosilvera.github.io',
  'http://localhost:5173',
  'http://localhost:4173',
])

// ── Mercado Pago webhook signature validation ─────────────────────────────────
async function validateMpSignature(request, env, dataId) {
  const secret = env.MP_WEBHOOK_SECRET
  if (!secret) return true // no configurado → no validar (para compatibilidad)
  const xSignature = request.headers.get('x-signature')
  const xRequestId = request.headers.get('x-request-id')
  if (!xSignature) return false
  const ts = (xSignature.match(/ts=([^,]+)/) || [])[1]
  const v1 = (xSignature.match(/v1=([^,]+)/) || [])[1]
  if (!ts || !v1) return false
  const message = `id:${dataId};request-id:${xRequestId || ''};ts:${ts};`
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message))
  const computed = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
  return computed === v1
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

    // ── MP Webhook (POST from Mercado Pago servers, no CORS needed) ─────────
    if (url.pathname.endsWith('/mp-webhook')) {
      if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
      let body
      try { body = await request.json() } catch { return new Response('OK', { status: 200 }) }

      const subId = body?.data?.id
      if (!subId || body?.type !== 'subscription_preapproval') {
        return new Response('OK', { status: 200 })
      }

      const validSig = await validateMpSignature(request, env, subId)
      if (!validSig) return new Response('Unauthorized', { status: 401 })

      try {
        const sub = await mpFetch(env, `/preapproval/${subId}`)
        const status = sub.status // 'authorized' | 'paused' | 'cancelled'
        const isPremium = status === 'authorized'
        const nextPayment = sub.next_payment_date ? new Date(sub.next_payment_date).toISOString() : null
        const premiumHasta = isPremium && nextPayment ? nextPayment : null

        // external_reference debería traer el user_id de Supabase.
        // Fallback: buscar por email del pagador si llega vacío.
        let userId = sub.external_reference
        if (!userId) {
          const payerEmail = sub.payer?.email
          if (!payerEmail) return new Response('OK', { status: 200 })
          const userRes = await fetch(
            `${env.SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(payerEmail)}`,
            { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } }
          )
          const userData = await userRes.json()
          userId = userData?.users?.[0]?.id
          if (!userId) return new Response('OK', { status: 200 })
        }

        // Upsert suscripciones
        await supabaseServiceFetch(env, 'suscripciones', {
          method: 'POST',
          body: JSON.stringify({
            user_id: userId,
            mp_subscription_id: subId,
            status,
            next_payment_date: nextPayment,
            updated_at: new Date().toISOString(),
          }),
        })

        // Update perfiles
        await supabaseServiceFetch(env, `perfiles?id=eq.${userId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            es_premium: isPremium,
            premium_hasta: premiumHasta,
            mp_subscription_id: subId,
            updated_at: new Date().toISOString(),
          }),
        })
      } catch { /* log in prod */ }

      return new Response('OK', { status: 200 })
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 })
    }

    const body = await request.json().catch(() => null)
    if (!body) return new Response('Invalid JSON', { status: 400 })

    // ── Debug: check MP plan ──────────────────────────────────────────────────
    if (body.action === 'check_mp_plan') {
      const planData = await mpFetch(env, `/preapproval_plan/${env.MP_PLAN_ID || 'NOT_SET'}`)
      return new Response(JSON.stringify({
        plan_id_in_env: env.MP_PLAN_ID || 'NOT SET',
        token_prefix: (env.MP_ACCESS_TOKEN || '').slice(0, 10) + '...',
        plan: planData,
      }), { status: 200, headers: corsHeaders })
    }

    // ── Create MP subscription ────────────────────────────────────────────────
    if (body.action === 'create_subscription') {
      const { user_id, user_email } = body
      if (!user_id || !user_email) {
        return new Response(JSON.stringify({ error: 'Faltan user_id y user_email' }), { status: 400, headers: corsHeaders })
      }
      if (!env.MP_PLAN_ID) {
        return new Response(JSON.stringify({ error: 'MP_PLAN_ID no está configurado en el Worker' }), { status: 500, headers: corsHeaders })
      }

      // Crear el preapproval vía API para que external_reference quede
      // grabado en el objeto de suscripción de MP. Sin esto, el campo
      // llega null al webhook y no podemos linkear el pago al usuario.
      const backUrl = 'https://ramirosilvera.github.io/optimizalinkedin/?premium=ok'
      const preapprovalRes = await mpFetch(env, '/preapproval', {
        method: 'POST',
        body: JSON.stringify({
          preapproval_plan_id: env.MP_PLAN_ID,
          reason: 'Optimiza LK Premium',
          external_reference: user_id,
          payer_email: user_email,
          back_url: backUrl,
        }),
      })

      if (!preapprovalRes?.init_point) {
        // Fallback: URL manual (sin external_reference garantizado)
        const params = new URLSearchParams({ preapproval_plan_id: env.MP_PLAN_ID, external_reference: user_id, payer_email: user_email })
        const init_point = `https://www.mercadopago.com.ar/subscriptions/checkout?${params}`
        return new Response(JSON.stringify({ init_point }), { status: 200, headers: corsHeaders })
      }

      return new Response(JSON.stringify({ init_point: preapprovalRes.init_point }), { status: 200, headers: corsHeaders })
    }

    // ── Grant premium manually (for gifting accounts) ────────────────────────
    if (body.action === 'grant_premium') {
      const { admin_key, email, months } = body
      if (admin_key !== env.ADMIN_KEY) {
        return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: corsHeaders })
      }
      if (!email) {
        return new Response(JSON.stringify({ error: 'Falta email' }), { status: 400, headers: corsHeaders })
      }
      const premiumHasta = new Date(Date.now() + (months || 1) * 30 * 24 * 60 * 60 * 1000).toISOString()
      // Find user by email in auth.users via Supabase admin
      const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}`, {
        headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
      })
      const userData = await userRes.json()
      const userId = userData?.users?.[0]?.id
      if (!userId) {
        return new Response(JSON.stringify({ error: `No se encontró usuario con email ${email}` }), { status: 404, headers: corsHeaders })
      }
      await supabaseServiceFetch(env, `perfiles?id=eq.${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ es_premium: true, premium_hasta: premiumHasta, updated_at: new Date().toISOString() }),
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
        return new Response(JSON.stringify({
          es_premium: perfil?.es_premium || false,
          premium_hasta: perfil?.premium_hasta || null,
          mp_subscription_id: perfil?.mp_subscription_id || null,
        }), { status: 200, headers: corsHeaders })
      } catch {
        return new Response(JSON.stringify({ es_premium: false }), { status: 200, headers: corsHeaders })
      }
    }

    // ── Sync MP subscription by payer email (admin) ───────────────────────────
    // Útil para reparar registros donde mp_subscription_id quedó NULL
    // porque el usuario pagó con una cuenta MP distinta a su email de Supabase.
    if (body.action === 'sync_mp_subscription') {
      const { admin_key, payer_email, user_id } = body
      if (admin_key !== env.ADMIN_KEY) {
        return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: corsHeaders })
      }
      if (!payer_email || !user_id) {
        return new Response(JSON.stringify({ error: 'Faltan payer_email y user_id' }), { status: 400, headers: corsHeaders })
      }

      // Buscar suscripciones autorizadas del plan para ese pagador
      const search = await mpFetch(env,
        `/preapproval/search?status=authorized&preapproval_plan_id=${env.MP_PLAN_ID}&payer_email=${encodeURIComponent(payer_email)}&limit=5`
      )
      const sub = search?.results?.[0]
      if (!sub) {
        return new Response(JSON.stringify({ error: 'No se encontró suscripción autorizada en MP para ese email' }), { status: 404, headers: corsHeaders })
      }

      const subId = sub.id
      const nextPayment = sub.next_payment_date ? new Date(sub.next_payment_date).toISOString() : null
      const premiumHasta = nextPayment || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

      // Actualizar perfiles con el subscription ID
      await supabaseServiceFetch(env, `perfiles?id=eq.${user_id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          es_premium: true,
          premium_hasta: premiumHasta,
          mp_subscription_id: subId,
          updated_at: new Date().toISOString(),
        }),
      })

      // Upsert en suscripciones
      await supabaseServiceFetch(env, 'suscripciones', {
        method: 'POST',
        body: JSON.stringify({
          user_id: user_id,
          mp_subscription_id: subId,
          status: 'authorized',
          next_payment_date: nextPayment,
          updated_at: new Date().toISOString(),
        }),
      })

      return new Response(JSON.stringify({
        ok: true,
        mp_subscription_id: subId,
        premium_hasta: premiumHasta,
        next_payment_date: nextPayment,
      }), { status: 200, headers: corsHeaders })
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

    // ── Gemini proxy (default) ────────────────────────────────────────────────
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
      return new Response(JSON.stringify({ error: { message: msg } }), {
        status: 504,
        headers: corsHeaders,
      })
    }
    clearTimeout(timeoutId)

    const data = await res.json().catch(() => ({ error: { message: 'Invalid response from upstream' } }))

    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: corsHeaders,
    })
  },
}

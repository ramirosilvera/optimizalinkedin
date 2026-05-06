const ALLOWED_MODELS = new Set(['gemini-2.5-flash-lite'])
const DEFAULT_MODEL = 'gemini-2.5-flash-lite'
const GEMINI_TIMEOUT_MS = 55_000
const ALLOWED_ORIGINS = new Set([
  'https://optimizalinkedin.com',
  'http://localhost:5173',
  'http://localhost:4173',
])

export default {
  async fetch(request, env) {
    const reqOrigin = request.headers.get('origin') || ''
    const origin = ALLOWED_ORIGINS.has(reqOrigin) ? reqOrigin : 'https://optimizalinkedin.com'

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      })
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 })
    }

    const body = await request.json().catch(() => null)
    if (!body) return new Response('Invalid JSON', { status: 400 })

    if (body.action === 'fetch_url') {
      const { url } = body
      const corsHeaders = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin }
      if (!url || !String(url).startsWith('https://www.linkedin.com/in/')) {
        return new Response(JSON.stringify({ blocked: true }), { status: 200, headers: corsHeaders })
      }
      const ctrl = new AbortController()
      setTimeout(() => ctrl.abort(), 5000)
      try {
        const r = await fetch(url, {
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

    if (body.action === 'linkedin_auth') {
      const corsHeaders = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin }
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
      } catch (err) {
        return new Response(JSON.stringify({ error: 'Error de conexión con LinkedIn. Intentá de nuevo.' }), { status: 502, headers: corsHeaders })
      }
    }

    if (!body.contents) return new Response('Missing required field: contents', { status: 400 })

    const { model: modelField, ...geminiBody } = body
    const model = ALLOWED_MODELS.has(modelField) ? modelField : DEFAULT_MODEL

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS)

    let res
    try {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(geminiBody),
          signal: controller.signal,
        }
      )
    } catch (err) {
      clearTimeout(timeoutId)
      const msg = err.name === 'AbortError' ? 'Upstream timeout' : 'Upstream fetch failed'
      return new Response(JSON.stringify({ error: { message: msg } }), {
        status: 504,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin },
      })
    }
    clearTimeout(timeoutId)

    const data = await res.json().catch(() => ({ error: { message: 'Invalid response from upstream' } }))

    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': origin,
      },
    })
  },
}

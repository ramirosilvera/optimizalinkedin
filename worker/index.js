const ALLOWED_MODELS = new Set(['gemini-2.5-flash-lite'])
const DEFAULT_MODEL = 'gemini-2.5-flash-lite'
const GEMINI_TIMEOUT_MS = 30_000

export default {
  async fetch(request, env) {
    const origin = 'https://optimizalinkedin.com'

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

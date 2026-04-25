export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || 'https://ramirosilvera.github.io'

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

    const { model: modelField, ...geminiBody } = body
    const model = modelField || 'gemini-2.5-flash-lite'

    let res
    try {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(geminiBody),
        }
      )
    } catch (err) {
      return new Response(JSON.stringify({ error: { message: 'No se pudo conectar con la API de Gemini.' } }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin },
      })
    }

    const data = await res.json().catch(() => ({ error: { message: 'Respuesta inválida de la API de Gemini.' } }))

    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': origin,
      },
    })
  },
}

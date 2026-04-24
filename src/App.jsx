import { useState } from 'react'
import './index.css'

const GEMINI_MODEL = 'gemini-2.5-flash-lite'
const geminiUrl = (key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`

function parseGeminiError(status, body) {
  if (status === 429) return 'Cuota de API agotada. Generá una nueva key en aistudio.google.com/apikey o esperá a que se resetee.'
  if (status === 400) return 'API key inválida o solicitud incorrecta. Revisá la key ingresada.'
  if (status === 403) return 'API key sin permisos. Verificá que esté habilitada en Google AI Studio.'
  return `Error HTTP ${status}: ${body?.error?.message || 'Error desconocido'}`
}

const STEPS = { WELCOME: 0, QUESTIONS: 1, PROFILE_INPUT: 2, LOADING: 3, RESULTS: 4 }
const MAX_QUESTIONS = 9

const INITIAL_QUESTION = {
  question: '¿Qué querés lograr con tu perfil de LinkedIn?',
  options: [
    'Conseguir un nuevo empleo',
    'Atraer clientes o proyectos freelance',
    'Posicionarme como referente en mi industria',
    'Ampliar mi red de contactos',
    'Varias cosas a la vez / No estoy seguro',
  ],
}

const QUESTION_SYSTEM_PROMPT = `Sos un experto en optimización de perfiles de LinkedIn y posicionamiento profesional.
Tu tarea es hacer preguntas estratégicas de múltiple choice para entender el contexto profesional del usuario y poder optimizar su perfil de forma personalizada.
Reglas:
- Cada pregunta debe tener entre 4 y 6 opciones concretas y relevantes
- Las opciones deben cubrir los casos más comunes sin ser genéricas
- Adaptá cada pregunta al contexto de las respuestas anteriores (si alguien busca empleo, preguntale cosas de empleo)
- Después de 5 respuestas podés evaluar si ya tenés suficiente info. Con 8 respuestas siempre terminá.
- Cuando tengas suficiente información para hacer una optimización completa y personalizada del perfil, respondé con done true
- Respondé SIEMPRE en español rioplatense (Argentina)
- Respondé SOLO en JSON válido, sin markdown, sin backticks`

const ANALYSIS_SYSTEM_PROMPT = `Sos un experto en posicionamiento profesional y LinkedIn con más de 15 años de experiencia.
Tu tarea es analizar el perfil de LinkedIn de un profesional y generar una evaluación estratégica personalizada.
Respondé siempre en español rioplatense (Argentina).
No uses lenguaje genérico ni de autoayuda.
Sé directo, específico y orientado a resultados.
Respondé SOLO en JSON válido, sin markdown, sin backticks.`

async function fetchNextQuestion(history, apiKey) {
  const historyText = history
    .map((h, i) => `${i + 1}. ${h.question}\n   → ${h.answer}`)
    .join('\n\n')

  const prompt = history.length < 5
    ? `Respuestas del usuario hasta ahora:\n${historyText}\n\n¿Cuál es la siguiente pregunta más importante para entender su contexto y optimizar su perfil?\n\nRespondé en este formato JSON:\n{"done": false, "question": "la pregunta", "options": ["opción 1", "opción 2", "opción 3", "opción 4"]}`
    : `Respuestas del usuario hasta ahora:\n${historyText}\n\n¿Ya tenés suficiente información para hacer una optimización completa del perfil, o necesitás hacer una pregunta más?\n\nSi necesitás más info:\n{"done": false, "question": "la pregunta", "options": ["opción 1", "opción 2", "opción 3", "opción 4"]}\n\nSi ya tenés suficiente:\n{"done": true}`

  const res = await fetch(geminiUrl(apiKey), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: QUESTION_SYSTEM_PROMPT }] },
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 512 },
    }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(parseGeminiError(res.status, body))
  }
  const data = await res.json()
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
  return JSON.parse(raw)
}

async function fetchLinkedInViaProxy(url) {
  const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
  const res = await fetch(proxy, { signal: AbortSignal.timeout(12000) })
  const html = await res.text()
  if (
    html.includes('authwall') ||
    html.includes('uas/login') ||
    html.includes('login-email') ||
    html.length < 500
  ) throw new Error('blocked')
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  doc.querySelectorAll('script, style, nav, footer, header').forEach(el => el.remove())
  const text = (doc.body?.textContent || '').replace(/\s+/g, ' ').trim()
  if (text.length < 300) throw new Error('blocked')
  return text.slice(0, 7000)
}

// ── UI components ──────────────────────────────────────────────

const LinkedInIcon = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
  </svg>
)

function Logo() {
  return (
    <div className="flex items-center gap-2 mb-8 sm:mb-12">
      <div className="w-8 h-8 rounded flex items-center justify-center shrink-0 text-white" style={{ backgroundColor: '#0077B5' }}>
        <LinkedInIcon className="w-5 h-5" />
      </div>
      <span className="text-slate-300 text-sm font-medium tracking-wide">LinkedIn Profile Optimizer</span>
    </div>
  )
}

function Spinner({ size = 4 }) {
  return (
    <div
      className={`w-${size} h-${size} rounded-full border-2 animate-spin shrink-0`}
      style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: 'white' }}
    />
  )
}

function OptionButton({ label, selected, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full text-left px-5 py-4 rounded-xl border transition-all duration-200 text-sm sm:text-base"
      style={selected
        ? { borderColor: '#0077B5', backgroundColor: 'rgba(0,119,181,0.14)', color: '#fff', fontWeight: 500 }
        : { borderColor: '#475569', backgroundColor: 'rgba(30,41,59,0.6)', color: '#cbd5e1', cursor: disabled ? 'not-allowed' : 'pointer' }
      }
    >
      {label}
    </button>
  )
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })}
      className="text-xs px-3 py-1.5 rounded-lg border transition-all duration-200 shrink-0"
      style={copied
        ? { borderColor: '#22c55e', color: '#4ade80', backgroundColor: 'rgba(34,197,94,0.1)' }
        : { borderColor: '#475569', color: '#94a3b8' }
      }
    >
      {copied ? '✓ Copiado' : 'Copiar'}
    </button>
  )
}

function ScoreRing({ score }) {
  const r = 52, circ = 2 * Math.PI * r
  const color = score >= 8 ? '#22c55e' : score >= 5 ? '#0077B5' : '#f59e0b'
  return (
    <div className="flex flex-col items-center shrink-0">
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={r} stroke="#1e293b" strokeWidth="12" fill="none" />
        <circle cx="70" cy="70" r={r} stroke={color} strokeWidth="12" fill="none"
          strokeDasharray={circ} strokeDashoffset={circ - (circ * score) / 10}
          strokeLinecap="round"
          style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', transition: 'stroke-dashoffset 1.2s ease-out' }}
        />
        <text x="70" y="65" textAnchor="middle" fill="white" fontSize="32" fontWeight="700" dy="0.35em">{score}</text>
        <text x="70" y="92" textAnchor="middle" fill="#94a3b8" fontSize="12">/ 10</text>
      </svg>
      <p className="text-slate-400 text-sm mt-1">Puntaje general</p>
    </div>
  )
}

function ResultCard({ title, children }) {
  return (
    <div className="rounded-2xl p-6" style={{ backgroundColor: 'rgba(30,41,59,0.6)', border: '1px solid #334155' }}>
      <h3 className="font-semibold text-xs mb-4 uppercase tracking-wider" style={{ color: '#0077B5' }}>{title}</h3>
      {children}
    </div>
  )
}

function BeforeAfter({ label, before, after }) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl p-4" style={{ backgroundColor: 'rgba(15,23,42,0.7)', border: '1px solid #334155' }}>
        <span className="text-xs text-slate-500 uppercase tracking-wide block mb-2">Actual</span>
        <p className="text-slate-300 text-sm leading-relaxed">{before || `No tiene ${label.toLowerCase()}`}</p>
      </div>
      <div className="rounded-xl p-4" style={{ backgroundColor: 'rgba(0,119,181,0.06)', border: '1px solid rgba(0,119,181,0.3)' }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs uppercase tracking-wide" style={{ color: '#0077B5' }}>Propuesto</span>
          <CopyButton text={after} />
        </div>
        <p className="text-white text-sm leading-relaxed">{after}</p>
      </div>
    </div>
  )
}

// ── Main App ───────────────────────────────────────────────────

export default function App() {
  const [step, setStep] = useState(STEPS.WELCOME)
  const [apiKey, setApiKey] = useState('AIzaSyDhIvm_R3f6CwVc5HckBHNC3xpHKq1l0p8')

  // Dynamic Q&A
  const [qaHistory, setQaHistory] = useState([])
  const [currentQ, setCurrentQ] = useState(INITIAL_QUESTION)
  const [selectedOption, setSelectedOption] = useState(null)
  const [qLoading, setQLoading] = useState(false)
  const [qError, setQError] = useState('')

  // Profile input
  const [linkedinUrl, setLinkedinUrl] = useState('')
  const [profileText, setProfileText] = useState('')
  const [fetchLoading, setFetchLoading] = useState(false)
  const [fetchBlocked, setFetchBlocked] = useState(false)

  // Results
  const [result, setResult] = useState(null)
  const [analysisError, setAnalysisError] = useState('')

  const reset = () => {
    setStep(STEPS.WELCOME)
    setApiKey('')
    setQaHistory([])
    setCurrentQ(INITIAL_QUESTION)
    setSelectedOption(null)
    setQLoading(false)
    setQError('')
    setLinkedinUrl('')
    setProfileText('')
    setFetchBlocked(false)
    setResult(null)
    setAnalysisError('')
  }

  // ── Answer a question and fetch next ──
  const handleAnswer = async (answer) => {
    if (qLoading) return
    setSelectedOption(answer)

    const newHistory = [...qaHistory, { question: currentQ.question, options: currentQ.options, answer }]
    setQaHistory(newHistory)
    setQLoading(true)
    setQError('')

    if (newHistory.length >= MAX_QUESTIONS) {
      setQLoading(false)
      setSelectedOption(null)
      setStep(STEPS.PROFILE_INPUT)
      return
    }

    try {
      const next = await fetchNextQuestion(newHistory, apiKey)
      if (next.done) {
        setStep(STEPS.PROFILE_INPUT)
      } else {
        setCurrentQ({ question: next.question, options: next.options })
        setSelectedOption(null)
      }
    } catch {
      setQError('No se pudo cargar la siguiente pregunta. Intentá de nuevo.')
      setQaHistory(qaHistory) // rollback
      setSelectedOption(null)
    } finally {
      setQLoading(false)
    }
  }

  // ── Go back one question ──
  const handleBack = () => {
    if (qaHistory.length === 0) {
      setStep(STEPS.WELCOME)
      return
    }
    const prev = qaHistory[qaHistory.length - 1]
    setQaHistory(h => h.slice(0, -1))
    setCurrentQ({ question: prev.question, options: prev.options })
    setSelectedOption(null)
    setQError('')
  }

  // ── Fetch LinkedIn profile ──
  const handleFetchProfile = async () => {
    setFetchLoading(true)
    setFetchBlocked(false)
    setProfileText('')
    try {
      const text = await fetchLinkedInViaProxy(linkedinUrl)
      setProfileText(text)
    } catch {
      setFetchBlocked(true)
    } finally {
      setFetchLoading(false)
    }
  }

  // ── Call Gemini for analysis ──
  const callGemini = async () => {
    setStep(STEPS.LOADING)
    setAnalysisError('')

    const contextText = qaHistory
      .map((h, i) => `${i + 1}. ${h.question}\n   → ${h.answer}`)
      .join('\n\n')

    const userPrompt = `Contexto del usuario (respuestas del cuestionario):
${contextText}

Perfil de LinkedIn:
${profileText}

Generá un análisis en este formato JSON exacto:
{
  "puntaje_general": número del 1 al 10,
  "resumen_diagnostico": "2-3 oraciones directas sobre el estado actual del perfil",
  "fortalezas": ["fortaleza 1", "fortaleza 2", "fortaleza 3"],
  "areas_de_mejora": ["area 1", "area 2", "area 3"],
  "titular_actual": "el titular actual",
  "titular_propuesto": "un titular mejorado y específico",
  "resumen_actual": "el resumen actual o No tiene resumen",
  "resumen_propuesto": "un resumen reescrito de máximo 5 oraciones",
  "recomendaciones": [
    {"titulo": "nombre de la recomendación", "descripcion": "explicación concreta de qué cambiar y cómo"}
  ],
  "estrategia_contenido": "sugerencia de 2-3 oraciones sobre qué tipo de contenido publicar para lograr el objetivo"
}`

    try {
      const res = await fetch(geminiUrl(apiKey), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: ANALYSIS_SYSTEM_PROMPT }] },
          contents: [{ parts: [{ text: userPrompt }] }],
          generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 2048 },
        }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error(parseGeminiError(res.status, e))
      }
      const data = await res.json()
      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
      let parsed
      try { parsed = JSON.parse(raw) }
      catch { const m = raw.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); else throw new Error('Respuesta inválida') }
      setResult(parsed)
      setStep(STEPS.RESULTS)
    } catch (err) {
      setAnalysisError(err.message || 'Error al conectar con Gemini.')
      setStep(STEPS.PROFILE_INPUT)
    }
  }

  const profileReady = profileText.trim().length >= 100
  const qNum = qaHistory.length + 1
  const qProgress = Math.min(88, (qaHistory.length / 7) * 100)

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className="min-h-dvh flex flex-col items-center px-4 py-8 sm:py-12" style={{ backgroundColor: '#0f172a' }}>
      <div className="w-full max-w-2xl">

        {/* ── WELCOME ── */}
        {step === STEPS.WELCOME && (
          <div className="step-transition text-center space-y-8">
            <Logo />
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm"
                style={{ backgroundColor: 'rgba(0,119,181,0.12)', border: '1px solid rgba(0,119,181,0.35)', color: '#0077B5' }}>
                ✦ Análisis con IA
              </div>
              <h1 className="text-4xl sm:text-5xl font-bold text-white leading-tight">
                Optimizá tu perfil<br />
                <span style={{ color: '#0077B5' }}>de LinkedIn</span>
              </h1>
              <p className="text-slate-400 text-lg max-w-md mx-auto leading-relaxed">
                Respondé algunas preguntas, ingresá la URL de tu perfil y recibí un análisis estratégico personalizado.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-4 text-center">
              {[
                { icon: '🤖', text: 'Preguntas adaptadas por IA' },
                { icon: '✍️', text: 'Titular y resumen mejorado' },
                { icon: '📈', text: 'Estrategia de contenido' },
              ].map(item => (
                <div key={item.text} className="rounded-xl p-4"
                  style={{ backgroundColor: 'rgba(30,41,59,0.5)', border: '1px solid #334155' }}>
                  <div className="text-2xl mb-2">{item.icon}</div>
                  <p className="text-slate-400 text-xs leading-snug">{item.text}</p>
                </div>
              ))}
            </div>
            <div className="space-y-3 text-left">
              <label className="text-slate-400 text-sm block">Tu API Key de Google AI Studio</label>
              <input
                type="password"
                placeholder="AIzaSy..."
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                className="w-full rounded-xl px-4 py-3 text-white placeholder-slate-500 text-sm focus:outline-none transition-colors"
                style={{ backgroundColor: '#1e293b', border: `1px solid ${apiKey ? '#0077B5' : '#475569'}` }}
              />
              <p className="text-slate-500 text-xs">
                Generá una key gratuita en{' '}
                <span style={{ color: '#0077B5' }}>aistudio.google.com/apikey</span>. No se guarda en ningún lado.
              </p>
              <button
                onClick={() => setStep(STEPS.QUESTIONS)}
                disabled={!apiKey.trim()}
                className="w-full text-white font-semibold py-4 px-8 rounded-xl transition-all duration-200 text-base"
                style={{
                  backgroundColor: apiKey.trim() ? '#0077B5' : '#334155',
                  opacity: apiKey.trim() ? 1 : 0.5,
                  cursor: apiKey.trim() ? 'pointer' : 'not-allowed',
                }}
              >
                Empezar →
              </button>
            </div>
          </div>
        )}

        {/* ── QUESTIONS ── */}
        {step === STEPS.QUESTIONS && (
          <div className="step-transition space-y-6">
            <Logo />

            {/* Progress bar */}
            <div className="w-full mb-2">
              <div className="flex justify-between text-xs text-slate-400 mb-2">
                <span>Pregunta {qNum}</span>
                <span className="text-slate-500">La IA adapta las preguntas a tus respuestas</span>
              </div>
              <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${qLoading ? qProgress + 6 : qProgress}%`, backgroundColor: '#0077B5' }} />
              </div>
            </div>

            {/* Question */}
            <div className="min-h-[4rem]">
              {qLoading && !currentQ ? (
                <div className="flex items-center gap-3 text-slate-400">
                  <div className="w-5 h-5 rounded-full border-2 animate-spin shrink-0"
                    style={{ borderColor: '#334155', borderTopColor: '#0077B5' }} />
                  <span className="text-sm">Generando siguiente pregunta...</span>
                </div>
              ) : (
                <h2 className="text-2xl sm:text-3xl font-bold text-white leading-snug">
                  {currentQ?.question}
                </h2>
              )}
            </div>

            {/* Options */}
            {currentQ && (
              <div className="space-y-3">
                {currentQ.options.map(opt => (
                  <OptionButton
                    key={opt}
                    label={opt}
                    selected={selectedOption === opt}
                    disabled={qLoading}
                    onClick={() => handleAnswer(opt)}
                  />
                ))}
              </div>
            )}

            {/* Loading overlay after selection */}
            {qLoading && selectedOption && (
              <div className="flex items-center gap-3 py-2">
                <div className="flex gap-1">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="w-1.5 h-1.5 rounded-full animate-bounce"
                      style={{ backgroundColor: '#0077B5', animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
                <span className="text-slate-400 text-sm">Analizando tu respuesta...</span>
              </div>
            )}

            {/* Error */}
            {qError && (
              <div className="rounded-xl p-4 text-sm flex items-center justify-between gap-4"
                style={{ backgroundColor: 'rgba(127,29,29,0.3)', border: '1px solid #b91c1c', color: '#fca5a5' }}>
                <span>⚠️ {qError}</span>
                <button onClick={() => setQError('')} className="text-xs underline shrink-0">Cerrar</button>
              </div>
            )}

            {/* Back button */}
            <button
              onClick={handleBack}
              disabled={qLoading}
              className="text-slate-500 text-sm hover:text-slate-300 transition-colors"
            >
              ← {qaHistory.length === 0 ? 'Volver al inicio' : 'Pregunta anterior'}
            </button>
          </div>
        )}

        {/* ── PROFILE INPUT ── */}
        {step === STEPS.PROFILE_INPUT && (
          <div className="step-transition space-y-6">
            <Logo />
            <div>
              <p className="text-slate-500 text-sm mb-1">Último paso</p>
              <h2 className="text-2xl sm:text-3xl font-bold text-white">Ingresá la URL de tu perfil</h2>
              <p className="text-slate-400 text-sm mt-2 leading-relaxed">
                Pegá el link de tu perfil de LinkedIn y lo analizamos automáticamente.
              </p>
            </div>

            {analysisError && (
              <div className="rounded-xl p-4 text-sm"
                style={{ backgroundColor: 'rgba(127,29,29,0.3)', border: '1px solid #b91c1c', color: '#fca5a5' }}>
                ⚠️ {analysisError}
              </div>
            )}

            {/* Resumen de respuestas */}
            <div className="rounded-xl p-4 space-y-2"
              style={{ backgroundColor: 'rgba(0,119,181,0.06)', border: '1px solid rgba(0,119,181,0.2)' }}>
              <p className="text-xs uppercase tracking-wide mb-3" style={{ color: '#0077B5' }}>Tu contexto</p>
              {qaHistory.map((h, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className="text-slate-500 shrink-0 mt-0.5">{i + 1}.</span>
                  <span className="text-slate-400">{h.question.replace('¿', '').replace('?', '')}:</span>
                  <span className="text-slate-200 font-medium">{h.answer}</span>
                </div>
              ))}
            </div>

            {/* URL input */}
            <div className="flex gap-2">
              <input
                type="url"
                placeholder="https://www.linkedin.com/in/tu-usuario"
                value={linkedinUrl}
                onChange={e => { setLinkedinUrl(e.target.value); setFetchBlocked(false); setProfileText('') }}
                className="flex-1 rounded-xl px-5 py-4 text-white placeholder-slate-500 text-sm focus:outline-none transition-colors"
                style={{ backgroundColor: '#1e293b', border: `1px solid ${linkedinUrl ? '#0077B5' : '#475569'}` }}
              />
              <button
                onClick={handleFetchProfile}
                disabled={!linkedinUrl.trim() || fetchLoading}
                className="px-5 py-4 rounded-xl font-semibold text-sm text-white transition-all shrink-0 flex items-center gap-2"
                style={{
                  backgroundColor: !linkedinUrl.trim() || fetchLoading ? '#334155' : '#0077B5',
                  opacity: !linkedinUrl.trim() || fetchLoading ? 0.6 : 1,
                  cursor: !linkedinUrl.trim() || fetchLoading ? 'not-allowed' : 'pointer',
                }}
              >
                {fetchLoading ? <Spinner size={4} /> : '→ Obtener'}
              </button>
            </div>

            {/* Fetch success */}
            {profileText && !fetchBlocked && (
              <div className="rounded-xl p-4 text-sm flex items-start gap-3"
                style={{ backgroundColor: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)' }}>
                <span className="text-green-400 text-base mt-0.5">✓</span>
                <div>
                  <p className="text-green-400 font-medium">Perfil obtenido correctamente</p>
                  <p className="text-slate-400 text-xs mt-1">{profileText.length.toLocaleString()} caracteres extraídos.</p>
                </div>
              </div>
            )}

            {/* Fetch blocked — fallback textarea */}
            {fetchBlocked && (
              <div className="space-y-4">
                <div className="rounded-xl p-4 text-sm flex items-start gap-3"
                  style={{ backgroundColor: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)' }}>
                  <span className="text-amber-400 text-base mt-0.5">⚠️</span>
                  <div>
                    <p className="text-amber-400 font-medium">LinkedIn bloqueó el acceso automático</p>
                    <p className="text-slate-400 text-xs mt-1">
                      Copiá el contenido de tu perfil desde LinkedIn (titular, sobre mí, experiencia) y pegalo acá.
                    </p>
                  </div>
                </div>
                <textarea
                  rows={10}
                  placeholder={'Titular: Senior PM en TechCorp\n\nSobre mí:\nSoy PM con 6 años de experiencia...\n\nExperiencia:\nSenior PM | TechCorp | 2021 - presente'}
                  value={profileText}
                  onChange={e => setProfileText(e.target.value)}
                  className="w-full rounded-xl px-5 py-4 text-white placeholder-slate-500 text-sm focus:outline-none transition-colors resize-none leading-relaxed"
                  style={{ backgroundColor: '#1e293b', border: `1px solid ${profileReady ? '#0077B5' : '#475569'}` }}
                />
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => { setStep(STEPS.QUESTIONS); setCurrentQ(qaHistory[qaHistory.length - 1] ? { question: qaHistory[qaHistory.length - 1].question, options: qaHistory[qaHistory.length - 1].options } : INITIAL_QUESTION) }}
                className="flex-1 border border-slate-600 text-slate-300 font-semibold py-3.5 rounded-xl transition-all duration-200 hover:border-slate-400"
              >
                ← Atrás
              </button>
              <button
                disabled={!profileReady}
                onClick={callGemini}
                className="flex-[2] font-semibold py-3.5 rounded-xl transition-all duration-200 text-white"
                style={{
                  backgroundColor: profileReady ? '#0077B5' : '#334155',
                  opacity: profileReady ? 1 : 0.5,
                  cursor: profileReady ? 'pointer' : 'not-allowed',
                }}
              >
                Analizar mi perfil ✦
              </button>
            </div>
          </div>
        )}

        {/* ── LOADING ── */}
        {step === STEPS.LOADING && (
          <div className="step-transition flex flex-col items-center justify-center min-h-[60vh] space-y-8 text-center">
            <div className="relative w-20 h-20">
              <div className="absolute inset-0 rounded-full border-4 border-slate-700" />
              <div className="absolute inset-0 rounded-full border-4 border-t-transparent animate-spin"
                style={{ borderColor: '#0077B5', borderTopColor: 'transparent' }} />
              <div className="absolute inset-0 flex items-center justify-center" style={{ color: '#0077B5' }}>
                <LinkedInIcon className="w-8 h-8" />
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-white">Analizando tu perfil...</h2>
              <p className="text-slate-400 text-sm max-w-xs">
                Gemini está procesando tu perfil y las respuestas del cuestionario para generar recomendaciones personalizadas.
              </p>
            </div>
            <div className="flex gap-1.5">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-2 h-2 rounded-full animate-bounce"
                  style={{ backgroundColor: '#0077B5', animationDelay: `${i * 0.2}s` }} />
              ))}
            </div>
          </div>
        )}

        {/* ── RESULTS ── */}
        {step === STEPS.RESULTS && result && (
          <div className="step-transition space-y-6">
            <Logo />

            <ResultCard title="Diagnóstico general">
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                <ScoreRing score={result.puntaje_general} />
                <p className="text-slate-300 text-sm leading-relaxed sm:pt-4">{result.resumen_diagnostico}</p>
              </div>
            </ResultCard>

            <ResultCard title="Fortalezas y áreas de mejora">
              <div className="grid sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: '#4ade80' }}>✅ Fortalezas</p>
                  {(result.fortalezas || []).map((f, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="mt-0.5 shrink-0" style={{ color: '#4ade80' }}>•</span>
                      <p className="text-slate-300 text-sm">{f}</p>
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: '#fbbf24' }}>⚠️ Áreas de mejora</p>
                  {(result.areas_de_mejora || []).map((a, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="mt-0.5 shrink-0" style={{ color: '#fbbf24' }}>•</span>
                      <p className="text-slate-300 text-sm">{a}</p>
                    </div>
                  ))}
                </div>
              </div>
            </ResultCard>

            <ResultCard title="Titular">
              <BeforeAfter label="Titular" before={result.titular_actual} after={result.titular_propuesto} />
            </ResultCard>

            <ResultCard title="Resumen / About">
              <BeforeAfter label="Resumen" before={result.resumen_actual} after={result.resumen_propuesto} />
            </ResultCard>

            <ResultCard title="Recomendaciones">
              <div className="space-y-4">
                {(result.recomendaciones || []).map((rec, i) => (
                  <div key={i} className="rounded-xl p-4"
                    style={{ backgroundColor: 'rgba(15,23,42,0.6)', border: '1px solid #334155' }}>
                    <p className="text-white font-semibold text-sm mb-1">
                      <span style={{ color: '#0077B5' }} className="mr-2">{i + 1}.</span>
                      {rec.titulo}
                    </p>
                    <p className="text-slate-400 text-sm leading-relaxed">{rec.descripcion}</p>
                  </div>
                ))}
              </div>
            </ResultCard>

            <div className="rounded-2xl p-6"
              style={{ backgroundColor: 'rgba(0,119,181,0.08)', border: '1px solid rgba(0,119,181,0.3)' }}>
              <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: '#0077B5' }}>📣 Estrategia de contenido</p>
              <p className="text-slate-200 text-sm leading-relaxed">{result.estrategia_contenido}</p>
            </div>

            <button
              onClick={reset}
              className="w-full border border-slate-600 text-slate-300 font-semibold py-4 rounded-xl transition-all duration-200 text-sm hover:border-slate-400"
            >
              ↺ Analizar otro perfil
            </button>
          </div>
        )}

      </div>
    </div>
  )
}

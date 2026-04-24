import { useState } from 'react'
import './index.css'

const STEPS = {
  WELCOME: 0,
  Q1: 1,
  Q2: 2,
  Q3: 3,
  Q4: 4,
  Q5: 5,
  PROFILE_INPUT: 6,
  LOADING: 7,
  RESULTS: 8,
}

const TOTAL_STEPS = 6

const Q1_OPTIONS = [
  { value: 'Conseguir un nuevo empleo', label: 'Conseguir un nuevo empleo' },
  { value: 'Atraer clientes o proyectos freelance', label: 'Atraer clientes o proyectos freelance' },
  { value: 'Posicionarme como referente en mi industria', label: 'Posicionarme como referente en mi industria' },
  { value: 'Ampliar mi red de contactos', label: 'Ampliar mi red de contactos' },
  { value: 'no_seguro', label: 'No estoy seguro' },
]

const Q2_OPTIONS = [
  { value: 'Estoy empezando (0-3 años)', label: 'Estoy empezando (0-3 años)' },
  { value: 'Tengo experiencia media (3-8 años)', label: 'Tengo experiencia media (3-8 años)' },
  { value: 'Soy senior o directivo (+8 años)', label: 'Soy senior o directivo (+8 años)' },
  { value: 'Estoy en transición o cambio de carrera', label: 'Estoy en transición o cambio de carrera' },
]

const Q3_OPTIONS = [
  { value: 'Reclutadores y empresas', label: 'Reclutadores y empresas' },
  { value: 'Potenciales clientes', label: 'Potenciales clientes' },
  { value: 'Colegas y pares de mi industria', label: 'Colegas y pares de mi industria' },
  { value: 'Líderes y tomadores de decisión', label: 'Líderes y tomadores de decisión' },
  { value: 'no_claro', label: 'No lo tengo claro' },
]

const ORIENTACION_Q1 = `Si no sabés bien qué querés lograr, empezá por preguntarte: ¿estás cómodo en tu trabajo actual? ¿Hay algo que te falta lograr profesionalmente? Un perfil bien enfocado en un solo objetivo suele funcionar mejor que uno que intenta abarcar todo.`

const ORIENTACION_Q3 = `Tu audiencia ideal depende de tu objetivo. Si buscás empleo, apuntá a reclutadores. Si querés proyectos, apuntá a clientes. Si querés posicionamiento, pensá en colegas y líderes de tu industria. Podés combinar, pero uno tiene que ser el principal.`

const LinkedInIcon = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
  </svg>
)

function ProgressBar({ current, total }) {
  const pct = Math.round((current / total) * 100)
  return (
    <div className="w-full mb-8">
      <div className="flex justify-between text-xs text-slate-400 mb-2">
        <span>Paso {current} de {total}</span>
        <span>{pct}%</span>
      </div>
      <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{ width: `${pct}%`, backgroundColor: '#0077B5' }}
        />
      </div>
    </div>
  )
}

function OptionButton({ label, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-5 py-4 rounded-xl border transition-all duration-200 text-sm sm:text-base"
      style={selected
        ? { borderColor: '#0077B5', backgroundColor: 'rgba(0,119,181,0.12)', color: '#fff', fontWeight: 500 }
        : { borderColor: '#475569', backgroundColor: 'rgba(30,41,59,0.6)', color: '#cbd5e1' }
      }
    >
      {label}
    </button>
  )
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  const handle = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button
      onClick={handle}
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
  const radius = 52
  const circ = 2 * Math.PI * radius
  const fill = circ - (circ * score) / 10
  const color = score >= 8 ? '#22c55e' : score >= 5 ? '#0077B5' : '#f59e0b'

  return (
    <div className="flex flex-col items-center shrink-0">
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={radius} stroke="#1e293b" strokeWidth="12" fill="none" />
        <circle
          cx="70" cy="70" r={radius}
          stroke={color} strokeWidth="12" fill="none"
          strokeDasharray={circ}
          strokeDashoffset={fill}
          strokeLinecap="round"
          style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', transition: 'stroke-dashoffset 1.2s ease-out' }}
        />
        <text x="70" y="65" textAnchor="middle" fill="white" fontSize="32" fontWeight="700" dy="0.35em">
          {score}
        </text>
        <text x="70" y="92" textAnchor="middle" fill="#94a3b8" fontSize="12">
          / 10
        </text>
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
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-slate-500 uppercase tracking-wide">Actual</span>
        </div>
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

function NavButtons({ onBack, onNext, nextLabel = 'Siguiente →', nextDisabled = false }) {
  return (
    <div className="flex gap-3">
      {onBack && (
        <button
          onClick={onBack}
          className="flex-1 border border-slate-600 text-slate-300 font-semibold py-3.5 rounded-xl transition-all duration-200 hover:border-slate-400"
        >
          ← Atrás
        </button>
      )}
      <button
        disabled={nextDisabled}
        onClick={onNext}
        className="font-semibold py-3.5 rounded-xl transition-all duration-200 text-white"
        style={{ flex: onBack ? 2 : 1, backgroundColor: nextDisabled ? '#334155' : '#0077B5', opacity: nextDisabled ? 0.5 : 1, cursor: nextDisabled ? 'not-allowed' : 'pointer' }}
      >
        {nextLabel}
      </button>
    </div>
  )
}

export default function App() {
  const [step, setStep] = useState(STEPS.WELCOME)
  const [answers, setAnswers] = useState({ q1: '', q2: '', q3: '', q4: '', q5: '' })
  const [showHint, setShowHint] = useState({ q1: false, q3: false })
  const [profileText, setProfileText] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const stepProgress = () => step >= STEPS.Q1 && step <= STEPS.PROFILE_INPUT
    ? step - STEPS.Q1 + 1
    : 0

  const reset = () => {
    setStep(STEPS.WELCOME)
    setAnswers({ q1: '', q2: '', q3: '', q4: '', q5: '' })
    setShowHint({ q1: false, q3: false })
    setProfileText('')
    setResult(null)
    setError('')
  }

  const callClaude = async () => {
    setStep(STEPS.LOADING)
    setError('')

    const systemPrompt = `Sos un experto en posicionamiento profesional y LinkedIn con más de 15 años de experiencia.
Tu tarea es analizar el perfil de LinkedIn de un profesional y generar una evaluación estratégica personalizada.
Respondé siempre en español rioplatense (Argentina).
No uses lenguaje genérico ni de autoayuda.
Sé directo, específico y orientado a resultados.
Respondé SOLO en JSON válido, sin markdown, sin backticks.`

    const q1Label = Q1_OPTIONS.find(o => o.value === answers.q1)?.label || answers.q1
    const q3Label = Q3_OPTIONS.find(o => o.value === answers.q3)?.label || answers.q3

    const userPrompt = `Contexto del usuario:
- Objetivo: ${q1Label}
- Etapa de carrera: ${answers.q2}
- Audiencia target: ${q3Label}
- Industria: ${answers.q4}
- Diferencial que quiere comunicar: ${answers.q5}

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
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'anthropic-dangerous-direct-browser-calls': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2048,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData?.error?.message || `Error HTTP ${res.status}`)
      }

      const data = await res.json()
      const raw = data.content?.[0]?.text || ''

      let parsed
      try {
        parsed = JSON.parse(raw)
      } catch {
        const match = raw.match(/\{[\s\S]*\}/)
        if (match) parsed = JSON.parse(match[0])
        else throw new Error('La respuesta no es JSON válido. Intentá de nuevo.')
      }

      setResult(parsed)
      setStep(STEPS.RESULTS)
    } catch (err) {
      setError(err.message || 'Ocurrió un error al conectar con Claude.')
      setStep(STEPS.PROFILE_INPUT)
    }
  }

  const showProgress = step >= STEPS.Q1 && step <= STEPS.PROFILE_INPUT

  return (
    <div className="min-h-dvh flex flex-col items-center px-4 py-8 sm:py-12" style={{ backgroundColor: '#0f172a' }}>
      <div className="w-full max-w-2xl">

        {/* Logo header */}
        {step !== STEPS.RESULTS && step !== STEPS.LOADING && (
          <div className="flex items-center gap-2 mb-8 sm:mb-12">
            <div className="w-8 h-8 rounded flex items-center justify-center shrink-0 text-white" style={{ backgroundColor: '#0077B5' }}>
              <LinkedInIcon className="w-5 h-5" />
            </div>
            <span className="text-slate-300 text-sm font-medium tracking-wide">LinkedIn Profile Optimizer</span>
          </div>
        )}

        {showProgress && <ProgressBar current={stepProgress()} total={TOTAL_STEPS} />}

        {/* ── WELCOME ── */}
        {step === STEPS.WELCOME && (
          <div className="step-transition text-center space-y-8">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm" style={{ backgroundColor: 'rgba(0,119,181,0.12)', border: '1px solid rgba(0,119,181,0.35)', color: '#0077B5' }}>
                ✦ Análisis con IA
              </div>
              <h1 className="text-4xl sm:text-5xl font-bold text-white leading-tight">
                Optimizá tu perfil<br />
                <span style={{ color: '#0077B5' }}>de LinkedIn</span>
              </h1>
              <p className="text-slate-400 text-lg max-w-md mx-auto leading-relaxed">
                Pegá tu perfil, respondé algunas preguntas y recibí un análisis estratégico personalizado para destacarte.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-4 text-center">
              {[
                { icon: '🎯', text: 'Análisis personalizado' },
                { icon: '✍️', text: 'Titular y resumen mejorado' },
                { icon: '📈', text: 'Estrategia de contenido' },
              ].map((item) => (
                <div key={item.text} className="rounded-xl p-4" style={{ backgroundColor: 'rgba(30,41,59,0.5)', border: '1px solid #334155' }}>
                  <div className="text-2xl mb-2">{item.icon}</div>
                  <p className="text-slate-400 text-xs leading-snug">{item.text}</p>
                </div>
              ))}
            </div>

            <div className="space-y-3 text-left">
              <label className="text-slate-400 text-sm block">Tu API Key de Anthropic</label>
              <input
                type="password"
                placeholder="sk-ant-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full rounded-xl px-4 py-3 text-white placeholder-slate-500 text-sm focus:outline-none transition-colors"
                style={{ backgroundColor: '#1e293b', border: `1px solid ${apiKey ? '#0077B5' : '#475569'}` }}
              />
              <p className="text-slate-500 text-xs">
                Necesitás una API key de <span style={{ color: '#0077B5' }}>console.anthropic.com</span>. No se guarda en ningún lado.
              </p>
              <button
                onClick={() => setStep(STEPS.Q1)}
                disabled={!apiKey.trim()}
                className="w-full text-white font-semibold py-4 px-8 rounded-xl transition-all duration-200 text-base mt-2"
                style={{ backgroundColor: apiKey.trim() ? '#0077B5' : '#334155', opacity: apiKey.trim() ? 1 : 0.5, cursor: apiKey.trim() ? 'pointer' : 'not-allowed' }}
              >
                Empezar →
              </button>
            </div>
          </div>
        )}

        {/* ── Q1 ── */}
        {step === STEPS.Q1 && (
          <div className="step-transition space-y-6">
            <div>
              <p className="text-slate-500 text-sm mb-1">Pregunta 1 de 5</p>
              <h2 className="text-2xl sm:text-3xl font-bold text-white">¿Qué querés lograr con tu perfil de LinkedIn?</h2>
            </div>
            <div className="space-y-3">
              {Q1_OPTIONS.map((opt) => (
                <OptionButton
                  key={opt.value}
                  label={opt.label}
                  selected={answers.q1 === opt.value}
                  onClick={() => {
                    setAnswers((p) => ({ ...p, q1: opt.value }))
                    setShowHint((p) => ({ ...p, q1: opt.value === 'no_seguro' }))
                  }}
                />
              ))}
            </div>
            {showHint.q1 && (
              <div className="rounded-xl p-4 text-slate-300 text-sm leading-relaxed" style={{ backgroundColor: 'rgba(30,41,59,0.8)', border: '1px solid #475569' }}>
                💡 {ORIENTACION_Q1}
              </div>
            )}
            <NavButtons onNext={() => setStep(STEPS.Q2)} nextDisabled={!answers.q1} />
          </div>
        )}

        {/* ── Q2 ── */}
        {step === STEPS.Q2 && (
          <div className="step-transition space-y-6">
            <div>
              <p className="text-slate-500 text-sm mb-1">Pregunta 2 de 5</p>
              <h2 className="text-2xl sm:text-3xl font-bold text-white">¿En qué etapa de tu carrera estás?</h2>
            </div>
            <div className="space-y-3">
              {Q2_OPTIONS.map((opt) => (
                <OptionButton
                  key={opt.value}
                  label={opt.label}
                  selected={answers.q2 === opt.value}
                  onClick={() => setAnswers((p) => ({ ...p, q2: opt.value }))}
                />
              ))}
            </div>
            <NavButtons onBack={() => setStep(STEPS.Q1)} onNext={() => setStep(STEPS.Q3)} nextDisabled={!answers.q2} />
          </div>
        )}

        {/* ── Q3 ── */}
        {step === STEPS.Q3 && (
          <div className="step-transition space-y-6">
            <div>
              <p className="text-slate-500 text-sm mb-1">Pregunta 3 de 5</p>
              <h2 className="text-2xl sm:text-3xl font-bold text-white">¿A quién querés llegar con tu perfil?</h2>
            </div>
            <div className="space-y-3">
              {Q3_OPTIONS.map((opt) => (
                <OptionButton
                  key={opt.value}
                  label={opt.label}
                  selected={answers.q3 === opt.value}
                  onClick={() => {
                    setAnswers((p) => ({ ...p, q3: opt.value }))
                    setShowHint((p) => ({ ...p, q3: opt.value === 'no_claro' }))
                  }}
                />
              ))}
            </div>
            {showHint.q3 && (
              <div className="rounded-xl p-4 text-slate-300 text-sm leading-relaxed" style={{ backgroundColor: 'rgba(30,41,59,0.8)', border: '1px solid #475569' }}>
                💡 {ORIENTACION_Q3}
              </div>
            )}
            <NavButtons onBack={() => setStep(STEPS.Q2)} onNext={() => setStep(STEPS.Q4)} nextDisabled={!answers.q3} />
          </div>
        )}

        {/* ── Q4 ── */}
        {step === STEPS.Q4 && (
          <div className="step-transition space-y-6">
            <div>
              <p className="text-slate-500 text-sm mb-1">Pregunta 4 de 5</p>
              <h2 className="text-2xl sm:text-3xl font-bold text-white">¿Cuál es tu industria o área de expertise?</h2>
            </div>
            <input
              type="text"
              placeholder="Ej: Tecnología, Marketing Digital, Finanzas, Salud..."
              value={answers.q4}
              onChange={(e) => setAnswers((p) => ({ ...p, q4: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && answers.q4.trim() && setStep(STEPS.Q5)}
              className="w-full rounded-xl px-5 py-4 text-white placeholder-slate-500 text-sm focus:outline-none transition-colors"
              style={{ backgroundColor: '#1e293b', border: `1px solid ${answers.q4 ? '#0077B5' : '#475569'}` }}
            />
            <NavButtons onBack={() => setStep(STEPS.Q3)} onNext={() => setStep(STEPS.Q5)} nextDisabled={!answers.q4.trim()} />
          </div>
        )}

        {/* ── Q5 ── */}
        {step === STEPS.Q5 && (
          <div className="step-transition space-y-6">
            <div>
              <p className="text-slate-500 text-sm mb-1">Pregunta 5 de 5</p>
              <h2 className="text-2xl sm:text-3xl font-bold text-white">¿Qué diferencial querés comunicar?</h2>
              <p className="text-slate-400 text-sm mt-2">Lo que te hace único y diferente en tu campo.</p>
            </div>
            <textarea
              rows={4}
              placeholder="Ej: 20 años en finanzas corporativas, especialista en turnaround de empresas"
              value={answers.q5}
              onChange={(e) => setAnswers((p) => ({ ...p, q5: e.target.value }))}
              className="w-full rounded-xl px-5 py-4 text-white placeholder-slate-500 text-sm focus:outline-none transition-colors resize-none"
              style={{ backgroundColor: '#1e293b', border: `1px solid ${answers.q5 ? '#0077B5' : '#475569'}` }}
            />
            <NavButtons onBack={() => setStep(STEPS.Q4)} onNext={() => setStep(STEPS.PROFILE_INPUT)} nextDisabled={!answers.q5.trim()} />
          </div>
        )}

        {/* ── PROFILE INPUT ── */}
        {step === STEPS.PROFILE_INPUT && (
          <div className="step-transition space-y-6">
            <div>
              <p className="text-slate-500 text-sm mb-1">Último paso</p>
              <h2 className="text-2xl sm:text-3xl font-bold text-white">Pegá el contenido de tu perfil</h2>
              <p className="text-slate-400 text-sm mt-2 leading-relaxed">
                Copiá y pegá tu titular, resumen (About), experiencia laboral y educación desde LinkedIn.
              </p>
            </div>

            {error && (
              <div className="rounded-xl p-4 text-sm" style={{ backgroundColor: 'rgba(127,29,29,0.3)', border: '1px solid #b91c1c', color: '#fca5a5' }}>
                ⚠️ {error}
              </div>
            )}

            <textarea
              rows={12}
              placeholder={`Titular: Senior Product Manager en TechCorp\n\nSobre mí:\nSoy PM con 6 años de experiencia en startups B2B...\n\nExperiencia:\nSenior PM | TechCorp | 2021 - presente\n...\n\nEducación:\nIngeniería Industrial | UBA | 2016`}
              value={profileText}
              onChange={(e) => setProfileText(e.target.value)}
              className="w-full rounded-xl px-5 py-4 text-white placeholder-slate-500 text-sm focus:outline-none transition-colors resize-none leading-relaxed"
              style={{ backgroundColor: '#1e293b', border: `1px solid ${profileText.trim().length >= 50 ? '#0077B5' : '#475569'}` }}
            />

            {profileText.trim().length > 0 && profileText.trim().length < 50 && (
              <p className="text-slate-500 text-xs text-center -mt-3">
                Necesitás pegar más contenido del perfil para un análisis preciso.
              </p>
            )}

            <NavButtons
              onBack={() => setStep(STEPS.Q5)}
              onNext={callClaude}
              nextLabel="Analizar mi perfil ✦"
              nextDisabled={profileText.trim().length < 50}
            />
          </div>
        )}

        {/* ── LOADING ── */}
        {step === STEPS.LOADING && (
          <div className="step-transition flex flex-col items-center justify-center min-h-[60vh] space-y-8 text-center">
            <div className="relative w-20 h-20">
              <div className="absolute inset-0 rounded-full border-4 border-slate-700" />
              <div className="absolute inset-0 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#0077B5', borderTopColor: 'transparent' }} />
              <div className="absolute inset-0 flex items-center justify-center" style={{ color: '#0077B5' }}>
                <LinkedInIcon className="w-8 h-8" />
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-white">Analizando tu perfil...</h2>
              <p className="text-slate-400 text-sm max-w-xs">
                Claude está evaluando tu perfil y preparando recomendaciones personalizadas.
              </p>
            </div>
            <div className="flex gap-1.5">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-2 h-2 rounded-full animate-bounce"
                  style={{ backgroundColor: '#0077B5', animationDelay: `${i * 0.2}s` }}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── RESULTS ── */}
        {step === STEPS.RESULTS && result && (
          <div className="step-transition space-y-6">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded flex items-center justify-center shrink-0 text-white" style={{ backgroundColor: '#0077B5' }}>
                <LinkedInIcon className="w-5 h-5" />
              </div>
              <span className="text-slate-300 text-sm font-medium tracking-wide">LinkedIn Profile Optimizer</span>
            </div>

            {/* S1: Diagnóstico */}
            <ResultCard title="Diagnóstico general">
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                <ScoreRing score={result.puntaje_general} />
                <p className="text-slate-300 text-sm leading-relaxed sm:pt-4">{result.resumen_diagnostico}</p>
              </div>
            </ResultCard>

            {/* S2: Fortalezas y mejoras */}
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

            {/* S3: Titular */}
            <ResultCard title="Titular">
              <BeforeAfter label="Titular" before={result.titular_actual} after={result.titular_propuesto} />
            </ResultCard>

            {/* S4: Resumen */}
            <ResultCard title="Resumen / About">
              <BeforeAfter label="Resumen" before={result.resumen_actual} after={result.resumen_propuesto} />
            </ResultCard>

            {/* S5: Recomendaciones */}
            <ResultCard title="Recomendaciones">
              <div className="space-y-4">
                {(result.recomendaciones || []).map((rec, i) => (
                  <div key={i} className="rounded-xl p-4" style={{ backgroundColor: 'rgba(15,23,42,0.6)', border: '1px solid #334155' }}>
                    <p className="text-white font-semibold text-sm mb-1">
                      <span style={{ color: '#0077B5' }} className="mr-2">{i + 1}.</span>
                      {rec.titulo}
                    </p>
                    <p className="text-slate-400 text-sm leading-relaxed">{rec.descripcion}</p>
                  </div>
                ))}
              </div>
            </ResultCard>

            {/* S6: Estrategia de contenido */}
            <div className="rounded-2xl p-6" style={{ backgroundColor: 'rgba(0,119,181,0.08)', border: '1px solid rgba(0,119,181,0.3)' }}>
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

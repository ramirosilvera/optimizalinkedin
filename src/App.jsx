import { useState, useEffect, useCallback } from 'react'
import './index.css'

const GEMINI_MODEL = 'gemini-2.5-flash-lite'
const WORKER_URL = import.meta.env.VITE_WORKER_URL

function parseGeminiError(status, body) {
  if (status === 429) return 'Cuota de API agotada. Generá una nueva key en aistudio.google.com/apikey o esperá a que se resetee.'
  if (status === 400) return 'API key inválida o solicitud incorrecta. Revisá la key ingresada.'
  if (status === 403) return 'API key sin permisos. Verificá que esté habilitada en Google AI Studio.'
  return `Error HTTP ${status}: ${body?.error?.message || 'Error desconocido'}`
}

const STEPS = { WELCOME: 0, QUESTIONS: 1, PROFILE_INPUT: 2, LOADING: 3, RESULTS: 4 }
const MAX_PDF_SIZE = 15 * 1024 * 1024

const STATIC_QUESTIONS = [
  {
    id: 'profesion',
    question: '¿A qué te dedicás?',
    type: 'text',
    placeholder: 'Ej: Desarrollador web freelance, Gerente de marketing en empresa de retail, Psicóloga clínica independiente...',
    hint: 'Escribí tu profesión o rol actual con el mayor detalle que puedas.',
  },
  {
    id: 'situacion',
    question: '¿Cuál es tu situación profesional actual?',
    options: [
      'Empleado/a buscando un nuevo trabajo',
      'Freelancer o consultor/a buscando más clientes',
      'Emprendedor/a o dueño/a de negocio buscando visibilidad',
      'Profesional buscando crecer o ascender en mi empresa',
      'En transición de carrera o reingresando al mercado',
    ],
  },
  {
    id: 'industria',
    question: '¿En qué industria o rubro trabajás?',
    options: [
      'Tecnología / Software / IT',
      'Marketing / Comunicación / Publicidad',
      'Finanzas / Contabilidad / Auditoría',
      'Recursos Humanos / Consultoría',
      'Salud / Medicina / Bienestar',
      'Educación / Capacitación',
      'Ventas / Comercial / Business Development',
      'Diseño / UX / Creatividad',
      'Otro rubro',
    ],
  },
  {
    id: 'seniority',
    question: '¿Cuál es tu nivel de experiencia?',
    options: [
      'Junior — menos de 2 años',
      'Semi-senior — entre 2 y 5 años',
      'Senior — entre 5 y 10 años',
      'Lead / Manager / Coordinador de equipo',
      'Director / Gerente / Head of',
      'C-Level / Fundador / Socio',
    ],
  },
  {
    id: 'audiencia',
    question: '¿A quién querés llegar principalmente con tu perfil?',
    options: [
      'Reclutadores de empresas medianas y grandes',
      'Startups y empresas de tecnología',
      'Clientes corporativos (B2B)',
      'Clientes individuales o pymes (freelance / consultoría)',
      'Inversores, socios o co-fundadores',
      'Comunidad y red de contactos profesionales',
    ],
  },
  {
    id: 'area_impacto',
    question: '¿En qué área generaste tu mayor impacto profesional?',
    options: [
      'Aumenté ventas, ingresos o captación de clientes',
      'Reduje costos, tiempos o mejoré la eficiencia operativa',
      'Lideré equipos o desarrollé personas',
      'Lancé productos, servicios o proyectos nuevos',
      'Implementé procesos, sistemas o transformaciones digitales',
      'Asesoría, estrategia o consultoría de alto nivel',
      'Estoy construyendo mi trayectoria, aún sin logros grandes',
    ],
  },
  {
    id: 'escala',
    question: '¿A qué escala trabajaste o trabajás habitualmente?',
    options: [
      'De forma individual, sin equipo a cargo',
      'Equipo pequeño (2 a 5 personas)',
      'Equipo mediano (6 a 15 personas)',
      'Equipos grandes o múltiples equipos (+15 personas)',
      'A nivel de área o empresa completa',
      'A nivel regional, multinacional o internacional',
    ],
  },
  {
    id: 'resultado',
    question: '¿Qué tipo de resultado describe mejor tus logros más importantes?',
    options: [
      'Aumenté ventas o contratos en un porcentaje concreto (ej: 30%, $X)',
      'Reduje costos, errores o tiempos en un % medible',
      'Crecí una base de usuarios, clientes o audiencia',
      'Entregué proyectos en tiempo y dentro del presupuesto',
      'Implementé algo que no existía antes en la empresa',
      'Mis logros son más cualitativos (cultura, relaciones, estrategia)',
      'Todavía no tengo métricas concretas para mostrar',
    ],
  },
  {
    id: 'reconocimiento',
    question: '¿Cuál de estas situaciones te representa mejor?',
    options: [
      'Me ascendieron o me dieron más responsabilidades recientemente',
      'Trabajé en empresas o proyectos de renombre en mi industria',
      'Tengo clientes que me recomiendan o vuelven a contratarme',
      'Fui reconocido/a formalmente (premio, mención, certificación)',
      'Participé en proyectos de alto impacto o visibilidad pública',
      'Estoy construyendo mi reputación, sin reconocimientos formales aún',
    ],
  },
  {
    id: 'diferenciador',
    question: '¿Qué es lo que más valoran de vos quienes trabajaron con vos?',
    options: [
      'Mi conocimiento técnico profundo y especializado',
      'Mi capacidad de liderar, motivar y desarrollar equipos',
      'Mi orientación a resultados y ejecución concreta',
      'Mi visión estratégica y pensamiento de negocio',
      'Mi creatividad, innovación o capacidad de resolver problemas',
      'Mi facilidad para comunicar, vender ideas y generar confianza',
      'Todavía estoy construyendo mi reputación profesional',
    ],
  },
  {
    id: 'contexto_adicional',
    question: '¿Hay algo más que quieras agregar sobre tu perfil o situación?',
    type: 'text',
    placeholder: 'Ej: Estoy cambiando de industria luego de 10 años en finanzas. Tengo un proyecto personal en IA. Quiero enfocarme en el mercado de EEUU...',
    hint: 'Opcional — cualquier detalle que las preguntas anteriores no hayan cubierto y que sea relevante para tu perfil.',
  },
]

const LOADING_MESSAGES = [
  'Los reclutadores pasan apenas 6 segundos en el primer vistazo de un perfil...',
  'El 87% de los reclutadores usa LinkedIn para encontrar candidatos activamente...',
  'Los perfiles con foto reciben 21× más visitas que los que no la tienen...',
  'Un titular optimizado puede triplicar tus apariciones en búsquedas de reclutadores...',
  'El resumen es el único espacio donde podés hablarle directamente a tu audiencia ideal...',
  'Los perfiles con habilidades validadas tienen 17× más chances de ser vistos por reclutadores...',
  'Perfiles con logros concretos y métricas generan 40% más solicitudes de conexión...',
]

const ANALYSIS_SYSTEM_PROMPT = `Sos una consultora senior de RRHH y headhunter con 20 años de experiencia en selección ejecutiva y posicionamiento profesional en LinkedIn.
Tu tarea es analizar el perfil de LinkedIn de un profesional y generar una evaluación estratégica con estándares de headhunter.
Aplicá estos frameworks en tu análisis:
- Test de 6 segundos: ¿el titular y la foto comunican quién es y para quién es relevante en menos de 6 segundos?
- SEO de LinkedIn: ¿aparecerá en las búsquedas correctas de reclutadores y potenciales clientes?
- Compliance ATS: ¿el perfil pasará los filtros automáticos de los sistemas de tracking de candidatos?
- Propuesta de valor: ¿está claro qué problema resuelve este profesional y para quién específicamente?
- Prueba social: ¿hay métricas, logros concretos, recomendaciones o validaciones externas?
- CTA: ¿hay una llamada a la acción clara para el visitante ideal del perfil?
Respondé siempre en español rioplatense (Argentina).
No usés lenguaje genérico ni de autoayuda.
Sé directa, específica y orientada a resultados medibles.
Respondé SOLO en JSON válido, sin markdown, sin backticks.`

// ── UI components ──────────────────────────────────────────────

const LinkedInIcon = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
  </svg>
)

function Logo() {
  return (
    <div className="flex items-center gap-2.5 mb-8 sm:mb-10">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-white"
        style={{ background: 'linear-gradient(135deg, #0077B5 0%, #0ea5e9 100%)', boxShadow: '0 2px 10px rgba(0,119,181,0.4)' }}>
        <LinkedInIcon className="w-4.5 h-4.5" />
      </div>
      <span className="text-slate-400 text-sm font-medium tracking-wide">LinkedIn Profile Optimizer</span>
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

function OptionButton({ label, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-5 py-3.5 rounded-2xl border transition-all duration-200 text-sm sm:text-base flex items-center justify-between gap-3 ${selected ? 'option-glow' : ''}`}
      style={selected
        ? { borderColor: 'rgba(0,119,181,0.6)', background: 'rgba(0,119,181,0.12)', color: '#fff', fontWeight: 500 }
        : { borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.03)', color: '#cbd5e1' }
      }
    >
      <span>{label}</span>
      {selected && (
        <span className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
          style={{ background: 'linear-gradient(135deg,#0077B5,#0ea5e9)', color: '#fff' }}>✓</span>
      )}
    </button>
  )
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })}
      className={`text-xs px-3 py-1.5 rounded-lg border transition-all duration-200 shrink-0 ${copied ? 'copy-btn-success' : ''}`}
      style={copied
        ? { borderColor: '#22c55e', color: '#4ade80', background: 'rgba(34,197,94,0.1)' }
        : { borderColor: 'rgba(255,255,255,0.12)', color: '#64748b', background: 'rgba(255,255,255,0.03)' }
      }
    >
      {copied ? '✓ Copiado' : 'Copiar'}
    </button>
  )
}

function ScoreRing({ score }) {
  const r = 52, circ = 2 * Math.PI * r
  const color = score >= 8 ? '#22c55e' : score >= 5 ? '#0ea5e9' : '#f59e0b'
  const glowColor = score >= 8 ? 'rgba(34,197,94,0.3)' : score >= 5 ? 'rgba(14,165,233,0.3)' : 'rgba(245,158,11,0.3)'
  return (
    <div className="flex flex-col items-center shrink-0">
      <svg width="140" height="140" viewBox="0 0 140 140" style={{ filter: `drop-shadow(0 0 8px ${glowColor})` }}>
        <circle cx="70" cy="70" r={r} stroke="rgba(255,255,255,0.06)" strokeWidth="10" fill="none" />
        <circle cx="70" cy="70" r={r} stroke={color} strokeWidth="10" fill="none"
          strokeDasharray={circ} strokeDashoffset={circ - (circ * score) / 10}
          strokeLinecap="round"
          style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', transition: 'stroke-dashoffset 1.3s cubic-bezier(0.16,1,0.3,1)' }}
        />
        <text x="70" y="65" textAnchor="middle" fill="white" fontSize="34" fontWeight="700" dy="0.35em">{score}</text>
        <text x="70" y="93" textAnchor="middle" fill="#64748b" fontSize="11">/ 10</text>
      </svg>
      <p className="text-slate-500 text-xs mt-1 tracking-wide uppercase">Puntaje general</p>
    </div>
  )
}

function ResultCard({ title, children, accent = '#0077B5' }) {
  return (
    <div className="rounded-2xl p-6 relative overflow-hidden card-accent-line"
      style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="absolute top-0 left-0 right-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent 0%, ${accent}60 50%, transparent 100%)` }} />
      <h3 className="font-semibold text-xs mb-4 uppercase tracking-widest" style={{ color: accent }}>{title}</h3>
      {children}
    </div>
  )
}

function BeforeAfter({ label, before, after }) {
  return (
    <div className="space-y-2">
      <div className="rounded-xl p-4" style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <span className="text-xs text-slate-600 uppercase tracking-widest block mb-2">Actual</span>
        <p className="text-slate-400 text-sm leading-relaxed">{before || `No tiene ${label.toLowerCase()}`}</p>
      </div>
      <div className="rounded-xl p-4 relative overflow-hidden"
        style={{ background: 'rgba(0,119,181,0.07)', border: '1px solid rgba(0,119,181,0.25)' }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs uppercase tracking-widest font-semibold" style={{ color: '#0ea5e9' }}>Propuesto</span>
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

  // Cuestionario estático
  const [qaHistory, setQaHistory] = useState([])
  const [currentQ, setCurrentQ] = useState(STATIC_QUESTIONS[0])
  const [selectedOption, setSelectedOption] = useState(null)
  const [textAnswer, setTextAnswer] = useState('')

  // Profile input
  const [profileText, setProfileText] = useState('')
  const [pdfFileName, setPdfFileName] = useState('')
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfError, setPdfError] = useState('')
  const [instrTab, setInstrTab] = useState('desktop')
  const [isDragging, setIsDragging] = useState(false)

  // Results
  const [result, setResult] = useState(null)
  const [analysisError, setAnalysisError] = useState('')
  const [analyzing, setAnalyzing] = useState(false)

  // Loading message rotation
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0)
  useEffect(() => {
    if (step !== STEPS.LOADING) return
    const id = setInterval(() => setLoadingMsgIdx(i => (i + 1) % LOADING_MESSAGES.length), 3500)
    return () => clearInterval(id)
  }, [step])

  const reset = () => {
    if (!window.confirm('¿Seguro? Se van a borrar los resultados del análisis actual.')) return
    setStep(STEPS.WELCOME)
    setQaHistory([])
    setCurrentQ(STATIC_QUESTIONS[0])
    setSelectedOption(null)
    setTextAnswer('')
    setProfileText('')
    setPdfFileName('')
    setPdfLoading(false)
    setPdfError('')
    setInstrTab('desktop')
    setIsDragging(false)
    setResult(null)
    setAnalysisError('')
    setAnalyzing(false)
    setLoadingMsgIdx(0)
  }

  // ── Avanzar al siguiente paso del cuestionario ──
  const handleAnswer = (answer) => {
    const newHistory = [...qaHistory, { question: currentQ.question, answer }]
    setQaHistory(newHistory)
    setSelectedOption(null)
    setTextAnswer('')
    const nextIndex = newHistory.length
    if (nextIndex < STATIC_QUESTIONS.length) {
      setCurrentQ(STATIC_QUESTIONS[nextIndex])
    } else {
      setStep(STEPS.PROFILE_INPUT)
    }
  }

  // ── Volver a la pregunta anterior ──
  const handleBack = () => {
    if (qaHistory.length === 0) {
      setStep(STEPS.WELCOME)
      return
    }
    const newHistory = qaHistory.slice(0, -1)
    setQaHistory(newHistory)
    setCurrentQ(STATIC_QUESTIONS[newHistory.length])
    setSelectedOption(null)
    setTextAnswer('')
  }

  // ── Upload and extract PDF ──
  const processPdfFile = useCallback(async (file) => {
    if (!file) return
    if (file.type !== 'application/pdf') {
      setPdfError('El archivo debe ser un PDF. Descargá tu perfil de LinkedIn como PDF y volvé a intentarlo.')
      return
    }
    if (file.size > MAX_PDF_SIZE) {
      setPdfError('El archivo es demasiado grande. El PDF debe pesar menos de 15 MB.')
      setPdfFileName('')
      return
    }
    setPdfLoading(true)
    setPdfError('')
    setProfileText('')
    setPdfFileName(file.name)
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result.split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      if (!WORKER_URL) throw new Error('Worker URL no configurada. Verificá el secret VITE_WORKER_URL en GitHub.')
      const res = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: 'application/pdf', data: base64 } },
              { text: 'Extraé todo el contenido de texto de este perfil de LinkedIn en PDF. Incluí el titular, resumen/about, toda la experiencia laboral con fechas y descripciones, educación, skills, certificaciones, voluntariado y cualquier otra sección del perfil. Devolvé solo el texto extraído, organizado claramente.' },
            ],
          }],
          generationConfig: { maxOutputTokens: 1800 },
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(parseGeminiError(res.status, body))
      }
      const data = await res.json()
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
      if (text.length < 100) throw new Error('No se pudo extraer contenido del PDF. Verificá que sea el PDF de tu perfil de LinkedIn y que no esté protegido con contraseña.')
      setProfileText(text)
    } catch (err) {
      setPdfError(err.message || 'Error al procesar el PDF.')
      setPdfFileName('')
    } finally {
      setPdfLoading(false)
    }
  }, [])

  const handlePdfUpload = (e) => processPdfFile(e.target.files[0])

  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true) }
  const handleDragLeave = (e) => { e.preventDefault(); setIsDragging(false) }
  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    processPdfFile(e.dataTransfer.files[0])
  }

  // ── Call Gemini for analysis ──
  const callGemini = async () => {
    if (analyzing) return
    setAnalyzing(true)
    setStep(STEPS.LOADING)
    setAnalysisError('')

    const contextText = qaHistory
      .map(h => `- ${STATIC_QUESTIONS.find(q => q.question === h.question)?.id ?? 'dato'}: ${h.answer}`)
      .join('\n')

    const userPrompt = `Perfil del usuario:
${contextText}

Perfil de LinkedIn:
${profileText.slice(0, 4000)}

Generá un análisis en este formato JSON exacto:
{
  "puntaje_general": número del 1 al 10,
  "nivel_seo": "Alto" o "Medio" o "Bajo",
  "resumen_diagnostico": "2-3 oraciones directas sobre el estado actual del perfil aplicando los frameworks de headhunter",
  "accion_prioritaria": "la UNA acción más impactante que puede hacer HOY para mejorar su perfil, explicada en 1-2 oraciones concretas",
  "fortalezas": ["fortaleza 1", "fortaleza 2", "fortaleza 3"],
  "areas_de_mejora": ["area 1", "area 2", "area 3"],
  "palabras_clave_sugeridas": ["keyword 1", "keyword 2", "keyword 3", "keyword 4", "keyword 5", "keyword 6", "keyword 7", "keyword 8"],
  "titular_actual": "el titular actual",
  "titular_propuesto": "un titular mejorado, específico, con keywords y propuesta de valor clara",
  "resumen_actual": "el resumen actual o No tiene resumen",
  "resumen_propuesto": "un resumen reescrito de máximo 5 oraciones con propuesta de valor, logros y CTA",
  "recomendaciones": [
    {"titulo": "nombre de la recomendación", "descripcion": "explicación concreta de qué cambiar y cómo, con ejemplos si aplica"},
    {"titulo": "...", "descripcion": "..."},
    {"titulo": "...", "descripcion": "..."}
  ],
  "estrategia_contenido": "sugerencia de 2-3 oraciones sobre qué tipo de contenido publicar para lograr el objetivo declarado"
}`

    try {
      if (!WORKER_URL) throw new Error('Worker URL no configurada. Verificá el secret VITE_WORKER_URL en GitHub.')
      const res = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: ANALYSIS_SYSTEM_PROMPT }] },
          contents: [{ parts: [{ text: userPrompt }] }],
          generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 1400 },
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
    } finally {
      setAnalyzing(false)
    }
  }

  const qNum = qaHistory.length + 1
  const qProgress = Math.round((qaHistory.length / STATIC_QUESTIONS.length) * 100)

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className="min-h-dvh flex flex-col items-center px-4 py-8 sm:py-14">
      <div className="w-full max-w-xl">

        {/* ── WELCOME ── */}
        {step === STEPS.WELCOME && (
          <div className="step-transition text-center space-y-8">
            <Logo />
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide badge-shimmer"
                style={{ border: '1px solid rgba(0,119,181,0.4)', color: '#7dd3fc' }}>
                ✦ &nbsp;Análisis profesional con IA
              </div>
              <h1 className="text-4xl sm:text-5xl font-bold leading-tight tracking-tight" style={{ letterSpacing: '-0.02em' }}>
                <span className="text-white">Optimizá tu perfil</span><br />
                <span style={{ background: 'linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  de LinkedIn
                </span>
              </h1>
              <p className="text-slate-400 text-base max-w-sm mx-auto leading-relaxed">
                Respondé el cuestionario, luego subí tu PDF y recibí un análisis con criterio de headhunter.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[
                { icon: '🎯', label: 'Headhunter', text: 'Diagnóstico profesional real', accent: '#0ea5e9' },
                { icon: '🔍', label: 'SEO',         text: 'Aparecer en búsquedas clave',  accent: '#6366f1' },
                { icon: '⚡', label: '6 segundos',  text: 'Test de primer impacto',        accent: '#0d9488' },
              ].map(item => (
                <div key={item.label} className="rounded-2xl p-4 text-center relative overflow-hidden"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div className="text-2xl mb-2">{item.icon}</div>
                  <p className="text-xs font-semibold mb-1" style={{ color: item.accent }}>{item.label}</p>
                  <p className="text-slate-500 text-xs leading-snug">{item.text}</p>
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <button
                onClick={() => setStep(STEPS.QUESTIONS)}
                className="btn-glow w-full text-white font-semibold py-4 px-8 rounded-2xl text-base"
                style={{ background: 'linear-gradient(135deg, #0077B5 0%, #0ea5e9 100%)' }}
              >
                Empezar análisis →
              </button>
              <p className="text-slate-600 text-xs">Gratis · Sin registro · 3 minutos</p>
            </div>
          </div>
        )}

        {/* ── QUESTIONS ── */}
        {step === STEPS.QUESTIONS && (
          <div className="step-transition space-y-7">
            <Logo />

            {/* Stepper de puntos */}
            <div className="flex items-center gap-1.5">
              {STATIC_QUESTIONS.map((_, i) => {
                const done = i < qaHistory.length
                const active = i === qaHistory.length
                return (
                  <div key={i} className="h-1.5 rounded-full transition-all duration-500 flex-1"
                    style={{
                      background: done
                        ? 'linear-gradient(90deg,#0077B5,#0ea5e9)'
                        : active
                          ? 'rgba(0,119,181,0.5)'
                          : 'rgba(255,255,255,0.07)',
                    }} />
                )
              })}
            </div>
            <p className="text-xs text-slate-500 -mt-4">
              Paso {qNum} de {STATIC_QUESTIONS.length}
              {currentQ.id && <span className="ml-2 opacity-60">· {currentQ.id.replace(/_/g,' ')}</span>}
            </p>

            {/* Question */}
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-white leading-snug" style={{ letterSpacing: '-0.01em' }}>
                {currentQ.question}
              </h2>
              {currentQ.type === 'text' && currentQ.hint && (
                <p className="text-slate-500 text-sm mt-2 leading-relaxed">{currentQ.hint}</p>
              )}
            </div>

            {/* Multiple choice */}
            {currentQ.type !== 'text' && (
              <div className="space-y-2.5">
                {currentQ.options.map(opt => (
                  <OptionButton
                    key={opt}
                    label={opt}
                    selected={selectedOption === opt}
                    onClick={() => { setSelectedOption(opt); handleAnswer(opt) }}
                  />
                ))}
              </div>
            )}

            {/* Texto libre — opcional */}
            {currentQ.type === 'text' && (
              <div className="space-y-3">
                <div className="relative">
                  <textarea
                    value={textAnswer}
                    onChange={e => setTextAnswer(e.target.value)}
                    placeholder={currentQ.placeholder}
                    rows={4}
                    maxLength={600}
                    className="w-full rounded-2xl px-4 py-3 text-sm text-white resize-none outline-none transition-all duration-200"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: textAnswer.trim() ? '1px solid rgba(0,119,181,0.5)' : '1px solid rgba(255,255,255,0.08)',
                      color: '#e2e8f0',
                    }}
                  />
                  <span className="absolute bottom-2.5 right-3 text-xs pointer-events-none"
                    style={{ color: textAnswer.length > 550 ? '#f59e0b' : '#334155' }}>
                    {textAnswer.length}/600
                  </span>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => handleAnswer('')}
                    className="flex-1 font-medium py-3 rounded-2xl text-sm transition-colors"
                    style={{ border: '1px solid rgba(255,255,255,0.08)', color: '#475569', background: 'transparent' }}
                  >
                    Omitir
                  </button>
                  <button
                    onClick={() => handleAnswer(textAnswer.trim())}
                    className="btn-glow flex-[2] font-semibold py-3 rounded-2xl text-white text-sm"
                    style={{ background: 'linear-gradient(135deg,#0077B5,#0ea5e9)' }}
                  >
                    Continuar →
                  </button>
                </div>
              </div>
            )}

            {/* Back */}
            <button onClick={handleBack} className="text-slate-600 text-sm hover:text-slate-400 transition-colors">
              ← {qaHistory.length === 0 ? 'Volver al inicio' : 'Anterior'}
            </button>
          </div>
        )}

        {/* ── PROFILE INPUT ── */}
        {step === STEPS.PROFILE_INPUT && (
          <div className="step-transition space-y-5">
            <Logo />
            <div>
              <p className="text-slate-500 text-sm mb-1">Último paso</p>
              <h2 className="text-2xl sm:text-3xl font-bold text-white">Subí tu perfil de LinkedIn</h2>
            </div>

            {/* Por qué PDF */}
            <div className="rounded-xl p-4 text-sm space-y-1"
              style={{ backgroundColor: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.25)' }}>
              <p className="text-amber-400 font-semibold text-xs uppercase tracking-wide mb-2">¿Por qué no se puede hacer automáticamente?</p>
              <p className="text-slate-300 leading-relaxed">
                LinkedIn bloquea el acceso a perfiles desde apps externas para proteger la privacidad de sus usuarios.
                No existe una API pública que permita leer perfiles completos — solo empresas con acuerdo comercial directo con LinkedIn pueden hacerlo.
                Por eso, la forma más simple y confiable es descargar tu propio perfil como PDF directamente desde LinkedIn.
              </p>
            </div>

            {/* Cómo descargar — tabs desktop/celular */}
            <div className="rounded-2xl overflow-hidden"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              {/* Tab selector */}
              <div className="flex border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
                {[
                  { id: 'desktop', label: '🖥️  Computadora' },
                  { id: 'mobile', label: '📱  Celular' },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setInstrTab(tab.id)}
                    className="flex-1 py-3 text-xs font-semibold transition-all duration-200"
                    style={instrTab === tab.id
                      ? { background: 'linear-gradient(135deg,#0077B5,#0ea5e9)', color: '#fff' }
                      : { color: '#475569', background: 'transparent' }
                    }
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Steps */}
              <div className="p-5 space-y-3">
                <p className="font-semibold text-white text-sm mb-1">
                  {instrTab === 'desktop' ? '📄 Cómo descargar desde la computadora' : '📄 Cómo descargar desde el celular'}
                </p>
                <ol className="space-y-2.5">
                  {(instrTab === 'desktop' ? [
                    'Abrí linkedin.com en tu navegador e iniciá sesión',
                    'Hacé clic en tu foto de perfil (arriba a la derecha) y seleccioná "Ver perfil"',
                    'En tu perfil, hacé clic en el botón "Más" (debajo de tu foto y nombre)',
                    'Seleccioná "Guardar como PDF" en el menú desplegable',
                    'El PDF se descarga automáticamente — buscalo en tu carpeta de Descargas',
                    'Volvé acá y arrastrá el archivo o hacé clic para subirlo ↓',
                  ] : [
                    'Abrí la app de LinkedIn en tu celular e iniciá sesión',
                    'Tocá tu foto de perfil (arriba a la izquierda) para ir a tu perfil',
                    'Tocá los tres puntos (...) que aparecen arriba a la derecha de tu perfil',
                    'Seleccioná "Guardar como PDF"',
                    'Si no ves esa opción: abrí linkedin.com en Chrome o Safari, iniciá sesión, y repetí desde el paso 2',
                    'El PDF se guarda en tu teléfono — subilo acá ↓',
                  ]).map((s, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-slate-300">
                      <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5"
                        style={{ backgroundColor: 'rgba(0,119,181,0.2)', color: '#0077B5', minWidth: '1.25rem' }}>
                        {i + 1}
                      </span>
                      <span className="leading-relaxed">{s}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            {/* Resumen de respuestas */}
            <div className="rounded-xl p-4"
              style={{ backgroundColor: 'rgba(0,119,181,0.06)', border: '1px solid rgba(0,119,181,0.2)' }}>
              <p className="text-xs uppercase tracking-wide mb-3" style={{ color: '#0077B5' }}>Tu contexto recopilado</p>
              <div className="space-y-0">
                {qaHistory.map((h, i) => (
                  <div key={i} className="py-2 border-b last:border-0" style={{ borderColor: 'rgba(51,65,85,0.5)' }}>
                    <p className="text-slate-500 text-xs leading-snug">
                      {STATIC_QUESTIONS[i]?.id ?? `Pregunta ${i + 1}`}
                    </p>
                    <p className="text-white text-xs font-medium mt-0.5 pl-3 leading-relaxed">→ {h.answer}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Upload area */}
            <div>
              <input
                type="file"
                accept="application/pdf"
                id="pdf-upload"
                className="hidden"
                onChange={handlePdfUpload}
              />
              <label
                htmlFor="pdf-upload"
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className="flex flex-col items-center justify-center gap-3 w-full py-10 px-6 rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-300"
                style={{
                  borderColor: profileText ? 'rgba(34,197,94,0.6)' : isDragging ? '#0a91d4' : pdfLoading ? '#0077B5' : 'rgba(255,255,255,0.12)',
                  background: profileText ? 'rgba(34,197,94,0.05)' : isDragging ? 'rgba(0,119,181,0.08)' : 'rgba(255,255,255,0.02)',
                }}
              >
                {pdfLoading ? (
                  <>
                    <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
                      style={{ borderColor: '#0077B5', borderTopColor: 'transparent' }} />
                    <p className="text-slate-400 text-sm">Extrayendo contenido del PDF...</p>
                  </>
                ) : profileText ? (
                  <>
                    <span className="text-3xl">✅</span>
                    <div className="text-center">
                      <p className="text-green-400 font-semibold text-sm">{pdfFileName}</p>
                      <p className="text-slate-400 text-xs mt-1">Perfil extraído correctamente · Hacé clic para cambiar el archivo</p>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="text-3xl">{isDragging ? '📂' : '📄'}</span>
                    <div className="text-center">
                      <p className="text-white font-semibold text-sm">
                        {isDragging ? 'Soltá el PDF acá' : 'Subir PDF de LinkedIn'}
                      </p>
                      <p className="text-slate-400 text-xs mt-1">Arrastrá el archivo o hacé clic para seleccionarlo · Máx. 15 MB</p>
                    </div>
                  </>
                )}
              </label>
            </div>

            {/* PDF error */}
            {pdfError && (
              <div className="rounded-xl p-4 text-sm flex items-start gap-3"
                style={{ backgroundColor: 'rgba(127,29,29,0.3)', border: '1px solid #b91c1c', color: '#fca5a5' }}>
                <span className="shrink-0 mt-0.5">⚠️</span>
                <span>{pdfError}</span>
              </div>
            )}

            {/* Analysis error */}
            {analysisError && (
              <div className="rounded-xl p-4 text-sm"
                style={{ backgroundColor: 'rgba(127,29,29,0.3)', border: '1px solid #b91c1c', color: '#fca5a5' }}>
                ⚠️ {analysisError}
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setStep(STEPS.QUESTIONS)}
                className="flex-1 font-semibold py-3.5 rounded-2xl transition-all duration-200"
                style={{ border: '1px solid rgba(255,255,255,0.10)', color: '#94a3b8', background: 'rgba(255,255,255,0.03)' }}
              >
                ← Atrás
              </button>
              <button
                disabled={!profileText || analyzing}
                onClick={callGemini}
                className={`flex-[2] font-semibold py-3.5 rounded-2xl transition-all duration-200 text-white ${profileText && !analyzing ? 'btn-glow' : ''}`}
                style={{
                  background: profileText && !analyzing ? 'linear-gradient(135deg,#0077B5,#0ea5e9)' : 'rgba(30,41,59,0.8)',
                  opacity: profileText && !analyzing ? 1 : 0.5,
                  cursor: profileText && !analyzing ? 'pointer' : 'not-allowed',
                  border: profileText && !analyzing ? 'none' : '1px solid rgba(255,255,255,0.06)',
                }}
              >
                {analyzing ? 'Analizando...' : 'Analizar mi perfil ✦'}
              </button>
            </div>
          </div>
        )}

        {/* ── LOADING ── */}
        {step === STEPS.LOADING && (
          <div className="step-transition flex flex-col items-center justify-center min-h-[60vh] space-y-8 text-center">
            <div className="relative w-28 h-28">
              {/* outer glow halo */}
              <div className="absolute inset-0 rounded-full"
                style={{ boxShadow: '0 0 50px rgba(0,119,181,0.25), 0 0 80px rgba(14,165,233,0.1)' }} />
              {/* track */}
              <div className="absolute inset-3 rounded-full"
                style={{ border: '2px solid rgba(255,255,255,0.05)' }} />
              {/* spinner */}
              <div className="absolute inset-3 rounded-full border-2 animate-spin"
                style={{ borderColor: 'rgba(0,119,181,0.3)', borderTopColor: '#0ea5e9' }} />
              {/* inner icon */}
              <div className="absolute inset-0 flex items-center justify-center"
                style={{ color: '#0ea5e9', filter: 'drop-shadow(0 0 6px rgba(14,165,233,0.5))' }}>
                <LinkedInIcon className="w-9 h-9" />
              </div>
            </div>
            <div className="space-y-3 max-w-xs">
              <h2 className="text-2xl font-bold text-white" style={{ letterSpacing: '-0.02em' }}>Analizando tu perfil...</h2>
              <p className="text-slate-400 text-sm leading-relaxed transition-all duration-700">
                {LOADING_MESSAGES[loadingMsgIdx]}
              </p>
            </div>
            <div className="flex gap-2">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-1.5 h-1.5 rounded-full animate-bounce"
                  style={{ backgroundColor: '#0ea5e9', animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        )}

        {/* ── RESULTS ── */}
        {step === STEPS.RESULTS && result && (
          <div className="step-transition space-y-6">
            <Logo />

            {/* Acción prioritaria — destacada arriba */}
            {result.accion_prioritaria && (
              <div className="rounded-2xl p-5"
                style={{ backgroundColor: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.35)' }}>
                <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#f59e0b' }}>
                  ⚡ Acción prioritaria — hacé esto hoy
                </p>
                <p className="text-white text-sm leading-relaxed">{result.accion_prioritaria}</p>
              </div>
            )}

            <ResultCard title="Diagnóstico general">
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                <div className="flex flex-col items-center gap-3">
                  <ScoreRing score={result.puntaje_general} />
                  {result.nivel_seo && (
                    <span className="text-xs font-semibold px-3 py-1 rounded-full"
                      style={{
                        backgroundColor: result.nivel_seo === 'Alto' ? 'rgba(34,197,94,0.12)' : result.nivel_seo === 'Medio' ? 'rgba(0,119,181,0.12)' : 'rgba(245,158,11,0.12)',
                        color: result.nivel_seo === 'Alto' ? '#4ade80' : result.nivel_seo === 'Medio' ? '#38bdf8' : '#f59e0b',
                        border: `1px solid ${result.nivel_seo === 'Alto' ? 'rgba(34,197,94,0.3)' : result.nivel_seo === 'Medio' ? 'rgba(0,119,181,0.3)' : 'rgba(245,158,11,0.3)'}`,
                      }}>
                      SEO: {result.nivel_seo}
                    </span>
                  )}
                </div>
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

            {/* Palabras clave SEO */}
            {result.palabras_clave_sugeridas?.length > 0 && (
              <ResultCard title="Palabras clave para SEO de LinkedIn">
                <div className="flex flex-wrap gap-2">
                  {result.palabras_clave_sugeridas.map((kw, i) => (
                    <span key={i} className="text-xs px-3 py-1.5 rounded-full font-medium"
                      style={{ backgroundColor: 'rgba(0,119,181,0.12)', border: '1px solid rgba(0,119,181,0.3)', color: '#7dd3fc' }}>
                      {kw}
                    </span>
                  ))}
                </div>
                <p className="text-slate-500 text-xs mt-3">Incluí estas palabras en tu titular, resumen y experiencias para aparecer en más búsquedas.</p>
              </ResultCard>
            )}

            <ResultCard title="Titular">
              <BeforeAfter label="Titular" before={result.titular_actual} after={result.titular_propuesto} />
            </ResultCard>

            <ResultCard title="Resumen / About">
              <BeforeAfter label="Resumen" before={result.resumen_actual} after={result.resumen_propuesto} />
            </ResultCard>

            <ResultCard title="Recomendaciones">
              <div className="space-y-4">
                {(result.recomendaciones || []).map((rec, i) => (
                  <div key={i} className="rounded-xl p-4 flex gap-4 items-start"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5"
                      style={{ background: 'linear-gradient(135deg,#0077B5,#0ea5e9)', color: '#fff' }}>
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-white font-semibold text-sm mb-1">{rec.titulo}</p>
                      <p className="text-slate-400 text-sm leading-relaxed">{rec.descripcion}</p>
                    </div>
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
              className="w-full font-semibold py-4 rounded-2xl transition-all duration-200 text-sm"
              style={{ border: '1px solid rgba(255,255,255,0.10)', color: '#94a3b8', background: 'rgba(255,255,255,0.03)' }}
            >
              ↺ Analizar otro perfil
            </button>
          </div>
        )}

      </div>
    </div>
  )
}

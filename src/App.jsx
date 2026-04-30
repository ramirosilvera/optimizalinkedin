import { useState, useEffect, useCallback, useRef } from 'react'
import './index.css'
import { saveAnalisis, saveCvGenerado } from './supabase.js'

const WORKER_URL = import.meta.env.VITE_WORKER_URL

function parseGeminiError(status, body) {
  if (status === 429) return 'Cuota de API agotada. Generá una nueva key en aistudio.google.com/apikey o esperá a que se resetee.'
  if (status === 400) return 'API key inválida o solicitud incorrecta. Revisá la key ingresada.'
  if (status === 403) return 'API key sin permisos. Verificá que esté habilitada en Google AI Studio.'
  return `Error HTTP ${status}: ${body?.error?.message || 'Error desconocido'}`
}

const STEPS = { WELCOME: 0, QUESTIONS: 1, PROFILE_INPUT: 2, LOADING: 3, RESULTS: 4 }
const MAX_QUESTIONS = 9
const MAX_PDF_SIZE = 15 * 1024 * 1024
const MP_URL = 'https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_plan_id=0922af414b854dabb5942e3291b2b5cb'

const INITIAL_QUESTION = {
  question: '¿Cuál es tu situación profesional actual?',
  options: [
    'Empleado/a en relación de dependencia buscando nuevo trabajo',
    'Freelancer o consultor/a independiente buscando más clientes',
    'Emprendedor/a o dueño/a de negocio buscando visibilidad',
    'Profesional buscando crecer o ascender en mi empresa actual',
    'En transición de carrera o reingresando al mercado laboral',
  ],
}

const LOADING_MESSAGES = [
  'Los reclutadores pasan apenas 6 segundos en el primer vistazo de un perfil...',
  'El 87% de los reclutadores usa LinkedIn para encontrar candidatos activamente...',
  'Los perfiles con foto reciben 21× más visitas que los que no la tienen...',
  'Un titular optimizado puede triplicar tus apariciones en búsquedas de reclutadores...',
  'El resumen es el único espacio donde podés hablarle directamente a tu audiencia ideal...',
  'Los perfiles con habilidades validadas tienen 17× más chances de ser vistos por reclutadores...',
  'Perfiles con logros concretos y métricas generan 40% más solicitudes de conexión...',
]

const QUESTION_SYSTEM_PROMPT = `Sos una consultora senior de RRHH y headhunter con 20 años de experiencia en selección ejecutiva, employer branding y posicionamiento profesional.
Tu tarea es hacer preguntas estratégicas de múltiple choice para construir un perfil completo del usuario y poder optimizar su LinkedIn con precisión quirúrgica.
Usá una metodología de embudo: comenzá con situación general → nivel de seniority → industria/rubro → audiencia objetivo → diferenciadores únicos → logros concretos.
Reglas:
- Cada pregunta debe tener entre 4 y 6 opciones concretas y relevantes
- Las opciones deben cubrir los casos más comunes sin ser genéricas
- Adaptá cada pregunta al contexto de las respuestas anteriores (si alguien busca empleo en tech, preguntale sobre stack, seniority, tipo de empresa target; si es freelancer, preguntale sobre nicho y tipo de cliente ideal)
- Después de 5 respuestas podés evaluar si ya tenés suficiente info. Con 8 respuestas siempre terminá.
- Cuando tengas suficiente información para hacer una optimización completa y personalizada del perfil, respondé con done true
- Respondé SIEMPRE en español rioplatense (Argentina)
- Respondé SOLO en JSON válido, sin markdown, sin backticks`

const ANALYSIS_SYSTEM_PROMPT = `Sos una consultora senior de RRHH y headhunter con 20 años de experiencia en selección ejecutiva y posicionamiento profesional en LinkedIn.
Tu tarea es analizar el perfil de LinkedIn de un profesional y generar una evaluación estratégica con estándares de headhunter.
Aplicá estos frameworks en tu análisis:
- Test de 6 segundos: ¿el titular y la foto comunican quién es y para quién es relevante en menos de 6 segundos?
- SEO de LinkedIn: ¿aparecerá en las búsquedas correctas de reclutadores y potenciales clientes?
- Compliance ATS: ¿el perfil pasará los filtros automáticos de los sistemas de tracking de candidatos?
- Propuesta de valor: ¿está claro qué problema resuelve este profesional y para quién específicamente?
- Prueba social: ¿hay métricas, logros concretos, recomendaciones o validaciones externas?
- CTA: ¿hay una llamada a la acción clara para el visitante ideal del perfil?
Si se adjunta una imagen de perfil, analizála con estos criterios: fondo (sólido/profesional vs. distractivo), iluminación (natural frontal vs. contraluz/sombras), encuadre (desde hombros hacia arriba vs. cuerpo entero o mal recortado), expresión (cálida/profesional vs. seria/distante), vestimenta (acorde al sector). Sé específica y accionable en las recomendaciones de foto.
Respondé siempre en español rioplatense (Argentina).
No usés lenguaje genérico ni de autoayuda.
Sé directa, específica y orientada a resultados medibles.
Respondé SOLO en JSON válido, sin markdown, sin backticks.`

const CV_SYSTEM_PROMPT = `Sos un experto redactor de CVs para el mercado laboral argentino y latinoamericano, con experiencia en selección ejecutiva y compliance ATS.
Tu tarea es transformar un perfil de LinkedIn en un CV de 1 página moderno, conciso y orientado a logros.

Reglas estrictas:
- Máximo 3 experiencias laborales (las más recientes y relevantes)
- Máximo 3 bullets por experiencia, comenzando con verbo de acción, con métricas cuando existan
- Resumen profesional de máximo 2 oraciones, impactante y orientado a valor
- Sin objetivo laboral (está desactualizado)
- Sin foto, sin estado civil, sin fecha de nacimiento
- Habilidades: entre 6 y 10 keywords relevantes al rol
- Todo en español (excepto términos técnicos que se usan en inglés en la industria)

Usá las secciones "titular_propuesto" y "resumen_propuesto" del análisis previo si están disponibles.
Extraé las experiencias y educación del texto del perfil.
Respondé SOLO en JSON válido, sin markdown, sin backticks.`

async function fetchNextQuestion(history) {
  if (!WORKER_URL) throw new Error('Worker URL no configurada. Verificá el secret VITE_WORKER_URL en GitHub.')

  const historyText = history
    .map((h, i) => `${i + 1}. ${h.question}\n   → ${h.answer}`)
    .join('\n\n')

  const prompt = history.length < 5
    ? `Respuestas del usuario hasta ahora:\n${historyText}\n\n¿Cuál es la siguiente pregunta más importante para entender su contexto y optimizar su perfil?\n\nRespondé en este formato JSON:\n{"done": false, "question": "la pregunta", "options": ["opción 1", "opción 2", "opción 3", "opción 4"]}`
    : `Respuestas del usuario hasta ahora:\n${historyText}\n\n¿Ya tenés suficiente información para hacer una optimización completa del perfil, o necesitás hacer una pregunta más?\n\nSi necesitás más info:\n{"done": false, "question": "la pregunta", "options": ["opción 1", "opción 2", "opción 3", "opción 4"]}\n\nSi ya tenés suficiente:\n{"done": true}`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30000)
  try {
    const res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
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
  } catch (err) {
    throw err.name === 'AbortError' ? new Error('La red tardó demasiado. Intentá de nuevo.') : err
  } finally {
    clearTimeout(timeoutId)
  }
}


function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
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
  const lastAnswerRef = useRef(null)

  // Dynamic Q&A
  const [qaHistory, setQaHistory] = useState([])
  const [currentQ, setCurrentQ] = useState(INITIAL_QUESTION)
  const [selectedOption, setSelectedOption] = useState(null)
  const [qLoading, setQLoading] = useState(false)
  const [qError, setQError] = useState('')

  // Profile input
  const [profileText, setProfileText] = useState('')
  const [pdfFileName, setPdfFileName] = useState('')
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfError, setPdfError] = useState('')
  const [instrTab, setInstrTab] = useState('desktop')
  const [isDragging, setIsDragging] = useState(false)
  const [inputMode, setInputMode] = useState('pdf')
  const [formNombre, setFormNombre] = useState('')
  const [formTitular, setFormTitular] = useState('')
  const [formResumen, setFormResumen] = useState('')
  const [formHabilidades, setFormHabilidades] = useState('')
  const [formExps, setFormExps] = useState([{ cargo: '', empresa: '', periodo: '', descripcion: '' }])
  const [formEdus, setFormEdus] = useState([{ titulo: '', institucion: '', periodo: '' }])
  const [photoBase64, setPhotoBase64] = useState('')
  const [photoMimeType, setPhotoMimeType] = useState('')
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState('')
  const [photoError, setPhotoError] = useState('')

  // Results
  const [result, setResult] = useState(null)
  const [analysisError, setAnalysisError] = useState('')
  const [cvLoading, setCvLoading] = useState(false)
  const [cvError, setCvError] = useState('')
  const [cvSuccess, setCvSuccess] = useState('')
  const [showCvModal, setShowCvModal] = useState(false)
  const [showContactForm, setShowContactForm] = useState(false)
  const [contactEmail, setContactEmail] = useState('')
  const [contactTelefono, setContactTelefono] = useState('')
  const [contactLinkedin, setContactLinkedin] = useState('')
  const [pendingWithSupport, setPendingWithSupport] = useState(false)
  const [analisisId, setAnalisisId] = useState(null)
  const [saveEmailValue, setSaveEmailValue] = useState('')
  const [savingAnalisis, setSavingAnalisis] = useState(false)
  const [analisisSaved, setAnalisisSaved] = useState(false)

  // Loading message rotation
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0)
  useEffect(() => {
    if (step !== STEPS.LOADING) return
    const id = setInterval(() => setLoadingMsgIdx(i => (i + 1) % LOADING_MESSAGES.length), 3500)
    return () => clearInterval(id)
  }, [step])

  const reset = () => {
    setStep(STEPS.WELCOME)
    setQaHistory([])
    setCurrentQ(INITIAL_QUESTION)
    setSelectedOption(null)
    setQLoading(false)
    setQError('')
    setProfileText('')
    setPdfFileName('')
    setPdfLoading(false)
    setPdfError('')
    setInstrTab('desktop')
    setIsDragging(false)
    setResult(null)
    setAnalysisError('')
    setLoadingMsgIdx(0)
    setCvLoading(false)
    setCvError('')
    setCvSuccess('')
    setShowCvModal(false)
    setShowContactForm(false)
    setContactEmail('')
    setContactTelefono('')
    setContactLinkedin('')
    setPendingWithSupport(false)
    setAnalisisId(null)
    setSaveEmailValue('')
    setSavingAnalisis(false)
    setAnalisisSaved(false)
    setInputMode('pdf')
    setFormNombre('')
    setFormTitular('')
    setFormResumen('')
    setFormHabilidades('')
    setFormExps([{ cargo: '', empresa: '', periodo: '', descripcion: '' }])
    setFormEdus([{ titulo: '', institucion: '', periodo: '' }])
    setPhotoBase64('')
    setPhotoMimeType('')
    setPhotoPreviewUrl('')
    setPhotoError('')
  }

  // ── Answer a question and fetch next ──
  const handleAnswer = async (answer) => {
    if (qLoading) return
    lastAnswerRef.current = answer
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
      const next = await fetchNextQuestion(newHistory)
      if (next.done) {
        setStep(STEPS.PROFILE_INPUT)
      } else {
        setCurrentQ({ question: next.question, options: next.options })
        setSelectedOption(null)
      }
    } catch (err) {
      setQError(err.message || 'No se pudo cargar la siguiente pregunta. Intentá de nuevo.')
      setQaHistory(prev => prev.slice(0, -1))
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
      const pdfController = new AbortController()
      const pdfTimeoutId = setTimeout(() => pdfController.abort(), 45000)
      let res
      try {
        res = await fetch(WORKER_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          signal: pdfController.signal,
          body: JSON.stringify({
            contents: [{
              parts: [
                { inline_data: { mime_type: 'application/pdf', data: base64 } },
                { text: 'Extraé todo el contenido de texto de este perfil de LinkedIn en PDF. Incluí el titular, resumen/about, toda la experiencia laboral con fechas y descripciones, educación, skills, certificaciones, voluntariado y cualquier otra sección del perfil. Devolvé solo el texto extraído, organizado claramente.' },
              ],
            }],
            generationConfig: { maxOutputTokens: 3000 },
          }),
        })
      } catch (err) {
        throw err.name === 'AbortError' ? new Error('La extracción del PDF tardó demasiado. Intentá de nuevo.') : err
      } finally {
        clearTimeout(pdfTimeoutId)
      }
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

  // ── Cambiar modo de ingreso (PDF / manual) ──
  const handleModeSwitch = (mode) => {
    setInputMode(mode)
    setProfileText('')
    setPdfError('')
    setPdfFileName('')
  }

  // ── Upload de foto de perfil ──
  const handlePhotoUpload = (file) => {
    setPhotoError('')
    if (!file) return
    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowed.includes(file.type)) {
      setPhotoError('Formato no válido. Usá JPG, PNG o WEBP.')
      return
    }
    if (file.size > 4 * 1024 * 1024) {
      setPhotoError('La imagen es muy grande. Máximo 4 MB.')
      return
    }
    const reader = new FileReader()
    reader.onload = (ev) => {
      const dataUrl = ev.target.result
      setPhotoMimeType(file.type)
      setPhotoBase64(dataUrl.split(',')[1])
      setPhotoPreviewUrl(dataUrl)
    }
    reader.readAsDataURL(file)
  }

  // ── Construir profileText desde el formulario manual ──
  const buildAndSetProfileText = () => {
    const expsText = formExps
      .filter(e => e.cargo.trim() || e.empresa.trim())
      .map(e => [
        [e.cargo.trim(), e.empresa.trim(), e.periodo.trim()].filter(Boolean).join(' | '),
        e.descripcion.trim(),
      ].filter(Boolean).join('\n'))
      .join('\n\n')

    const edusText = formEdus
      .filter(e => e.titulo.trim() || e.institucion.trim())
      .map(e => [e.titulo.trim(), e.institucion.trim(), e.periodo.trim()].filter(Boolean).join(' | '))
      .join('\n')

    const parts = [
      formNombre.trim()      && `NOMBRE: ${formNombre.trim()}`,
      formTitular.trim()     && `TITULAR:\n${formTitular.trim()}`,
      formResumen.trim()     && `RESUMEN / ABOUT:\n${formResumen.trim()}`,
      expsText               && `EXPERIENCIA LABORAL:\n${expsText}`,
      edusText               && `EDUCACIÓN:\n${edusText}`,
      formHabilidades.trim() && `HABILIDADES:\n${formHabilidades.trim()}`,
    ].filter(Boolean)

    setProfileText(parts.join('\n\n'))
    setPdfError('')
  }

  // ── Guardar análisis en Supabase ──
  const handleSaveAnalisis = async (email, consentimiento) => {
    if (!result || savingAnalisis) return
    setSavingAnalisis(true)
    const { id } = await saveAnalisis({
      email,
      analisis: { ...result, _fotoAnalizada: !!photoBase64 },
      inputMode,
      qaContexto: qaHistory,
      consentimiento,
    })
    if (id) {
      setAnalisisId(id)
      setAnalisisSaved(true)
      setSaveEmailValue(email)
    }
    setSavingAnalisis(false)
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

${photoBase64 ? 'Se adjunta la foto de perfil actual. Analizala y completá el campo foto_recomendacion con observaciones concretas.' : 'No se adjuntó foto de perfil. El campo foto_recomendacion debe ser null.'}

Generá un análisis en este formato JSON exacto:
{
  "nombre_completo": "nombre y apellido del profesional extraídos del perfil",
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
    {"titulo": "nombre de la recomendación", "descripcion": "explicación concreta de qué cambiar y cómo, con ejemplos si aplica"}
  ],
  "estrategia_contenido": "sugerencia de 2-3 oraciones sobre qué tipo de contenido publicar para lograr el objetivo declarado",
  "foto_recomendacion": "recomendación concreta sobre la foto de perfil analizada, o null si no se adjuntó foto"
}`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 60000)
    try {
      if (!WORKER_URL) throw new Error('Worker URL no configurada. Verificá el secret VITE_WORKER_URL en GitHub.')
      const res = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          system_instruction: { parts: [{ text: ANALYSIS_SYSTEM_PROMPT }] },
          contents: [{
            parts: [
              ...(photoBase64 ? [{ inline_data: { mime_type: photoMimeType, data: photoBase64 } }] : []),
              { text: userPrompt },
            ],
          }],
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
      const msg = err.name === 'AbortError' ? 'El análisis tardó demasiado. Intentá de nuevo.' : err.message || 'Error al conectar con Gemini.'
      setAnalysisError(msg)
      setStep(STEPS.PROFILE_INPUT)
    } finally {
      clearTimeout(timeoutId)
    }
  }

  // ── Generar CV de 1 página ──
  const callGenerateCV = async (contacto = {}) => {
    if (cvLoading) return
    setCvLoading(true)
    setCvError('')
    setCvSuccess('')

    const nombre = result?.nombre_completo || ''
    const titular = result?.titular_propuesto || result?.titular_actual || ''
    const resumen = result?.resumen_propuesto || ''
    const keywords = (result?.palabras_clave_sugeridas || []).join(', ')

    let userPrompt = `Generá el CV en JSON usando esta información del profesional.\n\n`
    userPrompt += `Nombre: ${nombre}\n`
    userPrompt += `Titular propuesto: ${titular}\n`
    userPrompt += `Resumen propuesto: ${resumen}\n`
    userPrompt += `Keywords sugeridas: ${keywords}\n\n`
    if (contacto.email)       userPrompt += `Email de contacto: ${contacto.email}\n`
    if (contacto.telefono)    userPrompt += `Teléfono: ${contacto.telefono}\n`
    if (contacto.linkedinUrl) userPrompt += `URL LinkedIn: ${contacto.linkedinUrl}\n`
    userPrompt += `\nTexto completo del perfil LinkedIn (extraé experiencias y educación):\n${profileText.slice(0, 5000)}\n\n`
    userPrompt += `Usá el email, teléfono y URL de LinkedIn proporcionados arriba. No los inventes si no se dieron (poné null).
Respondé con este JSON exacto:
{
  "nombre": "string",
  "titular": "string",
  "email": "string o null",
  "telefono": "string o null",
  "linkedin": "string o null",
  "ubicacion": "string o null",
  "resumen": "string (2 oraciones máx)",
  "experiencias": [
    { "cargo": "string", "empresa": "string", "periodo": "string", "logros": ["string"] }
  ],
  "educacion": [
    { "titulo": "string", "institucion": "string", "periodo": "string" }
  ],
  "habilidades": ["string"],
  "idiomas": ["string"]
}`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 58000)
    try {
      if (!WORKER_URL) throw new Error('Worker URL no configurada.')
      const res = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          system_instruction: { parts: [{ text: CV_SYSTEM_PROMPT }] },
          contents: [{ parts: [{ text: userPrompt }] }],
          generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 2000 },
        }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error(parseGeminiError(res.status, e))
      }
      const data = await res.json()
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
      const cv = JSON.parse(text)
      downloadCvHtml(cv)
      saveCvGenerado({ analisisId, contacto, cv, conApoyoMercadoPago: pendingWithSupport }).catch(() => {})
    } catch (err) {
      const msg = err.name === 'AbortError' ? 'El pedido tardó demasiado. Intentá de nuevo.' : err.message || 'No se pudo generar el CV.'
      setCvError(msg)
    } finally {
      clearTimeout(timeoutId)
      setCvLoading(false)
    }
  }

  function downloadCvHtml(cv) {
    const html = buildCvHtml(cv)
    const blob = new Blob([html], { type: 'text/html; charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const filename = cv.nombre
      ? `CV-${cv.nombre.replace(/[^a-zA-ZÀ-ÿ0-9 ]/g, '').replace(/\s+/g, '-')}.html`
      : 'CV.html'
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 30000)
    setCvSuccess(filename)
  }

  function buildCvHtml(cv) {
    const e = escapeHtml
    const contact = [cv.email, cv.telefono, cv.linkedin, cv.ubicacion].filter(Boolean).map(e).join(' · ')
    const expHtml = (cv.experiencias || []).map(ex => `
      <div class="exp-item">
        <div class="exp-header">
          <span class="exp-role">${e(ex.cargo)}</span>
          <span class="exp-period">${e(ex.periodo)}</span>
        </div>
        <div class="exp-company">${e(ex.empresa)}</div>
        <ul class="exp-bullets">${(ex.logros || []).map(l => `<li>${e(l)}</li>`).join('')}</ul>
      </div>`).join('')
    const eduHtml = (cv.educacion || []).map(ed => `
      <div class="edu-row">
        <div><div class="edu-title">${e(ed.titulo)}</div><div class="edu-inst">${e(ed.institucion)}</div></div>
        <div class="edu-period">${e(ed.periodo)}</div>
      </div>`).join('')
    const skillsHtml = (cv.habilidades || []).map(s => `<span class="skill">${e(s)}</span>`).join('')
    const idiomasHtml = cv.idiomas?.length
      ? `<div class="section"><div class="section-title">Idiomas</div><p>${cv.idiomas.map(e).join(' · ')}</p></div>`
      : ''

    return `<!DOCTYPE html><html lang="es"><head>
<meta charset="UTF-8">
<title>CV – ${e(cv.nombre)}</title>
<style>
  @page { size: A4; margin: 14mm 16mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 9.5pt; color: #111827; line-height: 1.45; }
  .header { border-bottom: 2px solid #0077B5; padding-bottom: 8px; margin-bottom: 12px; }
  .name { font-size: 19pt; font-weight: 700; color: #0077B5; }
  .title { font-size: 10pt; color: #374151; margin-top: 2px; }
  .contact { font-size: 8pt; color: #6B7280; margin-top: 3px; }
  .section { margin-bottom: 11px; }
  .section-title { font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.7px;
    color: #0077B5; border-bottom: 0.5px solid #BFDBFE; padding-bottom: 2px; margin-bottom: 6px; }
  .exp-item { margin-bottom: 7px; }
  .exp-header { display: flex; justify-content: space-between; }
  .exp-role { font-size: 9.5pt; font-weight: 700; }
  .exp-period { font-size: 8pt; color: #6B7280; }
  .exp-company { font-size: 8.5pt; color: #374151; font-style: italic; margin-bottom: 3px; }
  .exp-bullets { margin: 3px 0 0 14px; padding: 0; }
  .exp-bullets li { font-size: 8.5pt; color: #374151; margin-bottom: 1.5px; }
  .edu-row { display: flex; justify-content: space-between; margin-bottom: 4px; }
  .edu-title { font-size: 9pt; font-weight: 600; }
  .edu-inst { font-size: 8pt; color: #374151; font-style: italic; }
  .edu-period { font-size: 8pt; color: #6B7280; }
  .skills { display: flex; flex-wrap: wrap; gap: 4px; }
  .skill { background: #EFF6FF; color: #1D4ED8; font-size: 7.5pt;
    padding: 2px 7px; border-radius: 3px; border: 0.5px solid #BFDBFE; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head><body>
<div class="header">
  <div class="name">${e(cv.nombre)}</div>
  <div class="title">${e(cv.titular)}</div>
  ${contact ? `<div class="contact">${contact}</div>` : ''}
</div>
${cv.resumen ? `<div class="section"><div class="section-title">Resumen Profesional</div><p>${e(cv.resumen)}</p></div>` : ''}
${expHtml ? `<div class="section"><div class="section-title">Experiencia</div>${expHtml}</div>` : ''}
${eduHtml ? `<div class="section"><div class="section-title">Educación</div>${eduHtml}</div>` : ''}
${skillsHtml ? `<div class="section"><div class="section-title">Habilidades</div><div class="skills">${skillsHtml}</div></div>` : ''}
${idiomasHtml}
</body></html>`
  }

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
                Respondé algunas preguntas, descargá el PDF de tu perfil y recibí un análisis estratégico con criterio de headhunter.
              </p>
            </div>
            <div className="text-left space-y-4">
              <h2 className="text-base font-semibold text-slate-300 text-center">¿Qué incluye tu análisis?</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  {
                    icon: '🎯',
                    title: 'Diagnóstico con criterio de headhunter',
                    desc: 'Puntaje general del perfil y evaluación estratégica del primer impacto en reclutadores.',
                  },
                  {
                    icon: '🔍',
                    title: 'SEO de LinkedIn',
                    desc: 'Palabras clave sugeridas para aparecer en búsquedas reales de reclutadores y clientes.',
                  },
                  {
                    icon: '✏️',
                    title: 'Titular y resumen reescritos',
                    desc: 'Versión mejorada del titular y del About con propuesta de valor clara y llamada a la acción.',
                  },
                  {
                    icon: '📋',
                    title: 'Recomendaciones accionables',
                    desc: 'Lista priorizada de cambios concretos que podés implementar hoy.',
                  },
                  {
                    icon: '📄',
                    title: 'CV de 1 página',
                    desc: 'CV moderno, ATS-compatible y orientado a logros, listo para descargar como PDF.',
                  },
                  {
                    icon: '📣',
                    title: 'Estrategia de contenido',
                    desc: 'Qué publicar en LinkedIn según tu objetivo profesional para aumentar tu visibilidad.',
                  },
                  {
                    icon: '🎙️',
                    title: 'Simulador de entrevista con IA',
                    desc: 'Practicá una entrevista inicial y recibí feedback detallado con criterio de RRHH.',
                  },
                ].map(item => (
                  <div key={item.title} className="flex items-start gap-3 rounded-xl p-4"
                    style={{ backgroundColor: 'rgba(30,41,59,0.5)', border: '1px solid #334155' }}>
                    <span className="text-xl shrink-0 mt-0.5">{item.icon}</span>
                    <div>
                      <p className="text-white text-sm font-semibold leading-snug">{item.title}</p>
                      <p className="text-slate-400 text-xs mt-1 leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <button
              onClick={() => setStep(STEPS.QUESTIONS)}
              className="w-full text-white font-semibold py-4 px-8 rounded-xl transition-all duration-200 text-base"
              style={{ backgroundColor: '#0077B5' }}
            >
              Empezar →
            </button>
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
                <span className="text-slate-500 hidden sm:inline">La IA adapta las preguntas a tus respuestas</span>
                <span className="text-slate-500 sm:hidden">Adaptada por IA</span>
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
                <button
                  onClick={() => { setQError(''); if (lastAnswerRef.current) handleAnswer(lastAnswerRef.current) }}
                  className="text-xs font-semibold underline shrink-0"
                >
                  Reintentar
                </button>
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
          <div className="step-transition space-y-5">
            <Logo />
            <div>
              <p className="text-slate-500 text-sm mb-1">Último paso</p>
              <h2 className="text-2xl sm:text-3xl font-bold text-white">Ingresá tu perfil de LinkedIn</h2>
            </div>

            {/* Toggle PDF / Manual */}
            <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid #334155' }}>
              {[
                { id: 'pdf', label: '📄 Subir PDF' },
                { id: 'form', label: '✏️ Ingresar manualmente' },
              ].map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => handleModeSwitch(id)}
                  className="flex-1 py-2.5 text-xs font-semibold transition-all duration-200"
                  style={inputMode === id
                    ? { backgroundColor: '#0077B5', color: '#fff' }
                    : { color: '#64748b' }
                  }
                >
                  {label}
                </button>
              ))}
            </div>

            {/* ── Modo PDF ── */}
            {inputMode === 'pdf' && (<>

              {/* Por qué PDF */}
              <div className="rounded-xl p-4 text-sm"
                style={{ backgroundColor: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.25)' }}>
                <p className="text-amber-400 font-semibold text-xs uppercase tracking-wide mb-2">¿Por qué PDF?</p>
                <p className="text-slate-300 leading-relaxed">
                  LinkedIn bloquea el acceso a perfiles desde apps externas.
                  La forma más simple es descargar tu propio perfil como PDF directamente desde LinkedIn.
                </p>
              </div>

              {/* Instrucciones desktop / celular */}
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #334155' }}>
                <div className="flex" style={{ backgroundColor: 'rgba(15,23,42,0.8)' }}>
                  {[{ id: 'desktop', label: '🖥️  Computadora' }, { id: 'mobile', label: '📱  Celular' }].map(tab => (
                    <button key={tab.id} onClick={() => setInstrTab(tab.id)}
                      className="flex-1 py-2.5 text-xs font-semibold transition-all duration-200"
                      style={instrTab === tab.id ? { backgroundColor: '#0077B5', color: '#fff' } : { color: '#64748b' }}>
                      {tab.label}
                    </button>
                  ))}
                </div>
                <div className="p-5 space-y-3" style={{ backgroundColor: 'rgba(30,41,59,0.7)' }}>
                  <ol className="space-y-2.5">
                    {(instrTab === 'desktop' ? [
                      'Abrí linkedin.com en tu navegador e iniciá sesión',
                      'Hacé clic en tu foto de perfil (arriba a la derecha) → "Ver perfil"',
                      'Hacé clic en "Más" (debajo de tu foto) → "Guardar como PDF"',
                      'El PDF se descarga automáticamente — buscalo en Descargas',
                      'Volvé acá y arrastrá el archivo o hacé clic para subirlo ↓',
                    ] : [
                      'Abrí la app de LinkedIn e iniciá sesión',
                      'Tocá tu foto de perfil (arriba a la izquierda)',
                      'Tocá los tres puntos (...) arriba a la derecha → "Guardar como PDF"',
                      'Si no ves esa opción: usá linkedin.com en Chrome o Safari',
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

              {/* Upload area */}
              <div>
                <input type="file" accept="application/pdf" id="pdf-upload" className="hidden" onChange={handlePdfUpload} />
                <label
                  htmlFor="pdf-upload"
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className="flex flex-col items-center justify-center gap-3 w-full py-8 px-6 rounded-xl border-2 border-dashed cursor-pointer transition-all duration-200"
                  style={{
                    borderColor: profileText ? '#22c55e' : isDragging ? '#0a91d4' : pdfLoading ? '#0077B5' : '#475569',
                    backgroundColor: profileText ? 'rgba(34,197,94,0.05)' : isDragging ? 'rgba(0,119,181,0.08)' : 'rgba(30,41,59,0.4)',
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
                        <p className="text-slate-400 text-xs mt-1">Perfil extraído · Hacé clic para cambiar el archivo</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="text-3xl">{isDragging ? '📂' : '📄'}</span>
                      <div className="text-center">
                        <p className="text-white font-semibold text-sm">{isDragging ? 'Soltá el PDF acá' : 'Subir PDF de LinkedIn'}</p>
                        <p className="text-slate-400 text-xs mt-1">Arrastrá el archivo o hacé clic · Máx. 15 MB</p>
                      </div>
                    </>
                  )}
                </label>
              </div>

              {pdfError && (
                <div className="rounded-xl p-4 text-sm flex items-start gap-3"
                  style={{ backgroundColor: 'rgba(127,29,29,0.3)', border: '1px solid #b91c1c', color: '#fca5a5' }}>
                  <span className="shrink-0 mt-0.5">⚠️</span><span>{pdfError}</span>
                </div>
              )}
            </>)}

            {/* ── Modo manual ── */}
            {inputMode === 'form' && (
              <div className="space-y-4">

                {/* Nombre */}
                <div>
                  <label className="text-xs text-slate-400 block mb-1.5">Nombre completo <span className="text-slate-600">(opcional — para el CV)</span></label>
                  <input value={formNombre} onChange={e => setFormNombre(e.target.value)}
                    placeholder="Ej: María González"
                    className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none"
                    style={{ background: 'rgba(30,41,59,0.8)', border: '1px solid #334155' }} />
                </div>

                {/* Titular */}
                <div>
                  <label className="text-xs text-slate-400 block mb-1.5">Titular de LinkedIn <span className="text-red-400">*</span></label>
                  <input value={formTitular} onChange={e => setFormTitular(e.target.value)}
                    placeholder="Ej: Product Manager | Fintech | 5+ años liderando equipos"
                    className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none"
                    style={{ background: 'rgba(30,41,59,0.8)', border: `1px solid ${formTitular.trim() ? 'rgba(0,119,181,0.5)' : '#334155'}` }} />
                </div>

                {/* Resumen */}
                <div>
                  <label className="text-xs text-slate-400 block mb-1.5">Resumen / About</label>
                  <textarea value={formResumen} onChange={e => setFormResumen(e.target.value)}
                    placeholder="Copiá y pegá tu sección 'Acerca de' de LinkedIn..."
                    rows={4}
                    className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none resize-none"
                    style={{ background: 'rgba(30,41,59,0.8)', border: '1px solid #334155' }} />
                </div>

                {/* Experiencias */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs text-slate-400">Experiencia laboral</label>
                    {formExps.length < 4 && (
                      <button
                        onClick={() => setFormExps(prev => [...prev, { cargo: '', empresa: '', periodo: '', descripcion: '' }])}
                        className="text-xs font-semibold transition-colors"
                        style={{ color: '#0077B5' }}
                      >
                        + Agregar
                      </button>
                    )}
                  </div>
                  <div className="space-y-3">
                    {formExps.map((exp, i) => (
                      <div key={i} className="rounded-xl p-4 space-y-2.5"
                        style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid #334155' }}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-500 font-medium">Experiencia {i + 1}</span>
                          {formExps.length > 1 && (
                            <button
                              onClick={() => setFormExps(prev => prev.filter((_, idx) => idx !== i))}
                              className="text-xs text-slate-600 hover:text-red-400 transition-colors"
                            >
                              Eliminar
                            </button>
                          )}
                        </div>
                        <input value={exp.cargo}
                          onChange={e => setFormExps(prev => prev.map((x, idx) => idx === i ? { ...x, cargo: e.target.value } : x))}
                          placeholder="Cargo / Rol"
                          className="w-full rounded-lg px-3 py-2.5 text-sm text-white outline-none"
                          style={{ background: 'rgba(30,41,59,0.8)', border: '1px solid #334155' }} />
                        <div className="grid grid-cols-2 gap-2">
                          <input value={exp.empresa}
                            onChange={e => setFormExps(prev => prev.map((x, idx) => idx === i ? { ...x, empresa: e.target.value } : x))}
                            placeholder="Empresa"
                            className="rounded-lg px-3 py-2.5 text-sm text-white outline-none"
                            style={{ background: 'rgba(30,41,59,0.8)', border: '1px solid #334155' }} />
                          <input value={exp.periodo}
                            onChange={e => setFormExps(prev => prev.map((x, idx) => idx === i ? { ...x, periodo: e.target.value } : x))}
                            placeholder="Período (ej: 2021–hoy)"
                            className="rounded-lg px-3 py-2.5 text-sm text-white outline-none"
                            style={{ background: 'rgba(30,41,59,0.8)', border: '1px solid #334155' }} />
                        </div>
                        <textarea value={exp.descripcion}
                          onChange={e => setFormExps(prev => prev.map((x, idx) => idx === i ? { ...x, descripcion: e.target.value } : x))}
                          placeholder="Descripción, logros, responsabilidades..."
                          rows={3}
                          className="w-full rounded-lg px-3 py-2.5 text-sm text-white outline-none resize-none"
                          style={{ background: 'rgba(30,41,59,0.8)', border: '1px solid #334155' }} />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Educación */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs text-slate-400">Educación</label>
                    {formEdus.length < 4 && (
                      <button
                        onClick={() => setFormEdus(prev => [...prev, { titulo: '', institucion: '', periodo: '' }])}
                        className="text-xs font-semibold transition-colors"
                        style={{ color: '#0077B5' }}
                      >
                        + Agregar
                      </button>
                    )}
                  </div>
                  <div className="space-y-3">
                    {formEdus.map((edu, i) => (
                      <div key={i} className="rounded-xl p-4 space-y-2.5"
                        style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid #334155' }}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-500 font-medium">Educación {i + 1}</span>
                          {formEdus.length > 1 && (
                            <button
                              onClick={() => setFormEdus(prev => prev.filter((_, idx) => idx !== i))}
                              className="text-xs text-slate-600 hover:text-red-400 transition-colors"
                            >
                              Eliminar
                            </button>
                          )}
                        </div>
                        <input value={edu.titulo}
                          onChange={e => setFormEdus(prev => prev.map((x, idx) => idx === i ? { ...x, titulo: e.target.value } : x))}
                          placeholder="Título / Carrera"
                          className="w-full rounded-lg px-3 py-2.5 text-sm text-white outline-none"
                          style={{ background: 'rgba(30,41,59,0.8)', border: '1px solid #334155' }} />
                        <div className="grid grid-cols-2 gap-2">
                          <input value={edu.institucion}
                            onChange={e => setFormEdus(prev => prev.map((x, idx) => idx === i ? { ...x, institucion: e.target.value } : x))}
                            placeholder="Institución"
                            className="rounded-lg px-3 py-2.5 text-sm text-white outline-none"
                            style={{ background: 'rgba(30,41,59,0.8)', border: '1px solid #334155' }} />
                          <input value={edu.periodo}
                            onChange={e => setFormEdus(prev => prev.map((x, idx) => idx === i ? { ...x, periodo: e.target.value } : x))}
                            placeholder="Período (ej: 2018–2022)"
                            className="rounded-lg px-3 py-2.5 text-sm text-white outline-none"
                            style={{ background: 'rgba(30,41,59,0.8)', border: '1px solid #334155' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Habilidades */}
                <div>
                  <label className="text-xs text-slate-400 block mb-1.5">Habilidades / Skills</label>
                  <input value={formHabilidades} onChange={e => setFormHabilidades(e.target.value)}
                    placeholder="Ej: Product Management, Agile, SQL, Figma, Growth..."
                    className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none"
                    style={{ background: 'rgba(30,41,59,0.8)', border: '1px solid #334155' }} />
                </div>

                {/* Confirmar / estado listo */}
                {!profileText ? (
                  <button
                    onClick={buildAndSetProfileText}
                    disabled={!formTitular.trim()}
                    className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all"
                    style={{
                      background: formTitular.trim() ? '#0077B5' : '#334155',
                      opacity: formTitular.trim() ? 1 : 0.5,
                      cursor: formTitular.trim() ? 'pointer' : 'not-allowed',
                    }}
                  >
                    Usar estos datos →
                  </button>
                ) : (
                  <div className="rounded-xl p-4 flex items-center justify-between gap-3"
                    style={{ backgroundColor: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.3)' }}>
                    <div className="flex items-center gap-2">
                      <span>✅</span>
                      <p className="text-green-400 text-sm font-semibold">Datos del perfil listos</p>
                    </div>
                    <button onClick={() => setProfileText('')} className="text-slate-500 text-xs underline hover:text-slate-300 transition-colors">
                      Editar
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── Foto de perfil (opcional, independiente del modo) ── */}
            <div className="rounded-2xl p-5 space-y-3"
              style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid #334155' }}>
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-white">
                  Foto de perfil <span className="text-slate-500 font-normal text-xs">(opcional)</span>
                </label>
                {photoPreviewUrl && (
                  <button
                    onClick={() => { setPhotoBase64(''); setPhotoMimeType(''); setPhotoPreviewUrl(''); setPhotoError('') }}
                    className="text-xs text-slate-500 hover:text-red-400 transition-colors"
                  >
                    Quitar
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Subila para recibir recomendaciones sobre tu imagen profesional. JPG, PNG o WEBP · máx 4 MB.
              </p>
              {!photoPreviewUrl ? (
                <label
                  className="flex flex-col items-center justify-center gap-2 rounded-xl py-6 cursor-pointer border-2 border-dashed transition-colors"
                  style={{ borderColor: '#334155' }}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); handlePhotoUpload(e.dataTransfer.files[0]) }}
                >
                  <span className="text-2xl">🖼️</span>
                  <span className="text-xs text-slate-400">Hacé clic o arrastrá tu foto aquí</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={e => handlePhotoUpload(e.target.files?.[0])}
                  />
                </label>
              ) : (
                <div className="flex items-center gap-4">
                  <img src={photoPreviewUrl} alt="Foto de perfil"
                    className="w-20 h-20 rounded-full object-cover"
                    style={{ border: '2px solid rgba(0,119,181,0.4)' }} />
                  <p className="text-xs text-green-400 font-medium">✓ Foto cargada — se analizará junto al perfil</p>
                </div>
              )}
              {photoError && <p className="text-xs text-red-400">{photoError}</p>}
            </div>

            {/* Resumen de respuestas (siempre visible) */}
            <div className="rounded-xl p-4"
              style={{ backgroundColor: 'rgba(0,119,181,0.06)', border: '1px solid rgba(0,119,181,0.2)' }}>
              <p className="text-xs uppercase tracking-wide mb-3" style={{ color: '#0077B5' }}>Tu contexto recopilado</p>
              <div className="space-y-0">
                {qaHistory.map((h, i) => (
                  <div key={i} className="py-2 border-b last:border-0" style={{ borderColor: 'rgba(51,65,85,0.5)' }}>
                    <p className="text-slate-500 text-xs leading-snug">
                      {i + 1}. {h.question.replace(/^¿/, '').replace(/\?$/, '')}
                    </p>
                    <p className="text-white text-xs font-medium mt-0.5 pl-3">→ {h.answer}</p>
                  </div>
                ))}
              </div>
            </div>

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
                className="flex-1 border border-slate-600 text-slate-300 font-semibold py-3.5 rounded-xl transition-all duration-200 hover:border-slate-400"
              >
                ← Atrás
              </button>
              <button
                disabled={!profileText}
                onClick={callGemini}
                className="flex-[2] font-semibold py-3.5 rounded-xl transition-all duration-200 text-white"
                style={{
                  backgroundColor: profileText ? '#0077B5' : '#334155',
                  opacity: profileText ? 1 : 0.5,
                  cursor: profileText ? 'pointer' : 'not-allowed',
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
              <p className="text-slate-400 text-sm max-w-xs mx-auto leading-relaxed transition-all duration-500">
                {LOADING_MESSAGES[loadingMsgIdx]}
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

            {/* ── CTA principal: CV — visible sin scrollear ── */}
            <div className="space-y-1.5">
              <button
                onClick={() => {
                  if (saveEmailValue && !contactEmail) setContactEmail(saveEmailValue)
                  setShowCvModal(true)
                }}
                disabled={cvLoading}
                className="w-full font-semibold py-4 rounded-xl transition-all duration-200 text-white text-sm"
                style={{ background: cvLoading ? '#334155' : 'linear-gradient(135deg,#059669,#10b981)', opacity: cvLoading ? 0.7 : 1 }}
              >
                {cvLoading ? '⏳ Generando tu CV...' : '📄 Generá tu CV moderno de 1 página'}
              </button>
              <p className="text-center text-xs text-slate-500">
                Gratis · ATS-compatible · Descargalo y guardá como PDF con Ctrl+P
              </p>
              {cvError && <p className="text-xs text-red-400 text-center">{cvError}</p>}
              {cvSuccess && (
                <p className="text-xs text-emerald-400 text-center">
                  ✓ {cvSuccess} descargado — abrilo y guardá como PDF con Ctrl+P
                </p>
              )}
            </div>

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

            {result.foto_recomendacion && (
              <ResultCard title="📸 Foto de perfil">
                <p className="text-sm text-slate-300 leading-relaxed">{result.foto_recomendacion}</p>
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

            {/* Guardar análisis */}
            {!analisisSaved ? (
              <div className="rounded-2xl p-5 space-y-3"
                style={{ background: 'rgba(0,119,181,0.06)', border: '1px solid rgba(0,119,181,0.2)' }}>
                <p className="text-sm font-semibold text-white">💾 Guardá tu análisis</p>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Dejá tu email y guardamos el diagnóstico completo. Tus datos se almacenan de forma segura y no se comparten con terceros.
                </p>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={saveEmailValue}
                    onChange={e => setSaveEmailValue(e.target.value)}
                    placeholder="tu@email.com"
                    className="flex-1 rounded-xl px-4 py-2.5 text-sm text-white outline-none"
                    style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid #334155' }}
                  />
                  <button
                    onClick={() => { if (saveEmailValue.trim()) handleSaveAnalisis(saveEmailValue.trim(), true) }}
                    disabled={!saveEmailValue.trim() || savingAnalisis}
                    className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white shrink-0 transition-opacity"
                    style={{
                      background: saveEmailValue.trim() ? '#0077B5' : '#334155',
                      opacity: saveEmailValue.trim() ? 1 : 0.5,
                      cursor: saveEmailValue.trim() ? 'pointer' : 'not-allowed',
                    }}
                  >
                    {savingAnalisis ? '...' : 'Guardar'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl p-4 flex items-center gap-3"
                style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.25)' }}>
                <span>✅</span>
                <p className="text-green-400 text-sm">Análisis guardado en <span className="font-semibold">{saveEmailValue}</span></p>
              </div>
            )}

            <button
              onClick={reset}
              className="w-full border border-slate-600 text-slate-300 font-semibold py-4 rounded-xl transition-all duration-200 text-sm hover:border-slate-400"
            >
              ↺ Analizar otro perfil
            </button>
          </div>
        )}

      </div>

      {/* ── Modal CV 1 página ── */}
      {showCvModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 overflow-y-auto"
          style={{ background: 'rgba(0,0,0,0.70)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowCvModal(false) }}
        >
          <div className="w-full max-w-sm rounded-2xl overflow-hidden"
            style={{ background: '#1e293b', border: '1px solid #334155', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>

            {/* Header */}
            <div className="p-6 pb-4 space-y-2">
              <h3 className="text-lg font-bold text-white">📄 Tu CV de 1 página</h3>
              <ul className="text-xs text-slate-500 space-y-1 pt-1">
                <li>✓ Titular y resumen optimizados de tu análisis</li>
                <li>✓ Experiencias con logros y métricas</li>
                <li>✓ Keywords de tu industria incluidas</li>
                <li>✓ ATS-compatible · listo para guardar como PDF</li>
              </ul>
            </div>

            {/* Formulario de contacto */}
            <div className="px-6 pb-6 pt-4 space-y-3"
              style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>

              <p className="text-xs font-semibold text-slate-300">Datos de contacto para el CV</p>

              <div>
                <label className="text-xs text-slate-500 block mb-1">
                  Email <span className="text-red-400">*</span>
                </label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={e => setContactEmail(e.target.value)}
                  placeholder="tu@email.com"
                  className="w-full rounded-xl px-4 py-2.5 text-sm text-white outline-none"
                  style={{ background: 'rgba(15,23,42,0.8)', border: `1px solid ${contactEmail.trim() ? 'rgba(0,119,181,0.5)' : '#334155'}` }}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Teléfono</label>
                  <input
                    type="tel"
                    value={contactTelefono}
                    onChange={e => setContactTelefono(e.target.value)}
                    placeholder="+54 11 1234-5678"
                    className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none"
                    style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid #334155' }}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">URL LinkedIn</label>
                  <input
                    type="url"
                    value={contactLinkedin}
                    onChange={e => setContactLinkedin(e.target.value)}
                    placeholder="linkedin.com/in/..."
                    className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none"
                    style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid #334155' }}
                  />
                </div>
              </div>

              {/* Aviso de privacidad */}
              <p className="text-xs leading-relaxed pt-1"
                style={{ color: '#475569' }}>
                🔒 Tu nombre, email, teléfono y datos del CV serán almacenados de forma segura para la confección del documento. No serán compartidos con terceros.
              </p>

              {/* Acción principal */}
              <button
                onClick={() => {
                  if (!contactEmail.trim()) return
                  const contacto = { email: contactEmail.trim(), telefono: contactTelefono.trim(), linkedinUrl: contactLinkedin.trim() }
                  setPendingWithSupport(false)
                  setShowCvModal(false)
                  callGenerateCV(contacto)
                }}
                disabled={!contactEmail.trim()}
                className="w-full py-3.5 rounded-xl text-sm font-semibold transition-opacity"
                style={{
                  background: contactEmail.trim() ? '#0077B5' : '#334155',
                  color: 'white',
                  opacity: contactEmail.trim() ? 1 : 0.5,
                  cursor: contactEmail.trim() ? 'pointer' : 'not-allowed',
                }}
              >
                Generar mi CV →
              </button>

              {/* Donación — secundaria */}
              <div className="flex items-start gap-2.5">
                <span className="text-base shrink-0 mt-0.5">☕</span>
                <p className="text-xs leading-relaxed" style={{ color: '#475569' }}>
                  Si te aportó valor, podés apoyar con $5.000 (único, optativo). Me ayuda a mantenerla gratis.
                </p>
              </div>
              <button
                onClick={() => {
                  if (!contactEmail.trim()) return
                  const contacto = { email: contactEmail.trim(), telefono: contactTelefono.trim(), linkedinUrl: contactLinkedin.trim() }
                  setPendingWithSupport(true)
                  window.open(MP_URL, '_blank', 'noopener,noreferrer')
                  setShowCvModal(false)
                  callGenerateCV(contacto)
                }}
                disabled={!contactEmail.trim()}
                className="w-full py-2.5 rounded-xl text-xs font-medium transition-colors"
                style={{
                  border: `1px solid ${contactEmail.trim() ? 'rgba(0,180,150,0.35)' : '#334155'}`,
                  color: contactEmail.trim() ? '#34d399' : '#475569',
                  background: contactEmail.trim() ? 'rgba(0,180,150,0.06)' : 'transparent',
                  cursor: contactEmail.trim() ? 'pointer' : 'not-allowed',
                }}
              >
                ☕ Apoyar $5.000 y generar →
              </button>

              <button
                onClick={() => setShowCvModal(false)}
                className="w-full py-2 text-xs hover:text-slate-400 transition-colors"
                style={{ color: '#475569' }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

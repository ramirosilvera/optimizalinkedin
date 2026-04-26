import { useState, useEffect, useCallback, useRef } from 'react'
import './index.css'

const GEMINI_MODEL = 'gemini-2.5-flash-lite'
const WORKER_URL = import.meta.env.VITE_WORKER_URL
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

function parseGeminiError(status, body) {
  if (status === 429) return 'Cuota de API agotada. Generá una nueva key en aistudio.google.com/apikey o esperá a que se resetee.'
  if (status === 400) return 'API key inválida o solicitud incorrecta. Revisá la key ingresada.'
  if (status === 403) return 'API key sin permisos. Verificá que esté habilitada en Google AI Studio.'
  return `Error HTTP ${status}: ${body?.error?.message || 'Error desconocido'}`
}

const STEPS = {
  WELCOME: 0, QUESTIONS: 1, PROFILE_INPUT: 2, LOADING: 3, RESULTS: 4,
  INTERVIEW_INTRO: 5, INTERVIEW: 6, INTERVIEW_FEEDBACK: 7,
}

const RAMIRO_LINKEDIN_URL = 'https://www.linkedin.com/in/ramiro-silvera-b0819459'
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

const INTERVIEW_QUESTIONS = [
  { pregunta: 'Hacé tu presentación profesional: quién sos, en qué destacás y qué buscás en este momento.', hint: 'Imaginá que tenés 2 minutos para causar una primera impresión.' },
  { pregunta: 'Contame sobre tu mayor logro profesional: ¿qué hiciste, cómo lo hiciste y qué resultado concreto obtuviste?', hint: 'Si podés, mencioná números o métricas.' },
  { pregunta: '¿Cuál es tu mayor área de mejora y qué estás haciendo para trabajarla?', hint: 'Los reclutadores valoran la autoconciencia — sé honesto/a.' },
  { pregunta: '¿Qué te motiva a buscar un nuevo desafío en este momento de tu carrera?', hint: 'Enfocate en lo que te atrae, no en lo que dejás atrás.' },
  { pregunta: '¿Qué te diferencia de otros profesionales con tu mismo perfil y experiencia?', hint: 'Pensá en tu propuesta de valor única.' },
]

const INTERVIEW_SYSTEM_PROMPT = `Sos una entrevistadora senior de RRHH y headhunter con 20 años de experiencia en selección ejecutiva.
Tu tarea es evaluar las respuestas de una entrevista inicial y dar feedback constructivo y profesional.
Aplicá estos criterios: claridad del mensaje, método STAR en logros, nivel de autoconciencia, capacidad de comunicar propuesta de valor, autenticidad y solidez de los argumentos.
Respondé siempre en español rioplatense (Argentina).
No usés lenguaje genérico ni de autoayuda. Sé directa, específica y orientada a la mejora concreta.
Respondé SOLO en JSON válido, sin markdown, sin backticks.`

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
    <div className="mb-8 sm:mb-10">
      <img
        src="/logo.png"
        alt="OptimizaLinkedin"
        style={{ height: '72px', width: 'auto', mixBlendMode: 'multiply' }}
      />
    </div>
  )
}

function Spinner({ size = 4 }) {
  return (
    <div
      className={`w-${size} h-${size} rounded-full border-2 animate-spin shrink-0`}
      style={{ borderColor: 'rgba(0,119,181,0.25)', borderTopColor: '#0077B5' }}
    />
  )
}

function OptionButton({ label, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-5 py-3.5 rounded-2xl border transition-all duration-200 text-sm sm:text-base flex items-center justify-between gap-3 ${selected ? 'option-glow' : ''}`}
      style={selected
        ? { borderColor: 'rgba(0,119,181,0.6)', background: 'rgba(0,119,181,0.10)', color: '#0d2137', fontWeight: 500 }
        : { borderColor: 'rgba(0,119,181,0.15)', background: '#f8fafc', color: '#374151' }
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
        ? { borderColor: '#22c55e', color: '#16a34a', background: 'rgba(34,197,94,0.08)' }
        : { borderColor: 'rgba(0,119,181,0.2)', color: '#3d5a73', background: '#f8fafc' }
      }
    >
      {copied ? '✓ Copiado' : 'Copiar'}
    </button>
  )
}

function ScoreRing({ score }) {
  const s = Math.min(Math.max(Number(score) || 0, 0), 10)
  const r = 52, circ = 2 * Math.PI * r
  const color = s >= 8 ? '#22c55e' : s >= 5 ? '#0ea5e9' : '#f59e0b'
  const glowColor = s >= 8 ? 'rgba(34,197,94,0.3)' : s >= 5 ? 'rgba(14,165,233,0.3)' : 'rgba(245,158,11,0.3)'
  return (
    <div className="flex flex-col items-center shrink-0">
      <svg width="140" height="140" viewBox="0 0 140 140" style={{ filter: `drop-shadow(0 0 8px ${glowColor})` }}>
        <circle cx="70" cy="70" r={r} stroke="rgba(0,119,181,0.12)" strokeWidth="10" fill="none" />
        <circle cx="70" cy="70" r={r} stroke={color} strokeWidth="10" fill="none"
          strokeDasharray={circ} strokeDashoffset={circ - (circ * s) / 10}
          strokeLinecap="round"
          style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', transition: 'stroke-dashoffset 1.3s cubic-bezier(0.16,1,0.3,1)' }}
        />
        <text x="70" y="65" textAnchor="middle" fill="#0d2137" fontSize="34" fontWeight="700" dy="0.35em">{s}</text>
        <text x="70" y="93" textAnchor="middle" fill="#64748b" fontSize="11">/ 10</text>
      </svg>
      <p className="text-slate-500 text-xs mt-1 tracking-wide uppercase">Puntaje general</p>
    </div>
  )
}

function ResultCard({ title, children, accent = '#0077B5' }) {
  return (
    <div className="rounded-2xl p-4 sm:p-6 relative overflow-hidden card-accent-line"
      style={{ background: 'white', border: `1px solid rgba(0,119,181,0.12)`, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
      <div className="absolute top-0 left-0 right-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent 0%, ${accent}50 50%, transparent 100%)` }} />
      <h3 className="font-semibold text-xs mb-4 uppercase tracking-widest" style={{ color: accent }}>{title}</h3>
      {children}
    </div>
  )
}

function BeforeAfter({ label, before, after }) {
  return (
    <div className="space-y-2">
      <div className="rounded-xl p-4" style={{ background: '#f8fafc', border: '1px solid rgba(0,119,181,0.10)' }}>
        <span className="text-xs text-slate-500 uppercase tracking-widest block mb-2">Actual</span>
        <p className="text-slate-600 text-sm leading-relaxed">{before || `No tiene ${label.toLowerCase()}`}</p>
      </div>
      <div className="rounded-xl p-4 relative overflow-hidden"
        style={{ background: 'rgba(0,119,181,0.06)', border: '1px solid rgba(0,119,181,0.22)' }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs uppercase tracking-widest font-semibold" style={{ color: '#0077B5' }}>Propuesto</span>
          <CopyButton text={after || ''} />
        </div>
        <p className="text-slate-900 text-sm leading-relaxed">{after || '—'}</p>
      </div>
    </div>
  )
}

// ── Comments section ──────────────────────────────────────────

const AVATAR_GRADS = [
  'linear-gradient(135deg,#0077B5,#0ea5e9)',
  'linear-gradient(135deg,#6366f1,#8b5cf6)',
  'linear-gradient(135deg,#0d9488,#14b8a6)',
  'linear-gradient(135deg,#f59e0b,#ea580c)',
]

function CommentsSection() {
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [form, setForm] = useState({ nombre: '', titulo: '', linkedin_url: '', comentario: '' })
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [fetchError, setFetchError] = useState(false)

  useEffect(() => {
    if (!SUPABASE_URL) { setLoading(false); return }
    fetch(
      `${SUPABASE_URL}/rest/v1/comments?status=eq.approved&order=created_at.desc&limit=6`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    )
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => setComments(Array.isArray(data) ? data : []))
      .catch(() => setFetchError(true))
      .finally(() => setLoading(false))
  }, [])

  const initials = (name) => {
    const p = name.trim().split(/\s+/)
    return (p.length >= 2 ? p[0][0] + p[1][0] : name.slice(0, 2)).toUpperCase()
  }
  const avatarGrad = (name) => AVATAR_GRADS[name.charCodeAt(0) % AVATAR_GRADS.length]
  const isValidLinkedIn = (url) =>
    /^https?:\/\/(www\.)?linkedin\.com\/in\/[\w%-]+\/?$/.test(url.trim())

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!isValidLinkedIn(form.linkedin_url)) {
      setFormError('La URL debe tener el formato: https://linkedin.com/in/tu-usuario')
      return
    }
    setSubmitting(true)
    setFormError('')
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/comments`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ ...form, status: 'pending' }),
      })
      if (!res.ok) throw new Error()
      setSubmitted(true)
      setShowForm(false)
      setForm({ nombre: '', titulo: '', linkedin_url: '', comentario: '' })
    } catch {
      setFormError('Error al enviar. Intentá de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!SUPABASE_URL) return null

  return (
    <div className="pt-10 text-left">
      <div className="flex items-center gap-3 mb-7">
        <div className="flex-1 h-px" style={{ background: 'rgba(0,119,181,0.15)' }} />
        <p className="text-xs font-medium tracking-widest uppercase" style={{ color: '#3d5a73' }}>
          Experiencias reales
        </p>
        <div className="flex-1 h-px" style={{ background: 'rgba(0,119,181,0.15)' }} />
      </div>

      {loading ? (
        <div className="flex justify-center py-6"><Spinner size={5} /></div>
      ) : fetchError ? (
        <p className="text-center text-slate-600 text-sm py-4">
          No se pudieron cargar los comentarios.
        </p>
      ) : comments.length === 0 ? (
        <p className="text-center text-slate-600 text-sm py-4">
          Aún no hay comentarios. ¡Sé el primero!
        </p>
      ) : (
        <div className="space-y-3">
          {comments.map(c => (
            <div key={c.id} className="rounded-2xl p-4"
              style={{ background: 'white', border: '1px solid rgba(0,119,181,0.12)', boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                  style={{ background: avatarGrad(c.nombre) }}>
                  {initials(c.nombre)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-slate-900 text-sm font-semibold leading-tight">{c.nombre}</p>
                      <p className="text-slate-500 text-xs mt-0.5">{c.titulo}</p>
                    </div>
                    {isValidLinkedIn(c.linkedin_url) && (
                      <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer"
                        className="shrink-0 mt-0.5 transition-opacity hover:opacity-70"
                        style={{ color: '#0077B5' }} title="Ver perfil de LinkedIn">
                        <LinkedInIcon className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                  <p className="text-slate-600 text-sm mt-2 leading-relaxed">"{c.comentario}"</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {submitted ? (
        <p className="text-center text-sm mt-5 py-3 rounded-2xl"
          style={{ color: '#4ade80', background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.2)' }}>
          ✓ ¡Gracias! Tu comentario está en revisión y se publicará pronto.
        </p>
      ) : showForm ? (
        <form onSubmit={handleSubmit} className="mt-5 space-y-3 rounded-2xl p-5"
          style={{ background: 'white', border: '1px solid rgba(0,119,181,0.15)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <p className="text-slate-900 font-semibold text-sm">Compartí tu experiencia</p>
          {[
            { key: 'nombre',       placeholder: 'Nombre completo',                               max: 80  },
            { key: 'titulo',       placeholder: 'Título profesional · Empresa',                  max: 100 },
            { key: 'linkedin_url', placeholder: 'https://linkedin.com/in/tu-usuario', isUrl: true, max: 200 },
          ].map(({ key, placeholder, isUrl, max }) => (
            <input key={key}
              type={isUrl ? 'url' : 'text'}
              required
              maxLength={max}
              value={form[key]}
              onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
              placeholder={placeholder}
              className="w-full rounded-xl px-4 py-2.5 text-sm outline-none"
              style={{ background: '#f8fafc', border: '1px solid rgba(0,119,181,0.18)', color: '#0d2137' }}
            />
          ))}
          <div className="relative">
            <textarea required
              value={form.comentario}
              onChange={e => setForm(f => ({ ...f, comentario: e.target.value }))}
              placeholder="Contá cómo te ayudó la app..."
              rows={3} maxLength={300}
              className="w-full rounded-xl px-4 py-2.5 text-sm outline-none resize-none"
              style={{ background: '#f8fafc', border: '1px solid rgba(0,119,181,0.18)', color: '#0d2137' }}
            />
            <span className="absolute bottom-2 right-3 text-xs pointer-events-none"
              style={{ color: form.comentario.length > 260 ? '#f59e0b' : '#94a3b8' }}>
              {form.comentario.length}/300
            </span>
          </div>
          {formError && <p className="text-xs" style={{ color: '#dc2626' }}>{formError}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button"
              onClick={() => { setShowForm(false); setFormError('') }}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium"
              style={{ border: '1px solid rgba(0,119,181,0.15)', color: '#3d5a73', background: '#f0f4f8' }}>
              Cancelar
            </button>
            <button type="submit" disabled={submitting}
              className={`flex-[2] py-2.5 rounded-xl text-sm font-semibold text-white ${!submitting ? 'btn-glow' : ''}`}
              style={{ background: submitting ? 'rgba(0,119,181,0.15)' : 'linear-gradient(135deg,#0077B5,#0ea5e9)', color: submitting ? '#64748b' : '#fff' }}>
              {submitting ? 'Enviando...' : 'Enviar comentario'}
            </button>
          </div>
        </form>
      ) : (
        <button onClick={() => setShowForm(true)}
          className="w-full mt-5 py-3 rounded-2xl text-sm font-medium transition-all duration-200"
          style={{ border: '1px solid rgba(0,119,181,0.15)', color: '#3d5a73', background: '#f8fafc' }}>
          ✍️ &nbsp;Compartí tu experiencia
        </button>
      )}
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
  const analysisAbortRef = useRef(null)

  // Interview
  const [interviewAnswers, setInterviewAnswers] = useState([])
  const [interviewIdx, setInterviewIdx] = useState(0)
  const [interviewAnswer, setInterviewAnswer] = useState('')
  const [interviewFeedback, setInterviewFeedback] = useState(null)
  const [interviewLoading, setInterviewLoading] = useState(false)
  const [interviewError, setInterviewError] = useState('')

  // Contacto con Ramiro
  const [leadSaving, setLeadSaving] = useState(false)
  const [leadSent, setLeadSent] = useState(false)
  const [showLeadModal, setShowLeadModal] = useState(false)
  const [leadNombre, setLeadNombre] = useState('')
  const [leadApellido, setLeadApellido] = useState('')

  // Loading message rotation
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0)
  useEffect(() => {
    if (step !== STEPS.LOADING) return
    const id = setInterval(() => setLoadingMsgIdx(i => (i + 1) % LOADING_MESSAGES.length), 3500)
    return () => clearInterval(id)
  }, [step])

  const resetInterview = () => {
    setInterviewAnswers([])
    setInterviewIdx(0)
    setInterviewAnswer('')
    setInterviewFeedback(null)
    setInterviewLoading(false)
    setInterviewError('')
    setLeadSaving(false)
    setLeadSent(false)
    setShowLeadModal(false)
    setLeadNombre('')
    setLeadApellido('')
  }

  const reset = () => {
    if (!window.confirm('¿Seguro? Perderás el análisis, la entrevista y el feedback. Volvés al inicio.')) return
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
    resetInterview()
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

    const controller = new AbortController()
    analysisAbortRef.current = controller
    const timeoutId = setTimeout(() => controller.abort(), 90000)
    try {
      if (!WORKER_URL) throw new Error('Worker URL no configurada. Verificá el secret VITE_WORKER_URL en GitHub.')
      const res = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          system_instruction: { parts: [{ text: ANALYSIS_SYSTEM_PROMPT }] },
          contents: [{ parts: [{ text: userPrompt }] }],
          generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 2200 },
        }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error(parseGeminiError(res.status, e))
      }
      const data = await res.json()
      const candidate = data.candidates?.[0]
      if (candidate?.finishReason === 'MAX_TOKENS') {
        throw new Error('La respuesta fue demasiado larga. Intentá de nuevo — suele resolverse en el segundo intento.')
      }
      const raw = candidate?.content?.parts?.[0]?.text || ''
      let parsed
      try { parsed = JSON.parse(raw) }
      catch { const m = raw.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); else throw new Error('Error al procesar la respuesta. Intentá de nuevo.') }
      setResult({
        ...parsed,
        fortalezas: parsed.fortalezas || [],
        areas_de_mejora: parsed.areas_de_mejora || [],
        palabras_clave_sugeridas: parsed.palabras_clave_sugeridas || [],
        recomendaciones: parsed.recomendaciones || [],
      })
      setStep(STEPS.RESULTS)
    } catch (err) {
      if (err.name === 'AbortError') {
        setAnalysisError('El análisis fue cancelado o tardó demasiado (90 s). Revisá tu conexión e intentá de nuevo.')
      } else {
        setAnalysisError(err.message || 'Error al conectar con Gemini.')
      }
      setStep(STEPS.PROFILE_INPUT)
    } finally {
      clearTimeout(timeoutId)
      setAnalyzing(false)
    }
  }

  // ── Guardar lead y abrir LinkedIn de Ramiro ──
  const saveAndConnectRamiro = async (nombre, apellido, colaborar = false) => {
    if (leadSaving || leadSent) return
    setLeadSaving(true)
    setShowLeadModal(false)
    try {
      if (SUPABASE_URL) {
        await fetch(`${SUPABASE_URL}/rest/v1/leads`, {
          method: 'POST',
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({
            nombre: nombre.trim(),
            apellido: apellido.trim(),
            qa_history: qaHistory,
            resultado_analisis: result || {},
            respuestas_entrevista: interviewAnswers,
            feedback_entrevista: interviewFeedback || {},
          }),
        })
      }
    } catch {
      // Si falla, abrimos LinkedIn igual — nunca bloqueamos al usuario
    } finally {
      setLeadSaving(false)
      setLeadSent(true)
      if (colaborar) window.open('https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_plan_id=0922af414b854dabb5942e3291b2b5cb', '_blank', 'noopener,noreferrer')
      window.open(RAMIRO_LINKEDIN_URL, '_blank', 'noopener,noreferrer')
    }
  }

  // ── Call AI with completed interview answers ──
  const callInterviewFeedback = async (answers) => {
    if (interviewLoading) return
    setInterviewLoading(true)
    setStep(STEPS.INTERVIEW_FEEDBACK)
    setInterviewError('')

    const transcripcion = answers
      .map((a, i) => `Pregunta ${i + 1}: ${a.pregunta}\nRespuesta: ${a.respuesta}`)
      .join('\n\n')

    const contexto = qaHistory
      .filter(h => h.answer.trim())
      .map(h => `- ${STATIC_QUESTIONS.find(q => q.question === h.question)?.id ?? 'dato'}: ${h.answer}`)
      .join('\n')

    const prompt = `Contexto del profesional (cuestionario previo):
${contexto}

Análisis de perfil (puntaje: ${result?.puntaje_general ?? 'N/D'}/10):
${result?.resumen_diagnostico ?? ''}

Transcripción de la entrevista:
${transcripcion}

Generá el feedback en este JSON exacto:
{
  "puntaje_entrevista": número del 1 al 10,
  "evaluacion_general": "2-3 oraciones directas sobre la performance general en la entrevista",
  "fortalezas_entrevista": ["fortaleza 1", "fortaleza 2", "fortaleza 3"],
  "areas_de_mejora_entrevista": ["area 1", "area 2", "area 3"],
  "feedback_por_respuesta": [
    { "numero": 1, "aspecto_positivo": "qué estuvo bien", "sugerencia": "cómo mejorar esta respuesta concretamente" },
    { "numero": 2, "aspecto_positivo": "...", "sugerencia": "..." },
    { "numero": 3, "aspecto_positivo": "...", "sugerencia": "..." },
    { "numero": 4, "aspecto_positivo": "...", "sugerencia": "..." },
    { "numero": 5, "aspecto_positivo": "...", "sugerencia": "..." }
  ],
  "recomendacion_final": "el consejo más importante para su próxima entrevista real, en 1-2 oraciones concretas"
}`

    try {
      if (!WORKER_URL) throw new Error('Worker URL no configurada.')
      const res = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: INTERVIEW_SYSTEM_PROMPT }] },
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 1800 },
        }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error(parseGeminiError(res.status, e))
      }
      const data = await res.json()
      const candidate = data.candidates?.[0]
      if (candidate?.finishReason === 'MAX_TOKENS') throw new Error('Respuesta demasiado larga. Intentá de nuevo.')
      const raw = candidate?.content?.parts?.[0]?.text || ''
      let parsed
      try { parsed = JSON.parse(raw) }
      catch { const m = raw.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); else throw new Error('Error al procesar el feedback. Intentá de nuevo.') }
      setInterviewFeedback(parsed)
    } catch (err) {
      setInterviewError(err.message || 'Error al generar el feedback.')
    } finally {
      setInterviewLoading(false)
    }
  }

  // ── Avanzar en la entrevista ──
  const handleInterviewNext = (answer) => {
    if (interviewLoading) return
    const newAnswers = [...interviewAnswers, { pregunta: INTERVIEW_QUESTIONS[interviewIdx].pregunta, respuesta: answer }]
    setInterviewAnswers(newAnswers)
    setInterviewAnswer('')
    if (newAnswers.length < INTERVIEW_QUESTIONS.length) {
      setInterviewIdx(interviewIdx + 1)
    } else {
      callInterviewFeedback(newAnswers)
    }
  }

  const handleInterviewBack = () => {
    if (interviewIdx === 0) { setInterviewAnswer(''); setStep(STEPS.INTERVIEW_INTRO); return }
    const newIdx = interviewIdx - 1
    setInterviewAnswers(prev => prev.slice(0, newIdx))
    setInterviewIdx(newIdx)
    setInterviewAnswer(interviewAnswers[newIdx]?.respuesta || '')
  }

  const qNum = qaHistory.length + 1
  const qProgress = Math.round((qaHistory.length / STATIC_QUESTIONS.length) * 100)

  // ── Render ─────────────────────────────────────────────────

  return (
    <main className="min-h-dvh flex flex-col items-center px-4 py-8 sm:py-14">
      <div className="w-full max-w-xl">

        {/* ── WELCOME ── */}
        {step === STEPS.WELCOME && (
          <div className="step-transition text-center space-y-8">
            <Logo />
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide badge-shimmer"
                style={{ border: '1px solid rgba(0,119,181,0.4)', color: '#0077B5' }}>
                ✦ &nbsp;Análisis profesional con IA
              </div>
              <h1 className="text-4xl sm:text-5xl font-bold leading-tight tracking-tight" style={{ letterSpacing: '-0.02em' }}>
                <span className="text-slate-900">Optimizá tu perfil</span><br />
                <span style={{ background: 'linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  de LinkedIn
                </span>
              </h1>
              <p className="text-slate-600 text-base max-w-sm mx-auto leading-relaxed">
                Respondé el cuestionario, luego subí tu PDF y recibí un análisis con criterio de headhunter.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { icon: '🎯', label: 'Headhunter', text: 'Diagnóstico profesional real', accent: '#0ea5e9' },
                { icon: '🔍', label: 'SEO',         text: 'Aparecer en búsquedas clave',  accent: '#6366f1' },
                { icon: '⚡', label: '6 segundos',  text: 'Test de primer impacto',        accent: '#0d9488' },
              ].map(item => (
                <div key={item.label} className="rounded-2xl p-4 text-center relative overflow-hidden"
                  style={{ background: 'white', border: '1px solid rgba(0,119,181,0.12)', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
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
              <p className="text-slate-500 text-xs">Gratis · Sin registro · Sostenida por la comunidad 🙌</p>
            </div>

            <CommentsSection />
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
                          : 'rgba(0,119,181,0.12)',
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
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 leading-snug" style={{ letterSpacing: '-0.01em' }}>
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
                    className="w-full rounded-2xl px-4 py-3 text-sm resize-none outline-none transition-all duration-200"
                    style={{
                      background: '#f8fafc',
                      border: textAnswer.trim() ? '1px solid rgba(0,119,181,0.5)' : '1px solid rgba(0,119,181,0.15)',
                      color: '#0d2137',
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
                    style={{ border: '1px solid rgba(0,119,181,0.15)', color: '#475569', background: '#f8fafc' }}
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
            <button onClick={handleBack} className="text-slate-600 text-sm hover:text-slate-400 transition-colors py-2 px-1">
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
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">Subí tu perfil de LinkedIn</h2>
            </div>

            {/* Por qué PDF */}
            <div className="rounded-xl p-4 text-sm space-y-1"
              style={{ backgroundColor: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.25)' }}>
              <p className="text-amber-400 font-semibold text-xs uppercase tracking-wide mb-2">¿Por qué no se puede hacer automáticamente?</p>
              <p className="text-slate-600 leading-relaxed">
                LinkedIn bloquea el acceso a perfiles desde apps externas para proteger la privacidad de sus usuarios.
                No existe una API pública que permita leer perfiles completos — solo empresas con acuerdo comercial directo con LinkedIn pueden hacerlo.
                Por eso, la forma más simple y confiable es descargar tu propio perfil como PDF directamente desde LinkedIn.
              </p>
            </div>

            {/* Cómo descargar — tabs desktop/celular */}
            <div className="rounded-2xl overflow-hidden"
              style={{ background: 'white', border: '1px solid rgba(0,119,181,0.12)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              {/* Tab selector */}
              <div className="flex border-b" style={{ borderColor: 'rgba(0,119,181,0.12)' }}>
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
                <p className="font-semibold text-slate-900 text-sm mb-1">
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
                    <li key={i} className="flex items-start gap-3 text-sm text-slate-600">
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
                  <div key={i} className="py-2 border-b last:border-0" style={{ borderColor: 'rgba(0,119,181,0.10)' }}>
                    <p className="text-slate-500 text-xs leading-snug">
                      {STATIC_QUESTIONS[i]?.id ?? `Pregunta ${i + 1}`}
                    </p>
                    <p className="text-slate-900 text-xs font-medium mt-0.5 pl-3 leading-relaxed">→ {h.answer}</p>
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
                  borderColor: profileText ? 'rgba(34,197,94,0.6)' : isDragging ? '#0a91d4' : pdfLoading ? '#0077B5' : 'rgba(0,119,181,0.20)',
                  background: profileText ? 'rgba(34,197,94,0.05)' : isDragging ? 'rgba(0,119,181,0.08)' : '#f8fafc',
                }}
              >
                {pdfLoading ? (
                  <>
                    <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
                      style={{ borderColor: '#0077B5', borderTopColor: 'transparent' }} />
                    <p className="text-slate-500 text-sm">Extrayendo contenido del PDF...</p>
                  </>
                ) : profileText ? (
                  <>
                    <span className="text-3xl">✅</span>
                    <div className="text-center">
                      <p className="text-green-600 font-semibold text-sm">{pdfFileName}</p>
                      <p className="text-slate-500 text-xs mt-1">Perfil extraído correctamente · Hacé clic para cambiar el archivo</p>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="text-3xl">{isDragging ? '📂' : '📄'}</span>
                    <div className="text-center">
                      <p className="text-slate-900 font-semibold text-sm">
                        {isDragging ? 'Soltá el PDF acá' : 'Subir PDF de LinkedIn'}
                      </p>
                      <p className="text-slate-500 text-xs mt-1">Arrastrá el archivo o hacé clic para seleccionarlo · Máx. 15 MB</p>
                    </div>
                  </>
                )}
              </label>
            </div>

            {/* PDF error */}
            {pdfError && (
              <div className="rounded-xl p-4 text-sm flex items-start gap-3"
                style={{ backgroundColor: 'rgba(254,226,226,0.8)', border: '1px solid #fca5a5', color: '#b91c1c' }}>
                <span className="shrink-0 mt-0.5">⚠️</span>
                <span>{pdfError}</span>
              </div>
            )}

            {/* Analysis error */}
            {analysisError && (
              <div className="rounded-xl p-4 text-sm space-y-2"
                style={{ backgroundColor: 'rgba(254,226,226,0.8)', border: '1px solid #fca5a5', color: '#b91c1c' }}>
                <p>⚠️ {analysisError}</p>
                <button
                  onClick={callGemini}
                  disabled={!profileText || analyzing}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all duration-200"
                  style={{
                    background: 'rgba(185,28,28,0.1)',
                    border: '1px solid rgba(185,28,28,0.3)',
                    color: '#b91c1c',
                    opacity: profileText && !analyzing ? 1 : 0.5,
                    cursor: profileText && !analyzing ? 'pointer' : 'not-allowed',
                  }}
                >
                  ↺ Reintentar análisis
                </button>
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => { handleBack(); setStep(STEPS.QUESTIONS) }}
                className="flex-1 font-semibold py-3.5 rounded-2xl transition-all duration-200"
                style={{ border: '1px solid rgba(0,119,181,0.15)', color: '#3d5a73', background: '#f0f4f8' }}
              >
                ← Atrás
              </button>
              <button
                disabled={!profileText || analyzing}
                onClick={callGemini}
                className={`flex-[2] font-semibold py-3.5 rounded-2xl transition-all duration-200 text-white ${profileText && !analyzing ? 'btn-glow' : ''}`}
                style={{
                  background: profileText && !analyzing ? 'linear-gradient(135deg,#0077B5,#0ea5e9)' : 'rgba(0,119,181,0.08)',
                  opacity: profileText && !analyzing ? 1 : 0.5,
                  cursor: profileText && !analyzing ? 'pointer' : 'not-allowed',
                  border: profileText && !analyzing ? 'none' : '1px solid rgba(0,119,181,0.12)',
                  color: profileText && !analyzing ? '#fff' : '#64748b',
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
                style={{ border: '2px solid rgba(0,119,181,0.08)' }} />
              {/* spinner */}
              <div className="absolute inset-3 rounded-full border-2 animate-spin"
                style={{ borderColor: 'rgba(0,119,181,0.25)', borderTopColor: '#0ea5e9' }} />
              {/* inner icon */}
              <div className="absolute inset-0 flex items-center justify-center"
                style={{ color: '#0077B5', filter: 'drop-shadow(0 0 6px rgba(0,119,181,0.4))' }}>
                <LinkedInIcon className="w-9 h-9" />
              </div>
            </div>
            <div className="space-y-3 max-w-xs">
              <h2 className="text-2xl font-bold text-slate-900" style={{ letterSpacing: '-0.02em' }}>Analizando tu perfil...</h2>
              <p className="text-slate-500 text-sm leading-relaxed transition-all duration-700">
                {LOADING_MESSAGES[loadingMsgIdx]}
              </p>
            </div>
            <div className="flex gap-2">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-1.5 h-1.5 rounded-full animate-bounce"
                  style={{ backgroundColor: '#0ea5e9', animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
            <button
              onClick={() => { analysisAbortRef.current?.abort(); setAnalyzing(false); setStep(STEPS.PROFILE_INPUT) }}
              className="text-slate-500 text-xs hover:text-slate-700 transition-colors py-2 px-4 rounded-xl"
              style={{ border: '1px solid rgba(0,119,181,0.12)', background: '#f8fafc' }}
            >
              Cancelar análisis
            </button>
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
                <p className="text-slate-800 text-sm leading-relaxed">{result.accion_prioritaria}</p>
              </div>
            )}

            <ResultCard title="Diagnóstico general">
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                <div className="flex flex-col items-center gap-3">
                  <ScoreRing score={result.puntaje_general ?? 0} />
                  {result.nivel_seo && (
                    <span className="text-xs font-semibold px-3 py-1 rounded-full"
                      style={{
                        backgroundColor: result.nivel_seo === 'Alto' ? 'rgba(34,197,94,0.12)' : result.nivel_seo === 'Medio' ? 'rgba(0,119,181,0.12)' : 'rgba(245,158,11,0.12)',
                        color: result.nivel_seo === 'Alto' ? '#16a34a' : result.nivel_seo === 'Medio' ? '#0077B5' : '#d97706',
                        border: `1px solid ${result.nivel_seo === 'Alto' ? 'rgba(34,197,94,0.3)' : result.nivel_seo === 'Medio' ? 'rgba(0,119,181,0.3)' : 'rgba(245,158,11,0.3)'}`,
                      }}>
                      SEO: {result.nivel_seo}
                    </span>
                  )}
                </div>
                <p className="text-slate-600 text-sm leading-relaxed sm:pt-4">{result.resumen_diagnostico || 'Sin información disponible.'}</p>
              </div>
            </ResultCard>

            <ResultCard title="Fortalezas y áreas de mejora">
              <div className="grid sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: '#4ade80' }}>✅ Fortalezas</p>
                  {(result.fortalezas || []).map((f, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="mt-0.5 shrink-0" style={{ color: '#16a34a' }}>•</span>
                      <p className="text-slate-600 text-sm">{f}</p>
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: '#d97706' }}>⚠️ Áreas de mejora</p>
                  {(result.areas_de_mejora || []).map((a, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="mt-0.5 shrink-0" style={{ color: '#d97706' }}>•</span>
                      <p className="text-slate-600 text-sm">{a}</p>
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
                      style={{ backgroundColor: 'rgba(0,119,181,0.08)', border: '1px solid rgba(0,119,181,0.25)', color: '#0077B5' }}>
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
                    style={{ background: '#f8fafc', border: '1px solid rgba(0,119,181,0.12)' }}>
                    <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5"
                      style={{ background: 'linear-gradient(135deg,#0077B5,#0ea5e9)', color: '#fff' }}>
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-slate-900 font-semibold text-sm mb-1">{rec.titulo}</p>
                      <p className="text-slate-600 text-sm leading-relaxed">{rec.descripcion}</p>
                    </div>
                  </div>
                ))}
              </div>
            </ResultCard>

            <div className="rounded-2xl p-6"
              style={{ backgroundColor: 'rgba(0,119,181,0.08)', border: '1px solid rgba(0,119,181,0.3)' }}>
              <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: '#0077B5' }}>📣 Estrategia de contenido</p>
              <p className="text-slate-700 text-sm leading-relaxed">{result.estrategia_contenido || 'Sin información disponible.'}</p>
            </div>

            {/* Card consulta personalizada */}
            <div className="rounded-2xl p-5"
              style={{ background: 'rgba(0,119,181,0.06)', border: '1px solid rgba(0,119,181,0.20)' }}>
              <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#0077B5' }}>🎯 ¿Querés implementar estos cambios?</p>
              <p className="text-slate-700 text-sm leading-relaxed mb-3">
                Ramiro puede guiarte paso a paso: revisar tu perfil en vivo, reescribir tu titular y resumen, y armar tu estrategia de búsqueda. Consulta con costo — se cotiza en el momento.
              </p>
              <button
                onClick={() => setShowLeadModal(true)}
                className="btn-glow inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold"
                style={{ background: 'linear-gradient(135deg,#0077B5,#0ea5e9)' }}
              >
                <LinkedInIcon className="w-4 h-4" /> Hablar con Ramiro →
              </button>
            </div>

            {/* Card colaboración */}
            <div className="rounded-2xl p-5 flex items-center gap-4"
              style={{ background: 'rgba(0,180,150,0.05)', border: '1px solid rgba(0,180,150,0.22)' }}>
              <span className="text-2xl shrink-0">🙌</span>
              <div className="flex-1 min-w-0">
                <p className="text-slate-800 text-sm font-semibold">¿Te sirvió el análisis?</p>
                <p className="text-slate-500 text-xs mt-0.5 leading-snug">Podés apoyar la app con un aporte de única vez — no es suscripción, es totalmente optativo.</p>
              </div>
              <a
                href="https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_plan_id=0922af414b854dabb5942e3291b2b5cb"
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 px-4 py-2 rounded-xl text-white text-xs font-semibold transition-all"
                style={{ background: 'linear-gradient(135deg,#00b496,#00d4aa)', boxShadow: '0 0 12px rgba(0,180,150,0.25)' }}
              >
                💙 Colaborar
              </a>
            </div>

            <button
              onClick={() => { resetInterview(); setStep(STEPS.INTERVIEW_INTRO) }}
              className="btn-glow w-full font-semibold py-4 rounded-2xl text-white text-sm"
              style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
            >
              🎙️ Simulá una entrevista inicial →
            </button>

            <button
              onClick={reset}
              className="w-full font-semibold py-4 rounded-2xl transition-all duration-200 text-sm"
              style={{ border: '1px solid rgba(0,119,181,0.15)', color: '#3d5a73', background: '#f0f4f8' }}
            >
              ↺ Analizar otro perfil
            </button>
          </div>
        )}

        {/* ── INTERVIEW INTRO ── */}
        {step === STEPS.INTERVIEW_INTRO && (
          <div className="step-transition text-center space-y-8">
            <Logo />
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide"
                style={{ border: '1px solid rgba(99,102,241,0.4)', color: '#6366f1', background: 'rgba(99,102,241,0.07)' }}>
                🎙️ &nbsp;Entrevistador IA
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 leading-tight" style={{ letterSpacing: '-0.02em' }}>
                Simulación de<br />
                <span style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  entrevista inicial
                </span>
              </h2>
              <p className="text-slate-600 text-base max-w-sm mx-auto leading-relaxed">
                5 preguntas típicas de selección. Al final recibís feedback personalizado basado en tu perfil y tus respuestas.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { icon: '❓', label: '5 preguntas', text: 'Pre-armadas por RRHH', accent: '#6366f1' },
                { icon: '🧠', label: 'Feedback IA', text: 'Análisis de cada respuesta', accent: '#8b5cf6' },
                { icon: '🎯', label: 'Criterio real', text: 'Estándares de headhunter', accent: '#a855f7' },
              ].map(item => (
                <div key={item.label} className="rounded-2xl p-4 text-center"
                  style={{ background: 'white', border: '1px solid rgba(0,119,181,0.12)', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                  <div className="text-2xl mb-2">{item.icon}</div>
                  <p className="text-xs font-semibold mb-1" style={{ color: item.accent }}>{item.label}</p>
                  <p className="text-slate-500 text-xs leading-snug">{item.text}</p>
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <button
                onClick={() => setStep(STEPS.INTERVIEW)}
                className="btn-glow w-full text-white font-semibold py-4 rounded-2xl text-base"
                style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
              >
                Empezar entrevista →
              </button>
              <button
                onClick={() => setStep(STEPS.RESULTS)}
                className="w-full font-medium py-3 rounded-2xl text-sm transition-all"
                style={{ border: '1px solid rgba(0,119,181,0.15)', color: '#3d5a73', background: '#f0f4f8' }}
              >
                ← Volver a mis resultados
              </button>
            </div>
            <p className="text-slate-400 text-xs text-center">
              Simulación gratuita ·{' '}
              <a
                href="https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_plan_id=0922af414b854dabb5942e3291b2b5cb"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-slate-600 transition-colors"
              >
                Apoyar la app 🙌
              </a>
            </p>
          </div>
        )}

        {/* ── INTERVIEW ── */}
        {step === STEPS.INTERVIEW && (
          <div className="step-transition space-y-7">
            <Logo />

            {/* Progress */}
            <div className="flex items-center gap-1.5">
              {INTERVIEW_QUESTIONS.map((_, i) => (
                <div key={i} className="h-1.5 rounded-full transition-all duration-500 flex-1"
                  style={{
                    background: i < interviewIdx
                      ? 'linear-gradient(90deg,#6366f1,#8b5cf6)'
                      : i === interviewIdx
                        ? 'rgba(99,102,241,0.5)'
                        : 'rgba(0,119,181,0.12)',
                  }} />
              ))}
            </div>
            <p className="text-xs text-slate-500 -mt-4">
              Pregunta {interviewIdx + 1} de {INTERVIEW_QUESTIONS.length}
            </p>

            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 leading-snug" style={{ letterSpacing: '-0.01em' }}>
                {INTERVIEW_QUESTIONS[interviewIdx].pregunta}
              </h2>
              <p className="text-slate-500 text-sm mt-2 leading-relaxed">
                {INTERVIEW_QUESTIONS[interviewIdx].hint}
              </p>
            </div>

            <div className="space-y-3">
              <div className="relative">
                <textarea
                  value={interviewAnswer}
                  onChange={e => setInterviewAnswer(e.target.value)}
                  placeholder="Escribí tu respuesta acá..."
                  rows={6}
                  maxLength={800}
                  className="w-full rounded-2xl px-4 py-3 text-sm resize-none outline-none transition-all duration-200"
                  style={{
                    background: '#f8fafc',
                    border: interviewAnswer.trim() ? '1px solid rgba(99,102,241,0.5)' : '1px solid rgba(0,119,181,0.15)',
                    color: '#0d2137',
                  }}
                />
                <span className="absolute bottom-2.5 right-3 text-xs pointer-events-none"
                  style={{ color: interviewAnswer.length > 720 ? '#f59e0b' : '#94a3b8' }}>
                  {interviewAnswer.length}/800
                </span>
              </div>
              <button
                disabled={!interviewAnswer.trim()}
                onClick={() => handleInterviewNext(interviewAnswer.trim())}
                className={`btn-glow w-full font-semibold py-4 rounded-2xl text-white text-sm ${!interviewAnswer.trim() ? 'opacity-40 cursor-not-allowed' : ''}`}
                style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
              >
                {interviewIdx < INTERVIEW_QUESTIONS.length - 1 ? 'Siguiente →' : 'Ver mi feedback →'}
              </button>
            </div>

            <button onClick={handleInterviewBack} className="text-slate-600 text-sm hover:text-slate-400 transition-colors py-2 px-1">
              ← {interviewIdx === 0 ? 'Volver al inicio' : 'Pregunta anterior'}
            </button>
          </div>
        )}

        {/* ── INTERVIEW FEEDBACK ── */}
        {step === STEPS.INTERVIEW_FEEDBACK && (
          <div className="step-transition space-y-6">
            <Logo />

            {interviewLoading ? (
              <div className="flex flex-col items-center justify-center min-h-[55vh] space-y-8 text-center">
                <div className="relative w-28 h-28">
                  <div className="absolute inset-0 rounded-full"
                    style={{ boxShadow: '0 0 50px rgba(99,102,241,0.25), 0 0 80px rgba(139,92,246,0.1)' }} />
                  <div className="absolute inset-3 rounded-full" style={{ border: '2px solid rgba(99,102,241,0.10)' }} />
                  <div className="absolute inset-3 rounded-full border-2 animate-spin"
                    style={{ borderColor: 'rgba(99,102,241,0.25)', borderTopColor: '#8b5cf6' }} />
                  <div className="absolute inset-0 flex items-center justify-center text-2xl">🎙️</div>
                </div>
                <div className="space-y-2 max-w-xs">
                  <h2 className="text-2xl font-bold text-slate-900" style={{ letterSpacing: '-0.02em' }}>Evaluando tu entrevista...</h2>
                  <p className="text-slate-500 text-sm leading-relaxed">Analizando tus respuestas con criterio de headhunter.</p>
                </div>
                <div className="flex gap-2">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="w-1.5 h-1.5 rounded-full animate-bounce"
                      style={{ backgroundColor: '#8b5cf6', animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
              </div>
            ) : interviewError ? (
              <div className="space-y-4">
                <div className="rounded-xl p-4 text-sm"
                  style={{ backgroundColor: 'rgba(254,226,226,0.8)', border: '1px solid #fca5a5', color: '#b91c1c' }}>
                  ⚠️ {interviewError}
                </div>
                <button onClick={() => { setInterviewError(''); callInterviewFeedback(interviewAnswers) }}
                  className="btn-glow w-full font-semibold py-4 rounded-2xl text-white text-sm"
                  style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
                  Reintentar
                </button>
              </div>
            ) : !interviewFeedback ? (
              <div className="flex flex-col items-center justify-center min-h-[55vh] gap-5 text-center">
                <p className="text-slate-500 text-sm">No hay datos de entrevista. Completá la simulación primero.</p>
                <button onClick={() => setStep(STEPS.INTERVIEW_INTRO)}
                  className="btn-glow font-semibold px-6 py-3 rounded-2xl text-white text-sm"
                  style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
                  ← Ir a la entrevista
                </button>
              </div>
            ) : (
              <>
                {/* Score */}
                <ResultCard title="Resultado de la entrevista" accent="#6366f1">
                  <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                    <ScoreRing score={interviewFeedback.puntaje_entrevista} />
                    <p className="text-slate-600 text-sm leading-relaxed sm:pt-4">{interviewFeedback.evaluacion_general}</p>
                  </div>
                </ResultCard>

                {/* Fortalezas / áreas */}
                <ResultCard title="Fortalezas y áreas de mejora" accent="#6366f1">
                  <div className="grid sm:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: '#4ade80' }}>✅ Fortalezas</p>
                      {(interviewFeedback.fortalezas_entrevista || []).map((f, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <span className="mt-0.5 shrink-0" style={{ color: '#16a34a' }}>•</span>
                          <p className="text-slate-600 text-sm">{f}</p>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: '#d97706' }}>⚠️ Áreas de mejora</p>
                      {(interviewFeedback.areas_de_mejora_entrevista || []).map((a, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <span className="mt-0.5 shrink-0" style={{ color: '#d97706' }}>•</span>
                          <p className="text-slate-600 text-sm">{a}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </ResultCard>

                {/* Feedback por respuesta */}
                <ResultCard title="Feedback por respuesta" accent="#6366f1">
                  <div className="space-y-4">
                    {(interviewFeedback.feedback_por_respuesta || []).map((fb, i) => (
                      <div key={i} className="rounded-xl p-4"
                        style={{ background: '#f8fafc', border: '1px solid rgba(0,119,181,0.12)' }}>
                        <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#6366f1' }}>
                          Pregunta {fb.numero}
                        </p>
                        <p className="text-slate-500 text-xs italic mb-2 leading-relaxed">"{INTERVIEW_QUESTIONS[fb.numero - 1]?.pregunta ?? `Pregunta ${fb.numero}`}"</p>
                        <div className="space-y-1.5">
                          <p className="text-sm text-slate-600"><span style={{ color: '#16a34a' }}>✅ </span>{fb.aspecto_positivo}</p>
                          <p className="text-sm text-slate-600"><span style={{ color: '#d97706' }}>💡 </span>{fb.sugerencia}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ResultCard>

                {/* Recomendación final */}
                <div className="rounded-2xl p-5"
                  style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.3)' }}>
                  <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#6366f1' }}>⚡ Recomendación final</p>
                  <p className="text-slate-800 text-sm leading-relaxed">{interviewFeedback.recomendacion_final}</p>
                </div>

                {/* Card Ramiro */}
                <div className="rounded-2xl p-6 text-center"
                  style={{ background: 'rgba(0,119,181,0.08)', border: '1px solid rgba(0,119,181,0.3)' }}>
                  <div className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center text-white font-bold text-sm"
                    style={{ background: 'linear-gradient(135deg,#0077B5,#0ea5e9)' }}>
                    RS
                  </div>
                  <p className="text-slate-900 font-semibold">Ramiro Silvera</p>
                  <p className="text-slate-500 text-sm mt-0.5">Gerente de RRHH · Creador de esta herramienta</p>
                  <p className="text-slate-600 text-sm mt-3 leading-relaxed max-w-xs mx-auto">
                    Si querés feedback personalizado o ayuda concreta con tu búsqueda, escribime en LinkedIn.
                  </p>
                  <p className="text-slate-500 text-xs mt-3 max-w-xs mx-auto leading-relaxed">
                    Al conectar, tu análisis de perfil y tus respuestas de entrevista serán enviados al administrador de la app para que pueda orientarte desde el primer mensaje.
                  </p>
                  <button
                    onClick={() => !leadSaving && !leadSent && setShowLeadModal(true)}
                    disabled={leadSaving || leadSent}
                    className={`inline-flex items-center gap-2 mt-4 px-6 py-3 rounded-2xl text-white font-semibold text-sm ${!leadSent ? 'btn-glow' : ''}`}
                    style={{
                      background: leadSent
                        ? 'rgba(34,197,94,0.15)'
                        : 'linear-gradient(135deg,#0077B5,#0ea5e9)',
                      border: leadSent ? '1px solid rgba(34,197,94,0.4)' : 'none',
                      color: leadSent ? '#4ade80' : '#fff',
                      cursor: leadSaving || leadSent ? 'default' : 'pointer',
                    }}
                  >
                    {leadSaving ? (
                      <><Spinner size={4} /> Enviando datos...</>
                    ) : leadSent ? (
                      '✓ Datos enviados — LinkedIn abierto'
                    ) : (
                      <><LinkedInIcon className="w-4 h-4" /> Conectar con Ramiro</>
                    )}
                  </button>
                </div>

                {/* Card colaboración */}
                <div className="rounded-2xl p-6 text-center"
                  style={{ background: 'rgba(0,180,150,0.07)', border: '1px solid rgba(0,180,150,0.25)' }}>
                  <div className="text-3xl mb-3">🙌</div>
                  <p className="text-slate-900 font-semibold">¿Te fue útil la app?</p>
                  <p className="text-slate-600 text-sm mt-3 leading-relaxed max-w-xs mx-auto">
                    Esta herramienta tiene costos reales de mantenimiento. Si te fue útil, podés colaborar con un aporte de <strong>única vez</strong> — no es una suscripción. Es totalmente optativo y me ayuda a sostenerla y seguir mejorándola.
                  </p>
                  <a
                    href="https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_plan_id=0922af414b854dabb5942e3291b2b5cb"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 mt-4 px-6 py-3 rounded-2xl text-white font-semibold text-sm transition-all duration-200"
                    style={{ background: 'linear-gradient(135deg,#00b496,#00d4aa)', boxShadow: '0 0 20px rgba(0,180,150,0.3)' }}
                  >
                    💙 &nbsp;Colaborar con la app
                  </a>
                  <p className="text-slate-600 text-xs mt-3">Pago único · Seguro · Mercado Pago</p>
                </div>

                <button
                  onClick={() => setStep(STEPS.RESULTS)}
                  className="w-full font-semibold py-4 rounded-2xl text-sm"
                  style={{ border: '1px solid rgba(0,119,181,0.15)', color: '#3d5a73', background: '#f0f4f8' }}
                >
                  ← Volver a mi análisis
                </button>
              </>
            )}
          </div>
        )}

      </div>

      {/* ── Modal nombre + colaboración ── */}
      {showLeadModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 overflow-y-auto"
          style={{ background: 'rgba(0,0,0,0.40)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowLeadModal(false) }}
        >
          <div className="w-full max-w-sm rounded-2xl step-transition overflow-hidden"
            style={{ background: 'white', boxShadow: '0 20px 60px rgba(0,0,0,0.20)', border: '1px solid rgba(0,119,181,0.15)' }}>

            {/* Sección nombre */}
            <div className="p-6 space-y-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Antes de conectar con Ramiro</h3>
                <p className="text-slate-500 text-sm mt-1 leading-relaxed">
                  Ingresá tu nombre para que sepa quién le escribe y pueda revisar tu análisis de antemano.
                </p>
              </div>
              <div className="space-y-2.5">
                <input
                  type="text"
                  placeholder="Nombre"
                  value={leadNombre}
                  onChange={e => setLeadNombre(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && leadNombre.trim() && leadApellido.trim()) saveAndConnectRamiro(leadNombre, leadApellido) }}
                  maxLength={60}
                  className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-all duration-200"
                  style={{
                    background: '#f8fafc',
                    border: leadNombre.trim() ? '1px solid rgba(0,119,181,0.5)' : '1px solid rgba(0,119,181,0.15)',
                    color: '#0d2137',
                  }}
                />
                <input
                  type="text"
                  placeholder="Apellido"
                  value={leadApellido}
                  onChange={e => setLeadApellido(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && leadNombre.trim() && leadApellido.trim()) saveAndConnectRamiro(leadNombre, leadApellido) }}
                  maxLength={60}
                  className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-all duration-200"
                  style={{
                    background: '#f8fafc',
                    border: leadApellido.trim() ? '1px solid rgba(0,119,181,0.5)' : '1px solid rgba(0,119,181,0.15)',
                    color: '#0d2137',
                  }}
                />
              </div>
              <p className="text-slate-400 text-xs leading-relaxed">
                Tu nombre, análisis y respuestas de entrevista serán enviados a Ramiro para orientarte desde el primer mensaje. La consulta personalizada tiene un costo que se cotizará en el momento.
              </p>
            </div>

            {/* Sección colaboración */}
            <div className="px-6 pb-2 pt-1 space-y-3"
              style={{ borderTop: '1px solid rgba(0,180,150,0.18)', background: 'rgba(0,180,150,0.04)' }}>
              <div className="flex items-start gap-3 pt-4">
                <span className="text-2xl shrink-0">🙌</span>
                <div>
                  <p className="text-sm font-semibold text-slate-800">¿Querés apoyar la app?</p>
                  <p className="text-slate-500 text-xs mt-1 leading-relaxed">
                    Esta herramienta tiene costos reales. Si te fue útil, podés colaborar con un aporte de <strong>única vez</strong> — no es una suscripción mensual. Es totalmente optativo y me ayuda a sostenerla y seguir mejorándola.
                  </p>
                </div>
              </div>
              <button
                onClick={() => saveAndConnectRamiro(leadNombre, leadApellido, true)}
                disabled={!leadNombre.trim() || !leadApellido.trim()}
                className={`w-full py-3 rounded-xl text-white text-sm font-semibold transition-all ${leadNombre.trim() && leadApellido.trim() ? '' : 'opacity-40 cursor-not-allowed'}`}
                style={{ background: leadNombre.trim() && leadApellido.trim() ? 'linear-gradient(135deg,#00b496,#00d4aa)' : 'rgba(0,180,150,0.3)', boxShadow: leadNombre.trim() && leadApellido.trim() ? '0 0 18px rgba(0,180,150,0.3)' : 'none' }}
              >
                💙 Colaborar y conectar con Ramiro
              </button>
              <button
                onClick={() => saveAndConnectRamiro(leadNombre, leadApellido, false)}
                disabled={!leadNombre.trim() || !leadApellido.trim()}
                className={`w-full py-3 rounded-xl text-sm font-semibold transition-all ${leadNombre.trim() && leadApellido.trim() ? '' : 'opacity-40 cursor-not-allowed'}`}
                style={{ border: '1px solid rgba(0,119,181,0.2)', color: '#0077B5', background: 'white' }}
              >
                <LinkedInIcon className="w-4 h-4 inline mr-1.5" /> Solo conectar con Ramiro →
              </button>
              <button
                onClick={() => setShowLeadModal(false)}
                className="w-full py-2 text-slate-400 text-xs hover:text-slate-600 transition-colors pb-5"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

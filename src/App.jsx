import { useState, useEffect, useCallback, useRef } from 'react'
import emailjs from '@emailjs/browser'
import './index.css'

const WORKER_URL = import.meta.env.VITE_WORKER_URL
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
const EMAILJS_SERVICE_ID  = import.meta.env.VITE_EMAILJS_SERVICE_ID  || ''
const EMAILJS_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID || ''
const EMAILJS_PUBLIC_KEY  = import.meta.env.VITE_EMAILJS_PUBLIC_KEY  || ''

function parseGeminiError(status, body) {
  if (status === 400) return 'API key inválida o solicitud incorrecta. Revisá la key ingresada.'
  if (status === 403) return 'API key sin permisos. Verificá que esté habilitada en Google AI Studio.'
  return `Error HTTP ${status}: ${body?.error?.message || 'Error desconocido'}`
}
function makeRateLimitError() {
  return Object.assign(new Error('RATE_LIMIT'), { isRateLimit: true })
}

const STEPS = {
  WELCOME: 0, QUESTIONS: 1, PROFILE_INPUT: 2, LOADING: 3, RESULTS: 4,
  INTERVIEW_INTRO: 5, INTERVIEW: 6, INTERVIEW_FEEDBACK: 7, STAR_TRAINING: 8,
}

function RateLimitUI({ secs, evento, email, onEmailChange, sent, loading, onSubmit }) {
  const amber = { background: 'rgba(251,191,36,0.10)', border: '1px solid rgba(251,191,36,0.35)', color: '#fbbf24' }
  if (secs > 0) return (
    <div role="alert" className="rounded-xl p-4 text-sm flex items-center gap-3" style={amber}>
      <span style={{ fontSize: '1.1em' }}>⏱</span>
      <span>Estamos experimentando alta demanda. Volvé a intentar en <strong>{secs}s</strong></span>
    </div>
  )
  if (!evento) return null
  if (sent) return (
    <div role="alert" className="rounded-xl p-4 text-sm text-center font-medium"
      style={{ background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.35)', color: '#22c55e' }}>
      ✓ ¡Anotado! Te mandamos un mail cuando vuelva a estar disponible.
    </div>
  )
  return (
    <div role="alert" className="rounded-xl p-4 text-sm space-y-3" style={amber}>
      <p>⏱ Los tokens de IA se agotaron por hoy. Dejá tu email y te avisamos mañana cuando se reinicien.</p>
      <div className="flex gap-2">
        <input type="email" value={email} onChange={e => onEmailChange(e.target.value)}
          placeholder="tu@email.com" onKeyDown={e => e.key === 'Enter' && email.includes('@') && onSubmit(email)}
          className="flex-1 rounded-lg px-3 py-2 text-sm text-white outline-none"
          style={{ background: 'rgba(15,23,42,0.85)', border: '1px solid rgba(251,191,36,0.3)' }} />
        <button onClick={() => onSubmit(email)} disabled={loading || !email.includes('@')}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-900 transition-opacity"
          style={{ background: '#fbbf24', opacity: loading || !email.includes('@') ? 0.45 : 1, cursor: loading || !email.includes('@') ? 'not-allowed' : 'pointer' }}>
          {loading ? '...' : 'Avisame'}
        </button>
      </div>
    </div>
  )
}

// ── Shared style tokens ─────────────────────────────────────────
const LI_GRADIENT = 'linear-gradient(135deg,#0077B5,#0ea5e9)'
const CARD_STYLE = { background: 'white', border: '1px solid rgba(0,119,181,0.12)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }

// ── GA4 tracking helper ──────────────────────────────────────────
const trackEvent = (name, params = {}) => {
  if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
    window.gtag('event', name, params)
  }
}
const INPUT_STYLE = { background: 'white', border: '1px solid rgba(0,119,181,0.20)', color: '#0d2137' }
const INPUT_ALT_STYLE = { background: '#f8fafc', border: '1px solid rgba(0,119,181,0.15)', color: '#0d2137' }
const BTN_BACK_STYLE = { border: '1px solid rgba(0,119,181,0.15)', color: '#3d5a73', background: '#f0f4f8' }
const BTN_GHOST_STYLE = { color: '#0077B5', background: 'rgba(0,119,181,0.08)', border: '1px solid rgba(0,119,181,0.2)' }

const RAMIRO_LINKEDIN_URL  = 'https://www.linkedin.com/in/ramiro-silvera-b0819459'
const COMPANY_LINKEDIN_URL = 'https://www.linkedin.com/company/optimiza-lk/'
const MP_URL               = 'https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_plan_id=0922af414b854dabb5942e3291b2b5cb'
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

const STAR_SYSTEM_PROMPT = `Sos un coach de entrevistas laborales especializado en la metodología STAR. Evaluá si la respuesta del usuario aplica correctamente la metodología STAR (Situación, Tarea, Acción, Resultado). Sé directo, específico y constructivo. Respondé en español rioplatense. Respondé SOLO en JSON válido, sin markdown, sin backticks.`

const STAR_QUESTIONS = [
  'Contame sobre un momento en que tuviste que resolver un problema complejo en el trabajo.',
  'Describí una situación en la que lideraste un proyecto o iniciativa desde cero.',
  'Contame sobre un logro profesional concreto del que estés orgulloso/a.',
  '¿Cuándo tuviste que manejar un conflicto en tu equipo? ¿Cómo lo resolviste?',
  'Describí una situación en la que tuviste que adaptarte rápidamente a un cambio inesperado.',
  'Contame sobre una vez que tuviste que influir o convencer a alguien sin tener autoridad directa.',
]

const LOADING_MESSAGES_BY_SITUACION = {
  'Empleado/a buscando un nuevo trabajo': [
    'Los reclutadores pasan apenas 6 segundos en el primer vistazo de un perfil...',
    'El 87% de los reclutadores usa LinkedIn para encontrar candidatos activamente...',
    'Un titular optimizado puede triplicar tus apariciones en búsquedas de reclutadores...',
    'Los perfiles con foto reciben 21× más visitas que los que no la tienen...',
    'El resumen es tu única oportunidad de hablarle directamente al reclutador que te busca...',
    'Las habilidades validadas por colegas aumentan 17× tu visibilidad ante empresas...',
    'Perfiles con logros concretos y métricas generan 40% más entrevistas...',
  ],
  'Freelancer o consultor/a buscando más clientes': [
    'El 80% de los clientes B2B revisa LinkedIn antes de contratar a un consultor...',
    'Un perfil con propuesta de valor específica duplica las consultas entrantes...',
    'Tu titular es tu pitch de ventas — tiene 3 segundos para convencer a un cliente potencial...',
    'Los freelancers con recomendaciones visibles generan más confianza que los que no las tienen...',
    'Los perfiles con foto profesional reciben 21× más visitas...',
    'Un resumen orientado a resultados convierte más visitas en consultas reales...',
    'Las palabras clave correctas hacen que tus clientes ideales te encuentren a vos...',
  ],
  'Emprendedor/a o dueño/a de negocio buscando visibilidad': [
    'Los fundadores con perfil activo en LinkedIn generan más partnerships y oportunidades...',
    'Tu perfil es tu carta de presentación ante inversores, socios y clientes potenciales...',
    'El 60% de las decisiones de negocio B2B involucra una búsqueda en LinkedIn...',
    'Los emprendedores que publican contenido son 3× más visibles en su industria...',
    'Un titular que comunica tu visión atrae a las personas correctas...',
    'La sección Acerca de es tu oportunidad de contar por qué tu empresa existe...',
    'Los perfiles con foto reciben 21× más visitas que los que no la tienen...',
  ],
  'Profesional buscando crecer o ascender en mi empresa': [
    'Los profesionales con perfil optimizado son 40% más considerados para ascensos internos...',
    'Tu visibilidad en LinkedIn influye en cómo te perciben dentro y fuera de tu empresa...',
    'Un perfil que muestra logros concretos refuerza tu reputación ante líderes de área...',
    'Las habilidades validadas por colegas aumentan tu credibilidad ante decisores...',
    'El resumen es tu oportunidad de comunicar tu propuesta de valor hacia adentro...',
    'Publicar contenido de tu industria posiciona tu expertise frente a quienes toman decisiones...',
    'Los perfiles con foto profesional proyectan más confianza y seriedad...',
  ],
  'En transición de carrera o reingresando al mercado': [
    'Los perfiles que narran bien una transición generan más confianza en reclutadores...',
    'Tu experiencia previa es un activo — la clave está en cómo la reencuadrás...',
    'Un titular que comunica hacia dónde vas (no solo de dónde venís) abre más puertas...',
    'El resumen es el lugar ideal para contar tu historia de transición con claridad...',
    'Las habilidades transferibles bien documentadas acortan el tiempo de búsqueda...',
    'Más del 70% de los empleos se consiguen por red de contactos — LinkedIn es esa red...',
    'Los perfiles con foto reciben 21× más visitas que los que no la tienen...',
  ],
}
const LOADING_MESSAGES_DEFAULT = [
  'Los reclutadores pasan apenas 6 segundos en el primer vistazo de un perfil...',
  'El 87% de los reclutadores usa LinkedIn para encontrar candidatos activamente...',
  'Los perfiles con foto reciben 21× más visitas que los que no la tienen...',
  'Un titular optimizado puede triplicar tus apariciones en búsquedas...',
  'El resumen es el único espacio donde podés hablarle directamente a tu audiencia ideal...',
  'Los perfiles con habilidades validadas tienen 17× más chances de ser vistos...',
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
- Foto de perfil: si se incluye una imagen, evaluá profesionalismo, encuadre tipo headshot (hombros + cara), fondo limpio o neutro, iluminación, expresión y si comunica el rol profesional del candidato.
Respondé siempre en español rioplatense (Argentina).
No usés lenguaje genérico ni de autoayuda.
Sé directa, específica y orientada a resultados medibles.
Respondé SOLO en JSON válido, sin markdown, sin backticks.`

const CV_SYSTEM_PROMPT = `Sos un experto redactor de CVs ATS-compatible para el mercado argentino/latinoamericano.
Transformá el perfil en un CV de EXACTAMENTE 1 PÁGINA. Si el contenido es extenso, comprimí más: reducí bullets a 2 por experiencia, acortá el resumen a 1 oración, eliminá educación redundante.

Reglas:
- "experiencias_detalladas": últimas 3 posiciones con cargo, empresa, periodo y máx 2-3 bullets de logros (verbo + métrica)
- "experiencias_resumidas": posiciones anteriores, SOLO cargo + empresa + periodo, sin bullets
- "educacion_detallada": máx 2 títulos más relevantes con titulo, institucion, periodo
- "educacion_resumida": resto de educación, SOLO titulo + institucion + periodo
- Habilidades: extraé TODAS las habilidades, aptitudes y competencias del perfil. Si el usuario proporcionó habilidades adicionales, incorporalas obligatoriamente. Incluí entre 6 y 10 en total.
- Resumen: máx 2 oraciones. Sin objetivo laboral, sin foto, sin datos personales sensibles.
- Todo en español (excepto tecnicismos en inglés).
- Usá "titular_propuesto" y "resumen_propuesto" del análisis si están disponibles.
- Respondé SOLO en JSON válido, sin markdown, sin backticks.`

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
    <div className="mb-8 sm:mb-10">
      <img
        src="/logo.PNG"
        alt="OptimizaLinkedin"
        style={{ height: '80px', width: 'auto', display: 'block', mixBlendMode: 'multiply' }}
      />
    </div>
  )
}

function Spinner({ size = 4 }) {
  const px = size * 4
  return (
    <div
      className="rounded-full border-2 animate-spin shrink-0"
      style={{ width: px, height: px, borderColor: 'rgba(0,119,181,0.25)', borderTopColor: '#0077B5' }}
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
          style={{ background: LI_GRADIENT, color: '#fff' }}>✓</span>
      )}
    </button>
  )
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(t)
  }, [copied])
  return (
    <button
      onClick={() => navigator.clipboard.writeText(text).then(() => setCopied(true))}
      className={`text-xs px-3 py-1.5 rounded-lg border transition-all duration-200 shrink-0 whitespace-nowrap ${copied ? 'copy-btn-success' : ''}`}
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
  LI_GRADIENT,
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
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)
    fetch(
      `${SUPABASE_URL}/rest/v1/comments?status=eq.approved&order=created_at.desc&limit=6`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }, signal: controller.signal }
    )
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => setComments(Array.isArray(data) ? data : []))
      .catch(err => { if (err.name !== 'AbortError') setFetchError(true) })
      .finally(() => { clearTimeout(timeoutId); setLoading(false) })
    return () => { clearTimeout(timeoutId); controller.abort() }
  }, [])

  const initials = (name) => {
    const p = name.trim().split(/\s+/)
    return (p.length >= 2 ? p[0][0] + p[1][0] : name.slice(0, 2)).toUpperCase()
  }
  const avatarGrad = (name) => AVATAR_GRADS[name.charCodeAt(0) % AVATAR_GRADS.length]
  const isValidLinkedIn = (url) =>
    /^https?:\/\/(www\.)?linkedin\.com\/in\/[\w%-]+/i.test(url.trim())

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (submitting) return
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
              style={BTN_BACK_STYLE}>
              Cancelar
            </button>
            <button type="submit" disabled={submitting}
              className={`flex-[2] py-2.5 rounded-xl text-sm font-semibold text-white ${!submitting ? 'btn-glow' : ''}`}
              style={{ background: submitting ? 'rgba(0,119,181,0.15)' : LI_GRADIENT, color: submitting ? '#64748b' : '#fff' }}>
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
  const [instrTab, setInstrTab] = useState(() =>
    /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop'
  )
  const [mobileSlide, setMobileSlide] = useState(0)
  const touchStartX = useRef(null)
  const instrTabRef = useRef(instrTab)
  useEffect(() => { instrTabRef.current = instrTab }, [instrTab])
  useEffect(() => {
    const handleYTMessage = (e) => {
      if (!e.data) return
      try {
        const d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
        if (d.event !== 'onStateChange') return
        const actions = { 1: 'play', 2: 'pause', 0: 'end' }
        const action = actions[d.info]
        if (!action) return
        const tab = instrTabRef.current
        trackEvent('tutorial_video', {
          action,
          tab,
          video_id: 'wUR9COhVWyI',
        })
      } catch {}
    }
    window.addEventListener('message', handleYTMessage)
    return () => window.removeEventListener('message', handleYTMessage)
  }, [])
  const [isDragging, setIsDragging] = useState(false)
  const [inputMode, setInputMode] = useState('pdf') // 'pdf' | 'form'
  const [linkedinUrl, setLinkedinUrl] = useState('')
  const [urlLoading, setUrlLoading] = useState(false)
  const [urlAttempted, setUrlAttempted] = useState(false)
  const [profilePhoto, setProfilePhoto] = useState(null)
  const [profilePhotoMime, setProfilePhotoMime] = useState('image/jpeg')
  const [profilePhotoPreview, setProfilePhotoPreview] = useState(null)
  const [formTitular, setFormTitular] = useState('')
  const [formResumen, setFormResumen] = useState('')
  const [formHabilidades, setFormHabilidades] = useState('')
  const [formExperiencias, setFormExperiencias] = useState([{ cargo: '', empresa: '', periodo: '', descripcion: '' }])
  const [formEducacion, setFormEducacion] = useState([{ institucion: '', titulo: '', periodo: '' }])
  const [formConfirmed, setFormConfirmed] = useState(false)

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

  const [rateLimitSecs, setRateLimitSecs] = useState(0)
  const [rateLimitEvento, setRateLimitEvento] = useState('')
  const [waitlistEmail, setWaitlistEmail] = useState('')
  const [waitlistSent, setWaitlistSent] = useState(false)
  const [waitlistLoading, setWaitlistLoading] = useState(false)

  // Contacto con Ramiro
  const [leadSaving, setLeadSaving] = useState(false)
  const [leadSent, setLeadSent] = useState(false)
  const [showLeadModal, setShowLeadModal] = useState(false)
  const [leadNombre, setLeadNombre] = useState('')
  const [leadApellido, setLeadApellido] = useState('')

  // Entrenador STAR
  const [showStarModal, setShowStarModal] = useState(false)
  const [starPhase, setStarPhase] = useState('theory')
  const [starQuestionIdx, setStarQuestionIdx] = useState(0)
  const [starAnswer, setStarAnswer] = useState('')
  const [starFeedback, setStarFeedback] = useState(null)
  const [starLoading, setStarLoading] = useState(false)
  const [starError, setStarError] = useState('')

  // Consentimiento para guardar análisis
  const [showAnalisisConsent, setShowAnalisisConsent] = useState(false)
  const [analisisSaved, setAnalisisSaved] = useState(false)
  const [analisisSaving, setAnalisisSaving] = useState(false)
  const [analisisError, setAnalisisError] = useState('')

  // CV de 1 página
  const [cvLoading, setCvLoading] = useState(false)
  const [cvError, setCvError] = useState('')
  const [cvSuccess, setCvSuccess] = useState('')
  const [cvPreviewHtml, setCvPreviewHtml] = useState('')
  const [showCvModal, setShowCvModal] = useState(false)
  const [pendingWithSupport, setPendingWithSupport] = useState(false)
  const [contactEmail, setContactEmail] = useState('')
  const [contactTelefono, setContactTelefono] = useState('')
  const [contactLinkedin, setContactLinkedin] = useState('')
  const [contactNombre, setContactNombre] = useState('')
  const [contactUbicacion, setContactUbicacion] = useState('')
  const [contactIdiomas, setContactIdiomas] = useState('')
  const [contactHabilidades, setContactHabilidades] = useState('')

  // Scroll al tope en cada cambio de paso (crítico en mobile)
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }) }, [step])
  useEffect(() => {
    if (rateLimitSecs <= 0) return
    const t = setTimeout(() => setRateLimitSecs(s => s - 1), 1000)
    return () => clearTimeout(t)
  }, [rateLimitSecs])

  // Aviso antes de cerrar pestaña si hay resultados
  useEffect(() => {
    if (step < STEPS.RESULTS) return
    const handler = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [step])

  // Revocar object URL de foto al cambiar o desmontar (evita memory leak)
  useEffect(() => {
    return () => { if (profilePhotoPreview) URL.revokeObjectURL(profilePhotoPreview) }
  }, [profilePhotoPreview])

  // Loading message rotation
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0)
  const loadingMsgs = LOADING_MESSAGES_BY_SITUACION[qaHistory[1]?.answer] ?? LOADING_MESSAGES_DEFAULT
  useEffect(() => {
    if (step !== STEPS.LOADING) return
    const id = setInterval(() => setLoadingMsgIdx(i => (i + 1) % loadingMsgs.length), 3500)
    return () => clearInterval(id)
  }, [step, loadingMsgs.length])

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
    setInstrTab(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop')
    setMobileSlide(0)
    setIsDragging(false)
    setInputMode('pdf')
    setLinkedinUrl('')
    setUrlLoading(false)
    setUrlAttempted(false)
    setProfilePhoto(null)
    setProfilePhotoMime('image/jpeg')
    setProfilePhotoPreview(null)
    setFormTitular('')
    setFormResumen('')
    setFormHabilidades('')
    setFormExperiencias([{ cargo: '', empresa: '', periodo: '', descripcion: '' }])
    setFormEducacion([{ institucion: '', titulo: '', periodo: '' }])
    setFormConfirmed(false)
    setResult(null)
    setAnalysisError('')
    setAnalyzing(false)
    setLoadingMsgIdx(0)
    setShowAnalisisConsent(false)
    setAnalisisSaved(false)
    setAnalisisSaving(false)
    setAnalisisError('')
    setCvLoading(false)
    setCvError('')
    setCvSuccess('')
    setCvPreviewHtml('')
    setShowCvModal(false)
    setPendingWithSupport(false)
    setContactEmail('')
    setContactTelefono('')
    setContactLinkedin('')
    setContactNombre('')
    setContactUbicacion('')
    setContactIdiomas('')
    setContactHabilidades('')
    setRateLimitSecs(0)
    setRateLimitEvento('')
    setWaitlistEmail('')
    setWaitlistSent(false)
    setWaitlistLoading(false)
    setShowStarModal(false)
    setStarPhase('theory')
    setStarQuestionIdx(0)
    setStarAnswer('')
    setStarFeedback(null)
    setStarLoading(false)
    setStarError('')
    resetInterview()
  }

  // ── Waitlist: guardar email y enviar aviso ──
  const handleWaitlist = async (email) => {
    if (waitlistLoading || waitlistSent || !email.includes('@')) return
    setWaitlistLoading(true)
    try {
      if (SUPABASE_URL) {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/waitlist`, {
          method: 'POST',
          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ email: email.trim(), evento: rateLimitEvento }),
        })
        if (!res.ok) console.error('[waitlist save]', res.status)
      }
      if (EMAILJS_SERVICE_ID && EMAILJS_TEMPLATE_ID && EMAILJS_PUBLIC_KEY) {
        await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, { to_email: email.trim() }, EMAILJS_PUBLIC_KEY)
      }
      trackEvent('waitlist_signup', { evento: rateLimitEvento })
      setWaitlistSent(true)
    } catch (err) {
      console.error('[waitlist email]', err)
      setWaitlistSent(true)
    } finally {
      setWaitlistLoading(false)
    }
  }

  // ── Avanzar al siguiente paso del cuestionario ──
  const handleAnswer = (answer) => {
    const newHistory = [...qaHistory, { question: currentQ.question, answer }]
    setQaHistory(newHistory)
    setSelectedOption(null)
    setTextAnswer('')
    const nextIndex = newHistory.length
    trackEvent('paso_completado', { paso: nextIndex, id: currentQ.id })
    if (nextIndex < STATIC_QUESTIONS.length) {
      setCurrentQ(STATIC_QUESTIONS[nextIndex])
    } else {
      trackEvent('cuestionario_completado')
      setStep(STEPS.PROFILE_INPUT)
    }
  }

  // ── Volver a la pregunta anterior ──
  const handleBack = () => {
    if (qaHistory.length === 0) {
      setStep(STEPS.WELCOME)
      return
    }
    const prev = qaHistory[qaHistory.length - 1]
    const newHistory = qaHistory.slice(0, -1)
    setQaHistory(newHistory)
    const prevQ = STATIC_QUESTIONS[newHistory.length]
    setCurrentQ(prevQ)
    if (prevQ?.type === 'text') {
      setTextAnswer(prev.answer)
      setSelectedOption(null)
    } else {
      setSelectedOption(prev.answer)
      setTextAnswer('')
    }
  }

  // ── Switch input mode (pdf / form) ──
  const handleInputModeSwitch = (mode) => {
    if (mode === inputMode) return
    setInputMode(mode)
    setProfileText('')
    // Preserve form data when switching back to form tab; only clear PDF state
    if (mode === 'pdf') setFormConfirmed(false)
    setPdfFileName('')
    setPdfError('')
  }

  // ── Confirm form data → build profileText ──
  const handleFormConfirm = () => {
    if (!formTitular.trim()) return
    const expLines = formExperiencias
      .filter(e => e.cargo.trim() || e.empresa.trim())
      .map(e =>
        `• ${[e.cargo.trim(), e.empresa.trim()].filter(Boolean).join(' en ')}${e.periodo.trim() ? ` | ${e.periodo.trim()}` : ''}${e.descripcion.trim() ? `\n  ${e.descripcion.trim()}` : ''}`
      )
      .join('\n')
    const eduLines = formEducacion
      .filter(e => e.institucion.trim() || e.titulo.trim())
      .map(e =>
        `• ${[e.titulo.trim(), e.institucion.trim()].filter(Boolean).join(' — ')}${e.periodo.trim() ? ` | ${e.periodo.trim()}` : ''}`
      )
      .join('\n')
    const parts = [`TITULAR PROFESIONAL: ${formTitular.trim()}`]
    if (formResumen.trim()) parts.push(`RESUMEN / ACERCA DE:\n${formResumen.trim()}`)
    if (expLines) parts.push(`EXPERIENCIA PROFESIONAL:\n${expLines}`)
    if (eduLines) parts.push(`EDUCACIÓN:\n${eduLines}`)
    if (formHabilidades.trim()) parts.push(`HABILIDADES: ${formHabilidades.trim()}`)
    setProfileText(parts.join('\n\n'))
    setFormConfirmed(true)
    trackEvent('cv_subido', { metodo: 'formulario' })
  }

  // ── Attempt to fetch LinkedIn profile by URL ──
  const handleUrlAttempt = async () => {
    const url = linkedinUrl.trim()
    if (!url || urlLoading) return
    if (!url.startsWith('https://www.linkedin.com/in/') && !url.startsWith('https://linkedin.com/in/')) {
      setUrlAttempted(true)
      return
    }
    setUrlLoading(true)
    try {
      const res = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'fetch_url', url }),
      })
      const data = await res.json().catch(() => ({ blocked: true }))
      if (!data.blocked && data.html) {
        const text = data.html.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, 4000)
        if (text.length > 200) {
          setProfileText(text)
          setUrlAttempted(true)
          return
        }
      }
      setUrlAttempted(true)
    } catch {
      setUrlAttempted(true)
    } finally {
      setUrlLoading(false)
    }
  }

  // ── Upload profile photo for form mode ──
  const handlePhotoUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) return
    setProfilePhotoMime(file.type)
    setProfilePhotoPreview(URL.createObjectURL(file))
    const reader = new FileReader()
    reader.onload = () => setProfilePhoto(reader.result.split(',')[1])
    reader.readAsDataURL(file)
    setFormConfirmed(false)
    setProfileText('')
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
        if (res.status === 429) throw makeRateLimitError()
        throw new Error(parseGeminiError(res.status, body))
      }
      const data = await res.json()
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
      if (text.length < 100) throw new Error('No se pudo extraer contenido del PDF. Verificá que sea el PDF de tu perfil de LinkedIn y que no esté protegido con contraseña.')
      setProfileText(text)
      trackEvent('cv_subido', { metodo: 'pdf' })
    } catch (err) {
      if (err.isRateLimit) { setRateLimitSecs(60); setRateLimitEvento('pdf'); return }
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
  "estrategia_contenido": "sugerencia de 2-3 oraciones sobre qué tipo de contenido publicar para lograr el objetivo declarado",
  "analisis_foto": "evaluación concreta de la foto de perfil: profesionalismo, encuadre tipo headshot, fondo, iluminación, expresión. Si no se incluyó foto, indicá brevemente la importancia de tenerla."
}`

    const controller = new AbortController()
    analysisAbortRef.current = controller
    const timeoutId = setTimeout(() => controller.abort(), 58000)
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
              { text: userPrompt },
              ...(profilePhoto ? [{ inlineData: { mimeType: profilePhotoMime, data: profilePhoto } }] : []),
            ],
          }],
          generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 3000 },
        }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        if (res.status === 429) throw makeRateLimitError()
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
        analisis_foto: parsed.analisis_foto || '',
      })
      trackEvent('analisis_recibido', { puntaje: parsed.puntaje_general, nivel_seo: parsed.nivel_seo })
      setShowAnalisisConsent(true)
      trackEvent('analisis_consent_shown', { puntaje: parsed.puntaje_general })
      setStep(STEPS.RESULTS)
    } catch (err) {
      if (err.isRateLimit) { setRateLimitSecs(60); setRateLimitEvento('analisis'); setStep(STEPS.PROFILE_INPUT); return }
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
        const res = await fetch(`${SUPABASE_URL}/rest/v1/leads`, {
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
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          console.error('[leads save] error response:', res.status, body)
        }
      }
    } catch (err) {
      // Si falla, abrimos LinkedIn igual — nunca bloqueamos al usuario
      console.error('[leads save]', err)
    } finally {
      setLeadSaving(false)
      setLeadSent(true)
      if (colaborar) window.open(MP_URL, '_blank', 'noopener,noreferrer')
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

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 58000)
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
        signal: controller.signal,
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        if (res.status === 429) throw makeRateLimitError()
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
      trackEvent('entrevista_completada', { puntaje: parsed.puntaje_entrevista })
    } catch (err) {
      if (err.isRateLimit) { setRateLimitSecs(60); setRateLimitEvento('entrevista'); return }
      const msg = err.name === 'AbortError' ? 'El análisis tardó demasiado. Intentá de nuevo.' : err.message || 'Error al generar el feedback.'
      setInterviewError(msg)
    } finally {
      clearTimeout(timeoutId)
      setInterviewLoading(false)
    }
  }

  // ── Entrenador STAR ─────────────────────────────────────────

  const callStarFeedback = async () => {
    if (starLoading) return
    setStarLoading(true)
    setStarError('')
    setStarFeedback(null)
    const pregunta = STAR_QUESTIONS[starQuestionIdx]
    const userPrompt = `Pregunta de entrevista: "${pregunta}"\n\nRespuesta del candidato:\n"${starAnswer}"\n\nEvaluá si la respuesta aplica la metodología STAR. Respondé con este JSON exacto:\n{\n  "puntaje": número del 1 al 10,\n  "situacion": { "presente": true/false, "comentario": "max 1 oración" },\n  "tarea": { "presente": true/false, "comentario": "max 1 oración" },\n  "accion": { "presente": true/false, "comentario": "max 1 oración" },\n  "resultado": { "presente": true/false, "comentario": "max 1 oración" },\n  "sugerencia_clave": "1 mejora concreta y específica para esta respuesta"\n}`
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)
    try {
      if (!WORKER_URL) throw new Error('Worker URL no configurada.')
      const res = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          system_instruction: { parts: [{ text: STAR_SYSTEM_PROMPT }] },
          contents: [{ parts: [{ text: userPrompt }] }],
          generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 700 },
        }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        if (res.status === 429) throw makeRateLimitError()
        throw new Error(parseGeminiError(res.status, e))
      }
      const data = await res.json()
      const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
      let parsed
      try { parsed = JSON.parse(raw) }
      catch { const m = raw.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); else throw new Error('La IA devolvió una respuesta inesperada. Intentá de nuevo.') }
      setStarFeedback(parsed)
      trackEvent('star_feedback_received', { puntaje: parsed.puntaje, question_idx: starQuestionIdx })
    } catch (err) {
      if (err.isRateLimit) { setRateLimitSecs(60); setRateLimitEvento('star'); return }
      setStarError(err.name === 'AbortError' ? 'El pedido tardó demasiado. Intentá de nuevo.' : err.message || 'No se pudo obtener el feedback.')
    } finally {
      clearTimeout(timeoutId)
      setStarLoading(false)
    }
  }

  // ── CV de 1 página ──────────────────────────────────────────

  const saveAnalisis = async () => {
    if (analisisSaving || analisisSaved) return
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      setAnalisisError('Servicio de guardado no disponible. Intentá más tarde.')
      return
    }
    setAnalisisSaving(true)
    setAnalisisError('')
    const ctrl = new AbortController()
    const tid = setTimeout(() => ctrl.abort(), 15000)
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/analisis`, {
        signal: ctrl.signal,
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          qa_history: qaHistory,
          resultado_analisis: result,
          puntaje_general: result?.puntaje_general ?? null,
          consentimiento: true,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        console.error('[analisis save] error response:', res.status, body)
        throw new Error(`Error al guardar (${res.status}). Verificá que la tabla exista en Supabase.`)
      }
      setAnalisisSaved(true)
      setShowAnalisisConsent(false)
      trackEvent('analisis_saved', { puntaje: result?.puntaje_general })
    } catch (err) {
      const msg = err.name === 'AbortError' ? 'Tiempo agotado. Intentá de nuevo.' : err.message
      setAnalisisError(msg)
      console.error('[analisis save]', err)
    } finally {
      clearTimeout(tid)
      setAnalisisSaving(false)
    }
  }

  const saveCvGenerado = async ({ contacto, cv }) => {
    if (!SUPABASE_URL || !SUPABASE_KEY) return
    await fetch(`${SUPABASE_URL}/rest/v1/cv_generados`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        nombre: cv.nombre || null,
        email: contacto.email,
        telefono: contacto.telefono || null,
        linkedin_url: contacto.linkedinUrl || null,
        cv_data: cv,
        apoyo_mercadopago: !!pendingWithSupport,
        consentimiento: true,
      }),
    }).catch(err => console.error('[cv_generados save]', err))
  }

  const buildCvHtml = (cv) => {
    const e = escapeHtml
    const contact = [cv.email, cv.telefono, cv.linkedin, cv.ubicacion].filter(Boolean).map(e).join(' · ')
    const expDetHtml = (cv.experiencias_detalladas || cv.experiencias || []).map(ex => `
      <div class="exp-item">
        <div class="exp-header">
          <span class="exp-role">${e(ex.cargo)}</span>
          <span class="exp-period">${e(ex.periodo)}</span>
        </div>
        <div class="exp-company">${e(ex.empresa)}</div>
        <ul class="exp-bullets">${(ex.logros || []).map(l => `<li>${e(l)}</li>`).join('')}</ul>
      </div>`).join('')
    const expResHtml = (cv.experiencias_resumidas || []).map(ex =>
      `<div class="exp-compact"><span class="exp-compact-role">${e(ex.cargo)}</span> — ${e(ex.empresa)}<span class="exp-compact-period"> · ${e(ex.periodo)}</span></div>`
    ).join('')
    const expHtml = expDetHtml + expResHtml
    const eduDetHtml = (cv.educacion_detallada || cv.educacion || []).map(ed => `
      <div class="edu-row">
        <div><div class="edu-title">${e(ed.titulo)}</div><div class="edu-inst">${e(ed.institucion)}</div></div>
        <div class="edu-period">${e(ed.periodo)}</div>
      </div>`).join('')
    const eduResHtml = (cv.educacion_resumida || []).map(ed =>
      `<div class="edu-compact">${e(ed.titulo)} — <span class="edu-compact-inst">${e(ed.institucion)}</span><span class="edu-compact-period"> · ${e(ed.periodo)}</span></div>`
    ).join('')
    const eduHtml = eduDetHtml + eduResHtml
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
  .exp-compact { font-size: 8pt; color: #374151; margin-bottom: 2px; padding-left: 2px; }
  .exp-compact-role { font-weight: 600; }
  .exp-compact-period { color: #6B7280; }
  .edu-compact { font-size: 8pt; color: #374151; margin-bottom: 2px; }
  .edu-compact-inst { font-style: italic; }
  .edu-compact-period { color: #6B7280; }
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

  const downloadCvHtml = (cv) => {
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
    setCvSuccess(`${filename} — abrilo y guardá como PDF con Ctrl+P → Guardar como PDF`)
  }

  const callGenerateCV = async (contacto = {}) => {
    if (cvLoading) return
    setCvLoading(true)
    setCvError('')
    setCvSuccess('')
    setCvPreviewHtml('')

    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)

    const nombre = result?.nombre_completo || ''
    const titular = result?.titular_propuesto || result?.titular_actual || ''
    const resumen = result?.resumen_propuesto || ''
    const keywords = (result?.palabras_clave_sugeridas || []).join(', ')
    let userPrompt = `Generá el CV en JSON usando esta información del profesional.\n\n`
    const nombreFinal = contacto.nombre?.trim() || nombre
    userPrompt += `Nombre: ${nombreFinal}\nTitular propuesto: ${titular}\nResumen propuesto: ${resumen}\nKeywords sugeridas: ${keywords}\n\n`
    if (contacto.email)       userPrompt += `Email de contacto: ${contacto.email}\n`
    if (contacto.telefono)    userPrompt += `Teléfono: ${contacto.telefono}\n`
    if (contacto.linkedinUrl) userPrompt += `URL LinkedIn: ${contacto.linkedinUrl}\n`
    if (contacto.ubicacion)    userPrompt += `Ubicación: ${contacto.ubicacion}\n`
    if (contacto.idiomas)      userPrompt += `Idiomas: ${contacto.idiomas}\n`
    if (contacto.habilidades)  userPrompt += `Habilidades adicionales del usuario (incluílas en el CV): ${contacto.habilidades}\n`
    userPrompt += `\nPerfil LinkedIn:\n${profileText.slice(0, 3500)}\n\n`
    userPrompt += `JSON de salida (sin texto extra):
{"nombre":"","titular":"","email":null,"telefono":null,"linkedin":null,"ubicacion":null,"resumen":"","experiencias_detalladas":[{"cargo":"","empresa":"","periodo":"","logros":[]}],"experiencias_resumidas":[{"cargo":"","empresa":"","periodo":""}],"educacion_detallada":[{"titulo":"","institucion":"","periodo":""}],"educacion_resumida":[{"titulo":"","institucion":"","periodo":""}],"habilidades":[],"idiomas":[]}`
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
          generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 1200 },
        }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        if (res.status === 429) throw makeRateLimitError()
        throw new Error(parseGeminiError(res.status, e))
      }
      const data = await res.json()
      const rawCv = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
      let cv
      try { cv = JSON.parse(rawCv) }
      catch { const m = rawCv.match(/\{[\s\S]*\}/); if (m) cv = JSON.parse(m[0]); else throw new Error('No se pudo interpretar el CV generado. Intentá de nuevo.') }
      const html = buildCvHtml(cv)
      if (isMobile) {
        // Mobile: mostrar en overlay in-app (no depende de popups ni permisos del navegador)
        setCvPreviewHtml(html)
        setCvSuccess('Tu CV está listo — usá el botón de abajo para guardarlo como PDF')
      } else {
        downloadCvHtml(cv)
      }
      saveCvGenerado({ contacto, cv }).catch(err => console.error('[cv_generados save]', err))
    } catch (err) {
      if (err.isRateLimit) { setRateLimitSecs(60); setRateLimitEvento('cv'); return }
      setCvError(err.name === 'AbortError' ? 'El pedido tardó demasiado. Intentá de nuevo.' : err.message || 'No se pudo generar el CV.')
    } finally {
      clearTimeout(timeoutId)
      setCvLoading(false)
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
                Optimizá tu LinkedIn, mejorá tu CV y practicá la entrevista con IA. Gratis. Hecho con criterio de headhunter.
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
                onClick={() => { trackEvent('click_empezar_analisis', { location: 'hero' }); setStep(STEPS.QUESTIONS) }}
                className="btn-glow w-full text-white font-semibold py-4 px-8 rounded-2xl text-base"
                style={{ background: 'linear-gradient(135deg, #0077B5 0%, #0ea5e9 100%)' }}
              >
                Empezar análisis →
              </button>
              <p className="text-slate-500 text-xs">Gratis · Sin registro · Sostenida por la comunidad 🙌</p>
            </div>

            <CommentsSection />

            {/* ── Secciones SEO ── */}
            <div className="text-left space-y-12 pt-6">

              {/* ¿Qué incluye? */}
              <section>
                <h2 className="text-xl font-bold text-slate-900 mb-4">¿Qué incluye tu análisis?</h2>
                <div className="space-y-3">
                  {[
                    { icon: '🎯', title: 'Diagnóstico con criterio de headhunter', desc: 'Puntaje general del perfil y evaluación estratégica del primer impacto en reclutadores.' },
                    { icon: '🔍', title: 'SEO de LinkedIn', desc: 'Palabras clave sugeridas para aparecer en búsquedas reales de reclutadores y clientes.' },
                    { icon: '✏️', title: 'Titular y resumen reescritos', desc: 'Versión mejorada del titular y del About con propuesta de valor clara y llamada a la acción.' },
                    { icon: '📋', title: 'Recomendaciones accionables', desc: 'Lista priorizada de cambios concretos que podés implementar hoy.' },
                    { icon: '📄', title: 'CV de 1 página listo para enviar', desc: 'Lo que los reclutadores piden hoy: un CV moderno, ATS-compatible y de una sola página generado con tu perfil optimizado.' },
                    { icon: '📣', title: 'Estrategia de contenido', desc: 'Qué publicar en LinkedIn según tu objetivo profesional para aumentar tu visibilidad.' },
                    { icon: '🎙️', title: 'Simulador de entrevista con IA', desc: 'Practicá una entrevista inicial y recibí feedback detallado con criterio de RRHH.' },
                    { icon: '⭐', title: 'Entrenamiento metodología STAR', desc: 'Aprendé el framework que usan los mejores candidatos y practicá con feedback instantáneo de IA para estructurar respuestas de alto impacto.' },
                  ].map(item => (
                    <div key={item.title} className="flex items-start gap-3 rounded-2xl p-4"
                      style={{ background: 'white', border: '1px solid rgba(0,119,181,0.10)' }}>
                      <span className="text-xl shrink-0">{item.icon}</span>
                      <div>
                        <p className="text-slate-800 text-sm font-semibold">{item.title}</p>
                        <p className="text-slate-500 text-xs mt-0.5 leading-relaxed">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Comparativa vs alternativas */}
              <section>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold mb-3"
                  style={{ background: 'rgba(99,102,241,0.08)', color: '#6366f1', border: '1px solid rgba(99,102,241,0.2)' }}>
                  Por qué esta app
                </div>
                <h2 className="text-xl font-bold text-slate-900 mb-2">Gratis vs. las alternativas</h2>
                <p className="text-slate-500 text-sm mb-5 leading-relaxed">
                  Lo mismo que te costaría entre <strong className="text-slate-700">$30.000 y $125.000</strong> con un asesor, o <strong className="text-slate-700">~$56.000/mes</strong> con LinkedIn Premium — acá lo obtenés sin costo.
                </p>
                <div className="overflow-x-auto -mx-0 rounded-2xl border border-slate-100 shadow-sm">
                  <table className="w-full min-w-[500px] text-xs border-collapse">
                    <thead>
                      <tr>
                        <th className="text-left py-3 pl-4 pr-2 text-slate-400 font-normal" style={{ width: 160 }}></th>
                        <th className="py-3 px-2 text-center font-bold text-white" style={{ background: 'linear-gradient(135deg,#6366f1,#0ea5e9)', minWidth: 86 }}>
                          <div className="text-[10px] font-normal opacity-80 mb-0.5">Esta app</div>
                          <div className="text-emerald-200">GRATIS 🎉</div>
                        </th>
                        <th className="py-3 px-2 text-center text-slate-500 font-medium bg-slate-50" style={{ minWidth: 86 }}>
                          <div className="text-[10px] text-slate-400 mb-0.5">LinkedIn Premium</div>
                          <div className="text-slate-600 text-[11px]">~$56.000<span className="text-slate-400">/mes</span></div>
                        </th>
                        <th className="py-3 px-2 text-center text-slate-500 font-medium bg-slate-50" style={{ minWidth: 86 }}>
                          <div className="text-[10px] text-slate-400 mb-0.5">IA genérica</div>
                          <div className="text-slate-600 text-[11px]">Gratis*</div>
                        </th>
                        <th className="py-3 px-2 text-center text-slate-500 font-medium bg-slate-50" style={{ minWidth: 86 }}>
                          <div className="text-[10px] text-slate-400 mb-0.5">Asesor profesional</div>
                          <div className="text-slate-600 text-[11px]">$30k–$125k</div>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { feat: 'Criterio de headhunter real',         app: 1, premium: 0, ia: 0, asesor: 1 },
                        { feat: 'Diagnóstico completo del perfil',      app: 1, premium: 2, ia: 2, asesor: 1 },
                        { feat: 'Titular y resumen optimizados',        app: 1, premium: 2, ia: 2, asesor: 1 },
                        { feat: 'SEO para búsquedas de reclutadores',   app: 1, premium: 1, ia: 0, asesor: 1 },
                        { feat: 'Simulador de entrevista con IA',       app: 1, premium: 0, ia: 0, asesor: 2 },
                        { feat: 'Entrenamiento metodología STAR',       app: 1, premium: 0, ia: 0, asesor: 2 },
                        { feat: 'CV de 1 página ATS-compatible',        app: 1, premium: 0, ia: 0, asesor: 2 },
                        { feat: 'Sin registro · resultado en 60 seg',   app: 1, premium: 0, ia: 1, asesor: 0 },
                      ].map((row, i) => {
                        const cell = v => v === 1
                          ? <span className="text-emerald-500 font-bold text-sm">✓</span>
                          : v === 0
                          ? <span className="text-red-300 text-sm">✗</span>
                          : <span className="text-amber-500 text-[10px] font-semibold">varía</span>
                        return (
                          <tr key={row.feat} style={{ background: i % 2 === 0 ? 'white' : 'rgba(248,250,252,0.8)' }}>
                            <td className="py-2.5 pl-4 pr-2 text-slate-600 font-medium text-[11px] leading-snug">{row.feat}</td>
                            <td className="py-2.5 px-2 text-center" style={{ background: i % 2 === 0 ? 'rgba(99,102,241,0.06)' : 'rgba(99,102,241,0.09)' }}>{cell(row.app)}</td>
                            <td className="py-2.5 px-2 text-center">{cell(row.premium)}</td>
                            <td className="py-2.5 px-2 text-center">{cell(row.ia)}</td>
                            <td className="py-2.5 px-2 text-center">{cell(row.asesor)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-slate-400 text-[10px] mt-2 leading-relaxed">
                  * La IA genérica no cuenta con prompts especializados en RRHH ni con la validación de un profesional. Precios en ARS, referencia USD 1 ≈ ARS 1.400.
                </p>
              </section>

              {/* Cómo funciona */}
              <section>
                <h2 className="text-xl font-bold text-slate-900 mb-4">Cómo funciona</h2>
                <div className="space-y-3">
                  {[
                    { num: '1', title: 'Respondés 10 preguntas rápidas', desc: 'Sobre tu profesión, objetivo y logros. Tarda unos 3 minutos.' },
                    { num: '2', title: 'Subís tu perfil de LinkedIn', desc: 'En PDF, por URL o completando un formulario — elegís cómo.' },
                    { num: '3', title: 'Recibís tu análisis completo', desc: 'En menos de 60 segundos, con sugerencias listas para implementar.' },
                  ].map(stepItem => (
                    <div key={stepItem.num} className="flex items-start gap-4 rounded-2xl p-4"
                      style={{ background: 'white', border: '1px solid rgba(0,119,181,0.10)' }}>
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                        style={{ background: LI_GRADIENT }}>{stepItem.num}</div>
                      <div>
                        <p className="text-slate-800 text-sm font-semibold">{stepItem.title}</p>
                        <p className="text-slate-500 text-xs mt-0.5 leading-relaxed">{stepItem.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Quién está detrás */}
              <section>
                <h2 className="text-xl font-bold text-slate-900 mb-4">Quién está detrás</h2>
                <div className="rounded-2xl p-5 flex items-start gap-4"
                  style={{ background: 'white', border: '1px solid rgba(0,119,181,0.12)' }}>
                  <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                    style={{ background: LI_GRADIENT }}>RS</div>
                  <div>
                    <p className="text-slate-900 font-semibold text-sm">Ramiro Silvera</p>
                    <p className="text-slate-500 text-xs mt-0.5">Gerente de RRHH · Headhunter</p>
                    <p className="text-slate-600 text-sm mt-2 leading-relaxed">
                      Con más de 10 años seleccionando profesionales en Argentina y la región, creé esta herramienta para que cualquier persona pueda acceder al mismo análisis que haría un headhunter real — sin costo.
                    </p>
                    <a href={RAMIRO_LINKEDIN_URL} target="_blank" rel="noopener noreferrer"
                      onClick={() => trackEvent('click_externo', { destino: 'linkedin_ramiro', ubicacion: 'seccion_quien' })}
                      className="inline-flex items-center gap-1.5 mt-3 text-xs font-semibold"
                      style={{ color: '#0077B5' }}>
                      <LinkedInIcon className="w-3.5 h-3.5" /> Ver perfil de LinkedIn →
                    </a>
                  </div>
                </div>
              </section>

              {/* FAQ */}
              <section>
                <h2 className="text-xl font-bold text-slate-900 mb-4">Preguntas frecuentes</h2>
                <div className="space-y-3">
                  {[
                    { q: '¿Es realmente gratis?', a: 'Sí, 100% gratis y sin registro. No necesitás crear una cuenta ni dejar tu email para recibir el análisis.' },
                    { q: '¿Qué pasa con mi CV o perfil?', a: 'Tu información se usa para generar el análisis. Solo se guarda si vos lo autorizás — por ejemplo, al solicitar contacto con Ramiro o generar tu CV, para poder brindarte un servicio más personalizado. En ningún caso se comparte con terceros.' },
                    { q: '¿Cuánto tarda el análisis?', a: 'Menos de 60 segundos una vez que subís tu perfil. El cuestionario previo tarda unos 3 minutos.' },
                    { q: '¿Sirve si vivo fuera de Argentina?', a: 'Sí. El análisis se adapta a tu mercado y objetivo declarado en el cuestionario.' },
                    { q: '¿Qué es el simulador de entrevista?', a: 'Una entrevista inicial simulada con IA donde respondés 5 preguntas reales de RRHH y recibís feedback detallado sobre cada respuesta.' },
                    { q: '¿Necesito tener el PDF de LinkedIn?', a: 'No es obligatorio. Podés subir el PDF, pegar la URL de tu perfil o completar un formulario directamente en la app.' },
                  ].map(({ q, a }) => (
                    <div key={q} className="rounded-2xl p-4"
                      style={{ background: 'white', border: '1px solid rgba(0,119,181,0.10)' }}>
                      <p className="text-slate-800 text-sm font-semibold mb-1">{q}</p>
                      <p className="text-slate-500 text-xs leading-relaxed">{a}</p>
                    </div>
                  ))}
                </div>
              </section>

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
                    style={{ background: LI_GRADIENT }}
                  >
                    Continuar →
                  </button>
                </div>
              </div>
            )}

            {/* Back */}
            <button onClick={handleBack} className="text-slate-600 text-sm hover:text-slate-400 transition-colors py-3 px-3 min-h-[44px]">
              ← {qaHistory.length === 0 ? 'Volver al inicio' : 'Anterior'}
            </button>
          </div>
        )}

        {/* ── PROFILE INPUT ── */}
        {step === STEPS.PROFILE_INPUT && (
          <div className="step-transition space-y-5">
            <Logo />

            {/* ── RATE LIMIT: reemplaza toda la pantalla ── */}
            {(rateLimitSecs > 0 || rateLimitEvento === 'analisis') && (
              <RateLimitUI secs={rateLimitSecs} evento={rateLimitEvento === 'analisis' ? rateLimitEvento : ''} email={waitlistEmail} onEmailChange={setWaitlistEmail} sent={waitlistSent} loading={waitlistLoading} onSubmit={handleWaitlist} />
            )}

            {/* ── FORM NORMAL: se oculta cuando hay rate limit activo ── */}
            {!(rateLimitSecs > 0 || rateLimitEvento === 'analisis') && <>
            <div>
              <p className="text-slate-500 text-sm mb-1">Último paso</p>
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">Cargá tu perfil de LinkedIn</h2>
            </div>

            {/* ── FASE 1: URL ── */}
            <div className="rounded-2xl p-4 space-y-3"
              style={{ background: 'white', border: '1px solid rgba(0,119,181,0.12)', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
              <div>
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Acceso automático</p>
                <p className="text-slate-500 text-xs leading-relaxed">Pegá la URL de tu perfil e intentamos leerlo directamente.</p>
              </div>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={linkedinUrl}
                  onChange={e => setLinkedinUrl(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleUrlAttempt()}
                  placeholder="https://www.linkedin.com/in/tu-usuario"
                  disabled={urlLoading}
                  className="flex-1 rounded-xl px-4 py-2.5 text-sm outline-none"
                  style={{ background: '#f8fafc', border: '1px solid rgba(0,119,181,0.18)', color: '#0d2137' }}
                />
                <button
                  onClick={handleUrlAttempt}
                  disabled={!linkedinUrl.trim() || urlLoading}
                  className="shrink-0 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 flex items-center gap-2"
                  style={linkedinUrl.trim() && !urlLoading
                    ? { background: LI_GRADIENT, color: '#fff' }
                    : { background: 'rgba(0,119,181,0.07)', color: '#94a3b8', border: '1px solid rgba(0,119,181,0.12)', cursor: 'not-allowed' }
                  }
                >
                  {urlLoading ? <><Spinner size={4} /><span>Accediendo...</span></> : 'Intentar →'}
                </button>
              </div>
              <div aria-live="polite" aria-atomic="true" className="text-xs">
                {urlAttempted && profileText && !pdfFileName && !formConfirmed && (
                  <p className="text-green-600 font-medium">✅ Perfil accedido correctamente — podés analizar tu perfil.</p>
                )}
                {urlAttempted && !profileText && linkedinUrl.trim() && !linkedinUrl.trim().match(/^https?:\/\/(www\.)?linkedin\.com\/in\//) && (
                  <p role="alert" className="text-red-500">La URL debe ser de linkedin.com/in/tu-usuario</p>
                )}
                {urlAttempted && !profileText && linkedinUrl.trim().match(/^https?:\/\/(www\.)?linkedin\.com\/in\//) && (
                  <p className="text-amber-600">LinkedIn bloqueó el acceso automático — es su política de privacidad. Usá una de las opciones de abajo.</p>
                )}
                {urlAttempted && !profileText && !linkedinUrl.trim() && (
                  <p className="text-slate-500">Elegí cómo compartir tu perfil:</p>
                )}
              </div>
              <button
                onClick={() => { setUrlAttempted(true); setInputMode('pdf') }}
                className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
              >
                Saltar este paso →
              </button>
            </div>

            {/* ── FASE 2: Tabs (tras intento o skip) ── */}
            {urlAttempted && (
              <>
                <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid rgba(0,119,181,0.15)' }}>
                  {[
                    { id: 'pdf',  label: '📄  Subir PDF' },
                    { id: 'form', label: '✏️  Completar en la app' },
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => handleInputModeSwitch(tab.id)}
                      className="flex-1 py-3 text-xs font-semibold transition-all duration-200"
                      style={inputMode === tab.id
                        ? { background: LI_GRADIENT, color: '#fff' }
                        : { color: '#475569', background: 'transparent' }
                      }
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* ── MODO PDF ── */}
                {inputMode === 'pdf' && (
                  <div className="space-y-4">
                    <div className="rounded-xl p-4 text-sm"
                      style={{ backgroundColor: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.25)' }}>
                      <p className="text-amber-500 font-semibold text-xs uppercase tracking-wide mb-1">¿Por qué PDF?</p>
                      <p className="text-slate-600 text-xs leading-relaxed">Es la forma más completa de compartir tu perfil. LinkedIn lo genera en segundos con toda tu información.</p>
                    </div>
                    <div className="rounded-2xl overflow-hidden"
                      style={CARD_STYLE}>
                      <div className="flex border-b" style={{ borderColor: 'rgba(0,119,181,0.12)' }}>
                        {[
                          { id: 'desktop', label: '🖥️  Computadora' },
                          { id: 'mobile', label: '📱  Celular' },
                        ].map(tab => (
                          <button key={tab.id} onClick={() => { setInstrTab(tab.id); trackEvent('tutorial_tab_switch', { tab: tab.id }) }}
                            className="flex-1 py-3 text-xs font-semibold transition-all duration-200"
                            style={instrTab === tab.id
                              ? { background: LI_GRADIENT, color: '#fff' }
                              : { color: '#475569', background: 'transparent' }
                            }>{tab.label}</button>
                        ))}
                      </div>
                      <div className="p-5 space-y-4">
                        {instrTab === 'desktop' ? (
                          <>
                            <div className="flex flex-col items-center gap-2">
                              <p className="text-xs text-slate-500 font-medium self-start">📹 Tutorial rápido</p>
                              <div style={{ width: 220, margin: '0 auto', borderRadius: 12, overflow: 'hidden', flexShrink: 0 }}>
                                <div className="relative" style={{ paddingTop: '177.78%' }}>
                                  <iframe
                                    className="absolute inset-0 w-full h-full"
                                    src="https://www.youtube.com/embed/wUR9COhVWyI?rel=0&modestbranding=1&enablejsapi=1&origin=https://optimizalinkedin.com"
                                    title="Cómo descargar tu PDF de LinkedIn desde computadora"
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                    allowFullScreen
                                  />
                                </div>
                              </div>
                            </div>
                            <p className="font-semibold text-slate-900 text-sm">📄 Descargar desde computadora</p>
                            <ol className="space-y-2.5">
                              {[
                                'Abrí linkedin.com en tu navegador e iniciá sesión',
                                'Hacé clic en tu foto de perfil (arriba a la derecha) → "Ver perfil"',
                                'Hacé clic en "Más" (debajo de tu foto y nombre)',
                                'Seleccioná "Guardar como PDF"',
                                'El PDF se descarga automáticamente — buscalo en Descargas',
                                'Volvé acá y subilo ↓',
                              ].map((s, i) => (
                                <li key={i} className="flex items-start gap-3 text-sm text-slate-600">
                                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5"
                                    style={{ backgroundColor: 'rgba(0,119,181,0.2)', color: '#0077B5', minWidth: '1.25rem' }}>
                                    {i + 1}
                                  </span>
                                  <span className="leading-relaxed">{s}</span>
                                </li>
                              ))}
                            </ol>
                          </>
                        ) : (
                          <>
                            <p className="font-semibold text-slate-900 text-sm">📄 Descargar desde celular (Chrome)</p>
                            <div className="relative rounded-xl overflow-hidden select-none"
                              style={{ background: '#f1f5f9', border: '1px solid rgba(0,119,181,0.1)' }}
                              onTouchStart={e => { touchStartX.current = e.touches[0].clientX }}
                              onTouchEnd={e => {
                                const dx = e.changedTouches[0].clientX - (touchStartX.current ?? 0)
                                if (dx < -40 && mobileSlide < 1) setMobileSlide(1)
                                if (dx > 40 && mobileSlide > 0) setMobileSlide(0)
                              }}
                            >
                              <img
                                src={mobileSlide === 0 ? '/Captura linkedin celular.png' : '/Captura linkedin celular 2.png'}
                                alt={mobileSlide === 0 ? 'Botón Compartir resaltado en LinkedIn' : 'Pantalla de impresión con botón Compartir'}
                                className="w-full object-contain"
                                style={{ maxHeight: 340, display: 'block', margin: '0 auto' }}
                                onError={e => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling && (e.currentTarget.nextSibling.style.display = 'flex') }}
                              />
                              <div style={{ display: 'none', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 120, color: '#94a3b8', fontSize: 13 }}>
                                <span style={{ fontSize: 32 }}>📵</span>
                                <span>Imagen no disponible</span>
                              </div>
                              {mobileSlide > 0 && (
                                <button
                                  onClick={() => setMobileSlide(0)}
                                  className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-md"
                                  style={{ background: 'rgba(0,0,0,0.45)' }}
                                >‹</button>
                              )}
                              {mobileSlide < 1 && (
                                <button
                                  onClick={() => setMobileSlide(1)}
                                  className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-md"
                                  style={{ background: 'rgba(0,0,0,0.45)' }}
                                >›</button>
                              )}
                              <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5">
                                {[0, 1].map(i => (
                                  <button key={i} onClick={() => setMobileSlide(i)}
                                    className="rounded-full transition-all duration-200"
                                    style={{ width: mobileSlide === i ? 16 : 6, height: 6,
                                      background: mobileSlide === i ? '#0077B5' : 'rgba(255,255,255,0.7)' }}
                                  />
                                ))}
                              </div>
                            </div>
                            <p className="text-xs text-slate-500 text-center -mt-1">
                              {mobileSlide === 0
                                ? 'Imagen 1 — Tocá el botón Compartir (resaltado en amarillo)'
                                : 'Imagen 2 — En la pantalla de impresión, tocá Compartir → Guardar archivo'}
                            </p>
                            <ol className="space-y-2.5">
                              {[
                                'Abrí linkedin.com en Chrome (navegador, no en la app)',
                                'Iniciá sesión y andá a tu perfil',
                                'Tocá el botón Compartir resaltado en amarillo (ver imagen 1)',
                                'Seleccioná Imprimir en el menú que aparece',
                                'En la pantalla de impresión (imagen 2), tocá Compartir nuevamente',
                                'Seleccioná Guardar en Archivos (o "Guardar como PDF")',
                                'Volvé acá y subí el archivo ↓',
                              ].map((s, i) => (
                                <li key={i} className="flex items-start gap-3 text-sm text-slate-600">
                                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5"
                                    style={{ backgroundColor: 'rgba(0,119,181,0.2)', color: '#0077B5', minWidth: '1.25rem' }}>
                                    {i + 1}
                                  </span>
                                  <span className="leading-relaxed">{s}</span>
                                </li>
                              ))}
                            </ol>
                          </>
                        )}
                      </div>
                    </div>
                    <div>
                      <input type="file" accept="application/pdf" id="pdf-upload" className="hidden" onChange={handlePdfUpload} />
                      <label htmlFor="pdf-upload"
                        onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                        className="flex flex-col items-center justify-center gap-3 w-full py-10 px-6 rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-300"
                        style={{
                          borderColor: profileText ? 'rgba(34,197,94,0.6)' : isDragging ? '#0a91d4' : pdfLoading ? '#0077B5' : 'rgba(0,119,181,0.20)',
                          background: profileText ? 'rgba(34,197,94,0.05)' : isDragging ? 'rgba(0,119,181,0.08)' : '#f8fafc',
                        }}>
                        {pdfLoading ? (
                          <><div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: '#0077B5', borderTopColor: 'transparent' }} />
                            <p className="text-slate-500 text-sm">Extrayendo contenido del PDF...</p></>
                        ) : profileText ? (
                          <><span className="text-3xl">✅</span>
                            <div className="text-center">
                              <p className="text-green-600 font-semibold text-sm">{pdfFileName}</p>
                              <p className="text-slate-500 text-xs mt-1">Perfil extraído · Hacé clic para cambiar</p>
                            </div></>
                        ) : (
                          <><span className="text-3xl">{isDragging ? '📂' : '📄'}</span>
                            <div className="text-center">
                              <p className="text-slate-900 font-semibold text-sm">{isDragging ? 'Soltá el PDF acá' : 'Subir PDF de LinkedIn'}</p>
                              <p className="text-slate-500 text-xs mt-1">Arrastrá o hacé clic · Máx. 15 MB</p>
                            </div></>
                        )}
                      </label>
                    </div>
                    {(rateLimitSecs > 0 || rateLimitEvento === 'pdf')
                      ? <RateLimitUI secs={rateLimitSecs} evento={rateLimitEvento === 'pdf' ? rateLimitEvento : ''} email={waitlistEmail} onEmailChange={setWaitlistEmail} sent={waitlistSent} loading={waitlistLoading} onSubmit={handleWaitlist} />
                      : pdfError && (
                        <div role="alert" className="rounded-xl p-4 text-sm flex items-start gap-3"
                          style={{ backgroundColor: 'rgba(254,226,226,0.8)', border: '1px solid #fca5a5', color: '#b91c1c' }}>
                          <span className="shrink-0 mt-0.5">⚠️</span><span>{pdfError}</span>
                        </div>
                      )}
                  </div>
                )}

                {/* ── MODO FORMULARIO ── */}
                {inputMode === 'form' && (
                  <div className="space-y-4">
                    <p className="text-slate-500 text-sm leading-relaxed">
                      Copiá cada campo directamente desde tu perfil de LinkedIn.
                    </p>

                    {/* Foto de perfil */}
                    <div>
                      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide block mb-2">
                        Foto de perfil{' '}
                        <span className="text-slate-400 font-normal normal-case tracking-normal">(opcional — se analiza calidad)</span>
                      </label>
                      <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-full overflow-hidden shrink-0 relative"
                          style={{ border: '2px solid rgba(0,119,181,0.3)', background: '#dce8f0' }}>
                          {profilePhotoPreview
                            ? <img src={profilePhotoPreview} alt="preview" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                            : <span className="text-2xl absolute inset-0 flex items-center justify-center">👤</span>
                          }
                        </div>
                        <label htmlFor="photo-upload"
                          className="cursor-pointer px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200"
                          style={{ background: 'rgba(0,119,181,0.08)', color: '#0077B5', border: '1px solid rgba(0,119,181,0.2)' }}>
                          {profilePhotoPreview ? 'Cambiar foto' : 'Subir foto'}
                        </label>
                        <input id="photo-upload" type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                        {profilePhotoPreview && (
                          <button onClick={() => { setProfilePhotoPreview(null); setProfilePhoto(null); setProfilePhotoMime('image/jpeg'); setFormConfirmed(false); setProfileText('') }}
                            className="text-xs text-slate-400 hover:text-red-400 transition-colors">✕ Quitar</button>
                        )}
                      </div>
                    </div>

                    {/* Titular */}
                    <div>
                      <label htmlFor="form-titular" className="text-xs font-semibold text-slate-600 uppercase tracking-wide block mb-1.5">
                        Titular profesional <span style={{ color: '#0077B5' }}>*</span>
                      </label>
                      <input id="form-titular" type="text" value={formTitular}
                        onChange={e => { setFormTitular(e.target.value); setFormConfirmed(false); setProfileText('') }}
                        placeholder="Ej: Desarrollador Frontend Senior | React & TypeScript | 10 años"
                        maxLength={220}
                        className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                        style={INPUT_STYLE} />
                      <p className="text-slate-400 text-xs mt-1">El texto que aparece debajo de tu nombre en LinkedIn</p>
                    </div>

                    {/* Resumen */}
                    <div>
                      <label htmlFor="form-resumen" className="text-xs font-semibold text-slate-600 uppercase tracking-wide block mb-1.5">
                        Resumen / About{' '}
                        <span className="text-slate-400 font-normal normal-case tracking-normal">(recomendado)</span>
                      </label>
                      <textarea id="form-resumen" value={formResumen}
                        onChange={e => { setFormResumen(e.target.value); setFormConfirmed(false); setProfileText('') }}
                        placeholder={'Pegá el texto de tu sección "Acerca de" en LinkedIn...'}
                        rows={4} maxLength={2600}
                        className="w-full rounded-xl px-4 py-3 text-sm outline-none resize-none"
                        style={INPUT_STYLE} />
                    </div>

                    {/* Experiencias */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Experiencia profesional</label>
                        <button
                          onClick={() => { setFormExperiencias(p => [...p, { cargo: '', empresa: '', periodo: '', descripcion: '' }]); setFormConfirmed(false); setProfileText('') }}
                          className="text-xs px-3 py-1 rounded-lg transition-all duration-200"
                          style={BTN_GHOST_STYLE}>
                          + Agregar
                        </button>
                      </div>
                      {formExperiencias.map((exp, i) => (
                        <div key={i} className="rounded-xl p-4 space-y-2 mb-3"
                          style={{ background: 'white', border: '1px solid rgba(0,119,181,0.12)' }}>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-500 font-semibold">Experiencia {i + 1}</span>
                            {formExperiencias.length > 1 && (
                              <button onClick={() => { setFormExperiencias(p => p.filter((_, j) => j !== i)); setFormConfirmed(false); setProfileText('') }}
                                className="text-xs text-slate-400 hover:text-red-400 transition-colors">✕ Eliminar</button>
                            )}
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <input value={exp.cargo}
                              onChange={e => { setFormExperiencias(p => p.map((x, j) => j === i ? { ...x, cargo: e.target.value } : x)); setFormConfirmed(false); setProfileText('') }}
                              placeholder="Cargo" maxLength={120}
                              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                              style={INPUT_ALT_STYLE} />
                            <input value={exp.empresa}
                              onChange={e => { setFormExperiencias(p => p.map((x, j) => j === i ? { ...x, empresa: e.target.value } : x)); setFormConfirmed(false); setProfileText('') }}
                              placeholder="Empresa" maxLength={120}
                              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                              style={INPUT_ALT_STYLE} />
                          </div>
                          <input value={exp.periodo}
                            onChange={e => { setFormExperiencias(p => p.map((x, j) => j === i ? { ...x, periodo: e.target.value } : x)); setFormConfirmed(false); setProfileText('') }}
                            placeholder="Período (Ej: Mar 2021 – Presente)" maxLength={60}
                            className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                            style={INPUT_ALT_STYLE} />
                          <textarea value={exp.descripcion}
                            onChange={e => { setFormExperiencias(p => p.map((x, j) => j === i ? { ...x, descripcion: e.target.value } : x)); setFormConfirmed(false); setProfileText('') }}
                            placeholder="Descripción de responsabilidades y logros (opcional)"
                            rows={2} maxLength={500}
                            className="w-full rounded-xl px-3 py-2.5 text-sm outline-none resize-none"
                            style={INPUT_ALT_STYLE} />
                        </div>
                      ))}
                    </div>

                    {/* Educación */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Educación</label>
                        <button
                          onClick={() => { setFormEducacion(p => [...p, { institucion: '', titulo: '', periodo: '' }]); setFormConfirmed(false); setProfileText('') }}
                          className="text-xs px-3 py-1 rounded-lg transition-all duration-200"
                          style={BTN_GHOST_STYLE}>
                          + Agregar
                        </button>
                      </div>
                      {formEducacion.map((edu, i) => (
                        <div key={i} className="rounded-xl p-4 space-y-2 mb-3"
                          style={{ background: 'white', border: '1px solid rgba(0,119,181,0.12)' }}>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-500 font-semibold">Educación {i + 1}</span>
                            {formEducacion.length > 1 && (
                              <button onClick={() => { setFormEducacion(p => p.filter((_, j) => j !== i)); setFormConfirmed(false); setProfileText('') }}
                                className="text-xs text-slate-400 hover:text-red-400 transition-colors">✕ Eliminar</button>
                            )}
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <input value={edu.institucion}
                              onChange={e => { setFormEducacion(p => p.map((x, j) => j === i ? { ...x, institucion: e.target.value } : x)); setFormConfirmed(false); setProfileText('') }}
                              placeholder="Institución" maxLength={120}
                              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                              style={INPUT_ALT_STYLE} />
                            <input value={edu.titulo}
                              onChange={e => { setFormEducacion(p => p.map((x, j) => j === i ? { ...x, titulo: e.target.value } : x)); setFormConfirmed(false); setProfileText('') }}
                              placeholder="Título / Carrera / Curso" maxLength={120}
                              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                              style={INPUT_ALT_STYLE} />
                          </div>
                          <input value={edu.periodo}
                            onChange={e => { setFormEducacion(p => p.map((x, j) => j === i ? { ...x, periodo: e.target.value } : x)); setFormConfirmed(false); setProfileText('') }}
                            placeholder="Período (Ej: 2015 – 2019)" maxLength={60}
                            className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                            style={INPUT_ALT_STYLE} />
                        </div>
                      ))}
                    </div>

                    {/* Habilidades */}
                    <div>
                      <label htmlFor="form-habilidades" className="text-xs font-semibold text-slate-600 uppercase tracking-wide block mb-1.5">
                        Habilidades principales{' '}
                        <span className="text-slate-400 font-normal normal-case tracking-normal">(opcional)</span>
                      </label>
                      <input id="form-habilidades" type="text" value={formHabilidades}
                        onChange={e => { setFormHabilidades(e.target.value); setFormConfirmed(false); setProfileText('') }}
                        placeholder="Ej: React, Gestión de equipos, Análisis de datos, Inglés avanzado"
                        maxLength={400}
                        className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                        style={INPUT_STYLE} />
                    </div>

                    {/* Botón confirmar */}
                    <button
                      onClick={handleFormConfirm}
                      disabled={!formTitular.trim() || formConfirmed}
                      className="w-full py-3 rounded-xl font-semibold text-sm transition-all duration-200"
                      style={formConfirmed
                        ? { background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.35)', color: '#16a34a', cursor: 'default' }
                        : formTitular.trim()
                          ? { background: LI_GRADIENT, color: '#fff', cursor: 'pointer' }
                          : { background: 'rgba(0,119,181,0.06)', border: '1px solid rgba(0,119,181,0.12)', color: '#94a3b8', cursor: 'not-allowed' }
                      }
                    >
                      {formConfirmed ? '✅ Datos listos — podés analizar tu perfil' : 'Usar estos datos →'}
                    </button>
                  </div>
                )}
              </>
            )}

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

            {analysisError && (
              <div role="alert" className="rounded-xl p-4 text-sm space-y-2"
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
                style={BTN_BACK_STYLE}
              >
                ← Atrás
              </button>
              <button
                disabled={!profileText || analyzing}
                onClick={callGemini}
                className={`flex-[2] font-semibold py-3.5 rounded-2xl transition-all duration-200 text-white ${profileText && !analyzing ? 'btn-glow' : ''}`}
                style={{
                  background: profileText && !analyzing ? LI_GRADIENT : 'rgba(0,119,181,0.08)',
                  opacity: profileText && !analyzing ? 1 : 0.5,
                  cursor: profileText && !analyzing ? 'pointer' : 'not-allowed',
                  border: profileText && !analyzing ? 'none' : '1px solid rgba(0,119,181,0.12)',
                  color: profileText && !analyzing ? '#fff' : '#64748b',
                }}
              >
                {analyzing ? 'Analizando...' : 'Analizar mi perfil ✦'}
              </button>
            </div>
            </>}
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
                {loadingMsgs[loadingMsgIdx % loadingMsgs.length]}
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

            {/* Consentimiento para guardar análisis */}
            {showAnalisisConsent && !analisisSaved && (
              <div className="rounded-2xl p-4 space-y-3"
                style={{ background: 'white', border: '1px solid rgba(0,119,181,0.18)', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                <div className="flex items-start gap-3">
                  <span className="text-xl shrink-0">🔒</span>
                  <div>
                    <p className="text-slate-800 text-sm font-semibold mb-1">¿Guardamos tu análisis?</p>
                    <p className="text-slate-500 text-xs leading-relaxed">
                      Si lo autorizás, guardamos los resultados para poder brindarte recomendaciones más personalizadas. Solo Ramiro tiene acceso — nunca se comparte con terceros.
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={saveAnalisis}
                    disabled={analisisSaving}
                    className="flex-1 py-2 rounded-xl text-white text-xs font-semibold transition-all"
                    style={{ background: analisisSaving ? '#94a3b8' : 'linear-gradient(135deg,#0077B5,#0ea5e9)' }}
                  >
                    {analisisSaving ? '⏳ Guardando...' : 'Sí, guardar mi análisis'}
                  </button>
                  <button
                    onClick={() => { setShowAnalisisConsent(false); trackEvent('analisis_declined') }}
                    className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-600 transition-colors"
                    style={{ border: '1px solid rgba(0,0,0,0.08)' }}
                  >
                    No, gracias
                  </button>
                </div>
                {analisisError && <p className="text-xs text-red-500">{analisisError}</p>}
              </div>
            )}
            {analisisSaved && (
              <p className="text-xs text-center font-medium" style={{ color: '#059669' }}>
                ✓ Análisis guardado de forma segura.
              </p>
            )}

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

            {/* ── Botón CV de 1 página ── */}
            <div className="space-y-1.5">
              <button
                onClick={() => setShowCvModal(true)}
                disabled={cvLoading}
                className="w-full font-semibold py-4 rounded-xl transition-all duration-200 text-white text-sm"
                style={{ background: cvLoading ? '#94a3b8' : 'linear-gradient(135deg,#059669,#10b981)', opacity: cvLoading ? 0.7 : 1 }}
              >
                {cvLoading ? '⏳ Generando tu CV...' : '📄 Generá tu CV moderno de 1 página'}
              </button>
              <p className="text-center text-xs text-slate-500">
                Gratis · ATS-compatible · Se descarga como HTML y se guarda como PDF
              </p>
              {(rateLimitSecs > 0 || rateLimitEvento === 'cv')
                ? <RateLimitUI secs={rateLimitSecs} evento={rateLimitEvento === 'cv' ? rateLimitEvento : ''} email={waitlistEmail} onEmailChange={setWaitlistEmail} sent={waitlistSent} loading={waitlistLoading} onSubmit={handleWaitlist} />
                : cvError && <p className="text-xs text-red-500 text-center">{cvError}</p>
              }
              {cvSuccess && (
                <p className="text-xs text-center" style={{ color: '#059669' }}>
                  ✓ {cvSuccess}
                </p>
              )}
            </div>

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

            {result.analisis_foto && (
              <ResultCard title="📸 Foto de perfil">
                <p className="text-slate-600 text-sm leading-relaxed">{result.analisis_foto}</p>
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
                      style={{ background: LI_GRADIENT, color: '#fff' }}>
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
                style={{ background: LI_GRADIENT }}
              >
                <LinkedInIcon className="w-4 h-4" /> Hablar con Ramiro →
              </button>
            </div>

            {/* ── Bloque de conversión ── */}
            <div className="rounded-2xl overflow-hidden"
              style={{ border: '1px solid rgba(0,119,181,0.18)', boxShadow: '0 4px 20px rgba(0,0,0,0.07)' }}>

              {/* Header */}
              <div className="px-5 pt-5 pb-4 text-center"
                style={{ background: 'linear-gradient(135deg,rgba(0,119,181,0.06),rgba(14,165,233,0.08))' }}>
                <p className="text-slate-900 font-bold text-base leading-snug">
                  Si este análisis te sirvió, seguinos
                </p>
                <p className="text-slate-500 text-xs mt-1.5 leading-relaxed max-w-sm mx-auto">
                  Dos perfiles, dos tipos de contenido. Ambos gratuitos, como esto.
                </p>
              </div>

              {/* Dos follows — stacked mobile / side-by-side sm+ */}
              <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">

                {/* Perfil personal */}
                <div className="p-5 flex flex-col gap-3 items-center text-center">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: LI_GRADIENT }}>
                    <LinkedInIcon className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-slate-900 text-sm font-semibold">Perfil de Ramiro</p>
                    <p className="text-slate-500 text-xs mt-1 leading-relaxed">
                      Contenido práctico, mejoras concretas y casos reales de optimización de perfil.
                    </p>
                  </div>
                  <a href={RAMIRO_LINKEDIN_URL} target="_blank" rel="noopener noreferrer"
                    onClick={() => trackEvent('click_externo', { destino: 'linkedin_ramiro', ubicacion: 'results' })}
                    className="btn-glow w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl text-white text-sm font-semibold mt-auto"
                    style={{ background: LI_GRADIENT }}>
                    <LinkedInIcon className="w-4 h-4" /> Seguir a Ramiro
                  </a>
                </div>

                {/* Página de empresa */}
                <div className="p-5 flex flex-col gap-3 items-center text-center">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: LI_GRADIENT }}>
                    <LinkedInIcon className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-slate-900 text-sm font-semibold">Página OptimizaLK</p>
                    <p className="text-slate-500 text-xs mt-1 leading-relaxed">
                      Recursos estructurados, guías y contenido más profundo sobre búsqueda de empleo.
                    </p>
                  </div>
                  <a href={COMPANY_LINKEDIN_URL} target="_blank" rel="noopener noreferrer"
                    onClick={() => trackEvent('click_externo', { destino: 'linkedin_pagina', ubicacion: 'results' })}
                    className="btn-glow w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl text-white text-sm font-semibold mt-auto"
                    style={{ background: LI_GRADIENT }}>
                    <LinkedInIcon className="w-4 h-4" /> Seguir la página
                  </a>
                </div>

              </div>

              {/* MP — fila secundaria */}
              <div className="px-5 py-3 flex items-center justify-between gap-3"
                style={{ borderTop: '1px solid rgba(0,119,181,0.08)', background: 'rgba(0,119,181,0.02)' }}>
                <p className="text-slate-500 text-xs leading-snug">
                  ☕ $5.000 únicos — el precio de un café para mantener esto gratis para todos.
                </p>
                <a href={MP_URL} target="_blank" rel="noopener noreferrer"
                  onClick={() => trackEvent('click_externo', { destino: 'mercadopago', ubicacion: 'results' })}
                  className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-xs font-semibold transition-all duration-200"
                  style={{ background: 'linear-gradient(135deg,#00b496,#00d4aa)' }}>
                  ☕ Apoyar · $5.000
                </a>
              </div>

            </div>

            <button
              onClick={() => { trackEvent('click_simulador', { location: 'post_analisis' }); resetInterview(); setStep(STEPS.INTERVIEW_INTRO) }}
              className="btn-glow w-full font-semibold py-4 rounded-2xl text-white text-sm"
              style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
            >
              🎙️ Simulá una entrevista inicial →
            </button>

            <button
              onClick={() => { trackEvent('click_analizar_otro', { location: 'post_analisis' }); reset() }}
              className="w-full font-semibold py-4 rounded-2xl transition-all duration-200 text-sm"
              style={BTN_BACK_STYLE}
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
                onClick={() => { trackEvent('entrevista_iniciada'); setStep(STEPS.INTERVIEW) }}
                className="btn-glow w-full text-white font-semibold py-4 rounded-2xl text-base"
                style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
              >
                Empezar entrevista →
              </button>
              <button
                onClick={() => setStep(STEPS.RESULTS)}
                className="w-full font-medium py-3 rounded-2xl text-sm transition-all"
                style={BTN_BACK_STYLE}
              >
                ← Volver a mis resultados
              </button>
            </div>
            <p className="text-slate-400 text-xs text-center">
              Simulación gratuita ·{' '}
              <a
                href={MP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-slate-600 transition-colors"
              >
                ☕ Apoyar · $5.000
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
                  placeholder="Escribí tu respuesta acá... (mínimo 20 caracteres)"
                  rows={6}
                  maxLength={800}
                  className="w-full rounded-2xl px-4 py-3 text-sm resize-none outline-none transition-all duration-200"
                  style={{
                    background: '#f8fafc',
                    border: interviewAnswer.trim().length >= 20 ? '1px solid rgba(99,102,241,0.5)' : '1px solid rgba(0,119,181,0.15)',
                    color: '#0d2137',
                  }}
                />
                <span className="absolute bottom-2.5 right-3 text-xs pointer-events-none"
                  style={{ color: interviewAnswer.length > 720 ? '#f59e0b' : '#94a3b8' }}>
                  {interviewAnswer.length}/800
                </span>
              </div>
              {interviewAnswer.trim().length > 0 && interviewAnswer.trim().length < 20 && (
                <p className="text-xs text-amber-600">Escribí al menos {20 - interviewAnswer.trim().length} caracteres más para continuar.</p>
              )}
              <button
                disabled={interviewAnswer.trim().length < 20}
                onClick={() => handleInterviewNext(interviewAnswer.trim())}
                className={`btn-glow w-full font-semibold py-4 rounded-2xl text-white text-sm ${interviewAnswer.trim().length < 20 ? 'opacity-40 cursor-not-allowed' : ''}`}
                style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
              >
                {interviewIdx < INTERVIEW_QUESTIONS.length - 1 ? 'Siguiente →' : 'Ver mi feedback →'}
              </button>
            </div>

            <button onClick={handleInterviewBack} className="text-slate-600 text-sm hover:text-slate-400 transition-colors py-3 px-3 min-h-[44px]">
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
            ) : (rateLimitSecs > 0 || rateLimitEvento === 'entrevista') ? (
              <RateLimitUI secs={rateLimitSecs} evento={rateLimitEvento === 'entrevista' ? rateLimitEvento : ''} email={waitlistEmail} onEmailChange={setWaitlistEmail} sent={waitlistSent} loading={waitlistLoading} onSubmit={handleWaitlist} />
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

                {/* Fortalezas / áreas — preview (máx 2 por columna) */}
                <ResultCard title="Fortalezas y áreas de mejora" accent="#6366f1">
                  <div className="grid sm:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: '#4ade80' }}>✅ Fortalezas</p>
                      {(interviewFeedback.fortalezas_entrevista || []).slice(0, 2).map((f, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <span className="mt-0.5 shrink-0" style={{ color: '#16a34a' }}>•</span>
                          <p className="text-slate-600 text-sm">{f}</p>
                        </div>
                      ))}
                      {(interviewFeedback.fortalezas_entrevista || []).length > 2 && (
                        <p className="text-xs text-slate-400 italic pl-3">
                          + {interviewFeedback.fortalezas_entrevista.length - 2} más en el informe completo
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: '#d97706' }}>⚠️ Áreas de mejora</p>
                      {(interviewFeedback.areas_de_mejora_entrevista || []).slice(0, 2).map((a, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <span className="mt-0.5 shrink-0" style={{ color: '#d97706' }}>•</span>
                          <p className="text-slate-600 text-sm">{a}</p>
                        </div>
                      ))}
                      {(interviewFeedback.areas_de_mejora_entrevista || []).length > 2 && (
                        <p className="text-xs text-slate-400 italic pl-3">
                          + {interviewFeedback.areas_de_mejora_entrevista.length - 2} más en el informe completo
                        </p>
                      )}
                    </div>
                  </div>
                </ResultCard>

                {/* Preview borroso del contenido bloqueado */}
                <div className="rounded-2xl overflow-hidden relative"
                  style={{ border: '1px solid rgba(99,102,241,0.15)', minHeight: '180px' }}>
                  <div style={{ filter: 'blur(5px)', userSelect: 'none', pointerEvents: 'none' }}
                    className="p-5 space-y-4">
                    {(interviewFeedback.feedback_por_respuesta || []).slice(0, 2).map((fb, i) => (
                      <div key={i} className="rounded-xl p-4"
                        style={{ background: '#f8fafc', border: '1px solid rgba(0,119,181,0.12)' }}>
                        <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: '#6366f1' }}>
                          Pregunta {fb.numero}
                        </p>
                        <p className="text-sm text-slate-600">✅ {fb.aspecto_positivo}</p>
                        <p className="text-sm text-slate-600">💡 {fb.sugerencia}</p>
                      </div>
                    ))}
                    {interviewFeedback.recomendacion_final && (
                      <div className="rounded-xl p-4"
                        style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)' }}>
                        <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: '#6366f1' }}>⚡ Recomendación final</p>
                        <p className="text-sm text-slate-700">{interviewFeedback.recomendacion_final}</p>
                      </div>
                    )}
                  </div>
                  {/* Gradient overlay */}
                  <div style={{
                    position: 'absolute', inset: 0,
                    background: 'linear-gradient(to bottom, rgba(240,244,248,0) 0%, rgba(240,244,248,0.88) 55%, #f0f4f8 100%)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end',
                    paddingBottom: '20px', gap: '6px',
                  }}>
                    <span style={{ fontSize: '26px' }}>🔒</span>
                    <p className="text-slate-600 text-sm font-semibold text-center">Feedback detallado bloqueado</p>
                  </div>
                </div>

                {/* ── Bloque de desbloqueo ── */}
                <div className="rounded-2xl overflow-hidden"
                  style={{ border: '1.5px solid rgba(0,119,181,0.25)', boxShadow: '0 4px 20px rgba(0,119,181,0.10)' }}>

                  {/* Header */}
                  <div className="px-5 pt-5 pb-4 text-center"
                    style={{ background: LI_GRADIENT }}>
                    <p className="text-white font-bold text-base leading-snug">
                      🔓 Desbloqueá el análisis completo de tu entrevista
                    </p>
                    <p className="mt-1.5 text-xs leading-relaxed max-w-xs mx-auto"
                      style={{ color: 'rgba(255,255,255,0.82)' }}>
                      Feedback detallado por respuesta, mejoras específicas y ejemplos para entrevistas reales.
                    </p>
                  </div>

                  <div className="p-5 space-y-4 bg-white">
                    <p className="text-slate-800 text-sm font-semibold">Para acceder al informe completo:</p>

                    {/* Pasos */}
                    <div className="space-y-3">
                      {[
                        { num: 1, text: 'Seguime en mi perfil de LinkedIn', href: RAMIRO_LINKEDIN_URL, cta: 'Ir al perfil de Ramiro →' },
                        { num: 2, text: 'Seguí la página de LinkedIn', href: COMPANY_LINKEDIN_URL, cta: 'Ir a la página →' },
                        { num: 3, text: 'Enviame un mensaje indicando que usaste la app', href: null, cta: null },
                      ].map(s => (
                        <div key={s.num} className="flex items-start gap-3">
                          <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 mt-0.5"
                            style={{ background: LI_GRADIENT }}>
                            {s.num}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-slate-700 text-sm">{s.text}</p>
                            {s.href && (
                              <a href={s.href} target="_blank" rel="noopener noreferrer"
                                className="text-xs font-semibold mt-0.5 inline-block"
                                style={{ color: '#0077B5' }}>
                                {s.cta}
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Reductor de fricción */}
                    <div className="rounded-xl px-4 py-3"
                      style={{ background: 'rgba(0,119,181,0.05)', border: '1px solid rgba(0,119,181,0.12)' }}>
                      <p className="text-slate-500 text-xs leading-relaxed">
                        💬 Podés escribirme algo simple como:{' '}
                        <span className="text-slate-700 font-medium">"Usé la app y quiero el informe completo"</span>
                      </p>
                    </div>

                    {/* CTA principal */}
                    <a href={RAMIRO_LINKEDIN_URL} target="_blank" rel="noopener noreferrer"
                      onClick={() => trackEvent('click_externo', { destino: 'linkedin_ramiro', ubicacion: 'unlock_entrevista' })}
                      className="btn-glow w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white text-sm font-semibold"
                      style={{ background: LI_GRADIENT }}>
                      <LinkedInIcon className="w-4 h-4" /> Escribirle a Ramiro →
                    </a>

                    <p className="text-slate-400 text-xs text-center leading-relaxed">
                      Con eso te comparto el análisis completo y, si querés, vemos cómo prepararte para entrevistas reales.
                    </p>
                  </div>
                </div>

                {/* Card Ramiro — asesoramiento personalizado */}
                <div className="rounded-2xl p-5"
                  style={{ background: 'rgba(0,119,181,0.05)', border: '1px solid rgba(0,119,181,0.18)' }}>
                  <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#0077B5' }}>
                    🎯 ¿Querés asesoramiento personalizado?
                  </p>
                  <p className="text-slate-600 text-sm leading-relaxed mb-3">
                    Podemos revisar tu perfil en vivo, reescribir tu titular y prepararte para entrevistas reales. Escribime por privado en LinkedIn.
                  </p>
                  <button
                    onClick={() => !leadSaving && !leadSent && setShowLeadModal(true)}
                    disabled={leadSaving || leadSent}
                    className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white font-semibold text-sm ${!leadSent ? 'btn-glow' : ''}`}
                    style={{
                      background: leadSent ? 'rgba(34,197,94,0.15)' : LI_GRADIENT,
                      border: leadSent ? '1px solid rgba(34,197,94,0.4)' : 'none',
                      color: leadSent ? '#4ade80' : '#fff',
                      cursor: leadSaving || leadSent ? 'default' : 'pointer',
                    }}
                  >
                    {leadSaving ? (
                      <><Spinner size={4} /> Enviando...</>
                    ) : leadSent ? (
                      '✓ Mensaje enviado'
                    ) : (
                      <><LinkedInIcon className="w-4 h-4" /> Escribirle a Ramiro</>
                    )}
                  </button>
                </div>

                {/* MP — secundario */}
                <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl"
                  style={{ background: 'rgba(0,180,150,0.05)', border: '1px solid rgba(0,180,150,0.18)' }}>
                  <p className="text-slate-500 text-xs leading-snug">
                    ☕ $5.000 únicos — el precio de un café para mantener esto gratis para todos.
                  </p>
                  <a href={MP_URL} target="_blank" rel="noopener noreferrer"
                    onClick={() => trackEvent('click_externo', { destino: 'mercadopago', ubicacion: 'interview_feedback' })}
                    className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-xs font-semibold transition-all duration-200"
                    style={{ background: 'linear-gradient(135deg,#00b496,#00d4aa)' }}>
                    ☕ Apoyar · $5.000
                  </a>
                </div>

                {/* ── Sugerencia STAR ── */}
                <div className="rounded-2xl p-5 space-y-3"
                  style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.22)' }}>
                  <p className="text-sm font-semibold text-slate-800">🎯 ¿Querés mejorar tus respuestas de entrevista?</p>
                  <p className="text-slate-500 text-xs leading-relaxed">
                    Aprendé y practicá la <strong>metodología STAR</strong> — el framework que usan los mejores candidatos para estructurar sus respuestas y causar impacto real en los reclutadores.
                  </p>
                  <button
                    onClick={() => { trackEvent('star_cta_click', { location: 'interview_feedback' }); setShowStarModal(true) }}
                    className="w-full py-3 rounded-xl text-white text-sm font-semibold transition-all"
                    style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
                  >
                    Entrenar metodología STAR →
                  </button>
                </div>

                <button
                  onClick={() => setStep(STEPS.RESULTS)}
                  className="w-full font-semibold py-4 rounded-2xl text-sm"
                  style={BTN_BACK_STYLE}
                >
                  ← Volver a mi análisis
                </button>
              </>
            )}
          </div>
        )}

        {/* ── STAR TRAINING ── */}
        {step === STEPS.STAR_TRAINING && (
          <div className="step-transition space-y-6">
            <Logo />

            {starPhase === 'theory' && (
              <>
                <div className="text-center space-y-2">
                  <h2 className="text-2xl font-bold text-slate-900">Metodología STAR</h2>
                  <p className="text-slate-500 text-sm leading-relaxed max-w-sm mx-auto">
                    Un framework simple para dar respuestas claras, estructuradas y memorables en cualquier entrevista.
                  </p>
                </div>

                <div className="space-y-3">
                  {[
                    { letra: 'S', color: '#6366f1', bg: 'rgba(99,102,241,0.08)', border: 'rgba(99,102,241,0.22)', nombre: 'Situación', def: 'Describí el contexto. ¿Cuándo y dónde ocurrió? ¿Qué estaba en juego?', ej: 'Ej: "Era finales de año y el sistema de facturación colapsó justo antes del cierre."' },
                    { letra: 'T', color: '#0ea5e9', bg: 'rgba(14,165,233,0.08)', border: 'rgba(14,165,233,0.22)', nombre: 'Tarea', def: '¿Cuál era tu responsabilidad específica en esa situación?', ej: 'Ej: "Yo era el responsable de garantizar que los pagos se procesaran a tiempo."' },
                    { letra: 'A', color: '#059669', bg: 'rgba(5,150,105,0.08)', border: 'rgba(5,150,105,0.22)', nombre: 'Acción', def: '¿Qué hiciste vos concretamente? Usá verbos de acción en primera persona.', ej: 'Ej: "Coordiné al equipo, prioricé manualmente las cuentas críticas y contacté al proveedor."' },
                    { letra: 'R', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.22)', nombre: 'Resultado', def: '¿Qué lograste? Con métricas si podés. ¿Qué aprendiste?', ej: 'Ej: "Procesamos el 95% de los pagos en tiempo. El cliente renovó el contrato por 2 años más."' },
                  ].map(({ letra, color, bg, border, nombre, def, ej }) => (
                    <div key={letra} className="rounded-2xl p-4 flex gap-4 items-start"
                      style={{ background: bg, border: `1px solid ${border}` }}>
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-lg font-black shrink-0"
                        style={{ background: color }}>{letra}</div>
                      <div className="space-y-1">
                        <p className="font-semibold text-sm text-slate-800">{nombre}</p>
                        <p className="text-slate-600 text-xs leading-relaxed">{def}</p>
                        <p className="text-xs italic" style={{ color }}>{ej}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="rounded-2xl p-5 space-y-3"
                  style={{ background: 'white', border: '1px solid rgba(99,102,241,0.20)', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#6366f1' }}>Ejemplo completo bien estructurado</p>
                  <p className="text-xs text-slate-500 italic mb-1">Pregunta: "Contame sobre un logro profesional del que estés orgulloso/a."</p>
                  <p className="text-slate-700 text-sm leading-relaxed">
                    <strong className="text-indigo-600">S:</strong> "En mi anterior empresa, el equipo de ventas no tenía visibilidad en tiempo real de los resultados." <strong className="text-sky-600">T:</strong> "Como analista de datos, me propuse crear un dashboard que resolviera ese problema sin presupuesto adicional." <strong className="text-emerald-600">A:</strong> "Dediqué 3 semanas fuera del horario laboral, aprendí Power BI y coordiné con el equipo de IT para los accesos." <strong className="text-amber-600">R:</strong> "El dashboard redujo el tiempo de reporte semanal de 4 horas a 20 minutos. El gerente lo adoptó para toda la región."
                  </p>
                </div>

                <button
                  onClick={() => { setStarPhase('practice'); trackEvent('star_phase_change', { phase: 'practice' }) }}
                  className="w-full py-4 rounded-2xl text-white text-sm font-semibold transition-all btn-glow"
                  style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
                >
                  Practicar ahora →
                </button>
                <button onClick={() => setStep(STEPS.INTERVIEW_FEEDBACK)}
                  className="w-full py-3 rounded-2xl text-sm font-semibold" style={BTN_BACK_STYLE}>
                  ← Volver al feedback
                </button>
              </>
            )}

            {starPhase === 'practice' && (
              <>
                <div className="rounded-2xl p-5 space-y-2"
                  style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.22)' }}>
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#6366f1' }}>
                    Pregunta {starQuestionIdx + 1} de {STAR_QUESTIONS.length}
                  </p>
                  <p className="text-slate-800 text-base font-semibold leading-snug">
                    {STAR_QUESTIONS[starQuestionIdx]}
                  </p>
                </div>

                <div className="flex gap-2 flex-wrap">
                  {[
                    { l: 'S', label: 'Situación', color: '#6366f1' },
                    { l: 'T', label: 'Tarea', color: '#0ea5e9' },
                    { l: 'A', label: 'Acción', color: '#059669' },
                    { l: 'R', label: 'Resultado', color: '#f59e0b' },
                  ].map(({ l, label, color }) => (
                    <span key={l} className="text-xs px-3 py-1 rounded-full font-semibold"
                      style={{ background: `${color}15`, color, border: `1px solid ${color}40` }}>
                      {l} · {label}
                    </span>
                  ))}
                </div>

                {!starFeedback ? (
                  <div className="space-y-3">
                    <div className="relative">
                      <textarea
                        value={starAnswer}
                        onChange={e => setStarAnswer(e.target.value)}
                        placeholder="Escribí tu respuesta usando la estructura STAR. Empezá describiendo la Situación..."
                        rows={7}
                        maxLength={1000}
                        className="w-full rounded-2xl px-4 py-3.5 text-sm text-slate-800 resize-none outline-none transition-all"
                        style={{
                          ...INPUT_STYLE,
                          border: `1px solid ${starAnswer.length >= 40 ? 'rgba(99,102,241,0.4)' : 'rgba(0,119,181,0.20)'}`,
                        }}
                      />
                      <span className="absolute bottom-3 right-4 text-xs text-slate-400">{starAnswer.length}/1000</span>
                    </div>
                    {starAnswer.length > 0 && starAnswer.length < 40 && (
                      <p className="text-xs text-slate-400">{40 - starAnswer.length} caracteres más para habilitar el feedback</p>
                    )}
                    {(rateLimitSecs > 0 || rateLimitEvento === 'star')
                      ? <RateLimitUI secs={rateLimitSecs} evento={rateLimitEvento === 'star' ? rateLimitEvento : ''} email={waitlistEmail} onEmailChange={setWaitlistEmail} sent={waitlistSent} loading={waitlistLoading} onSubmit={handleWaitlist} />
                      : starError && <p className="text-xs text-red-500">{starError}</p>
                    }
                    <button
                      disabled={starAnswer.trim().length < 40 || starLoading}
                      onClick={() => { trackEvent('star_practice_submit', { question_idx: starQuestionIdx }); callStarFeedback() }}
                      className="w-full py-4 rounded-2xl text-sm font-semibold text-white transition-all"
                      style={{
                        background: starAnswer.trim().length >= 40 && !starLoading ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : '#94a3b8',
                        opacity: starAnswer.trim().length < 40 || starLoading ? 0.6 : 1,
                      }}
                    >
                      {starLoading ? '⏳ Analizando tu respuesta...' : 'Obtener feedback →'}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center gap-4 rounded-2xl p-4"
                      style={{ background: 'white', border: '1px solid rgba(99,102,241,0.15)', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                      <div className="flex flex-col items-center shrink-0">
                        <span className="text-3xl font-black" style={{ color: starFeedback.puntaje >= 7 ? '#059669' : starFeedback.puntaje >= 5 ? '#6366f1' : '#f59e0b' }}>
                          {starFeedback.puntaje}
                        </span>
                        <span className="text-xs text-slate-400">/ 10</span>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-800">Puntaje STAR</p>
                        <p className="text-xs text-slate-500">
                          {starFeedback.puntaje >= 8 ? '¡Excelente estructura!' : starFeedback.puntaje >= 6 ? 'Buena base, hay margen de mejora.' : 'Seguí practicando — vas a mejorar rápido.'}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {[
                        { key: 'situacion', letra: 'S', nombre: 'Situación', color: '#6366f1' },
                        { key: 'tarea', letra: 'T', nombre: 'Tarea', color: '#0ea5e9' },
                        { key: 'accion', letra: 'A', nombre: 'Acción', color: '#059669' },
                        { key: 'resultado', letra: 'R', nombre: 'Resultado', color: '#f59e0b' },
                      ].map(({ key, letra, nombre, color }) => {
                        const item = starFeedback[key]
                        return (
                          <div key={key} className="flex items-start gap-3 rounded-xl p-3"
                            style={{ background: item.presente ? `${color}08` : 'rgba(239,68,68,0.05)', border: `1px solid ${item.presente ? `${color}25` : 'rgba(239,68,68,0.20)'}` }}>
                            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-black shrink-0"
                              style={{ background: item.presente ? color : '#ef4444' }}>{letra}</div>
                            <div>
                              <p className="text-xs font-semibold" style={{ color: item.presente ? color : '#ef4444' }}>
                                {nombre} — {item.presente ? '✓ Presente' : '✗ Falta o poco claro'}
                              </p>
                              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{item.comentario}</p>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    <div className="rounded-2xl p-4 space-y-1"
                      style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.22)' }}>
                      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#6366f1' }}>💡 Sugerencia clave</p>
                      <p className="text-slate-700 text-sm leading-relaxed">{starFeedback.sugerencia_clave}</p>
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={() => { setStarFeedback(null); setStarAnswer(''); setStarError(''); trackEvent('star_retry', { question_idx: starQuestionIdx }) }}
                        className="flex-1 py-3 rounded-xl text-sm font-semibold" style={BTN_BACK_STYLE}
                      >
                        Intentar de nuevo
                      </button>
                      <button
                        onClick={() => {
                          const next = (starQuestionIdx + 1) % STAR_QUESTIONS.length
                          setStarQuestionIdx(next)
                          setStarFeedback(null)
                          setStarAnswer('')
                          setStarError('')
                          trackEvent('star_next_question', { question_idx: next })
                        }}
                        className="flex-1 py-3 rounded-xl text-sm font-semibold text-white"
                        style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
                      >
                        Nueva pregunta →
                      </button>
                    </div>
                  </div>
                )}

                <button onClick={() => setStep(STEPS.RESULTS)}
                  className="w-full py-3 rounded-2xl text-sm font-semibold" style={BTN_BACK_STYLE}>
                  ← Volver a mi análisis
                </button>
              </>
            )}
          </div>
        )}

      </div>

      {/* ── Preview CV mobile (in-app overlay, reemplaza window.open) ── */}
      {cvPreviewHtml && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#fff' }}>
          <div className="flex items-center justify-between px-4 py-3 shrink-0"
            style={{ background: 'linear-gradient(135deg,#0077B5,#0ea5e9)', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
            <p className="text-white text-sm font-semibold">📄 Tu CV — guardalo como PDF</p>
            <button onClick={() => setCvPreviewHtml('')}
              className="text-white text-xs px-3 py-1.5 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.2)' }}>
              ✕ Cerrar
            </button>
          </div>
          <div className="px-4 py-2 shrink-0 text-center text-xs text-slate-600 leading-relaxed"
            style={{ background: '#f0f7ff', borderBottom: '1px solid rgba(0,119,181,0.12)' }}>
            Tocá <strong>Compartir</strong> en tu navegador → <strong>Imprimir</strong> → Compartir → <strong>Guardar en Archivos</strong>
          </div>
          <iframe
            srcDoc={cvPreviewHtml}
            title="Vista previa de tu CV"
            className="flex-1 w-full border-0"
            sandbox="allow-same-origin"
          />
        </div>
      )}

      {/* ── Modal STAR paywall ── */}
      {showStarModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 overflow-y-auto"
          style={{ background: 'rgba(0,0,0,0.70)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowStarModal(false) }}
        >
          <div className="w-full max-w-sm rounded-2xl overflow-hidden step-transition"
            style={{ background: '#1e293b', border: '1px solid #334155', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            <div className="p-6 pb-4 space-y-2">
              <h3 className="text-lg font-bold text-white">🎯 Entrenador STAR</h3>
              <p className="text-xs leading-relaxed" style={{ color: '#64748b' }}>
                El método que usan los mejores candidatos para estructurar respuestas que impactan.
              </p>
              <ul className="text-xs space-y-1 pt-1" style={{ color: '#64748b' }}>
                <li>✓ Teoría explicada paso a paso (S · T · A · R)</li>
                <li>✓ Ejemplo completo de una respuesta bien estructurada</li>
                <li>✓ Práctica real con preguntas de RRHH</li>
                <li>✓ Feedback de IA por cada componente STAR</li>
              </ul>
            </div>
            <div className="px-6 pb-6 pt-4 space-y-3" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
              <button
                onClick={() => {
                  trackEvent('star_training_start', { via: 'free' })
                  setShowStarModal(false)
                  setStarPhase('theory')
                  setStarFeedback(null)
                  setStarAnswer('')
                  setStep(STEPS.STAR_TRAINING)
                }}
                className="w-full py-3.5 rounded-xl text-sm font-semibold"
                style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: 'white' }}
              >
                Empezar gratis →
              </button>
              <div className="flex items-start gap-2.5">
                <span className="text-base shrink-0 mt-0.5">☕</span>
                <p className="text-xs leading-relaxed" style={{ color: '#475569' }}>
                  Si te aportó valor, podés apoyar con $5.000 (único, optativo).
                </p>
              </div>
              <button
                onClick={() => {
                  trackEvent('star_training_start', { via: 'paid' })
                  window.open(MP_URL, '_blank', 'noopener,noreferrer')
                  setShowStarModal(false)
                  setStarPhase('theory')
                  setStarFeedback(null)
                  setStarAnswer('')
                  setStep(STEPS.STAR_TRAINING)
                }}
                className="w-full py-2.5 rounded-xl text-xs font-medium"
                style={{ border: '1px solid rgba(0,180,150,0.35)', color: '#34d399', background: 'rgba(0,180,150,0.06)' }}
              >
                ☕ Apoyar $5.000 y empezar →
              </button>
              <button
                onClick={() => setShowStarModal(false)}
                className="w-full py-2 text-xs transition-colors"
                style={{ color: '#475569' }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal CV de 1 página ── */}
      {showCvModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 overflow-y-auto"
          style={{ background: 'rgba(0,0,0,0.70)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowCvModal(false) }}
        >
          <div className="w-full max-w-sm rounded-2xl overflow-hidden"
            style={{ background: '#1e293b', border: '1px solid #334155', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            <div className="p-6 pb-4 space-y-2">
              <h3 className="text-lg font-bold text-white">📄 Tu CV de 1 página</h3>
              <ul className="text-xs space-y-1 pt-1" style={{ color: '#64748b' }}>
                <li>✓ Titular y resumen optimizados de tu análisis</li>
                <li>✓ Experiencias con logros y métricas</li>
                <li>✓ Keywords de tu industria incluidas</li>
                <li>✓ ATS-compatible · listo para guardar como PDF</li>
              </ul>
            </div>
            <div className="px-6 pb-6 pt-4 space-y-3" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-xs font-semibold" style={{ color: '#cbd5e1' }}>Datos de contacto para el CV</p>
              <div>
                <label className="text-xs block mb-1" style={{ color: '#64748b' }}>
                  Email <span style={{ color: '#f87171' }}>*</span>
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
                  <label className="text-xs block mb-1" style={{ color: '#64748b' }}>Teléfono</label>
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
                  <label className="text-xs block mb-1" style={{ color: '#64748b' }}>URL LinkedIn</label>
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
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs block mb-1" style={{ color: '#64748b' }}>Nombre completo</label>
                  <input
                    type="text"
                    value={contactNombre}
                    onChange={e => setContactNombre(e.target.value)}
                    placeholder="Nombre Apellido"
                    className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none"
                    style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid #334155' }}
                  />
                </div>
                <div>
                  <label className="text-xs block mb-1" style={{ color: '#64748b' }}>Ubicación</label>
                  <input
                    type="text"
                    value={contactUbicacion}
                    onChange={e => setContactUbicacion(e.target.value)}
                    placeholder="Buenos Aires, AR"
                    className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none"
                    style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid #334155' }}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs block mb-1" style={{ color: '#64748b' }}>Idiomas</label>
                <input
                  type="text"
                  value={contactIdiomas}
                  onChange={e => setContactIdiomas(e.target.value)}
                  placeholder="Español nativo · Inglés avanzado"
                  className="w-full rounded-xl px-4 py-2.5 text-sm text-white outline-none"
                  style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid #334155' }}
                />
              </div>
              <div>
                <label className="text-xs block mb-1" style={{ color: '#64748b' }}>Habilidades clave <span style={{ color: '#475569', fontWeight: 400 }}>(opcionales — si no aparecen en tu perfil)</span></label>
                <input
                  type="text"
                  value={contactHabilidades}
                  onChange={e => setContactHabilidades(e.target.value)}
                  placeholder="Liderazgo, Excel, Scrum, Negociación..."
                  className="w-full rounded-xl px-4 py-2.5 text-sm text-white outline-none"
                  style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid #334155' }}
                />
              </div>
              <p className="text-xs leading-relaxed pt-1" style={{ color: '#475569' }}>
                🔒 Tus datos se usan solo para confeccionar el CV y no se comparten con terceros.
              </p>
              <button
                onClick={() => {
                  if (!contactEmail.trim()) return
                  const contacto = { email: contactEmail.trim(), telefono: contactTelefono.trim(), linkedinUrl: contactLinkedin.trim(), nombre: contactNombre.trim(), ubicacion: contactUbicacion.trim(), idiomas: contactIdiomas.trim(), habilidades: contactHabilidades.trim() }
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
              <div className="flex items-start gap-2.5">
                <span className="text-base shrink-0 mt-0.5">☕</span>
                <p className="text-xs leading-relaxed" style={{ color: '#475569' }}>
                  Si te aportó valor, podés apoyar con $5.000 (único, optativo).
                </p>
              </div>
              <button
                onClick={() => {
                  if (!contactEmail.trim()) return
                  const contacto = { email: contactEmail.trim(), telefono: contactTelefono.trim(), linkedinUrl: contactLinkedin.trim(), nombre: contactNombre.trim(), ubicacion: contactUbicacion.trim(), idiomas: contactIdiomas.trim(), habilidades: contactHabilidades.trim() }
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
                className="w-full py-2 text-xs transition-colors"
                style={{ color: '#475569' }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

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
                <h3 className="text-lg font-bold text-slate-900">Conectate con Ramiro</h3>
                <p className="text-slate-500 text-sm mt-1 leading-relaxed">
                  Ingresá tu nombre para que Ramiro pueda revisar tu análisis antes del primer mensaje.
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
                Tu nombre y análisis serán compartidos con Ramiro para que pueda orientarte desde el inicio.
              </p>
              <p className="text-slate-400 text-xs">
                La consultoría personalizada tiene costo — se cotiza en el momento.
              </p>
            </div>

            {/* Sección colaboración */}
            <div className="px-6 pb-2 pt-1 space-y-3"
              style={{ borderTop: '1px solid rgba(0,180,150,0.18)', background: 'rgba(0,180,150,0.04)' }}>
              <div className="flex items-start gap-3 pt-4">
                <span className="text-2xl shrink-0">🙌</span>
                <div>
                  <p className="text-sm font-semibold text-slate-800">¿Te aportó valor? Invitame un cafecito ☕</p>
                  <p className="text-slate-500 text-xs mt-1 leading-relaxed">
                    $5.000 de única vez — no es suscripción, es totalmente optativo. Me ayuda a sostener la herramienta gratuita.
                  </p>
                </div>
              </div>
              <button
                onClick={() => saveAndConnectRamiro(leadNombre, leadApellido, true)}
                disabled={!leadNombre.trim() || !leadApellido.trim()}
                className={`w-full py-3 rounded-xl text-white text-sm font-semibold transition-all ${leadNombre.trim() && leadApellido.trim() ? '' : 'opacity-40 cursor-not-allowed'}`}
                style={{ background: leadNombre.trim() && leadApellido.trim() ? 'linear-gradient(135deg,#00b496,#00d4aa)' : 'rgba(0,180,150,0.3)', boxShadow: leadNombre.trim() && leadApellido.trim() ? '0 0 18px rgba(0,180,150,0.3)' : 'none' }}
              >
                ☕ Apoyar ($5.000) y conectar con Ramiro
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
                className="w-full py-2 text-slate-400 text-xs hover:text-slate-600 transition-colors"
              >
                Cancelar
              </button>
              <p className="text-center text-slate-400 text-xs pb-5">
                🔒 Tu nombre y análisis se almacenan de forma segura y solo Ramiro puede acceder a ellos.
              </p>
            </div>
          </div>
        </div>
      )}



    </main>
  )
}

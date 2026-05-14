import { useState, useEffect, useCallback, useRef } from 'react'
import './index.css'

const WORKER_URL = import.meta.env.VITE_WORKER_URL
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
const APP_TOKEN   = import.meta.env.VITE_APP_TOKEN || ''

// ── EmailJS (envío de emails transaccionales) ────────────────────────────────
const EMAILJS_SERVICE_ID        = import.meta.env.VITE_EMAILJS_SERVICE_ID        || ''
const EMAILJS_PUBLIC_KEY        = import.meta.env.VITE_EMAILJS_PUBLIC_KEY        || ''
const EMAILJS_TEMPLATE_WELCOME  = import.meta.env.VITE_EMAILJS_TEMPLATE_WELCOME  || ''
const EMAILJS_TEMPLATE_CANCEL   = import.meta.env.VITE_EMAILJS_TEMPLATE_CANCEL   || ''

// ── Headers para todas las llamadas al Worker ────────────────────────────────
const WORKER_HEADERS = Object.freeze({
  'Content-Type': 'application/json',
  ...(APP_TOKEN ? { 'X-App-Token': APP_TOKEN } : {}),
})

// ── Envío de email vía EmailJS REST API (non-blocking, silent fail) ──────────
const sendEmail = (templateId, params) => {
  if (!EMAILJS_SERVICE_ID || !EMAILJS_PUBLIC_KEY || !templateId) return
  fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ service_id: EMAILJS_SERVICE_ID, template_id: templateId, user_id: EMAILJS_PUBLIC_KEY, template_params: params }),
  }).catch(() => {})
}

function parseGeminiError(status, body) {
  if (status === 400) return 'API key inválida o solicitud incorrecta. Revisá la key ingresada.'
  if (status === 403) return 'API key sin permisos. Verificá que esté habilitada en Google AI Studio.'
  return `Error HTTP ${status}: ${body?.error?.message || 'Error desconocido'}`
}

function makeRateLimitError() {
  return Object.assign(new Error('RATE_LIMIT'), { isRateLimit: true })
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
      ✓ ¡Anotado! Te avisamos cuando vuelva a estar disponible.
    </div>
  )
  return (
    <div role="alert" className="rounded-xl p-4 text-sm space-y-3" style={amber}>
      <p>⏱ Los tokens de IA se agotaron por hoy. Dejá tu email y te avisamos mañana cuando se reinicien.</p>
      <div className="flex gap-2">
        <input type="email" value={email} onChange={e => onEmailChange(e.target.value)}
          placeholder="tu@email.com" onKeyDown={e => e.key === 'Enter' && email.includes('@') && onSubmit(email)}
          className="flex-1 rounded-lg px-3 py-2 text-sm outline-none"
          style={{ background: 'rgba(15,23,42,0.85)', border: '1px solid rgba(251,191,36,0.3)', color: 'white' }} />
        <button onClick={() => onSubmit(email)} disabled={loading || !email.includes('@')}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-900"
          style={{ background: '#fbbf24', opacity: loading || !email.includes('@') ? 0.45 : 1, cursor: loading || !email.includes('@') ? 'not-allowed' : 'pointer' }}>
          {loading ? '...' : 'Avisame'}
        </button>
      </div>
    </div>
  )
}

const STEPS = {
  WELCOME: 0, QUESTIONS: 1, PROFILE_INPUT: 2, LOADING: 3, RESULTS: 4,
  INTERVIEW_INTRO: 5, INTERVIEW: 6, INTERVIEW_FEEDBACK: 7, STAR_TRAINING: 8,
  MODE_SELECT: 9, TRACKING: 10,
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
const MP_URL               = 'https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_plan_id=8aad681a5695404b962fcae2918079fe'
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


function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ── CV autofit script (shared across all templates) ─────────────────────────
const CV_AUTOFIT_SCRIPT = `<script>
(function () {
  var A4W = Math.round(210 * 3.7795);
  var A4H = Math.round(297 * 3.7795);
  function autofit() {
    if (window.matchMedia('print').matches) return;
    var wrap = document.getElementById('cv-wrap');
    if (!wrap) return;
    var vw = window.innerWidth || document.documentElement.clientWidth || A4W;
    if (vw > 0 && vw < A4W) {
      wrap.style.zoom = (vw / A4W).toFixed(4);
      document.documentElement.style.overflowX = 'hidden';
      document.body.style.overflowX = 'hidden';
      return;
    }
    var h = wrap.scrollHeight;
    if (h > 0 && h < A4H * 0.84) {
      wrap.style.zoom = Math.min((A4H * 0.93) / h, 1.35).toFixed(4);
    }
  }
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', autofit); } else { autofit(); }
  window.addEventListener('resize', autofit);
  function clearZoomForPrint() {
    var wrap = document.getElementById('cv-wrap');
    if (wrap) wrap.style.zoom = '';
    document.documentElement.style.overflowX = '';
    document.body.style.overflowX = '';
  }
  window.addEventListener('beforeprint', clearZoomForPrint);
  var mq = window.matchMedia('print');
  if (mq.addListener) { mq.addListener(function(e){ if(e.matches) clearZoomForPrint(); }); }
  else if (mq.addEventListener) { mq.addEventListener('change', function(e){ if(e.matches) clearZoomForPrint(); }); }
})();
<\/script>`

// ── CV template: Minimal ─────────────────────────────────────────────────────
function buildCvHtmlMinimal(cv, photoBase64 = null, photoMime = 'image/jpeg') {
  const e = escapeHtml
  const nameParts = (cv.nombre || '').trim().split(/\s+/)
  const apellido = nameParts.length > 1 ? nameParts[nameParts.length - 1] : nameParts[0] || ''
  const primerNombre = nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : ''
  const hoy = new Date()
  const fechaStr = `${String(hoy.getDate()).padStart(2, '0')}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${hoy.getFullYear()}`
  const pdfTitle = `${apellido}${primerNombre ? ' ' + primerNombre : ''} - ${fechaStr} - CV Optimiza LK`

  const photoHtml = photoBase64
    ? `<img class="cv-photo-min" src="data:${photoMime};base64,${photoBase64}" alt="Foto de perfil" />`
    : ''

  const contactItems = [
    cv.email    && `<span>✉ ${e(cv.email)}</span>`,
    cv.telefono && `<span>✆ ${e(cv.telefono)}</span>`,
    cv.linkedin && `<span>in ${e(cv.linkedin)}</span>`,
    cv.ubicacion&& `<span>⌖ ${e(cv.ubicacion)}</span>`,
  ].filter(Boolean).join('')

  const expHtml = (cv.experiencias || []).map(ex => `
    <div class="exp-item">
      <div class="exp-row">
        <span class="exp-role">${e(ex.cargo)}</span>
        <span class="exp-period">${e(ex.periodo || '')}</span>
      </div>
      <div class="exp-company">${e(ex.empresa)}</div>
      <ul class="exp-bullets">${(ex.logros || []).map(l => `<li>${e(l)}</li>`).join('')}</ul>
    </div>`).join('')

  const prevJobsHtml = (cv.experiencias_anteriores || []).length > 0
    ? `<div class="prev-jobs">${(cv.experiencias_anteriores || []).map(p =>
        `<span class="prev-job">${e(p.cargo)} · ${e(p.empresa)}</span>`
      ).join('')}</div>`
    : ''

  const skillsText = (cv.habilidades || []).join(' · ')

  const eduHtml = (cv.educacion || []).map(ed => `
    <div class="edu-item">
      <div class="edu-row">
        <span class="edu-title">${e(ed.titulo)}</span>
        <span class="edu-period">${e(ed.periodo || '')}</span>
      </div>
      <div class="edu-inst">${e(ed.institucion)}</div>
    </div>`).join('')

  const idiomasText = (cv.idiomas || []).join(' · ')

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=210mm, initial-scale=1">
<title>${e(pdfTitle)}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 9.5pt; color: #111827; line-height: 1.5; width: 210mm; min-height: 297mm; background: white; padding: 18mm 16mm 16mm; }
  .cv-wrap { width: 100%; min-height: 100%; }
  .cv-header { display: flex; align-items: flex-start; justify-content: space-between; padding-bottom: 10px; border-bottom: 2px solid #111827; margin-bottom: 10px; gap: 12px; }
  .header-left { flex: 1; }
  .cv-name { font-size: 22pt; font-weight: 800; letter-spacing: -0.5px; line-height: 1.1; }
  .cv-title { font-size: 9pt; color: #6B7280; margin-top: 4px; line-height: 1.4; }
  .cv-photo-min { width: 60px; height: 60px; border-radius: 50%; object-fit: cover; border: 2px solid #e5e7eb; flex-shrink: 0; }
  .contact-bar { display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 7.5pt; color: #6B7280; margin-bottom: 14px; }
  .section { margin-bottom: 13px; }
  .section-title { font-size: 6pt; font-weight: 700; letter-spacing: 1.6px; text-transform: uppercase; color: #374151; padding-bottom: 4px; margin-bottom: 8px; border-bottom: 1px solid #E5E7EB; }
  .resumen-text { font-size: 9pt; color: #374151; line-height: 1.6; }
  .exp-item { margin-bottom: 11px; }
  .exp-item:last-child { margin-bottom: 0; }
  .exp-row { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
  .exp-role { font-size: 9.5pt; font-weight: 700; color: #111827; flex: 1; }
  .exp-period { font-size: 7.5pt; color: #9CA3AF; white-space: nowrap; flex-shrink: 0; }
  .exp-company { font-size: 8pt; color: #6B7280; font-style: italic; margin: 1.5px 0 4px; }
  .exp-bullets { margin: 0 0 0 12px; padding: 0; }
  .exp-bullets li { font-size: 8.5pt; color: #374151; margin-bottom: 2px; line-height: 1.45; }
  .prev-jobs { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 2px 10px; }
  .prev-job { font-size: 7.5pt; color: #9CA3AF; }
  .edu-item { margin-bottom: 7px; }
  .edu-row { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
  .edu-title { font-size: 8.5pt; font-weight: 600; color: #111827; flex: 1; }
  .edu-period { font-size: 7.5pt; color: #9CA3AF; white-space: nowrap; flex-shrink: 0; }
  .edu-inst { font-size: 8pt; color: #6B7280; margin-top: 1px; }
  .skills-text { font-size: 8.5pt; color: #374151; line-height: 1.7; }
  @media print {
    @page { size: A4 portrait; margin: 0; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    html, body { margin: 0 !important; padding: 18mm 16mm !important; width: 210mm !important; }
    .cv-wrap { zoom: 1 !important; transform: none !important; }
  }
</style>
</head>
<body>
<div class="cv-wrap" id="cv-wrap">
  <div class="cv-header">
    <div class="header-left">
      <div class="cv-name">${e(cv.nombre)}</div>
      <div class="cv-title">${e(cv.titular)}</div>
    </div>
    ${photoHtml}
  </div>
  ${contactItems ? `<div class="contact-bar">${contactItems}</div>` : ''}
  ${cv.resumen ? `<div class="section"><div class="section-title">Perfil</div><p class="resumen-text">${e(cv.resumen)}</p></div>` : ''}
  ${expHtml ? `<div class="section"><div class="section-title">Experiencia</div>${expHtml}${prevJobsHtml}</div>` : ''}
  ${skillsText ? `<div class="section"><div class="section-title">Habilidades</div><p class="skills-text">${e(skillsText)}</p></div>` : ''}
  ${eduHtml ? `<div class="section"><div class="section-title">Educación</div>${eduHtml}</div>` : ''}
  ${idiomasText ? `<div class="section"><div class="section-title">Idiomas</div><p class="skills-text">${e(idiomasText)}</p></div>` : ''}
</div>
${CV_AUTOFIT_SCRIPT}
</body></html>`
}

// ── CV template: Ejecutivo ───────────────────────────────────────────────────
function buildCvHtmlEjecutivo(cv, photoBase64 = null, photoMime = 'image/jpeg') {
  const e = escapeHtml
  const nameParts = (cv.nombre || '').trim().split(/\s+/)
  const apellido = nameParts.length > 1 ? nameParts[nameParts.length - 1] : nameParts[0] || ''
  const primerNombre = nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : ''
  const hoy = new Date()
  const fechaStr = `${String(hoy.getDate()).padStart(2, '0')}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${hoy.getFullYear()}`
  const pdfTitle = `${apellido}${primerNombre ? ' ' + primerNombre : ''} - ${fechaStr} - CV Optimiza LK`

  const contactItems = [
    cv.email    && `<div class="cl-item">✉ ${e(cv.email)}</div>`,
    cv.telefono && `<div class="cl-item">✆ ${e(cv.telefono)}</div>`,
    cv.linkedin && `<div class="cl-item">in ${e(cv.linkedin)}</div>`,
    cv.ubicacion&& `<div class="cl-item">⌖ ${e(cv.ubicacion)}</div>`,
  ].filter(Boolean).join('')

  const skillsHtml = (cv.habilidades || []).map(s => `<div class="cl-skill">${e(s)}</div>`).join('')

  const eduHtml = (cv.educacion || []).map(ed => `
    <div class="cl-edu">
      <div class="cl-edu-title">${e(ed.titulo)}</div>
      <div class="cl-edu-inst">${e(ed.institucion)}</div>
      ${ed.periodo ? `<div class="cl-edu-period">${e(ed.periodo)}</div>` : ''}
    </div>`).join('')

  const idiomasHtml = (cv.idiomas || []).map(i => `<div class="cl-idioma">${e(i)}</div>`).join('')

  const expHtml = (cv.experiencias || []).map(ex => `
    <div class="exp-item">
      <div class="exp-header">
        <span class="exp-role">${e(ex.cargo)}</span>
        <span class="exp-period">${e(ex.periodo || '')}</span>
      </div>
      <div class="exp-company">${e(ex.empresa)}</div>
      <ul class="exp-bullets">${(ex.logros || []).map(l => `<li>${e(l)}</li>`).join('')}</ul>
    </div>`).join('')

  const prevJobsHtml = (cv.experiencias_anteriores || []).length > 0
    ? `<div class="prev-wrap">${(cv.experiencias_anteriores || []).map(p =>
        `<div class="prev-item"><span class="prev-role">${e(p.cargo)}</span> · <span class="prev-co">${e(p.empresa)}</span></div>`
      ).join('')}</div>`
    : ''

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=210mm, initial-scale=1">
<title>${e(pdfTitle)}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 9.5pt; color: #1e293b; line-height: 1.48; width: 210mm; min-height: 297mm; background: white; }
  .cv-wrap { display: flex; flex-direction: column; width: 210mm; min-height: 297mm; }
  .cv-header { background: #1e293b; color: white; padding: 20px 26px; display: flex; align-items: center; gap: 16px; }
  .header-text { flex: 1; }
  .cv-name { font-size: 20pt; font-weight: 800; color: white; letter-spacing: -0.3px; line-height: 1.1; }
  .cv-title { font-size: 9pt; color: rgba(255,255,255,0.60); margin-top: 4px; line-height: 1.4; }
  .cv-photo-exec { width: 64px; height: 64px; border-radius: 50%; object-fit: cover; border: 2px solid rgba(255,255,255,0.25); flex-shrink: 0; }
  .cv-body { display: flex; flex: 1; }
  .col-left { width: 58mm; background: #f8fafc; border-right: 1px solid #e2e8f0; padding: 16px 14px; flex-shrink: 0; }
  .col-right { flex: 1; padding: 16px 20px; background: white; min-width: 0; }
  .cl-section { margin-bottom: 14px; }
  .cl-section-title { font-size: 6pt; font-weight: 700; letter-spacing: 1.3px; text-transform: uppercase; color: #b45309; padding-bottom: 4px; margin-bottom: 7px; border-bottom: 1px solid #fde68a; }
  .cl-item { font-size: 7.5pt; color: #475569; margin-bottom: 4px; word-break: break-all; line-height: 1.35; }
  .cl-skill { font-size: 8pt; color: #334155; padding: 2.5px 0; border-bottom: 0.5px solid #e2e8f0; line-height: 1.35; }
  .cl-skill:last-child { border-bottom: none; }
  .cl-edu { margin-bottom: 8px; }
  .cl-edu-title { font-size: 8pt; font-weight: 600; color: #1e293b; line-height: 1.3; }
  .cl-edu-inst { font-size: 7.5pt; color: #64748b; font-style: italic; margin-top: 1px; }
  .cl-edu-period { font-size: 7pt; color: #94a3b8; margin-top: 1.5px; }
  .cl-idioma { font-size: 8pt; color: #475569; margin-bottom: 3px; }
  .cr-section { margin-bottom: 14px; }
  .cr-section-title { font-size: 6.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.9px; color: #1e293b; padding-bottom: 4px; margin-bottom: 10px; border-bottom: 1.5px solid #cbd5e1; }
  .resumen-text { font-size: 9pt; color: #374151; line-height: 1.62; }
  .exp-item { margin-bottom: 12px; }
  .exp-item:last-child { margin-bottom: 0; }
  .exp-header { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
  .exp-role { font-size: 10pt; font-weight: 700; color: #0f172a; flex: 1; line-height: 1.25; }
  .exp-period { font-size: 7.5pt; color: #94a3b8; white-space: nowrap; flex-shrink: 0; }
  .exp-company { font-size: 8.5pt; color: #b45309; font-weight: 600; margin: 2px 0 4px; }
  .exp-bullets { margin: 0 0 0 13px; padding: 0; }
  .exp-bullets li { font-size: 8.5pt; color: #374151; margin-bottom: 2.5px; line-height: 1.48; }
  .prev-wrap { margin-top: 9px; padding-top: 7px; border-top: 0.5px solid #e2e8f0; }
  .prev-item { font-size: 8pt; color: #64748b; margin-bottom: 3px; }
  .prev-role { font-weight: 600; color: #475569; }
  .prev-co { font-style: italic; }
  @media print {
    @page { size: A4 portrait; margin: 0; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    html, body { margin: 0 !important; padding: 0 !important; width: 210mm !important; }
    .cv-wrap { zoom: 1 !important; transform: none !important; break-inside: avoid; }
  }
</style>
</head>
<body>
<div class="cv-wrap" id="cv-wrap">
  <div class="cv-header">
    ${photoBase64 ? `<img class="cv-photo-exec" src="data:${photoMime};base64,${photoBase64}" alt="Foto de perfil" />` : ''}
    <div class="header-text">
      <div class="cv-name">${e(cv.nombre)}</div>
      <div class="cv-title">${e(cv.titular)}</div>
    </div>
  </div>
  <div class="cv-body">
    <div class="col-left">
      ${contactItems ? `<div class="cl-section"><div class="cl-section-title">Contacto</div>${contactItems}</div>` : ''}
      ${skillsHtml ? `<div class="cl-section"><div class="cl-section-title">Habilidades</div>${skillsHtml}</div>` : ''}
      ${eduHtml ? `<div class="cl-section"><div class="cl-section-title">Educación</div>${eduHtml}</div>` : ''}
      ${idiomasHtml ? `<div class="cl-section"><div class="cl-section-title">Idiomas</div>${idiomasHtml}</div>` : ''}
    </div>
    <div class="col-right">
      ${cv.resumen ? `<div class="cr-section"><div class="cr-section-title">Resumen Profesional</div><p class="resumen-text">${e(cv.resumen)}</p></div>` : ''}
      ${expHtml ? `<div class="cr-section"><div class="cr-section-title">Experiencia</div>${expHtml}${prevJobsHtml}</div>` : ''}
    </div>
  </div>
</div>
${CV_AUTOFIT_SCRIPT}
</body></html>`
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
        alt="Optimiza LK"
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

function TagInput({ placeholder, onAdd }) {
  const [val, setVal] = React.useState('')
  return (
    <input
      className="w-full px-3 py-1.5 rounded-lg text-xs border focus:outline-none focus:ring-1"
      style={{ borderColor: 'rgba(0,0,0,0.12)', focusRingColor: '#fbbf24' }}
      placeholder={placeholder}
      value={val}
      onChange={e => setVal(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter' && val.trim()) {
          e.preventDefault()
          onAdd(val.trim())
          setVal('')
        }
      }}
    />
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
  const [inputMode, setInputMode] = useState('linkedin') // 'linkedin' | 'pdf' | 'form' | 'sinperfil'
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

  // CV iterativo — pipeline de calidad y gaps
  const [cvDraft, setCvDraft] = useState(null)
  const [cvQuality, setCvQuality] = useState(null)
  const [cvGapAnswers, setCvGapAnswers] = useState({})
  const [cvStage, setCvStage] = useState('idle') // 'idle'|'pre_loading'|'pre_questions'|'drafting'|'scoring'|'gap_form'|'regenerating'|'done'
  const [cvTemplate, setCvTemplate] = useState('clasico')
  const [cvEditing, setCvEditing] = useState(false)
  const [linkedinGrowth, setLinkedinGrowth] = useState(null)
  const [growthLoading, setGrowthLoading] = useState(false)
  const [growthError, setGrowthError] = useState('')
  const [seguidores, setSeguidores] = useState('')
  const [showGrowthSection, setShowGrowthSection] = useState(false)
  const [cvFinalData, setCvFinalData] = useState(null)
  const [cvContacto, setCvContacto] = useState(null)
  const [cvPreQuestions, setCvPreQuestions] = useState([])  // Questions generated pre-CV from profile analysis
  const [cvPreAnswers, setCvPreAnswers] = useState({})      // User's answers to pre-generation questions

  // LinkedIn OAuth
  const [linkedinOAuth, setLinkedinOAuth] = useState(null)
  const [linkedinAuthLoading, setLinkedinAuthLoading] = useState(false)
  const [linkedinAuthError, setLinkedinAuthError] = useState('')
  // LinkedIn AutoFill Plugin
  const [liAutofillDone, setLiAutofillDone] = useState(false)
  const [liAutofillLoading, setLiAutofillLoading] = useState(false)
  const [liAutofillError, setLiAutofillError] = useState(false)

  // Sin perfil mode
  const [sinPerfilMode, setSinPerfilMode] = useState(false)

  // Rate limiting + waitlist
  const [rateLimitSecs, setRateLimitSecs] = useState(0)
  const [rateLimitEvento, setRateLimitEvento] = useState('')
  const [waitlistEmail, setWaitlistEmail] = useState('')
  const [waitlistSent, setWaitlistSent] = useState(false)
  const [waitlistLoading, setWaitlistLoading] = useState(false)

  // ── Auth & Premium state ──
  const [user, setUser] = useState(null)
  const [authToken, setAuthToken] = useState(null)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')
  const [authSuccess, setAuthSuccess] = useState(null) // null | 'login'
  const [showHistorial, setShowHistorial] = useState(false)
  const [historial, setHistorial] = useState([])
  const [showPremiumModal, setShowPremiumModal] = useState(false)
  const [premiumEmail, setPremiumEmail] = useState('')
  const [showPostPayment, setShowPostPayment] = useState(false)
  const [postPaymentEmail, setPostPaymentEmail] = useState('')
  const [postPaymentPassword, setPostPaymentPassword] = useState('')
  const [postPaymentLoading, setPostPaymentLoading] = useState(false)
  const [postPaymentError, setPostPaymentError] = useState('')
  const [historialLoading, setHistorialLoading] = useState(false)
  const [deletingHistorialId, setDeletingHistorialId] = useState(null)
  const [deleteHistorialLoading, setDeleteHistorialLoading] = useState(false)
  const [subscriptionLoading, setSubscriptionLoading] = useState(false)
  const [checkingPremium, setCheckingPremium] = useState(false)
  const [showManageModal, setShowManageModal] = useState(false)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [cancelConfirm, setCancelConfirm] = useState(false)
  const [cancelDone, setCancelDone] = useState(false)
  const [showCouponField, setShowCouponField] = useState(false)
  const [couponCode, setCouponCode] = useState('')
  const [couponEmail, setCouponEmail] = useState('')
  const [couponLoading, setCouponLoading] = useState(false)
  const [couponError, setCouponError] = useState('')
  const [couponSuccess, setCouponSuccess] = useState(false)

  // ── Tracking / Kanban state ──
  const [trackingColumnas, setTrackingColumnas] = useState([])
  const [trackingCards, setTrackingCards] = useState([])
  const [trackingLoading, setTrackingLoading] = useState(false)
  const [showAddCard, setShowAddCard] = useState(null)      // columna_id | null
  const [newCardForm, setNewCardForm] = useState({ empresa: '', puesto: '', link_aviso: '', fecha_aplicacion: new Date().toISOString().slice(0, 10), notas: '' })
  const [editCard, setEditCard] = useState(null)            // card object | null
  const [showAddColumna, setShowAddColumna] = useState(false)
  const [newColumnaName, setNewColumnaName] = useState('')
  const [newColumnaColor, setNewColumnaColor] = useState('#64748b')
  const [renameColumna, setRenameColumna] = useState(null)  // { id, nombre } | null
  const [trackingError, setTrackingError] = useState('')

  // Job adapter + cover letter
  const [showJobModal, setShowJobModal] = useState(false)
  const [jobPosting, setJobPosting] = useState('')
  const [jobResult, setJobResult] = useState(null)
  const [jobLoading, setJobLoading] = useState(false)
  const [jobError, setJobError] = useState('')
  const [jobCvForAdapter, setJobCvForAdapter] = useState(null)
  const [jobAdapterNoCv, setJobAdapterNoCv] = useState(false)
  const [jobAdapterCheckLoading, setJobAdapterCheckLoading] = useState(false)

  // ── Auth helpers ─────────────────────────────────────────────────────────
  const sbAuthFetch = async (path, options = {}) => {
    const res = await fetch(`${SUPABASE_URL}/auth/v1${path}`, {
      ...options,
      headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json', ...options.headers },
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error_description || data.msg || data.message || 'Error de autenticación')
    return data
  }

  const loadPerfil = async (userId, token) => {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/perfiles?id=eq.${userId}&select=*`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` },
      })
      const rows = await res.json()
      return rows?.[0] || null
    } catch { return null }
  }

  const upsertPerfil = async (userId, data, token) => {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/perfiles`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates',
        },
        body: JSON.stringify({ id: userId, ...data }),
      })
    } catch { /* silencioso */ }
  }

  const sbUserFetch = (path, options = {}) => {
    const at = localStorage.getItem('ol_at')
    return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...options,
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${at}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
        ...options.headers,
      },
    })
  }

  const DEFAULT_COLUMNAS = [
    { nombre: 'Aplicado',    color: '#64748b', orden: 0 },
    { nombre: 'Entrevista',  color: '#0077B5', orden: 1 },
    { nombre: 'Oferta',      color: '#16a34a', orden: 2 },
    { nombre: 'Rechazado',   color: '#dc2626', orden: 3 },
  ]

  const loadTracking = async () => {
    const uid = localStorage.getItem('ol_uid')
    if (!uid) return
    setTrackingLoading(true)
    setTrackingError('')
    try {
      const [colRes, cardRes] = await Promise.all([
        sbUserFetch(`kanban_columnas?user_id=eq.${uid}&order=orden.asc`),
        sbUserFetch(`postulaciones?user_id=eq.${uid}&order=orden.asc,created_at.desc`),
      ])
      const cols  = await colRes.json().catch(() => [])
      const cards = await cardRes.json().catch(() => [])
      if (!Array.isArray(cols) || cols.error) throw new Error(cols.message || 'Error cargando columnas')
      if (cols.length === 0) {
        // Seed default columns
        const uid2 = localStorage.getItem('ol_uid')
        const seeds = DEFAULT_COLUMNAS.map(c => ({ ...c, user_id: uid2 }))
        const seedRes = await sbUserFetch('kanban_columnas', {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify(seeds),
        })
        const seeded = await seedRes.json().catch(() => [])
        setTrackingColumnas(Array.isArray(seeded) ? seeded.sort((a, b) => a.orden - b.orden) : [])
      } else {
        setTrackingColumnas(cols)
      }
      setTrackingCards(Array.isArray(cards) ? cards : [])
    } catch (e) {
      setTrackingError(e.message || 'Error cargando postulaciones')
    } finally {
      setTrackingLoading(false)
    }
  }

  const createCard = async (columnaId, form) => {
    const uid = localStorage.getItem('ol_uid')
    const res = await sbUserFetch('postulaciones', {
      method: 'POST',
      body: JSON.stringify({ ...form, user_id: uid, columna_id: columnaId }),
    })
    const data = await res.json().catch(() => [])
    if (!res.ok) throw new Error(data.message || 'Error al crear')
    const card = Array.isArray(data) ? data[0] : data
    setTrackingCards(prev => [card, ...prev])
    return card
  }

  const updateCard = async (id, patch) => {
    const res = await sbUserFetch(`postulaciones?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
    })
    const data = await res.json().catch(() => [])
    if (!res.ok) throw new Error(data.message || 'Error al actualizar')
    const updated = Array.isArray(data) ? data[0] : data
    setTrackingCards(prev => prev.map(c => c.id === id ? { ...c, ...updated } : c))
    return updated
  }

  const deleteCard = async (id) => {
    await sbUserFetch(`postulaciones?id=eq.${id}`, { method: 'DELETE', headers: { Prefer: '' } })
    setTrackingCards(prev => prev.filter(c => c.id !== id))
  }

  const createColumna = async (nombre, color) => {
    const uid = localStorage.getItem('ol_uid')
    const maxOrden = trackingColumnas.reduce((m, c) => Math.max(m, c.orden), -1)
    const res = await sbUserFetch('kanban_columnas', {
      method: 'POST',
      body: JSON.stringify({ user_id: uid, nombre, color, orden: maxOrden + 1 }),
    })
    const data = await res.json().catch(() => [])
    if (!res.ok) throw new Error(data.message || 'Error al crear columna')
    const col = Array.isArray(data) ? data[0] : data
    setTrackingColumnas(prev => [...prev, col])
    return col
  }

  const updateColumna = async (id, patch) => {
    const res = await sbUserFetch(`kanban_columnas?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
    const data = await res.json().catch(() => [])
    if (!res.ok) throw new Error(data.message || 'Error al actualizar columna')
    const updated = Array.isArray(data) ? data[0] : data
    setTrackingColumnas(prev => prev.map(c => c.id === id ? { ...c, ...updated } : c))
  }

  const deleteColumna = async (id) => {
    await sbUserFetch(`kanban_columnas?id=eq.${id}`, { method: 'DELETE', headers: { Prefer: '' } })
    setTrackingColumnas(prev => prev.filter(c => c.id !== id))
    setTrackingCards(prev => prev.map(c => c.columna_id === id ? { ...c, columna_id: null } : c))
  }

  const moveCard = async (cardId, newColumnaId) => {
    setTrackingCards(prev => prev.map(c => c.id === cardId ? { ...c, columna_id: newColumnaId } : c))
    await updateCard(cardId, { columna_id: newColumnaId }).catch(() => {})
  }

  const applySession = (accessToken, refreshToken, userData) => {
    localStorage.setItem('ol_at', accessToken)
    localStorage.setItem('ol_rt', refreshToken)
    localStorage.setItem('ol_uid', userData.id)
    localStorage.setItem('ol_premium', userData.es_premium ? '1' : '0')
    setAuthToken(accessToken)
    setUser(userData)
  }

  const clearSession = () => {
    localStorage.removeItem('ol_at')
    localStorage.removeItem('ol_rt')
    localStorage.removeItem('ol_uid')
    localStorage.removeItem('ol_premium')
    setAuthToken(null)
    setUser(null)
    setHistorial([])
  }

  const authLogin = async (email, password) => {
    setAuthLoading(true)
    setAuthError('')
    try {
      const data = await sbAuthFetch('/token?grant_type=password', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      const perfil = await loadPerfil(data.user.id, data.access_token)
      const userData = {
        id: data.user.id,
        email: data.user.email,
        nombre: perfil?.nombre || data.user.email.split('@')[0],
        es_premium: perfil?.es_premium || false,
        premium_hasta: perfil?.premium_hasta || null,
      }
      applySession(data.access_token, data.refresh_token, userData)
      setAuthEmail('')
      setAuthPassword('')
      setAuthSuccess('login')
      trackEvent('auth_login')
    } catch (err) {
      setAuthError(err.message || 'Email o contraseña incorrectos')
    } finally {
      setAuthLoading(false)
    }
  }

  const authRegister = async (email, password) => {
    setAuthLoading(true)
    setAuthError('')
    try {
      const data = await sbAuthFetch('/signup', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      if (data.access_token) {
        await upsertPerfil(data.user.id, { email: data.user.email, nombre: email.split('@')[0] }, data.access_token)
        const userData = { id: data.user.id, email: data.user.email, nombre: email.split('@')[0], es_premium: false, premium_hasta: null }
        applySession(data.access_token, data.refresh_token, userData)
        setAuthEmail('')
        setAuthPassword('')
        setAuthSuccess('register')
        trackEvent('auth_register')
      } else {
        setAuthError('Te enviamos un email de confirmación. Revisá tu bandeja.')
      }
    } catch (err) {
      setAuthError(err.message || 'Error al registrarse')
    } finally {
      setAuthLoading(false)
    }
  }

  const authLogout = async () => {
    try {
      const at = localStorage.getItem('ol_at')
      if (at) await fetch(`${SUPABASE_URL}/auth/v1/logout`, { method: 'POST', headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${at}` } })
    } catch { /* silencioso */ }
    clearSession()
    trackEvent('auth_logout')
  }

  const saveToHistorial = async (tipo, datos, titulo = '') => {
    const token = localStorage.getItem('ol_at')
    const uid = localStorage.getItem('ol_uid')
    const isPremium = localStorage.getItem('ol_premium') === '1'
    if (!token || !uid || !isPremium) return
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/historial`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json', Prefer: 'return=minimal',
        },
        body: JSON.stringify({ user_id: uid, tipo, titulo, datos }),
      })
    } catch { /* silencioso */ }
  }

  const loadHistorial = async () => {
    const token = localStorage.getItem('ol_at')
    const uid = localStorage.getItem('ol_uid')
    if (!token || !uid) return []
    setHistorialLoading(true)
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/historial?user_id=eq.${uid}&order=created_at.desc&limit=30`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` },
      })
      const rows = await res.json()
      const items = Array.isArray(rows) ? rows : []
      setHistorial(items)
      setHistorialLoading(false)
      return items
    } catch { /* silencioso */ }
    setHistorialLoading(false)
    return []
  }

  const deleteHistorialItem = async (id) => {
    const token = localStorage.getItem('ol_at')
    const uid = localStorage.getItem('ol_uid')
    if (!token || !uid) return
    setDeleteHistorialLoading(true)
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/historial?id=eq.${id}&user_id=eq.${uid}`, {
        method: 'DELETE',
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` },
      })
      setHistorial(prev => prev.filter(i => i.id !== id))
    } catch { /* silencioso */ }
    setDeleteHistorialLoading(false)
    setDeletingHistorialId(null)
  }

  const startSubscription = async (emailOverride) => {
    const emailToUse = emailOverride || user?.email || premiumEmail
    if (!emailToUse) return
    // Si tiene sesión usamos su user_id; si no, lo asignará el webhook cuando cree la cuenta
    const userId = user?.id || 'pending'
    setSubscriptionLoading(true)
    setShowPremiumModal(false)
    if (!user) localStorage.setItem('ol_pending_email', emailToUse)
    try {
      const res = await fetch(WORKER_URL, {
        method: 'POST',
        headers: WORKER_HEADERS,
        body: JSON.stringify({ action: 'create_subscription', user_id: userId, user_email: emailToUse }),
      })
      const data = await res.json()
      if (data.init_point) {
        trackEvent('premium_checkout_opened')
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
        if (isMobile) {
          // Intentar abrir la app nativa de MP; si falla o no está instalada, redirigir a la web
          const mpDeepLink = data.init_point.replace('https://www.mercadopago.com.ar', 'mercadopago://')
          const fallbackTimer = setTimeout(() => { window.location.href = data.init_point }, 1500)
          window.location.href = mpDeepLink
          // Si la app abrió, el timer se cancela porque la página pierde foco
          window.addEventListener('blur', () => clearTimeout(fallbackTimer), { once: true })
        } else {
          window.location.href = data.init_point
        }
      } else {
        alert(`Error al iniciar el pago: ${data.error || 'respuesta inesperada de Mercado Pago'}`)
      }
    } catch (err) {
      alert(`Error de conexión: ${err.message || 'no se pudo contactar al servidor'}`)
    }
    setSubscriptionLoading(false)
  }

  const restoreFromHistorial = (item) => {
    setShowHistorial(false)
    switch (item.tipo) {
      case 'analisis':
        setResult(item.datos)
        setCvStage('idle')
        setCvFinalData(null)
        setCvPreviewHtml('')
        setStep(STEPS.RESULTS)
        break
      case 'cv': {
        // Also restore the most recent analysis so the full RESULTS page loads
        const latestAnalisis = historial.find(i => i.tipo === 'analisis')
        if (latestAnalisis) setResult(latestAnalisis.datos)
        else setResult(null)
        setCvFinalData(item.datos)
        setCvDraft(item.datos)
        setCvPreviewHtml(buildCvHtml(item.datos, null, 'image/jpeg', 'clasico'))
        setCvStage('done')
        setStep(STEPS.RESULTS)
        break
      }
      case 'entrevista':
        setInterviewFeedback(item.datos?.feedback || item.datos)
        setInterviewAnswers(item.datos?.respuestas || [])
        setStep(STEPS.INTERVIEW_FEEDBACK)
        break
      default:
        break
    }
  }

  const handleModeSelectJobAdapter = async () => {
    setJobAdapterNoCv(false)
    // Current session CV takes priority
    if (cvFinalData) {
      setJobCvForAdapter(cvFinalData)
      setJobPosting('')
      setJobResult(null)
      setJobError('')
      setShowJobModal(true)
      return
    }
    // No session CV — check historial
    if (!user) { setShowAuthModal(true); return }
    setJobAdapterCheckLoading(true)
    const items = historial.length > 0 ? historial : await loadHistorial()
    setJobAdapterCheckLoading(false)
    const latestCv = items.find(item => item.tipo === 'cv')
    if (latestCv) {
      setJobCvForAdapter(latestCv.datos)
      setJobPosting('')
      setJobResult(null)
      setJobError('')
      setShowJobModal(true)
    } else {
      setJobAdapterNoCv(true)
    }
  }

  const callAdaptCvForJob = async () => {
    if (!jobPosting.trim() || !jobCvForAdapter || jobLoading) return
    setJobLoading(true)
    setJobError('')
    setJobResult(null)
    const cvText = JSON.stringify(jobCvForAdapter)
    const userPrompt = `CV del candidato (JSON):\n${cvText}\n\nAviso de empleo:\n${jobPosting.trim()}`
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 58000)
    try {
      const res = await fetch(WORKER_URL, {
        method: 'POST',
        headers: WORKER_HEADERS,
        signal: controller.signal,
        body: JSON.stringify({
          action: 'ai_job_adapter',
          contents: [{ parts: [{ text: userPrompt }] }],
          generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 3000 },
        }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error(parseGeminiError(res.status, e))
      }
      const data = await res.json()
      const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
      let parsed
      try { parsed = JSON.parse(raw) }
      catch { const m = raw.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); else throw new Error('No se pudo procesar la respuesta. Intentá de nuevo.') }
      setJobResult(parsed)
      trackEvent('job_adapter_generated')
    } catch (err) {
      setJobError(err.name === 'AbortError' ? 'El pedido tardó demasiado. Intentá de nuevo.' : err.message || 'Error al generar. Intentá de nuevo.')
    } finally {
      clearTimeout(timeoutId)
      setJobLoading(false)
    }
  }

  const applyCoupon = async () => {
    const emailToUse = user?.email || couponEmail.trim()
    if (!couponCode.trim() || !emailToUse) return
    setCouponLoading(true)
    setCouponError('')
    try {
      const res = await fetch(WORKER_URL, {
        method: 'POST',
        headers: WORKER_HEADERS,
        body: JSON.stringify({ action: 'grant_premium', admin_key: couponCode.trim(), email: emailToUse, months: 12 }),
      })
      const data = await res.json()
      if (data.ok) {
        setCouponSuccess(true)
        localStorage.setItem('ol_premium', '1')
        setUser(prev => {
          if (!prev) return prev
          sendEmail(EMAILJS_TEMPLATE_WELCOME, {
            to_email: prev.email || emailToUse,
            nombre: prev.nombre || prev.email || emailToUse,
            premium_hasta: '',
          })
          return { ...prev, es_premium: true }
        })
        trackEvent('premium_coupon_applied')
        setTimeout(() => {
          setShowPremiumModal(false)
          setCouponCode('')
          setCouponEmail('')
          setCouponSuccess(false)
          setShowCouponField(false)
        }, 2000)
      } else {
        setCouponError(data.error || 'Código incorrecto o email no encontrado')
      }
    } catch {
      setCouponError('Error de conexión. Intentá de nuevo.')
    }
    setCouponLoading(false)
  }

  const createAccountPostPayment = async () => {
    if (!postPaymentEmail || postPaymentPassword.length < 6) return
    setPostPaymentLoading(true)
    setPostPaymentError('')
    try {
      const data = await sbAuthFetch('/signup', {
        method: 'POST',
        body: JSON.stringify({ email: postPaymentEmail, password: postPaymentPassword }),
      })
      if (data.access_token) {
        localStorage.removeItem('ol_pending_email')
        await upsertPerfil(data.user.id, { email: postPaymentEmail, nombre: postPaymentEmail.split('@')[0] }, data.access_token)
        const userData = { id: data.user.id, email: postPaymentEmail, nombre: postPaymentEmail.split('@')[0], es_premium: false, premium_hasta: null }
        applySession(data.access_token, data.refresh_token, userData)
        setShowPostPayment(false)
        // Esperar un momento para que el webhook de MP procese el pago
        setTimeout(() => checkSubscriptionStatus(data.user.id, data.access_token, { withRetry: true }), 3000)
        trackEvent('auth_register_post_payment')
      } else {
        setPostPaymentError('No se pudo crear la cuenta. Si ya tenés una, ingresá desde "Ingresar".')
      }
    } catch (err) {
      setPostPaymentError(err.message || 'Error al crear la cuenta')
    }
    setPostPaymentLoading(false)
  }

  const checkSubscriptionStatus = async (userId, token, { withRetry = false } = {}) => {
    if (withRetry) setCheckingPremium(true)
    const maxAttempts = withRetry ? 8 : 1
    const delayMs = 5000
    try {
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (attempt > 0) await new Promise(r => setTimeout(r, delayMs))
        try {
          const res = await fetch(WORKER_URL, {
            method: 'POST',
            headers: WORKER_HEADERS,
            body: JSON.stringify({ action: 'subscription_status', user_id: userId }),
          })
          const data = await res.json()
          if (data.es_premium) {
            localStorage.setItem('ol_premium', '1')
            setUser(prev => {
              if (!prev) return prev
              if (!prev.es_premium) {
                sendEmail(EMAILJS_TEMPLATE_WELCOME, {
                  to_email: prev.email,
                  nombre: prev.nombre || prev.email,
                  premium_hasta: data.premium_hasta
                    ? new Date(data.premium_hasta).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
                    : '',
                })
              }
              return { ...prev, es_premium: true, premium_hasta: data.premium_hasta }
            })
            trackEvent('premium_activated')
            return
          }
        } catch { /* continuar */ }
      }
      // Todos los intentos fallaron o no es premium
      localStorage.setItem('ol_premium', '0')
      setUser(prev => prev ? { ...prev, es_premium: false, premium_hasta: null } : prev)
    } finally {
      setCheckingPremium(false)
    }
  }

  const cancelSubscription = async () => {
    if (!user?.id) return
    setCancelLoading(true)
    try {
      const res = await fetch(WORKER_URL, {
        method: 'POST',
        headers: WORKER_HEADERS,
        body: JSON.stringify({ action: 'cancel_subscription', user_id: user.id }),
      })
      const data = await res.json()
      if (data.ok) {
        // El acceso sigue vigente hasta premium_hasta — solo marcamos la cancelación
        // localStorage.setItem('ol_premium', '0') ← NO: el usuario conserva acceso hasta el vencimiento
        sendEmail(EMAILJS_TEMPLATE_CANCEL, {
          to_email: user.email,
          nombre: user.nombre || user.email,
          premium_hasta: data.premium_hasta
            ? new Date(data.premium_hasta).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
            : '',
        })
        setCancelDone(true)
      }
    } catch { /* silent */ } finally {
      setCancelLoading(false)
    }
  }

  // Restaurar sesión desde localStorage al cargar
  useEffect(() => {
    const at = localStorage.getItem('ol_at')
    const rt = localStorage.getItem('ol_rt')
    const uid = localStorage.getItem('ol_uid')
    if (!at || !rt || !uid) return
    fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: rt }),
    })
      .then(r => r.json())
      .then(async data => {
        if (!data.access_token) { clearSession(); return }
        const perfil = await loadPerfil(uid, data.access_token)
        const userData = {
          id: uid,
          email: data.user?.email || '',
          nombre: perfil?.nombre || (data.user?.email || '').split('@')[0],
          es_premium: perfil?.es_premium || false,
          premium_hasta: perfil?.premium_hasta || null,
        }
        applySession(data.access_token, data.refresh_token, userData)
      })
      .catch(() => clearSession())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Detectar #access_token=... hash del redirect de Supabase LinkedIn OAuth
  useEffect(() => {
    const hash = window.location.hash
    if (!hash.includes('access_token')) return
    const params = new URLSearchParams(hash.slice(1))
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    const type = params.get('type') // 'signup' | 'recovery' | etc
    if (!accessToken) return
    window.history.replaceState({}, '', window.location.pathname)
    fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${accessToken}` },
    })
      .then(r => r.json())
      .then(async userData => {
        const userId = userData.id
        const email = userData.email || ''
        const name = userData.user_metadata?.full_name || userData.user_metadata?.name || email.split('@')[0]
        let perfil = null
        try {
          await upsertPerfil(userId, { email, nombre: name }, accessToken)
          perfil = await loadPerfil(userId, accessToken)
        } catch { /* silencioso — no bloquea el login */ }
        const userObj = {
          id: userId,
          email,
          nombre: perfil?.nombre || name,
          es_premium: perfil?.es_premium || false,
          premium_hasta: perfil?.premium_hasta || null,
        }
        if (userObj.es_premium) {
          applySession(accessToken, refreshToken || '', userObj)
          setAuthSuccess('login')
        } else {
          // No es premium: aplicar sesión temporalmente y pedir que active
          applySession(accessToken, refreshToken || '', userObj)
          setAuthSuccess('linkedin_needs_premium')
        }
        setShowAuthModal(true)
        trackEvent('auth_linkedin_supabase', { type })
      })
      .catch(() => { /* silencioso */ })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Detectar ?premium=ok redirect de Mercado Pago
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('premium') !== 'ok') return
    window.history.replaceState({}, '', window.location.pathname)
    const uid = localStorage.getItem('ol_uid')
    const token = localStorage.getItem('ol_at')
    if (uid && token) {
      // Ya tiene sesión (ej: entró con LinkedIn antes de pagar)
      setTimeout(() => checkSubscriptionStatus(uid, token, { withRetry: true }), 2500)
    } else {
      // No tiene sesión: mostrar flujo de creación de contraseña
      const pending = localStorage.getItem('ol_pending_email') || ''
      setPostPaymentEmail(pending)
      setShowPostPayment(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // LinkedIn OAuth callback — lee ?code=&state= del URL al cargar
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const state = params.get('state')
    if (!code || !state) return
    const savedState = sessionStorage.getItem('li_oauth_state')
    if (state !== savedState) return
    sessionStorage.removeItem('li_oauth_state')
    // Limpiar URL sin recargar
    window.history.replaceState({}, '', window.location.pathname)
    const redirectUri = window.location.origin + window.location.pathname
    setLinkedinAuthLoading(true)
    setLinkedinAuthError('')
    fetch(WORKER_URL, {
      method: 'POST',
      headers: WORKER_HEADERS,
      body: JSON.stringify({ action: 'linkedin_auth', code, redirect_uri: redirectUri }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.error) { setLinkedinAuthError(data.error); setLinkedinAuthLoading(false); return }
        setLinkedinOAuth(data)
        if (data.headline) setFormTitular(data.headline)
        if (data.summary) setFormResumen(data.summary)
        setLinkedinAuthLoading(false)
        setInputMode('linkedin')
        setUrlAttempted(true)
        setStep(STEPS.PROFILE_INPUT)
      })
      .catch(() => { setLinkedinAuthError('Error de conexión. Intentá de nuevo.'); setLinkedinAuthLoading(false) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // LinkedIn AutoFill Plugin — escucha evento 'li-autofill' del DOM
  useEffect(() => {
    const handler = (e) => {
      const d = e.detail || {}
      if (d.firstName || d.lastName) {
        const name = [d.firstName, d.lastName].filter(Boolean).join(' ')
        if (name) setFormTitular(prev => prev || name)
      }
      if (d.headline) setFormTitular(d.headline)
      if (d.summary) setFormResumen(d.summary)
      if (d.title || d.company) {
        setFormExperiencias(prev => {
          const updated = [...prev]
          if (!updated[0]) updated[0] = { cargo: '', empresa: '', periodo: '', descripcion: '' }
          if (d.title) updated[0].cargo = d.title
          if (d.company) updated[0].empresa = d.company
          return updated
        })
      }
      setLiAutofillDone(true)
      setLiAutofillLoading(false)
      setLiAutofillError(false)
    }
    window.addEventListener('li-autofill', handler)
    return () => window.removeEventListener('li-autofill', handler)
  }, [])

  // Countdown de rate limit
  useEffect(() => {
    if (rateLimitSecs <= 0) return
    const t = setTimeout(() => setRateLimitSecs(s => s - 1), 1000)
    return () => clearTimeout(t)
  }, [rateLimitSecs])

  // Scroll al tope en cada cambio de paso (crítico en mobile)
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }) }, [step])

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

  const handleWaitlist = async (email) => {
    if (!email.includes('@')) return
    setWaitlistLoading(true)
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/waitlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
        body: JSON.stringify({ email, evento: rateLimitEvento }),
      })
      trackEvent('waitlist_signup', { evento: rateLimitEvento })
    } catch { /* silencioso */ }
    setWaitlistLoading(false)
    setWaitlistSent(true)
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
    setShowStarModal(false)
    setStarPhase('theory')
    setStarQuestionIdx(0)
    setStarAnswer('')
    setStarFeedback(null)
    setStarLoading(false)
    setStarError('')
    resetInterview()
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

  // ── LinkedIn OAuth via Supabase (para auth/cuenta) ──
  const handleLinkedinAuthViaSupabase = () => {
    const redirectTo = encodeURIComponent('https://optimizalinkedin.com/')
    window.location.href = `${SUPABASE_URL}/auth/v1/authorize?provider=linkedin_oidc&redirect_to=${redirectTo}`
  }

  // ── LinkedIn OAuth directo (para rellenar perfil) ──
  const handleLinkedinLogin = () => {
    const clientId = import.meta.env.VITE_LINKEDIN_CLIENT_ID
    if (!clientId) {
      setLinkedinAuthError('Configuración pendiente: VITE_LINKEDIN_CLIENT_ID no está definido.')
      return
    }
    const state = Math.random().toString(36).slice(2)
    sessionStorage.setItem('li_oauth_state', state)
    const redirectUri = encodeURIComponent(window.location.origin + window.location.pathname)
    const scope = encodeURIComponent('openid profile email')
    window.location.href = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&state=${state}`
  }

  // ── LinkedIn AutoFill: disparar el plugin ──
  const handleLinkedinAutofill = () => {
    setLiAutofillLoading(true)
    setLiAutofillError(false)
    if (typeof window.__triggerLiAutofill === 'function') {
      window.__triggerLiAutofill()
    } else {
      setLiAutofillLoading(false)
      setLiAutofillError(true)
    }
  }

  // ── LinkedIn OAuth confirm: construye profileText desde datos OAuth ──
  const handleLinkedinConfirm = () => {
    if (!linkedinOAuth) return
    const { name, email, positions } = linkedinOAuth
    const parts = []
    if (formTitular.trim()) parts.push(`TITULAR PROFESIONAL: ${formTitular.trim()}`)
    if (formResumen.trim()) parts.push(`RESUMEN / ACERCA DE:\n${formResumen.trim()}`)
    const expFromOAuth = positions?.map(p =>
      `• ${[p.title, p.companyName].filter(Boolean).join(' en ')}${p.startYear ? ` | ${p.startYear}–${p.endYear || 'presente'}` : ''}${p.description ? `\n  ${p.description}` : ''}`
    ).join('\n')
    const expFromForm = formExperiencias
      .filter(e => e.cargo.trim() || e.empresa.trim())
      .map(e => `• ${[e.cargo.trim(), e.empresa.trim()].filter(Boolean).join(' en ')}${e.periodo.trim() ? ` | ${e.periodo.trim()}` : ''}${e.descripcion.trim() ? `\n  ${e.descripcion.trim()}` : ''}`)
      .join('\n')
    if (expFromOAuth || expFromForm) parts.push(`EXPERIENCIA PROFESIONAL:\n${expFromOAuth || expFromForm}`)
    const eduLines = formEducacion
      .filter(e => e.institucion.trim() || e.titulo.trim())
      .map(e => `• ${[e.titulo.trim(), e.institucion.trim()].filter(Boolean).join(' — ')}${e.periodo.trim() ? ` | ${e.periodo.trim()}` : ''}`)
      .join('\n')
    if (eduLines) parts.push(`EDUCACIÓN:\n${eduLines}`)
    if (formHabilidades.trim()) parts.push(`HABILIDADES: ${formHabilidades.trim()}`)
    if (name) parts.push(`NOMBRE: ${name}`)
    if (email) parts.push(`EMAIL: ${email}`)
    setProfileText(parts.join('\n\n'))
    setFormConfirmed(true)
    trackEvent('cv_subido', { metodo: 'linkedin_oauth' })
  }

  // ── Switch input mode (pdf / form / linkedin) ──
  const handleInputModeSwitch = (mode) => {
    if (mode === inputMode) return
    setInputMode(mode)
    if (mode !== 'linkedin') setProfileText('')
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
        headers: WORKER_HEADERS,
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

  // Solo actualiza la foto sin borrar el profileText (para el modal de CV)
  const handleCvPhotoUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) return
    setProfilePhotoMime(file.type)
    setProfilePhotoPreview(URL.createObjectURL(file))
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = reader.result.split(',')[1]
      setProfilePhoto(base64)
      if (cvFinalData && cvStage === 'done') {
        setCvPreviewHtml(buildCvHtml(cvFinalData, base64, file.type, cvTemplate))
      }
    }
    reader.readAsDataURL(file)
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
        headers: WORKER_HEADERS,
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
        if (res.status === 429) { setRateLimitEvento('analisis'); setRateLimitSecs(60); setWaitlistSent(false); throw makeRateLimitError() }
        throw new Error(parseGeminiError(res.status, body))
      }
      const data = await res.json()
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
      if (text.length < 100) throw new Error('No se pudo extraer contenido del PDF. Verificá que sea el PDF de tu perfil de LinkedIn y que no esté protegido con contraseña.')
      setProfileText(text)
      trackEvent('cv_subido', { metodo: 'pdf' })
    } catch (err) {
      if (err.isRateLimit) { setPdfLoading(false); return }
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

  // ── LinkedIn Growth: banner ideas + networking plan ──
  const callLinkedinGrowth = async () => {
    if (growthLoading || !result) return
    setGrowthLoading(true)
    setGrowthError('')
    setLinkedinGrowth(null)
    const situacion = qaHistory.find(h => h.questionId === 'situacion')?.answer || qaHistory[1]?.answer || ''
    const userPrompt = [
      `Perfil analizado: ${result.nombre_titular || ''}`,
      `Titular actual: ${result.titular_actual || ''}`,
      `Titular propuesto: ${result.titular_propuesto || ''}`,
      `Objetivo profesional: ${situacion}`,
      `Puntaje actual del perfil: ${result.puntaje_general ?? 'N/D'}/10`,
      `Resumen diagnóstico: ${result.resumen_diagnostico || ''}`,
      seguidores.trim() ? `Seguidores actuales en LinkedIn: ${seguidores.trim()}` : null,
      `Palabras clave del perfil: ${(result.palabras_clave_sugeridas || []).join(', ')}`,
    ].filter(Boolean).join('\n')
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 40000)
    try {
      const res = await fetch(WORKER_URL, {
        method: 'POST',
        headers: WORKER_HEADERS,
        signal: controller.signal,
        body: JSON.stringify({
          action: 'ai_linkedin_growth',
          contents: [{ parts: [{ text: userPrompt }] }],
          generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 2000 },
        }),
      })
      clearTimeout(timeoutId)
      if (!res.ok) throw new Error('Error al generar. Intentá de nuevo.')
      const data = await res.json()
      const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
      let parsed
      try { parsed = JSON.parse(raw) }
      catch { const m = raw.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); else throw new Error('No se pudo procesar la respuesta.') }
      setLinkedinGrowth(parsed)
      trackEvent('linkedin_growth_generated')
    } catch (err) {
      clearTimeout(timeoutId)
      setGrowthError(err.name === 'AbortError' ? 'El pedido tardó demasiado. Intentá de nuevo.' : err.message || 'Error al generar.')
    }
    setGrowthLoading(false)
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

    const userPrompt = sinPerfilMode
      ? `El usuario aún NO tiene perfil de LinkedIn. Basándote EXCLUSIVAMENTE en sus respuestas del cuestionario, generá un diagnóstico base con:
- Titular propuesto desde cero (con keywords relevantes para su sector y objetivo)
- Resumen propuesto desde cero con propuesta de valor, logros probables y CTA
- Palabras clave para aparecer en búsquedas
- Recomendaciones concretas para construir su perfil

Para "puntaje_general" devolvé null. Para "nivel_seo" devolvé null.
Para "titular_actual" y "resumen_actual" devolvé "No proporcionado".
Contexto del usuario:
${contextText}`
      : `Perfil del usuario:
${contextText}

Perfil de LinkedIn:
${profileText.slice(0, 7000)}

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
        headers: WORKER_HEADERS,
        signal: controller.signal,
        body: JSON.stringify({
          action: 'ai_analyze_linkedin',
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
        if (res.status === 429) { setRateLimitEvento('analisis'); setRateLimitSecs(60); setWaitlistSent(false); throw makeRateLimitError() }
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
      if (localStorage.getItem('ol_premium') === '1') {
        setShowAnalisisConsent(true)
        trackEvent('analisis_consent_shown', { puntaje: parsed.puntaje_general })
      }
      setStep(STEPS.RESULTS)
      saveToHistorial('analisis', { ...parsed, fortalezas: parsed.fortalezas||[], areas_de_mejora: parsed.areas_de_mejora||[], palabras_clave_sugeridas: parsed.palabras_clave_sugeridas||[] }, parsed.nombre_titular || 'Análisis LinkedIn')
    } catch (err) {
      if (err.isRateLimit) { setStep(STEPS.PROFILE_INPUT) }
      else if (err.name === 'AbortError') {
        setAnalysisError('El análisis fue cancelado o tardó demasiado (90 s). Revisá tu conexión e intentá de nuevo.')
        setStep(STEPS.PROFILE_INPUT)
      } else {
        setAnalysisError(err.message || 'Error al conectar con Gemini.')
        setStep(STEPS.PROFILE_INPUT)
      }
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
      trackEvent('lead_saved', { colaborar })
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
        headers: WORKER_HEADERS,
        body: JSON.stringify({
          action: 'ai_interview_feedback',
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 1800 },
        }),
        signal: controller.signal,
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        if (res.status === 429) { setRateLimitEvento('entrevista'); setRateLimitSecs(60); setWaitlistSent(false); throw makeRateLimitError() }
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
      saveEntrevista(parsed, answers).catch(err => console.error('[entrevistas save]', err))
      saveToHistorial('entrevista', { feedback: parsed, respuestas: answers }, 'Simulación de entrevista')
    } catch (err) {
      if (!err.isRateLimit) {
        const msg = err.name === 'AbortError' ? 'El análisis tardó demasiado. Intentá de nuevo.' : err.message || 'Error al generar el feedback.'
        setInterviewError(msg)
      }
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
        headers: WORKER_HEADERS,
        signal: controller.signal,
        body: JSON.stringify({
          action: 'ai_star_feedback',
          contents: [{ parts: [{ text: userPrompt }] }],
          generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 700 },
        }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        if (res.status === 429) { setRateLimitEvento('star'); setRateLimitSecs(60); setWaitlistSent(false); throw makeRateLimitError() }
        throw new Error(parseGeminiError(res.status, e))
      }
      const data = await res.json()
      const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
      let parsed
      try { parsed = JSON.parse(raw) }
      catch { const m = raw.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); else throw new Error('La IA devolvió una respuesta inesperada. Intentá de nuevo.') }
      setStarFeedback(parsed)
      trackEvent('star_feedback_received', { puntaje: parsed.puntaje, question_idx: starQuestionIdx })
      saveStarPractica(pregunta, starAnswer, parsed).catch(err => console.error('[star_practicas save]', err))
    } catch (err) {
      if (!err.isRateLimit) setStarError(err.name === 'AbortError' ? 'El pedido tardó demasiado. Intentá de nuevo.' : err.message || 'No se pudo obtener el feedback.')
    } finally {
      clearTimeout(timeoutId)
      setStarLoading(false)
    }
  }

  // ── CV de 1 página ──────────────────────────────────────────

  const saveAnalisis = async () => {
    if (analisisSaving || analisisSaved) return
    if (localStorage.getItem('ol_premium') !== '1') return
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
    if (localStorage.getItem('ol_premium') !== '1') return
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

  const saveStarPractica = async (pregunta, respuesta, feedback) => {
    if (localStorage.getItem('ol_premium') !== '1') return
    if (!SUPABASE_URL || !SUPABASE_KEY) return
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/star_practicas`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          pregunta,
          respuesta,
          feedback_star: feedback,
          puntaje: feedback?.puntaje ?? null,
          qa_history: qaHistory,
        }),
      })
      trackEvent('star_saved', { puntaje: feedback?.puntaje })
    } catch (err) {
      console.error('[star_practicas save]', err)
    }
  }

  const saveEntrevista = async (feedback, answers) => {
    if (localStorage.getItem('ol_premium') !== '1') return
    if (!SUPABASE_URL || !SUPABASE_KEY) return
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/entrevistas`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          qa_history: qaHistory,
          respuestas_entrevista: answers,
          feedback_entrevista: feedback,
          puntaje_entrevista: feedback?.puntaje_entrevista ?? null,
        }),
      })
      trackEvent('entrevista_saved', { puntaje: feedback?.puntaje_entrevista })
    } catch (err) {
      console.error('[entrevistas save]', err)
    }
  }

  const updateCv = (newData) => {
    setCvFinalData(newData)
    setCvPreviewHtml(buildCvHtml(newData, profilePhoto, profilePhotoMime, cvTemplate))
  }

  const buildCvHtml = (cv, photoBase64 = null, photoMime = 'image/jpeg', template = 'clasico') => {
    const e = escapeHtml
    if (template === 'minimal')   return buildCvHtmlMinimal(cv, photoBase64, photoMime)
    if (template === 'ejecutivo') return buildCvHtmlEjecutivo(cv, photoBase64, photoMime)

    // Template-specific color scheme
    const sidebarBg    = template === 'tech' ? '#134e4a' : template === 'creativo' ? 'linear-gradient(160deg,#7c3aed,#4338ca)' : '#0d2137'
    const accentColor  = template === 'tech' ? '#34d399' : template === 'creativo' ? '#c4b5fd' : '#38bdf8'
    const mainAccent   = template === 'tech' ? '#0f766e' : template === 'creativo' ? '#7c3aed' : '#0077B5'
    const borderAccent = template === 'tech' ? '#99f6e4' : template === 'creativo' ? '#ddd6fe' : '#BFDBFE'
    const companyColor = template === 'tech' ? '#0f766e' : template === 'creativo' ? '#7c3aed' : '#0077B5'

    // ── PDF filename: "Apellido Nombre - DD-MM-YYYY - CV Optimiza LK" ──
    const nameParts = (cv.nombre || '').trim().split(/\s+/)
    const apellido = nameParts.length > 1 ? nameParts[nameParts.length - 1] : nameParts[0] || ''
    const primerNombre = nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : ''
    const hoy = new Date()
    const fechaStr = `${String(hoy.getDate()).padStart(2, '0')}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${hoy.getFullYear()}`
    const pdfTitle = `${apellido}${primerNombre ? ' ' + primerNombre : ''} - ${fechaStr} - CV Optimiza LK`

    // ── Sidebar: photo ──
    const photoHtml = photoBase64
      ? `<img class="cv-photo" src="data:${photoMime};base64,${photoBase64}" alt="Foto de perfil" />`
      : `<div class="cv-photo-placeholder"></div>`

    // ── Sidebar: contact ──
    const contactItems = [
      cv.email    && `<div class="sb-contact-item">✉ ${e(cv.email)}</div>`,
      cv.telefono && `<div class="sb-contact-item">✆ ${e(cv.telefono)}</div>`,
      cv.linkedin && `<div class="sb-contact-item">in ${e(cv.linkedin)}</div>`,
      cv.ubicacion&& `<div class="sb-contact-item">⌖ ${e(cv.ubicacion)}</div>`,
    ].filter(Boolean).join('')

    // ── Sidebar: skills ──
    const skillsHtml = (cv.habilidades || [])
      .map(s => `<div class="sb-skill">${e(s)}</div>`).join('')

    // ── Sidebar: education ──
    const eduHtml = (cv.educacion || []).map(ed => `
      <div class="sb-edu-item">
        <div class="sb-edu-title">${e(ed.titulo)}</div>
        <div class="sb-edu-inst">${e(ed.institucion)}</div>
        ${ed.periodo ? `<div class="sb-edu-period">${e(ed.periodo)}</div>` : ''}
      </div>`).join('')

    // ── Sidebar: languages ──
    const idiomasHtml = (cv.idiomas || [])
      .map(i => `<div class="sb-idioma">${e(i)}</div>`).join('')

    // ── Main: experience (3 recent with bullets) ──
    const expHtml = (cv.experiencias || []).map(ex => `
      <div class="exp-item">
        <div class="exp-header">
          <span class="exp-role">${e(ex.cargo)}</span>
          <span class="exp-period">${e(ex.periodo || '')}</span>
        </div>
        <div class="exp-company">${e(ex.empresa)}</div>
        <ul class="exp-bullets">${(ex.logros || []).map(l => `<li>${e(l)}</li>`).join('')}</ul>
      </div>`).join('')

    // ── Main: previous jobs (compact, no bullets) ──
    const prevJobsHtml = (cv.experiencias_anteriores || []).length > 0
      ? `<div class="exp-prev-wrap">
          ${(cv.experiencias_anteriores || []).map(p =>
            `<div class="exp-prev-item"><span class="exp-prev-role">${e(p.cargo)}</span><span class="exp-prev-sep"> · </span><span class="exp-prev-co">${e(p.empresa)}</span></div>`
          ).join('')}
        </div>`
      : ''

    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=210mm, initial-scale=1">
<title>${e(pdfTitle)}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Helvetica Neue', Arial, sans-serif;
    font-size: 9.5pt;
    color: #1a2332;
    line-height: 1.48;
    width: 210mm;
    min-height: 297mm;
    background: white;
  }

  /* ── Layout ── */
  .cv-wrap {
    display: flex;
    width: 210mm;
    min-height: 297mm;
  }

  /* ── SIDEBAR ── */
  .sidebar {
    width: 65mm;
    background: ${sidebarBg};
    color: white;
    padding: 26px 17px 24px;
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
  }

  .photo-wrap {
    display: flex;
    justify-content: center;
    margin-bottom: 15px;
  }

  .cv-photo {
    width: 76px; height: 76px;
    border-radius: 50%;
    object-fit: cover;
    border: 2.5px solid rgba(255,255,255,0.30);
  }

  .cv-photo-placeholder {
    width: 76px; height: 76px;
    border-radius: 50%;
    background: rgba(255,255,255,0.10);
    border: 2px solid rgba(255,255,255,0.18);
  }

  .sb-name {
    font-size: 14pt;
    font-weight: 700;
    color: #ffffff;
    line-height: 1.2;
    margin-bottom: 5px;
    word-break: break-word;
    hyphens: auto;
  }

  .sb-title {
    font-size: 8pt;
    color: rgba(255,255,255,0.65);
    line-height: 1.40;
    margin-bottom: 20px;
  }

  .sb-section { margin-bottom: 18px; }

  .sb-section-title {
    font-size: 6.5pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1.3px;
    color: ${accentColor};
    padding-bottom: 5px;
    margin-bottom: 8px;
    border-bottom: 0.5px solid rgba(255,255,255,0.12);
  }

  .sb-contact-item {
    font-size: 7.5pt;
    color: rgba(255,255,255,0.78);
    margin-bottom: 5px;
    word-break: break-all;
    line-height: 1.38;
  }

  .sb-skill {
    font-size: 8pt;
    color: rgba(255,255,255,0.82);
    padding: 3.5px 0;
    border-bottom: 0.5px solid rgba(255,255,255,0.07);
    line-height: 1.32;
  }
  .sb-skill:last-child { border-bottom: none; }

  .sb-edu-item { margin-bottom: 10px; }
  .sb-edu-title  { font-size: 8pt; font-weight: 600; color: white; line-height: 1.3; }
  .sb-edu-inst   { font-size: 7.5pt; color: rgba(255,255,255,0.60); font-style: italic; margin-top: 1.5px; }
  .sb-edu-period { font-size: 7pt; color: rgba(255,255,255,0.44); margin-top: 2px; }

  .sb-idioma {
    font-size: 8pt;
    color: rgba(255,255,255,0.80);
    margin-bottom: 4px;
    line-height: 1.32;
  }

  /* ── Tech: skill tags ── */
  ${template === 'tech' ? `.sb-skill { display: inline-block; background: rgba(52,211,153,0.15); border: 1px solid rgba(52,211,153,0.25); border-radius: 3px; padding: 2px 6px; font-size: 7pt; color: rgba(255,255,255,0.88); margin: 2px 1px; }
  .sb-skill:last-child { border-bottom: none; }` : ''}

  /* ── MAIN COLUMN ── */
  .main {
    flex: 1;
    padding: 30px 24px 26px 26px;
    background: white;
    min-width: 0;
  }

  .main-section { margin-bottom: 18px; }

  .main-section-title {
    font-size: 8pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.9px;
    color: ${mainAccent};
    padding-bottom: 4px;
    margin-bottom: 11px;
    border-bottom: 1.5px solid ${borderAccent};
  }

  .resumen-text {
    font-size: 9pt;
    color: #374151;
    line-height: 1.62;
  }

  .exp-item { margin-bottom: 13px; }
  .exp-item:last-child { margin-bottom: 0; }

  .exp-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
  }

  .exp-role {
    font-size: 10pt;
    font-weight: 700;
    color: #0f172a;
    flex: 1;
    min-width: 0;
    line-height: 1.25;
  }

  .exp-period {
    font-size: 8pt;
    color: #6B7280;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .exp-company {
    font-size: 8.5pt;
    color: ${companyColor};
    font-weight: 600;
    margin: 2.5px 0 5px;
  }

  .exp-bullets { margin: 0 0 0 13px; padding: 0; }
  .exp-bullets li {
    font-size: 8.5pt;
    color: #374151;
    margin-bottom: 3px;
    line-height: 1.50;
  }

  /* ── Experiencia anterior (compact) ── */
  .exp-prev-wrap {
    margin-top: 11px;
    padding-top: 9px;
    border-top: 0.5px solid #e2e8f0;
  }
  .exp-prev-item {
    font-size: 8pt;
    color: #64748b;
    margin-bottom: 3.5px;
    line-height: 1.35;
  }
  .exp-prev-role { font-weight: 600; color: #475569; }
  .exp-prev-sep  { color: #cbd5e1; margin: 0 2px; }
  .exp-prev-co   { font-style: italic; }

  @media print {
    @page { size: A4 portrait; margin: 0; }
    /* Forzar colores reales en todos los elementos (sidebar, fondos, etc.) */
    * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    /* SIN overflow:hidden ni height fijos — en iOS Safari clipa todo → página en blanco */
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      width: 210mm !important;
    }
    .cv-wrap {
      width: 210mm !important;
      min-height: unset !important;
      /* Resetear zoom inline puesto por el script de autofit */
      zoom: 1 !important;
      transform: none !important;
      break-inside: avoid;
      page-break-inside: avoid;
    }
  }
</style>
</head>
<body>
<div class="cv-wrap" id="cv-wrap">

  <!-- SIDEBAR -->
  <div class="sidebar">
    <div class="photo-wrap">${photoHtml}</div>
    <div class="sb-name">${e(cv.nombre)}</div>
    <div class="sb-title">${e(cv.titular)}</div>

    ${contactItems ? `
    <div class="sb-section">
      <div class="sb-section-title">Contacto</div>
      ${contactItems}
    </div>` : ''}

    ${skillsHtml ? `
    <div class="sb-section">
      <div class="sb-section-title">Habilidades</div>
      ${skillsHtml}
    </div>` : ''}

    ${eduHtml ? `
    <div class="sb-section">
      <div class="sb-section-title">Educación</div>
      ${eduHtml}
    </div>` : ''}

    ${idiomasHtml ? `
    <div class="sb-section">
      <div class="sb-section-title">Idiomas</div>
      ${idiomasHtml}
    </div>` : ''}
  </div>

  <!-- MAIN -->
  <div class="main">
    ${cv.resumen ? `
    <div class="main-section">
      <div class="main-section-title">Resumen Profesional</div>
      <p class="resumen-text">${e(cv.resumen)}</p>
    </div>` : ''}

    ${expHtml ? `
    <div class="main-section">
      <div class="main-section-title">Experiencia</div>
      ${expHtml}
      ${prevJobsHtml}
    </div>` : ''}
  </div>

</div>
${CV_AUTOFIT_SCRIPT}
</body></html>`
  }


  const buildCvPromptBase = (contacto, preAnswers = {}) => {
    const nombre = result?.nombre_completo || ''
    const titular = result?.titular_propuesto || result?.titular_actual || ''
    const resumen = result?.resumen_propuesto || ''
    const keywords = (result?.palabras_clave_sugeridas || []).join(', ')
    let p = `Generá el CV en JSON usando esta información del profesional.\n\n`
    p += `Nombre: ${nombre}\nTitular propuesto: ${titular}\nResumen propuesto: ${resumen}\nKeywords sugeridas: ${keywords}\n\n`
    if (contacto.email)       p += `Email de contacto: ${contacto.email}\n`
    if (contacto.telefono)    p += `Teléfono: ${contacto.telefono}\n`
    if (contacto.linkedinUrl) p += `URL LinkedIn: ${contacto.linkedinUrl}\n`
    p += `\nTexto completo del perfil LinkedIn (extraé experiencias, educación y sus fechas individuales):\n${profileText.slice(0, 8000)}\n\n`

    // Incluir respuestas pre-generación del candidato
    const enrichedLines = cvPreQuestions
      .filter(q => preAnswers[q.id]?.trim())
      .map(q => `- ${q.contexto ? `[${q.contexto}] ` : ''}${preAnswers[q.id].trim()}`)
      .join('\n')
    if (enrichedLines) {
      p += `INFORMACIÓN ADICIONAL REAL PROVISTA POR EL CANDIDATO — integrala en los bullets y resumen correspondientes, NUNCA inventes nada extra más allá de lo que el candidato escribió:\n${enrichedLines}\n\n`
    }

    p += `Usá el email, teléfono y URL de LinkedIn proporcionados arriba. No los inventes si no se dieron (poné null).
IMPORTANTE sobre fechas: el campo "periodo" de cada experiencia y educación DEBE tomarse del texto del perfil para ESA entrada específica. Si hay dos formaciones distintas (grado y posgrado), cada una tiene su propio "periodo". NUNCA copies el mismo periodo para entradas distintas.
Respondé con este JSON exacto:
{
  "nombre": "string",
  "titular": "string",
  "email": "string o null",
  "telefono": "string o null",
  "linkedin": "string o null",
  "ubicacion": "string o null",
  "resumen": "string (2 oraciones máx)",
  "experiencias": [{ "cargo": "string", "empresa": "string", "periodo": "string — período exacto de esa experiencia", "logros": ["string"] }],
  "educacion": [{ "titulo": "string", "institucion": "string", "periodo": "string — período exacto de ese título, diferente para cada uno" }],
  "habilidades": ["string"],
  "idiomas": ["string"],
  "experiencias_anteriores": [{ "cargo": "string", "empresa": "string" }]
}`
    return p
  }

  const callAnalyzeCvQuality = async (cv) => {
    try {
      const cvText = [
        `Nombre: ${cv.nombre}`,
        `Titular: ${cv.titular}`,
        `Resumen: ${cv.resumen || '(sin resumen)'}`,
        ...(cv.experiencias || []).map(ex =>
          `Cargo: ${ex.cargo} en ${ex.empresa} | Período: ${ex.periodo || 'SIN FECHA'}\nLogros: ${(ex.logros || []).join(' | ') || '(sin logros)'}`
        ),
        `Educación: ${(cv.educacion || []).map(ed => `${ed.titulo} — ${ed.institucion} (${ed.periodo || 'SIN FECHA'})`).join(' | ') || '(sin educación)'}`,
        `Habilidades: ${(cv.habilidades || []).join(', ') || '(ninguna)'}`,
        cv.idiomas?.length ? `Idiomas: ${cv.idiomas.join(', ')}` : null,
      ].filter(Boolean).join('\n\n')
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000)
      const res = await fetch(WORKER_URL, {
        method: 'POST',
        headers: WORKER_HEADERS,
        signal: controller.signal,
        body: JSON.stringify({
          action: 'ai_cv_quality',
          contents: [{ parts: [{ text: `Analizá este CV:\n\n${cvText}` }] }],
          generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 1000 },
        }),
      })
      clearTimeout(timeoutId)
      if (!res.ok) return null
      const data = await res.json()
      const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
      let quality
      try { quality = JSON.parse(raw) }
      catch { const m = raw.match(/\{[\s\S]*\}/); if (m) quality = JSON.parse(m[0]); else return null }
      return quality
    } catch {
      return null
    }
  }

  const callGenerateCvPreQuestions = async (contacto) => {
    if (cvLoading) return
    setCvContacto(contacto)
    setCvPreQuestions([])
    setCvPreAnswers({})
    setCvStage('pre_loading')
    try {
      if (!WORKER_URL) { callGenerateCV(contacto, {}); return }
      const profesion = qaHistory.find(h => h.questionId === 'profesion')?.answer || qaHistory[0]?.answer || ''
      const situacion = qaHistory.find(h => h.questionId === 'situacion')?.answer || qaHistory[1]?.answer || ''
      const prompt = `Profesión del candidato: ${profesion}\nSituación actual: ${situacion}\n\nTexto del perfil LinkedIn:\n${profileText.slice(0, 5000)}`
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 25000)
      const res = await fetch(WORKER_URL, {
        method: 'POST',
        headers: WORKER_HEADERS,
        signal: controller.signal,
        body: JSON.stringify({
          action: 'ai_cv_pre_questions',
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 800 },
        }),
      })
      clearTimeout(timeoutId)
      if (!res.ok) { callGenerateCV(contacto, {}); return }
      const data = await res.json()
      const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
      let parsed
      try { parsed = JSON.parse(raw) } catch { parsed = null }
      const preguntas = parsed?.preguntas?.filter(q => q.id && q.pregunta) || []
      if (preguntas.length === 0) {
        callGenerateCV(contacto, {})
      } else {
        setCvPreQuestions(preguntas)
        setCvStage('pre_questions')
        trackEvent('cv_pre_questions_shown', { count: preguntas.length })
      }
    } catch {
      callGenerateCV(contacto, {})
    }
  }

  const callGenerateCV = async (contacto = {}, preAnswers = {}) => {
    if (cvLoading) return
    setCvLoading(true)
    setCvError('')
    setCvSuccess('')
    setCvPreviewHtml('')
    setCvDraft(null)
    setCvQuality(null)
    setCvFinalData(null)
    setCvGapAnswers({})
    const resolvedContacto = contacto && Object.keys(contacto).length ? contacto : (cvContacto || {})
    setCvContacto(resolvedContacto)
    setCvStage('drafting')

    const userPrompt = buildCvPromptBase(resolvedContacto, preAnswers)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 58000)
    try {
      if (!WORKER_URL) throw new Error('Worker URL no configurada.')
      const res = await fetch(WORKER_URL, {
        method: 'POST',
        headers: WORKER_HEADERS,
        signal: controller.signal,
        body: JSON.stringify({
          action: 'ai_generate_cv',
          contents: [{ parts: [{ text: userPrompt }] }],
          generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 2000 },
        }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        if (res.status === 429) { setRateLimitEvento('cv'); setRateLimitSecs(60); setWaitlistSent(false); throw makeRateLimitError() }
        throw new Error(parseGeminiError(res.status, e))
      }
      const data = await res.json()
      const rawCv = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
      let cv
      try { cv = JSON.parse(rawCv) }
      catch { const m = rawCv.match(/\{[\s\S]*\}/); if (m) cv = JSON.parse(m[0]); else throw new Error('No se pudo interpretar el CV generado. Intentá de nuevo.') }
      setCvDraft(cv)
      saveCvGenerado({ contacto, cv }).catch(err => console.error('[cv_generados save]', err))
      trackEvent('cv_draft_generated')

      // Detectar fechas faltantes del lado del cliente antes del scoring IA
      const dateGaps = []
      ;(cv.experiencias || []).forEach((ex, i) => {
        if (!ex.periodo) dateGaps.push({
          id: `fecha_exp_${i}`,
          campo: `${ex.cargo} en ${ex.empresa}`,
          descripcion: 'Faltan las fechas de esta experiencia laboral.',
          pregunta: `¿En qué período trabajaste como ${ex.cargo} en ${ex.empresa}? (mes/año de inicio y fin)`,
          placeholder: 'ej: mar 2019 – dic 2022',
          impacto: 'Alto',
        })
      })
      ;(cv.educacion || []).forEach((ed, i) => {
        if (!ed.periodo) dateGaps.push({
          id: `fecha_edu_${i}`,
          campo: `${ed.titulo} — ${ed.institucion}`,
          descripcion: 'Faltan las fechas de este título educativo.',
          pregunta: `¿En qué período cursaste ${ed.titulo} en ${ed.institucion}?`,
          placeholder: 'ej: 2015 – 2019',
          impacto: 'Alto',
        })
      })

      setCvStage('scoring')
      const quality = await callAnalyzeCvQuality(cv)

      // Fusionar gaps de fecha del cliente con los de IA (evitar duplicados por id)
      let mergedQuality = quality
      if (dateGaps.length > 0) {
        const existingIds = new Set((quality?.gaps || []).map(g => g.id))
        const newDateGaps = dateGaps.filter(g => !existingIds.has(g.id))
        mergedQuality = quality
          ? { ...quality, gaps: [...newDateGaps, ...(quality.gaps || [])], aprobado: false }
          : { score: 5, nivel: 'Básico', aprobado: false, gaps: dateGaps }
      }
      setCvQuality(mergedQuality)
      if (quality) {
        trackEvent('cv_quality_scored', { score: mergedQuality.score, nivel: mergedQuality.nivel, gap_count: mergedQuality.gaps?.length || 0 })
      }

      const hasHighImpactGaps = mergedQuality?.gaps?.some(g => g.impacto === 'Alto')
      if (!mergedQuality || mergedQuality.aprobado || !hasHighImpactGaps) {
        setCvFinalData(cv)
        setCvStage('done')
        setCvPreviewHtml(buildCvHtml(cv, profilePhoto, profilePhotoMime, cvTemplate))
        saveToHistorial('cv', cv, cv.nombre || 'CV generado')
      } else {
        trackEvent('cv_gap_form_shown', { gap_count: mergedQuality.gaps?.length || 0 })
        setCvStage('gap_form')
      }
    } catch (err) {
      setCvStage('idle')
      if (!err.isRateLimit) setCvError(err.name === 'AbortError' ? 'El pedido tardó demasiado. Intentá de nuevo.' : err.message || 'No se pudo generar el CV.')
    } finally {
      clearTimeout(timeoutId)
      setCvLoading(false)
    }
  }

  const callRegenerateCV = async (gapAnswers) => {
    if (!cvDraft || !cvContacto || cvLoading) return
    setCvLoading(true)
    setCvError('')
    setCvStage('regenerating')
    trackEvent('cv_gap_form_submitted', { answered_count: Object.keys(gapAnswers).length })

    let userPrompt = buildCvPromptBase(cvContacto, cvPreAnswers)
    const gapLines = (cvQuality?.gaps || [])
      .filter(g => gapAnswers[g.id]?.trim())
      .map(g => `- ${g.campo}: ${gapAnswers[g.id].trim()}`)
      .join('\n')
    if (gapLines) {
      userPrompt += `\nCORRECCIONES Y DATOS ADICIONALES PROVISTOS POR EL CANDIDATO (integrala en los bullets correspondientes, NUNCA inventes nada extra):\n${gapLines}\n`
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 58000)
    try {
      if (!WORKER_URL) throw new Error('Worker URL no configurada.')
      const res = await fetch(WORKER_URL, {
        method: 'POST',
        headers: WORKER_HEADERS,
        signal: controller.signal,
        body: JSON.stringify({
          action: 'ai_generate_cv',
          contents: [{ parts: [{ text: userPrompt }] }],
          generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 2000 },
        }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        if (res.status === 429) { setRateLimitEvento('cv'); setRateLimitSecs(60); setWaitlistSent(false); throw makeRateLimitError() }
        throw new Error(parseGeminiError(res.status, e))
      }
      const data = await res.json()
      const rawCv = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
      let cv
      try { cv = JSON.parse(rawCv) }
      catch { const m = rawCv.match(/\{[\s\S]*\}/); if (m) cv = JSON.parse(m[0]); else throw new Error('No se pudo regenerar el CV. Intentá de nuevo.') }
      setCvFinalData(cv)
      setCvStage('done')
      setCvPreviewHtml(buildCvHtml(cv, profilePhoto, profilePhotoMime, cvTemplate))
      trackEvent('cv_regenerated', { answered_count: Object.keys(gapAnswers).length })
      saveCvGenerado({ contacto: cvContacto, cv }).catch(err => console.error('[cv_generados regen save]', err))
      saveToHistorial('cv', cv, cv.nombre || 'CV generado')
    } catch (err) {
      if (!err.isRateLimit) {
        setCvStage('gap_form')
        setCvError(err.name === 'AbortError' ? 'El pedido tardó demasiado. Intentá de nuevo.' : err.message || 'No se pudo regenerar el CV.')
      }
    } finally {
      clearTimeout(timeoutId)
      setCvLoading(false)
    }
  }

  const _cvFileName = () =>
    (cvFinalData?.nombre || cvDraft?.nombre || 'CV')
      .replace(/[^a-zA-ZÀ-ÿ0-9 ]/g, '').replace(/\s+/g, '-')

  // ── Desktop: abre ventana nueva → diálogo de impresión automático ──────────
  const saveCvDesktop = () => {
    if (!cvPreviewHtml) return
    trackEvent('cv_save_desktop')
    const win = window.open('', '_blank')
    if (win) {
      win.document.open()
      win.document.write(cvPreviewHtml)
      win.document.close()
      // Esperar render completo antes de imprimir
      win.addEventListener('load', () => setTimeout(() => { try { win.focus(); win.print() } catch {} }, 150))
      setTimeout(() => { try { win.focus(); win.print() } catch {} }, 700)
      return
    }
    // Popup bloqueado: descarga el archivo
    const blob = new Blob([cvPreviewHtml], { type: 'text/html; charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `CV-${_cvFileName()}.html`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    setCvSuccess('Abrí el archivo descargado en Chrome → Ctrl+P → Guardar como PDF')
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

      {/* ── Auth Modal ── */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) { setShowAuthModal(false); setAuthError(''); setAuthSuccess(null) } }}>
          <div className="w-full max-w-sm rounded-3xl p-6 space-y-4"
            style={{ background: 'white', boxShadow: '0 25px 60px rgba(0,0,0,0.2)' }}>

            {authSuccess ? (
              /* ── Pantalla de éxito ── */
              <div className="text-center space-y-5 py-2">
                <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto text-3xl"
                  style={{ background: 'rgba(0,119,181,0.08)' }}>✓</div>
                <div className="space-y-1">
                  <p className="font-bold text-slate-900 text-xl">
                    {authSuccess === 'linkedin_needs_premium'
                      ? `Hola, ${user?.nombre}!`
                      : authSuccess === 'register' ? '¡Cuenta creada!' : `¡Bienvenido/a, ${user?.nombre}!`}
                  </p>
                  <p className="text-slate-500 text-sm leading-relaxed">
                    {authSuccess === 'linkedin_needs_premium'
                      ? 'Conectaste con LinkedIn. La app es gratuita — si querés guardar tu historial, podés probar Premium 7 días gratis.'
                      : authSuccess === 'register'
                        ? 'Cuenta creada. La app funciona completa sin Premium. Si querés guardar tu historial, podés probarlo 7 días gratis.'
                        : 'Ya podés usar la app con tu historial guardado.'}
                  </p>
                </div>
                {authSuccess === 'linkedin_needs_premium' ? (
                  <div className="space-y-2 pt-1">
                    <button onClick={() => { setShowAuthModal(false); setAuthSuccess(null); setShowPremiumModal(true) }}
                      className="btn-glow w-full py-3 rounded-xl text-white font-semibold text-sm"
                      style={{ background: LI_GRADIENT }}>
                      Probar Premium 7 días gratis →
                    </button>
                    <button onClick={() => { authLogout(); setShowAuthModal(false); setAuthSuccess(null) }}
                      className="w-full py-2.5 text-sm font-medium rounded-xl"
                      style={{ color: '#64748b' }}>
                      Seguir usando gratis sin guardar
                    </button>
                  </div>
                ) : authSuccess === 'register' ? (
                  <div className="space-y-2 pt-1">
                    <button onClick={() => { setShowAuthModal(false); setAuthSuccess(null); setShowPremiumModal(true) }}
                      className="btn-glow w-full py-3 rounded-xl text-white font-semibold text-sm"
                      style={{ background: LI_GRADIENT }}>
                      Probar Premium 7 días gratis →
                    </button>
                    <button onClick={() => { setShowAuthModal(false); setAuthSuccess(null) }}
                      className="w-full py-2.5 text-sm font-medium rounded-xl"
                      style={{ color: '#64748b' }}>
                      Ahora no, seguir usando gratis
                    </button>
                  </div>
                ) : (
                  <button onClick={() => { setShowAuthModal(false); setAuthSuccess(null) }}
                    className="btn-glow w-full py-3 rounded-xl text-white font-semibold text-sm"
                    style={{ background: LI_GRADIENT }}>
                    Continuar →
                  </button>
                )}
              </div>
            ) : (
              /* ── Formulario login ── */
              <>
                <div className="flex items-center justify-between">
                  <h2 className="text-slate-900 font-bold text-lg">Ingresá a tu cuenta</h2>
                  <button onClick={() => { setShowAuthModal(false); setAuthError('') }}
                    className="text-slate-400 hover:text-slate-600 text-2xl leading-none w-8 h-8 flex items-center justify-center">×</button>
                </div>

                <button onClick={handleLinkedinAuthViaSupabase}
                  className="w-full py-3 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold transition-opacity hover:opacity-90"
                  style={{ background: '#0077B5', color: 'white' }}>
                  <LinkedInIcon className="w-4 h-4" style={{ fill: 'white' }} />
                  Continuar con LinkedIn
                </button>

                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px" style={{ background: '#e2e8f0' }} />
                  <span className="text-xs text-slate-400">o con email</span>
                  <div className="flex-1 h-px" style={{ background: '#e2e8f0' }} />
                </div>

                <div className="space-y-3">
                  <input type="email" placeholder="Email" value={authEmail}
                    onChange={e => setAuthEmail(e.target.value)} autoComplete="email"
                    className="w-full px-4 py-3 rounded-xl text-sm outline-none" style={INPUT_STYLE} />
                  <input type="password" placeholder="Contraseña" value={authPassword}
                    onChange={e => setAuthPassword(e.target.value)} autoComplete="current-password"
                    onKeyDown={e => e.key === 'Enter' && authEmail.includes('@') && authPassword.length >= 6 && authLogin(authEmail, authPassword)}
                    className="w-full px-4 py-3 rounded-xl text-sm outline-none" style={INPUT_STYLE} />
                </div>

                {authError && <p className="text-sm text-center font-medium" style={{ color: '#ef4444' }}>{authError}</p>}

                <button
                  onClick={() => authLogin(authEmail, authPassword)}
                  disabled={authLoading || !authEmail.includes('@') || authPassword.length < 6}
                  className="btn-glow w-full py-3 rounded-xl text-white font-semibold text-sm"
                  style={{ background: LI_GRADIENT, opacity: (authLoading || !authEmail.includes('@') || authPassword.length < 6) ? 0.5 : 1 }}>
                  {authLoading ? 'Procesando...' : 'Ingresar'}
                </button>

                <p className="text-xs text-center text-slate-400 leading-relaxed">
                  ¿Todavía no tenés cuenta? <button onClick={() => { setShowAuthModal(false); setShowPremiumModal(true) }} className="underline" style={{ color: '#0077B5' }}>Probá Premium gratis 7 días</button> para crear una y guardar tu historial.
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Premium Modal ── */}
      {showPremiumModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) { setShowPremiumModal(false); setShowCouponField(false); setCouponCode(''); setCouponError(''); setCouponSuccess(false) } }}>
          <div className="w-full max-w-sm rounded-3xl overflow-hidden"
            style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.2)' }}>
            <div className="p-6 text-white" style={{ background: LI_GRADIENT }}>
              <p className="text-xs font-semibold opacity-80 mb-1">OPTIMIZA LINKEDIN</p>
              <h2 className="text-2xl font-bold">Premium</h2>
              <div className="flex items-baseline gap-2 mt-2">
                <p className="text-4xl font-bold">$3.000<span className="text-lg font-normal opacity-80">/mes</span></p>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.22)', color: 'white' }}>7 DÍAS GRATIS</span>
              </div>
              <p className="text-sm opacity-75 mt-1">Cancelás antes del día 7 y no te cobramos nada</p>
            </div>
            <div className="p-6 space-y-5 bg-white">
              <ul className="space-y-3">
                {[
                  ['💾', 'Historial completo', 'Todos tus análisis, CVs y entrevistas guardados y accesibles cuando quieras'],
                  ['📊', 'Análisis guardados', 'Revisá tu progreso y compará resultados entre perfiles'],
                  ['📄', 'CVs anteriores', 'Accedé y re-descargá cualquier CV que generaste'],
                  ['🎙️', 'Entrevistas guardadas', 'Revisá tu feedback y seguí mejorando tus respuestas'],
                ].map(([icon, title, desc]) => (
                  <li key={title} className="flex gap-3">
                    <span className="text-xl shrink-0">{icon}</span>
                    <div>
                      <p className="text-slate-800 font-semibold text-sm">{title}</p>
                      <p className="text-slate-500 text-xs leading-snug">{desc}</p>
                    </div>
                  </li>
                ))}
              </ul>

              {!user && (
                <>
                  <button onClick={() => { setShowPremiumModal(false); handleLinkedinAuthViaSupabase() }}
                    className="w-full py-3 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold transition-opacity hover:opacity-90"
                    style={{ background: '#0077B5', color: 'white' }}>
                    <LinkedInIcon className="w-4 h-4" style={{ fill: 'white' }} />
                    Continuar con LinkedIn
                  </button>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px" style={{ background: '#e2e8f0' }} />
                    <span className="text-xs text-slate-400">o con email</span>
                    <div className="flex-1 h-px" style={{ background: '#e2e8f0' }} />
                  </div>
                  <input type="email" placeholder="Tu email para crear la cuenta"
                    value={premiumEmail} onChange={e => setPremiumEmail(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl text-sm outline-none" style={INPUT_STYLE} />
                </>
              )}

              <button onClick={() => startSubscription()} disabled={subscriptionLoading || (!user && !premiumEmail.includes('@'))}
                className="btn-glow w-full py-3.5 rounded-xl text-white font-bold text-sm"
                style={{ background: LI_GRADIENT, opacity: (subscriptionLoading || (!user && !premiumEmail.includes('@'))) ? 0.6 : 1 }}>
                {subscriptionLoading ? 'Procesando...' : 'Probar 7 días gratis → Mercado Pago'}
              </button>
              <p className="text-center text-xs text-slate-400 -mt-1">
                La app seguirá siendo 100% gratuita. Premium es solo para guardar tu historial.
              </p>
              <button onClick={() => setShowPremiumModal(false)}
                className="w-full py-2 text-sm text-slate-400 text-center">
                Ahora no, seguir usando gratis
              </button>

              {/* ── Cupón / código de acceso ── */}
              {!showCouponField ? (
                <button
                  onClick={() => { setShowCouponField(true); setCouponError(''); setCouponSuccess(false) }}
                  className="w-full py-1 text-xs text-slate-400 text-center hover:text-slate-600 transition-colors">
                  ¿Tenés un código de acceso?
                </button>
              ) : couponSuccess ? (
                <p className="text-center text-sm font-semibold py-2" style={{ color: '#16a34a' }}>
                  ✓ ¡Premium activado correctamente!
                </p>
              ) : (
                <div className="space-y-2 pt-1 border-t" style={{ borderColor: 'rgba(0,119,181,0.1)' }}>
                  <p className="text-xs text-slate-500 text-center pt-2">Ingresá tu código de acceso</p>
                  {!user && (
                    <input type="email" placeholder="Tu email"
                      value={couponEmail} onChange={e => setCouponEmail(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl text-sm outline-none" style={INPUT_STYLE} />
                  )}
                  <div className="flex gap-2">
                    <input type="text" placeholder="Código"
                      value={couponCode} onChange={e => { setCouponCode(e.target.value); setCouponError('') }}
                      onKeyDown={e => e.key === 'Enter' && applyCoupon()}
                      className="flex-1 px-3 py-2.5 rounded-xl text-sm outline-none" style={INPUT_STYLE} />
                    <button onClick={applyCoupon}
                      disabled={couponLoading || !couponCode.trim() || (!user && !couponEmail.includes('@'))}
                      className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white shrink-0"
                      style={{ background: LI_GRADIENT, opacity: (couponLoading || !couponCode.trim() || (!user && !couponEmail.includes('@'))) ? 0.5 : 1 }}>
                      {couponLoading ? '...' : 'Aplicar'}
                    </button>
                  </div>
                  {couponError && <p className="text-xs text-center" style={{ color: '#ef4444' }}>{couponError}</p>}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Gestionar Suscripción Modal ── */}
      {showManageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) { setShowManageModal(false); setCancelConfirm(false); setCancelDone(false) } }}>
          <div className="w-full max-w-sm rounded-3xl overflow-hidden"
            style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.2)' }}>
            <div className="p-6 text-white" style={{ background: LI_GRADIENT }}>
              <p className="text-xs font-semibold opacity-80 mb-1">TU SUSCRIPCIÓN</p>
              <h2 className="text-xl font-bold">Cuenta Premium</h2>
              {user?.premium_hasta && (
                <p className="text-sm opacity-80 mt-1">
                  Activa hasta {new Date(user.premium_hasta).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              )}
            </div>
            <div className="p-6 space-y-4 bg-white">
              {cancelDone ? (
                <div className="text-center space-y-3 py-2">
                  <p className="text-2xl">✓</p>
                  <p className="font-semibold text-slate-800">Cancelación procesada</p>
                  <p className="text-sm text-slate-500">
                    No se realizarán cobros futuros. Tu acceso Premium continúa activo
                    {user?.premium_hasta
                      ? ` hasta el ${new Date(user.premium_hasta).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })}.`
                      : ' hasta el vencimiento del período actual.'}
                  </p>
                  <button onClick={() => { setShowManageModal(false); setCancelDone(false) }}
                    className="w-full py-3 rounded-xl text-sm font-semibold text-white"
                    style={{ background: LI_GRADIENT }}>
                    Entendido
                  </button>
                </div>
              ) : cancelConfirm ? (
                <div className="space-y-3">
                  <p className="text-sm text-slate-700 text-center font-medium">¿Confirmar cancelación?</p>
                  <p className="text-xs text-slate-500 text-center">No se realizarán cargos futuros. Tu acceso Premium continúa hasta que venza el período actual.</p>
                  <button onClick={cancelSubscription} disabled={cancelLoading}
                    className="w-full py-3 rounded-xl text-sm font-semibold text-white"
                    style={{ background: '#ef4444', opacity: cancelLoading ? 0.7 : 1 }}>
                    {cancelLoading ? 'Cancelando...' : 'Sí, cancelar suscripción'}
                  </button>
                  <button onClick={() => setCancelConfirm(false)} disabled={cancelLoading}
                    className="w-full py-2 text-sm text-slate-500 text-center">
                    Volver
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-slate-600">
                    Tu suscripción se renueva automáticamente cada mes a través de <strong>Mercado Pago</strong>.
                  </p>
                  <p className="text-xs text-slate-400">
                    Podés cancelar desde aquí o directamente desde tu cuenta de Mercado Pago en <em>Suscripciones activas</em>.
                  </p>
                  <button onClick={() => setCancelConfirm(true)}
                    className="w-full py-3 rounded-xl text-sm font-medium border"
                    style={{ borderColor: '#ef4444', color: '#ef4444', background: 'transparent' }}>
                    Cancelar suscripción
                  </button>
                  <button onClick={() => { setShowManageModal(false); setCancelConfirm(false) }}
                    className="w-full py-2 text-sm text-slate-400 text-center">
                    Cerrar
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Historial Modal ── */}
      {showHistorial && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-lg rounded-3xl p-6 space-y-4 max-h-[85vh] overflow-y-auto"
            style={{ background: 'white', boxShadow: '0 25px 60px rgba(0,0,0,0.2)' }}>
            <div className="flex items-center justify-between">
              <h2 className="text-slate-900 font-bold text-lg">Mi historial</h2>
              <button onClick={() => { setShowHistorial(false); setDeletingHistorialId(null) }}
                className="text-slate-400 hover:text-slate-600 text-2xl leading-none w-8 h-8 flex items-center justify-center">×</button>
            </div>
            {historialLoading ? (
              <div className="flex justify-center py-10"><Spinner size={8} /></div>
            ) : historial.length === 0 ? (
              <p className="text-center text-slate-500 text-sm py-10 leading-relaxed">
                Todavía no hay items guardados.<br />
                Los análisis, CVs y entrevistas se guardan automáticamente.
              </p>
            ) : (
              <div className="space-y-2">
                {historial.map(item => {
                  const icons = { analisis: '📊', cv: '📄', entrevista: '🎙️', star: '⭐' }
                  const labels = { analisis: 'Análisis', cv: 'CV', entrevista: 'Entrevista', star: 'STAR' }
                  const colors = {
                    analisis: { background: '#dbeafe', color: '#1d4ed8' },
                    cv:       { background: '#dcfce7', color: '#15803d' },
                    entrevista: { background: '#f3e8ff', color: '#7c3aed' },
                    star:     { background: '#fef3c7', color: '#b45309' },
                  }
                  const isRestorable = item.tipo === 'analisis' || item.tipo === 'cv' || item.tipo === 'entrevista'
                  const isPremium = localStorage.getItem('ol_premium') === '1'
                  const isConfirming = deletingHistorialId === item.id

                  if (isConfirming) {
                    return (
                      <div key={item.id} className="rounded-2xl p-4 flex items-center justify-between gap-3"
                        style={{ border: '1px solid rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.04)' }}>
                        <p className="text-sm text-slate-700 font-medium">¿Eliminar este registro?</p>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => setDeletingHistorialId(null)}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                            style={{ background: 'rgba(100,116,139,0.10)', color: '#475569' }}>
                            Cancelar
                          </button>
                          <button
                            onClick={() => deleteHistorialItem(item.id)}
                            disabled={deleteHistorialLoading}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all"
                            style={{ background: '#ef4444', opacity: deleteHistorialLoading ? 0.6 : 1 }}>
                            {deleteHistorialLoading ? '...' : 'Sí, eliminar'}
                          </button>
                        </div>
                      </div>
                    )
                  }

                  return (
                    <div key={item.id}
                      onClick={isRestorable ? () => restoreFromHistorial(item) : undefined}
                      className={`rounded-2xl p-4 flex items-center justify-between gap-3 transition-all duration-150 ${isRestorable ? 'cursor-pointer hover:shadow-md active:scale-[0.99]' : ''}`}
                      style={{ border: '1px solid rgba(0,119,181,0.12)', background: isRestorable ? 'white' : '#f8fafc' }}>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full shrink-0"
                          style={colors[item.tipo] || colors.analisis}>
                          {icons[item.tipo]} {labels[item.tipo]}
                        </span>
                        <span className="text-slate-700 text-sm font-medium truncate">{item.titulo || '—'}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-slate-400">
                          {new Date(item.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: '2-digit' })}
                        </span>
                        {isPremium && (
                          <button
                            onClick={e => { e.stopPropagation(); setDeletingHistorialId(item.id) }}
                            className="w-7 h-7 rounded-lg flex items-center justify-center transition-all opacity-40 hover:opacity-100"
                            style={{ background: 'transparent' }}
                            title="Eliminar">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-slate-400 hover:text-red-500">
                              <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193v-.443A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                            </svg>
                          </button>
                        )}
                        {isRestorable && <span className="text-slate-300 text-base">›</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Post-Payment Modal ── */}
      {showPostPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-sm rounded-3xl p-6 space-y-4"
            style={{ background: 'white', boxShadow: '0 25px 60px rgba(0,0,0,0.2)' }}>
            <div className="text-center space-y-1">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto text-2xl mb-3"
                style={{ background: 'rgba(0,119,181,0.08)' }}>✦</div>
              <h2 className="text-slate-900 font-bold text-xl">¡Suscripción activada!</h2>
              <p className="text-slate-500 text-sm leading-relaxed">Creá tu contraseña para acceder a tu historial desde cualquier dispositivo.</p>
            </div>

            <div className="space-y-3">
              <input type="email" value={postPaymentEmail} readOnly
                className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                style={{ ...INPUT_STYLE, background: '#f8fafc', color: '#64748b' }} />
              <input type="password" placeholder="Elegí una contraseña (mínimo 6 caracteres)"
                value={postPaymentPassword} onChange={e => setPostPaymentPassword(e.target.value)}
                autoComplete="new-password"
                onKeyDown={e => e.key === 'Enter' && postPaymentPassword.length >= 6 && createAccountPostPayment()}
                className="w-full px-4 py-3 rounded-xl text-sm outline-none" style={INPUT_STYLE} />
            </div>

            {postPaymentError && <p className="text-sm text-center font-medium" style={{ color: '#ef4444' }}>{postPaymentError}</p>}

            <button onClick={createAccountPostPayment}
              disabled={postPaymentLoading || postPaymentPassword.length < 6}
              className="btn-glow w-full py-3 rounded-xl text-white font-semibold text-sm"
              style={{ background: LI_GRADIENT, opacity: (postPaymentLoading || postPaymentPassword.length < 6) ? 0.5 : 1 }}>
              {postPaymentLoading ? 'Creando cuenta...' : 'Crear mi cuenta →'}
            </button>
          </div>
        </div>
      )}

      {/* ── Job Adapter Modal ── */}
      {showJobModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.60)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) { setShowJobModal(false); setJobResult(null); setJobError('') } }}>
          <div className="w-full max-w-lg rounded-3xl overflow-hidden flex flex-col max-h-[90vh]"
            style={{ background: 'white', boxShadow: '0 25px 60px rgba(0,0,0,0.25)' }}>

            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b shrink-0" style={{ borderColor: 'rgba(0,119,181,0.12)' }}>
              <div>
                <h2 className="text-slate-900 font-bold text-base">Adaptar CV para un aviso</h2>
                <p className="text-slate-500 text-xs mt-0.5">Gemini ajusta tu CV y genera la carta de presentación</p>
              </div>
              <button onClick={() => { setShowJobModal(false); setJobResult(null); setJobError('') }}
                className="text-slate-400 hover:text-slate-600 text-2xl leading-none w-8 h-8 flex items-center justify-center shrink-0">×</button>
            </div>

            <div className="overflow-y-auto flex-1 p-5 space-y-4">
              {!jobResult ? (
                <>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Pegá el aviso de empleo</label>
                    <textarea
                      value={jobPosting}
                      onChange={e => { setJobPosting(e.target.value); setJobError('') }}
                      placeholder="Pegá acá el texto completo del aviso: título del puesto, responsabilidades, requisitos, empresa, etc."
                      rows={9}
                      className="w-full rounded-2xl px-4 py-3 text-sm resize-none outline-none"
                      style={{ background: '#f8fafc', border: '1px solid rgba(0,119,181,0.18)', color: '#0d2137' }}
                    />
                    <p className="text-xs text-slate-400 text-right">{jobPosting.length} caracteres</p>
                  </div>
                  {jobError && <p className="text-xs text-center" style={{ color: '#ef4444' }}>{jobError}</p>}
                  <button
                    onClick={callAdaptCvForJob}
                    disabled={jobLoading || jobPosting.trim().length < 50}
                    className="btn-glow w-full py-3.5 rounded-xl text-white font-bold text-sm"
                    style={{ background: LI_GRADIENT, opacity: (jobLoading || jobPosting.trim().length < 50) ? 0.5 : 1 }}>
                    {jobLoading ? (
                      <span className="flex items-center justify-center gap-2"><Spinner size={4} /><span>Generando CV adaptado y carta...</span></span>
                    ) : 'Generar CV adaptado + Carta →'}
                  </button>
                </>
              ) : (
                <div className="space-y-5">
                  {/* Ajustes realizados */}
                  {jobResult.ajustes_principales?.length > 0 && (
                    <div className="rounded-2xl p-4 space-y-2"
                      style={{ background: 'rgba(0,119,181,0.04)', border: '1px solid rgba(0,119,181,0.15)' }}>
                      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#0077B5' }}>Ajustes realizados al CV</p>
                      {jobResult.ajustes_principales.map((a, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <span className="text-blue-400 shrink-0 text-xs mt-0.5">✓</span>
                          <p className="text-slate-600 text-xs leading-snug">{a}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Keywords */}
                  {jobResult.palabras_clave_incorporadas?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Keywords incorporadas</p>
                      <div className="flex flex-wrap gap-1.5">
                        {jobResult.palabras_clave_incorporadas.map((kw, i) => (
                          <span key={i} className="text-xs px-2.5 py-1 rounded-full font-medium"
                            style={{ background: 'rgba(0,119,181,0.08)', border: '1px solid rgba(0,119,181,0.2)', color: '#0077B5' }}>
                            {kw}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* CV adaptado — foto + descargar */}
                  {jobResult.cv_adaptado && (
                    <>
                      <div className="rounded-2xl p-4 space-y-3"
                        style={{ background: profilePhotoPreview ? 'rgba(5,150,105,0.05)' : 'rgba(0,119,181,0.05)', border: `1px solid ${profilePhotoPreview ? 'rgba(5,150,105,0.2)' : 'rgba(0,119,181,0.18)'}` }}>
                        <p className="text-xs font-semibold text-slate-700">
                          {profilePhotoPreview ? '📸 Foto de perfil cargada' : '📸 ¿Querés incluir tu foto de perfil?'}
                        </p>
                        {!profilePhotoPreview && (
                          <p className="text-xs text-slate-500">Las fotos no se guardan en el historial. Podés cargarla ahora o descargar sin ella.</p>
                        )}
                        <div className="flex items-center gap-3">
                          {profilePhotoPreview && (
                            <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 relative"
                              style={{ border: '2px solid rgba(5,150,105,0.4)' }}>
                              <img src={profilePhotoPreview} alt="Foto" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                            </div>
                          )}
                          <label htmlFor="job-modal-photo" className="cursor-pointer px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                            style={{ background: 'rgba(0,119,181,0.12)', color: '#0077B5', border: '1px solid rgba(0,119,181,0.25)' }}>
                            {profilePhotoPreview ? 'Cambiar foto' : 'Cargar foto'}
                          </label>
                          <input id="job-modal-photo" type="file" accept="image/*" className="hidden" onChange={handleCvPhotoUpload} />
                          {profilePhotoPreview && (
                            <button onClick={() => { setProfilePhotoPreview(null); setProfilePhoto(null); setProfilePhotoMime('image/jpeg') }}
                              className="text-xs transition-colors" style={{ color: '#94a3b8' }}>
                              ✕ Quitar
                            </button>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          const html = buildCvHtml(jobResult.cv_adaptado, profilePhoto, profilePhotoMime, cvTemplate)
                          const win = window.open('', '_blank')
                          if (win) { win.document.write(html); win.document.close(); win.focus(); setTimeout(() => { try { win.print() } catch {} }, 300) }
                          trackEvent('job_adapter_cv_download')
                        }}
                        className="w-full py-3.5 rounded-xl text-sm font-semibold text-white"
                        style={{ background: 'linear-gradient(135deg,#059669,#10b981)', boxShadow: '0 4px 12px rgba(5,150,105,0.25)' }}>
                        📥 Descargar CV adaptado →
                      </button>
                    </>
                  )}

                  {/* Carta de presentación */}
                  {jobResult.carta_de_presentacion && (
                    <div className="rounded-2xl overflow-hidden"
                      style={{ border: '1px solid rgba(99,102,241,0.25)' }}>
                      <div className="flex items-center justify-between px-4 py-3"
                        style={{ background: 'rgba(99,102,241,0.06)' }}>
                        <p className="text-sm font-semibold text-slate-800">✉ Carta de presentación</p>
                        <CopyButton text={jobResult.carta_de_presentacion} />
                      </div>
                      <div className="px-4 py-4 bg-white">
                        <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{jobResult.carta_de_presentacion}</p>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => { setJobResult(null); setJobPosting(''); setJobError('') }}
                    className="w-full py-2.5 rounded-xl text-sm text-slate-400 hover:text-slate-600 transition-colors">
                    ← Adaptar para otro aviso
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Barra de usuario ── */}
      <div className="w-full max-w-xl mb-2 flex justify-end items-center gap-2 flex-wrap">
        {checkingPremium && (
          <span className="text-xs font-medium px-3 py-1 rounded-full animate-pulse"
            style={{ background: 'rgba(0,119,181,0.10)', color: '#0077B5' }}>
            ⏳ Verificando suscripción...
          </span>
        )}
        {user ? (
          <>
            {user.es_premium && (() => {
              const hasta = user.premium_hasta ? new Date(user.premium_hasta) : null
              const label = hasta
                ? `✦ Premium hasta ${hasta.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}`
                : '✦ Premium'
              return (
                <button onClick={() => { setCancelConfirm(false); setCancelDone(false); setShowManageModal(true) }}
                  className="text-xs font-bold px-2.5 py-1 rounded-full transition-opacity hover:opacity-80"
                  style={{ background: LI_GRADIENT, color: 'white' }}
                  title="Gestionar suscripción">
                  {label}
                </button>
              )
            })()}
            <span className="text-sm text-slate-500 font-medium">{user.nombre || user.email}</span>
            {!user.es_premium && (
              <button onClick={() => setShowPremiumModal(true)} disabled={subscriptionLoading}
                className="text-xs font-semibold px-3 py-1.5 rounded-full"
                style={{ background: LI_GRADIENT, color: 'white', opacity: subscriptionLoading ? 0.7 : 1 }}>
                {subscriptionLoading ? '...' : '⬆ Activar Premium'}
              </button>
            )}
            {user.es_premium && (
              <button onClick={() => { loadHistorial(); setShowHistorial(true) }}
                className="text-xs font-medium px-3 py-1.5 rounded-full"
                style={BTN_GHOST_STYLE}>
                📋 Historial
              </button>
            )}
            {user.es_premium && (
              <button onClick={() => { loadTracking(); setStep(STEPS.TRACKING) }}
                className="text-xs font-medium px-3 py-1.5 rounded-full"
                style={BTN_GHOST_STYLE}>
                📍 Postulaciones
              </button>
            )}
            <button onClick={authLogout} className="text-xs text-slate-400 hover:text-slate-600 transition-colors px-1">
              Salir
            </button>
          </>
        ) : (
          <button onClick={() => setShowAuthModal(true)}
            className="text-sm font-semibold px-4 py-2 rounded-full transition-all"
            style={BTN_GHOST_STYLE}>
            Ingresar
          </button>
        )}
      </div>

      <div className="w-full max-w-xl">

        {/* ── WELCOME ── */}
        {step === STEPS.WELCOME && (
          <div className="step-transition text-center space-y-8">
            <Logo />
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide badge-shimmer"
                style={{ border: '1px solid rgba(0,119,181,0.4)', color: '#0077B5' }}>
                ✦ &nbsp;Optimiza LK · Con criterio de headhunter
              </div>
              <h1 className="text-4xl sm:text-5xl font-bold leading-tight tracking-tight" style={{ letterSpacing: '-0.02em' }}>
                <span className="text-slate-900">Que los reclutadores</span><br />
                <span style={{ background: 'linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  te encuentren en LinkedIn
                </span>
              </h1>
              <p className="text-slate-600 text-base max-w-sm mx-auto leading-relaxed">
                <strong className="text-slate-700">Optimiza LK</strong> analiza tu perfil con ojo de headhunter: para que aparezcas en las búsquedas correctas, pases los filtros ATS y tengas un CV moderno listo para enviar. Todo gratis.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: '📬', label: 'Que te contacten', text: 'Aparecer en búsquedas de reclutadores que buscan tu perfil exacto', accent: '#0ea5e9' },
                { icon: '✅', label: 'Pasá los filtros', text: 'ATS-compatible: que tu postulación no quede fuera por un algoritmo', accent: '#6366f1' },
                { icon: '📄', label: 'CV listo hoy',     text: 'Un CV moderno de 1 página, listo para enviar en cualquier proceso', accent: '#0d9488' },
                { icon: '📝', label: 'CV para cada aviso', text: 'Adaptá tu CV a cada búsqueda y generá la carta de presentación', accent: '#8b5cf6' },
              ].map(item => (
                <div key={item.label} className="rounded-2xl p-4 text-center relative overflow-hidden"
                  style={{ background: 'white', border: '1px solid rgba(0,119,181,0.15)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
                  <div className="text-2xl mb-2">{item.icon}</div>
                  <p className="text-xs font-semibold mb-1" style={{ color: item.accent }}>{item.label}</p>
                  <p className="text-slate-500 text-xs leading-snug">{item.text}</p>
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <button
                onClick={() => { trackEvent('click_empezar_analisis', { location: 'hero' }); setStep(STEPS.MODE_SELECT) }}
                className="btn-glow w-full text-white font-semibold py-4 px-8 rounded-2xl text-base"
                style={{ background: 'linear-gradient(135deg, #0077B5 0%, #0ea5e9 100%)' }}
              >
                Obtener mi diagnóstico gratis →
              </button>
              <button
                onClick={() => { trackEvent('click_job_adapter', { location: 'hero' }); handleModeSelectJobAdapter() }}
                disabled={jobAdapterCheckLoading}
                className="w-full font-semibold py-3.5 px-8 rounded-2xl text-sm transition-all"
                style={{ border: '1.5px solid rgba(99,102,241,0.35)', color: '#6366f1', background: 'rgba(99,102,241,0.06)' }}
              >
                {jobAdapterCheckLoading ? '...' : '📝 Adaptar mi CV para un aviso →'}
              </button>
              {jobAdapterNoCv && (
                <p className="text-xs text-center leading-relaxed" style={{ color: '#6366f1' }}>
                  Primero necesitás generar tu CV con el diagnóstico →{' '}
                  <button onClick={() => { setJobAdapterNoCv(false); setStep(STEPS.QUESTIONS) }} className="underline font-semibold">
                    Empezar ahora
                  </button>
                </p>
              )}
              <p className="text-slate-500 text-xs">Sin registro · Resultado en 2 minutos · 100% gratis</p>
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
                    { icon: '📝', title: 'CV adaptado por aviso + carta de presentación', desc: 'Pegás el aviso de empleo y la IA ajusta tu CV para esa posición específica e incluye una carta de presentación personalizada lista para enviar.' },
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
                          <div className="text-[10px] font-normal opacity-80 mb-0.5">Optimiza LK</div>
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
                      Con más de 10 años seleccionando profesionales en Argentina y la región, creé <strong className="text-slate-700">Optimiza LK</strong> para que cualquier persona pueda acceder al mismo análisis que haría un headhunter real — sin costo.
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
                    { q: '¿Qué es Optimiza LK?', a: 'Optimiza LK es una herramienta gratuita creada por Ramiro Silvera (Gerente de RRHH y Headhunter) que analiza tu perfil de LinkedIn con criterio profesional. También generás tu CV, practicás entrevistas con IA y adaptás tu CV a avisos de empleo — todo sin costo y sin registro.' },
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

              {/* Footer de marca */}
              <div className="pt-4 pb-2 text-center border-t" style={{ borderColor: 'rgba(0,119,181,0.1)' }}>
                <p className="text-xs text-slate-400 leading-relaxed">
                  <strong className="text-slate-500">Optimiza LK</strong> · Creado por Ramiro Silvera · Argentina<br />
                  <span>Análisis de perfiles LinkedIn con IA · Generador de CV · Simulador de entrevista</span>
                </p>
              </div>

            </div>

          </div>
        )}

        {/* ── MODE SELECT ── */}
        {step === STEPS.MODE_SELECT && (
          <div className="step-transition space-y-6">
            <Logo />
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold text-slate-900 leading-tight">¿Qué querés hacer hoy?</h2>
              <p className="text-slate-500 text-sm">Elegí por dónde empezar</p>
            </div>

            <div className="space-y-3">
              {/* Card 1: Diagnóstico LinkedIn + CV */}
              <button
                onClick={() => { trackEvent('mode_select', { mode: 'diagnostico' }); setStep(STEPS.QUESTIONS) }}
                className="w-full text-left rounded-2xl p-5 transition-all duration-200 hover:shadow-md active:scale-[0.99]"
                style={{ background: 'white', border: '1.5px solid rgba(0,119,181,0.35)', boxShadow: '0 2px 12px rgba(0,119,181,0.08)' }}
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0"
                    style={{ background: 'rgba(0,119,181,0.08)' }}>🎯</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-slate-900 text-base">Diagnóstico LinkedIn + CV</span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(0,119,181,0.1)', color: '#0077B5' }}>Más popular</span>
                    </div>
                    <p className="text-slate-500 text-xs leading-relaxed">
                      Analizá tu perfil con criterio de headhunter y generá un CV premium de 1 página listo para enviar.
                    </p>
                  </div>
                  <span className="text-slate-300 text-xl shrink-0 self-center">›</span>
                </div>
              </button>

              {/* Card 2: Simulador de entrevista */}
              <button
                onClick={() => { trackEvent('mode_select', { mode: 'entrevista' }); resetInterview(); setStep(STEPS.INTERVIEW_INTRO) }}
                className="w-full text-left rounded-2xl p-5 transition-all duration-200 hover:shadow-md active:scale-[0.99]"
                style={{ background: 'white', border: '1.5px solid rgba(99,102,241,0.35)', boxShadow: '0 2px 12px rgba(99,102,241,0.08)' }}
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0"
                    style={{ background: 'rgba(99,102,241,0.08)' }}>🎙️</div>
                  <div className="flex-1 min-w-0">
                    <span className="font-bold text-slate-900 text-base block mb-1">Simulador de entrevista</span>
                    <p className="text-slate-500 text-xs leading-relaxed">
                      Practicá 5 preguntas típicas de selección y recibí feedback detallado con criterio de RRHH.
                    </p>
                  </div>
                  <span className="text-slate-300 text-xl shrink-0 self-center">›</span>
                </div>
              </button>

              {/* Card 3: Entrenamiento STAR */}
              <button
                onClick={() => { trackEvent('mode_select', { mode: 'star' }); setStarPhase('theory'); setStep(STEPS.STAR_TRAINING) }}
                className="w-full text-left rounded-2xl p-5 transition-all duration-200 hover:shadow-md active:scale-[0.99]"
                style={{ background: 'white', border: '1.5px solid rgba(13,148,136,0.35)', boxShadow: '0 2px 12px rgba(13,148,136,0.08)' }}
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0"
                    style={{ background: 'rgba(13,148,136,0.08)' }}>⭐</div>
                  <div className="flex-1 min-w-0">
                    <span className="font-bold text-slate-900 text-base block mb-1">Entrenamiento STAR</span>
                    <p className="text-slate-500 text-xs leading-relaxed">
                      Aprendé la metodología que usan los mejores candidatos y practicá con feedback instantáneo de IA.
                    </p>
                  </div>
                  <span className="text-slate-300 text-xl shrink-0 self-center">›</span>
                </div>
              </button>

              {/* Card 4: Adaptar CV para un aviso */}
              <div>
                <button
                  onClick={() => { trackEvent('mode_select', { mode: 'job_adapter' }); handleModeSelectJobAdapter() }}
                  disabled={jobAdapterCheckLoading}
                  className="w-full text-left rounded-2xl p-5 transition-all duration-200 hover:shadow-md active:scale-[0.99]"
                  style={{ background: 'white', border: '1.5px solid rgba(99,102,241,0.35)', boxShadow: '0 2px 12px rgba(99,102,241,0.08)', opacity: jobAdapterCheckLoading ? 0.7 : 1 }}
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0"
                      style={{ background: 'rgba(99,102,241,0.08)' }}>
                      {jobAdapterCheckLoading ? <Spinner size={5} /> : '📝'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-bold text-slate-900 text-base block mb-1">Adaptar CV para un aviso</span>
                      <p className="text-slate-500 text-xs leading-relaxed">
                        Pegá un aviso de empleo y la IA adapta tu CV y genera la carta de presentación personalizada.
                      </p>
                    </div>
                    <span className="text-slate-300 text-xl shrink-0 self-center">›</span>
                  </div>
                </button>
                {jobAdapterNoCv && (
                  <div className="mt-2 rounded-xl px-4 py-3 text-xs leading-relaxed"
                    style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', color: '#6366f1' }}>
                    <strong>Primero necesitás generar tu CV.</strong> Hacé el diagnóstico LinkedIn, generá tu CV, y después vas a poder adaptarlo para cualquier búsqueda.
                    <button onClick={() => { setJobAdapterNoCv(false); trackEvent('mode_select', { mode: 'diagnostico' }); setStep(STEPS.QUESTIONS) }}
                      className="block mt-2 font-semibold underline">
                      Hacer el diagnóstico ahora →
                    </button>
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={() => setStep(STEPS.WELCOME)}
              className="w-full py-3 rounded-2xl text-sm font-medium transition-all"
              style={BTN_BACK_STYLE}
            >
              ← Volver al inicio
            </button>
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
            <div>
              <p className="text-slate-500 text-sm mb-1">Último paso</p>
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">Cargá tu perfil de LinkedIn</h2>
            </div>

            {/* Rate limit banner */}
            {(rateLimitEvento === 'analisis') && (
              <RateLimitUI secs={rateLimitSecs} evento={rateLimitEvento}
                email={waitlistEmail} onEmailChange={setWaitlistEmail}
                sent={waitlistSent} loading={waitlistLoading} onSubmit={handleWaitlist} />
            )}

            {/* ── Tabs de carga de perfil ── */}
            <>

                <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid rgba(0,119,181,0.15)' }}>
                  {[
                    { id: 'linkedin',  label: '🔗  LinkedIn' },
                    { id: 'pdf',       label: '📄  PDF' },
                    { id: 'form',      label: '✏️  Manual' },
                    { id: 'sinperfil', label: '💡  Sin perfil' },
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

                {/* ── MODO LINKEDIN ── */}
                {inputMode === 'linkedin' && (
                  <div className="space-y-4">
                    {linkedinAuthLoading && (
                      <div className="rounded-2xl p-6 text-center space-y-2"
                        style={{ background: 'rgba(0,119,181,0.05)', border: '1px solid rgba(0,119,181,0.15)' }}>
                        <div className="text-2xl">⏳</div>
                        <p className="text-slate-600 text-sm">Verificando tu cuenta de LinkedIn...</p>
                      </div>
                    )}

                    {!linkedinAuthLoading && !linkedinOAuth && (
                      <div className="space-y-4">
                        <div className="rounded-2xl p-5 space-y-3"
                          style={{ background: 'rgba(0,119,181,0.04)', border: '1px solid rgba(0,119,181,0.15)' }}>
                          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#0077B5' }}>¿Por qué iniciar sesión?</p>
                          <ul className="space-y-1.5">
                            {[
                              'Importa tu nombre, cargo y resumen automáticamente',
                              'Foto de perfil incluida en el CV generado',
                              'Sin copiar y pegar — más rápido y preciso',
                            ].map(t => (
                              <li key={t} className="flex items-start gap-2 text-xs text-slate-600">
                                <span className="text-emerald-500 shrink-0 mt-0.5">✓</span>{t}
                              </li>
                            ))}
                          </ul>
                        </div>

                        {linkedinAuthError && (
                          <p className="text-red-500 text-xs rounded-xl px-4 py-2"
                            style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
                            {linkedinAuthError}
                          </p>
                        )}

                        <button
                          onClick={handleLinkedinLogin}
                          className="w-full py-3.5 rounded-2xl font-semibold text-white flex items-center justify-center gap-3 transition-all btn-glow"
                          style={{ background: '#0077B5' }}
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                          </svg>
                          Iniciar sesión con LinkedIn
                        </button>
                      </div>
                    )}

                    {!linkedinAuthLoading && linkedinOAuth && (
                      <div className="space-y-5">
                        {/* Lo que obtuvimos */}
                        <div className="rounded-2xl p-4 space-y-3"
                          style={{ background: 'rgba(5,150,105,0.06)', border: '1px solid rgba(5,150,105,0.2)' }}>
                          <div className="flex items-center gap-3">
                            {linkedinOAuth.picture && (
                              <img src={linkedinOAuth.picture} alt="Foto" className="w-12 h-12 rounded-full object-cover shrink-0"
                                style={{ border: '2px solid #0077B5' }} />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-slate-900 text-sm truncate">{linkedinOAuth.name}</p>
                              <p className="text-slate-500 text-xs truncate">{linkedinOAuth.email}</p>
                            </div>
                            <span className="text-emerald-500 shrink-0">✓ Conectado</span>
                          </div>
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#059669' }}>
                              Datos importados de LinkedIn
                            </p>
                            <div className="grid grid-cols-2 gap-1">
                              {[
                                ['Nombre', !!linkedinOAuth.name],
                                ['Email', !!linkedinOAuth.email],
                                ['Foto de perfil', !!linkedinOAuth.picture],
                                ['Titular', !!linkedinOAuth.headline],
                                ['Resumen / About', !!linkedinOAuth.summary],
                              ].map(([label, ok]) => (
                                <div key={label} className="flex items-center gap-1.5 text-xs">
                                  <span style={{ color: ok ? '#059669' : '#94a3b8' }}>{ok ? '✓' : '○'}</span>
                                  <span className={ok ? 'text-slate-700' : 'text-slate-400 line-through'}>{label}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Por qué falta lo demás */}
                        <div className="rounded-2xl p-4"
                          style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.22)' }}>
                          <p className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: '#d97706' }}>
                            ⚠ Por qué no se importan las experiencias
                          </p>
                          <p className="text-xs text-slate-600 leading-relaxed">
                            La API de LinkedIn <strong>no permite acceder a experiencias laborales, educación ni habilidades</strong> de apps externas — es su política de privacidad. Completalos abajo para un análisis más preciso.
                          </p>
                        </div>

                        {/* Titular */}
                        <div>
                          <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide flex items-center gap-2 mb-1.5">
                            Titular profesional
                            {linkedinOAuth.headline
                              ? <span className="text-emerald-600 normal-case font-normal tracking-normal">✓ importado</span>
                              : <span style={{ color: '#0077B5' }}>*</span>}
                          </label>
                          <input value={formTitular}
                            onChange={e => { setFormTitular(e.target.value); setFormConfirmed(false) }}
                            placeholder="Ej: Desarrollador Full Stack | React & Node | 8 años"
                            className="w-full rounded-xl px-4 py-3 text-sm outline-none" style={INPUT_STYLE} />
                        </div>

                        {/* Resumen */}
                        <div>
                          <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide flex items-center gap-2 mb-1.5">
                            Resumen / About
                            {linkedinOAuth.summary
                              ? <span className="text-emerald-600 normal-case font-normal tracking-normal">✓ importado</span>
                              : <span className="text-slate-400 font-normal normal-case tracking-normal">(recomendado)</span>}
                          </label>
                          <textarea value={formResumen}
                            onChange={e => { setFormResumen(e.target.value); setFormConfirmed(false) }}
                            placeholder="Tu propuesta de valor, logros clave y especialización..."
                            rows={3} className="w-full rounded-xl px-4 py-3 text-sm resize-none outline-none" style={INPUT_STYLE} />
                        </div>

                        {/* Experiencias */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide flex items-center gap-2">
                              Experiencia profesional
                              <span className="text-amber-500 font-normal normal-case tracking-normal">⚠ no importada</span>
                            </label>
                            <button
                              onClick={() => { setFormExperiencias(p => [...p, { cargo: '', empresa: '', periodo: '', descripcion: '' }]); setFormConfirmed(false) }}
                              className="text-xs px-3 py-1 rounded-lg" style={BTN_GHOST_STYLE}>
                              + Agregar
                            </button>
                          </div>
                          {formExperiencias.map((exp, i) => (
                            <div key={i} className="rounded-xl p-4 space-y-2 mb-3"
                              style={{ background: 'white', border: '1px solid rgba(0,119,181,0.12)' }}>
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-slate-500 font-semibold">Experiencia {i + 1}</span>
                                {formExperiencias.length > 1 && (
                                  <button onClick={() => { setFormExperiencias(p => p.filter((_, j) => j !== i)); setFormConfirmed(false) }}
                                    className="text-xs text-slate-400 hover:text-red-400 transition-colors">✕</button>
                                )}
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <input value={exp.cargo}
                                  onChange={e => { setFormExperiencias(p => p.map((x, j) => j === i ? { ...x, cargo: e.target.value } : x)); setFormConfirmed(false) }}
                                  placeholder="Cargo" className="w-full rounded-xl px-3 py-2.5 text-sm outline-none" style={INPUT_ALT_STYLE} />
                                <input value={exp.empresa}
                                  onChange={e => { setFormExperiencias(p => p.map((x, j) => j === i ? { ...x, empresa: e.target.value } : x)); setFormConfirmed(false) }}
                                  placeholder="Empresa" className="w-full rounded-xl px-3 py-2.5 text-sm outline-none" style={INPUT_ALT_STYLE} />
                              </div>
                              <input value={exp.periodo}
                                onChange={e => { setFormExperiencias(p => p.map((x, j) => j === i ? { ...x, periodo: e.target.value } : x)); setFormConfirmed(false) }}
                                placeholder="Período (Ej: Mar 2021 – Presente)" className="w-full rounded-xl px-3 py-2.5 text-sm outline-none" style={INPUT_ALT_STYLE} />
                              <textarea value={exp.descripcion}
                                onChange={e => { setFormExperiencias(p => p.map((x, j) => j === i ? { ...x, descripcion: e.target.value } : x)); setFormConfirmed(false) }}
                                placeholder="Responsabilidades y logros (opcional)" rows={2}
                                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none resize-none" style={INPUT_ALT_STYLE} />
                            </div>
                          ))}
                        </div>

                        {/* Educación */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide flex items-center gap-2">
                              Educación
                              <span className="text-amber-500 font-normal normal-case tracking-normal">⚠ no importada</span>
                            </label>
                            <button
                              onClick={() => { setFormEducacion(p => [...p, { institucion: '', titulo: '', periodo: '' }]); setFormConfirmed(false) }}
                              className="text-xs px-3 py-1 rounded-lg" style={BTN_GHOST_STYLE}>
                              + Agregar
                            </button>
                          </div>
                          {formEducacion.map((edu, i) => (
                            <div key={i} className="rounded-xl p-4 space-y-2 mb-3"
                              style={{ background: 'white', border: '1px solid rgba(0,119,181,0.12)' }}>
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-slate-500 font-semibold">Educación {i + 1}</span>
                                {formEducacion.length > 1 && (
                                  <button onClick={() => { setFormEducacion(p => p.filter((_, j) => j !== i)); setFormConfirmed(false) }}
                                    className="text-xs text-slate-400 hover:text-red-400 transition-colors">✕</button>
                                )}
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <input value={edu.institucion}
                                  onChange={e => { setFormEducacion(p => p.map((x, j) => j === i ? { ...x, institucion: e.target.value } : x)); setFormConfirmed(false) }}
                                  placeholder="Institución" className="w-full rounded-xl px-3 py-2.5 text-sm outline-none" style={INPUT_ALT_STYLE} />
                                <input value={edu.titulo}
                                  onChange={e => { setFormEducacion(p => p.map((x, j) => j === i ? { ...x, titulo: e.target.value } : x)); setFormConfirmed(false) }}
                                  placeholder="Título / Carrera" className="w-full rounded-xl px-3 py-2.5 text-sm outline-none" style={INPUT_ALT_STYLE} />
                              </div>
                              <input value={edu.periodo}
                                onChange={e => { setFormEducacion(p => p.map((x, j) => j === i ? { ...x, periodo: e.target.value } : x)); setFormConfirmed(false) }}
                                placeholder="Período (Ej: 2015 – 2019)" className="w-full rounded-xl px-3 py-2.5 text-sm outline-none" style={INPUT_ALT_STYLE} />
                            </div>
                          ))}
                        </div>

                        {/* Habilidades */}
                        <div>
                          <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide flex items-center gap-2 mb-1.5">
                            Habilidades
                            <span className="text-amber-500 font-normal normal-case tracking-normal">⚠ no importadas</span>
                          </label>
                          <input value={formHabilidades}
                            onChange={e => { setFormHabilidades(e.target.value); setFormConfirmed(false) }}
                            placeholder="Ej: React, Gestión de equipos, Análisis de datos, Inglés avanzado"
                            className="w-full rounded-xl px-4 py-3 text-sm outline-none" style={INPUT_STYLE} />
                        </div>

                        <button
                          onClick={handleLinkedinConfirm}
                          disabled={!formTitular.trim()}
                          className="w-full py-3.5 rounded-2xl font-semibold text-white transition-all btn-glow"
                          style={{
                            background: formTitular.trim() ? LI_GRADIENT : 'rgba(0,119,181,0.15)',
                            opacity: formTitular.trim() ? 1 : 0.6,
                            cursor: formTitular.trim() ? 'pointer' : 'not-allowed',
                          }}
                        >
                          {formConfirmed ? '✅ Datos listos — podés analizar tu perfil' : 'Usar estos datos →'}
                        </button>
                      </div>
                    )}
                  </div>
                )}

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
                    {pdfError && (
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

                    {/* Banner AutoFill */}
                    <div className="rounded-xl p-3 flex items-center gap-3"
                      style={{ background: 'rgba(0,119,181,0.05)', border: '1px solid rgba(0,119,181,0.18)' }}>
                      <span className="text-lg shrink-0">⚡</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-700">Autocompletar desde LinkedIn</p>
                        <p className="text-xs text-slate-500">Completá los campos con un clic</p>
                      </div>
                      {liAutofillDone
                        ? <span className="text-emerald-500 text-xs font-semibold shrink-0">✓ Listo</span>
                        : (
                          <button
                            onClick={handleLinkedinAutofill}
                            disabled={liAutofillLoading}
                            className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
                            style={{ background: '#0077B5', color: 'white', opacity: liAutofillLoading ? 0.6 : 1 }}
                          >
                            {liAutofillLoading ? '...' : 'Autocompletar'}
                          </button>
                        )
                      }
                    </div>
                    {liAutofillError && (
                      <p className="text-xs text-amber-600">Plugin pendiente de aprobación por LinkedIn. Completá manualmente.</p>
                    )}

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

                {/* ── MODO SIN PERFIL ── */}
                {inputMode === 'sinperfil' && (
                  <div className="space-y-4">
                    <div className="rounded-2xl p-5 space-y-3"
                      style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.18)' }}>
                      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#6366f1' }}>
                        ¿No tenés perfil de LinkedIn todavía?
                      </p>
                      <p className="text-slate-600 text-sm leading-relaxed">
                        Generamos un diagnóstico de cómo posicionarte y te damos titular, resumen y palabras clave para construir tu perfil desde cero.
                      </p>
                      <ul className="space-y-1.5">
                        {['Titular propuesto con keywords de tu sector', 'Resumen con propuesta de valor clara', 'Palabras clave para aparecer en búsquedas'].map(t => (
                          <li key={t} className="flex items-start gap-2 text-xs text-slate-600">
                            <span className="text-indigo-500 shrink-0 mt-0.5">✓</span>{t}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <button
                      onClick={() => { setSinPerfilMode(true); setProfileText('SIN_PERFIL') }}
                      className="w-full py-3.5 rounded-2xl font-semibold text-white btn-glow"
                      style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
                    >
                      Generar mi diagnóstico base →
                    </button>
                    {sinPerfilMode && (
                      <p className="text-xs text-center text-emerald-600 font-medium">
                        ✓ Listo — podés analizar tu perfil sin subir nada
                      </p>
                    )}
                  </div>
                )}
            </>

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

            {/* Analysis error */}
            {analysisError && (
              <div role="alert" className="rounded-xl p-4 text-sm space-y-2"
                style={{ backgroundColor: 'rgba(254,226,226,0.8)', border: '1px solid #fca5a5', color: '#b91c1c' }}>
                <p>⚠️ {analysisError}</p>
                <button
                  onClick={callGemini}
                  disabled={(!profileText && !sinPerfilMode) || analyzing}
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
        {step === STEPS.RESULTS && (result || (cvStage === 'done' && cvFinalData)) && (
          <div className="step-transition space-y-6">
            <Logo />

            {/* Consentimiento para guardar análisis */}
            {showAnalisisConsent && !analisisSaved && (
              <div className="rounded-2xl p-4 space-y-3"
                style={{ background: 'white', border: '1px solid rgba(0,119,181,0.15)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
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
              {result.puntaje_general === null && (
                <div className="rounded-xl p-3 mb-4 flex items-start gap-2 text-xs"
                  style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.2)', color: '#6366f1' }}>
                  <span className="shrink-0 text-base">💡</span>
                  <span>Diagnóstico base generado con tus respuestas. Subí tu PDF de LinkedIn para obtener un análisis completo con puntaje real.</span>
                </div>
              )}
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                <div className="flex flex-col items-center gap-3">
                  {result.puntaje_general !== null
                    ? <ScoreRing score={result.puntaje_general ?? 0} />
                    : <div className="w-20 h-20 rounded-full flex items-center justify-center text-3xl"
                        style={{ background: 'rgba(99,102,241,0.08)', border: '2px solid rgba(99,102,241,0.2)' }}>💡</div>
                  }
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

            {/* ── CV de 1 página ── */}
            <div className="space-y-3">
              {/* Botón principal — solo visible cuando no hay pipeline activo */}
              {cvStage === 'idle' && (
                <div className="space-y-1.5">
                  <button
                    onClick={() => setShowCvModal(true)}
                    disabled={cvLoading}
                    className="w-full font-semibold py-4 rounded-xl transition-all duration-200 text-white text-sm"
                    style={{ background: 'linear-gradient(135deg,#059669,#10b981)' }}
                  >
                    📄 Generá tu CV moderno de 1 página
                  </button>
                  <p className="text-center text-xs text-slate-500">
                    Gratis · ATS-compatible · Con foto · Listo para imprimir
                  </p>
                </div>
              )}

              {/* Loading states */}
              {(cvStage === 'pre_loading' || cvStage === 'drafting' || cvStage === 'scoring' || cvStage === 'regenerating') && (
                <div className="rounded-2xl p-5 text-center space-y-3"
                  style={{ background: 'rgba(0,119,181,0.04)', border: '1px solid rgba(0,119,181,0.12)' }}>
                  <div className="flex justify-center">
                    <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'rgba(0,119,181,0.25)', borderTopColor: '#0077B5' }} />
                  </div>
                  <p className="text-sm font-medium text-slate-700">
                    {cvStage === 'pre_loading' && 'Analizando tu perfil...'}
                    {cvStage === 'drafting' && 'Generando tu CV...'}
                    {cvStage === 'scoring' && 'Revisando con consultor de empleabilidad...'}
                    {cvStage === 'regenerating' && 'Aplicando mejoras...'}
                  </p>
                  <p className="text-xs text-slate-400">
                    {cvStage === 'pre_loading' && 'Identificando qué información potenciaría tu CV'}
                    {cvStage === 'drafting' && 'Extrayendo tu experiencia real del perfil'}
                    {cvStage === 'scoring' && 'Evaluando calidad, fechas, logros y compatibilidad ATS'}
                    {cvStage === 'regenerating' && 'Integrando la información que nos diste'}
                  </p>
                </div>
              )}

              {/* Pre-questions — enriquecer antes de generar */}
              {cvStage === 'pre_questions' && cvPreQuestions.length > 0 && (
                <div className="rounded-2xl overflow-hidden"
                  style={{ border: '1px solid rgba(0,119,181,0.20)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
                  <div className="px-5 pt-5 pb-4"
                    style={{ background: 'linear-gradient(135deg,rgba(0,119,181,0.06),rgba(14,165,233,0.04))', borderBottom: '1px solid rgba(0,119,181,0.10)' }}>
                    <div className="flex items-start gap-3">
                      <span className="text-xl shrink-0 mt-0.5">✦</span>
                      <div>
                        <p className="text-sm font-bold text-slate-900 leading-snug">
                          Antes de generar tu CV, respondé estas preguntas
                        </p>
                        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                          Identificamos {cvPreQuestions.length} oportunidad{cvPreQuestions.length > 1 ? 'es' : ''} para enriquecer tu CV con datos reales que hacen diferencia. Cada respuesta se integra directamente en los bullets.
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="px-5 py-5 space-y-5 bg-white">
                    {cvPreQuestions.map((q, i) => (
                      <div key={q.id} className="space-y-2">
                        <div className="flex items-start gap-2.5">
                          <span className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0 mt-0.5"
                            style={{ background: LI_GRADIENT }}>{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            {q.contexto && (
                              <p className="text-[10px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: '#64748b' }}>{q.contexto}</p>
                            )}
                            <p className="text-sm font-medium text-slate-800 leading-snug">{q.pregunta}</p>
                          </div>
                        </div>
                        <input
                          type="text"
                          value={cvPreAnswers[q.id] || ''}
                          onChange={e => setCvPreAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                          placeholder={q.placeholder || 'Tu respuesta...'}
                          className="w-full rounded-xl px-4 py-2.5 text-sm outline-none transition-all"
                          style={{
                            ...INPUT_ALT_STYLE,
                            border: `1px solid ${cvPreAnswers[q.id]?.trim() ? 'rgba(0,119,181,0.40)' : 'rgba(0,119,181,0.15)'}`,
                          }}
                        />
                      </div>
                    ))}
                    {cvError && <p className="text-xs text-red-500">{cvError}</p>}
                    <div className="space-y-2 pt-1">
                      <button
                        onClick={() => {
                          trackEvent('cv_pre_questions_submitted', { answered: Object.values(cvPreAnswers).filter(v => v?.trim()).length, total: cvPreQuestions.length })
                          callGenerateCV(cvContacto, cvPreAnswers)
                        }}
                        className="btn-glow w-full font-semibold py-3.5 rounded-2xl text-white text-sm"
                        style={{ background: LI_GRADIENT }}
                      >
                        Crear mi CV →
                      </button>
                      <button
                        onClick={() => {
                          trackEvent('cv_pre_questions_skipped')
                          callGenerateCV(cvContacto, {})
                        }}
                        className="w-full py-2.5 rounded-2xl text-xs text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        Generar con los datos actuales
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Gap Form — calidad insuficiente, pedir más info */}
              {cvStage === 'gap_form' && cvQuality && (
                <div className="rounded-2xl overflow-hidden"
                  style={{ border: '1px solid rgba(245,158,11,0.30)', boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}>
                  {/* Header con score y nota consultor */}
                  <div className="px-5 py-4 space-y-3"
                    style={{ background: 'linear-gradient(135deg,rgba(245,158,11,0.08),rgba(234,88,12,0.05))' }}>
                    <div className="flex items-center gap-4">
                      <div className="shrink-0 w-12 h-12 rounded-full flex flex-col items-center justify-center font-black"
                        style={{ background: 'rgba(245,158,11,0.12)', border: '1.5px solid rgba(245,158,11,0.30)', color: '#d97706' }}>
                        <span className="text-lg leading-none">{cvQuality.score}</span>
                        <span className="text-[9px] text-slate-500 font-normal">/10</span>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-800">Puntaje {cvQuality.score}/10 — podemos mejorarlo</p>
                        <p className="text-xs text-slate-500 mt-0.5">{cvQuality.nota_consultor || 'Respondé estas preguntas para agregar datos reales que potencien tu CV'}</p>
                      </div>
                    </div>
                    {cvQuality.fortalezas?.length > 0 && (
                      <div className="space-y-1 border-t pt-3" style={{ borderColor: 'rgba(245,158,11,0.15)' }}>
                        <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: '#d97706' }}>Lo que ya está bien</p>
                        {cvQuality.fortalezas.map((f, i) => (
                          <div key={i} className="flex items-start gap-1.5">
                            <span className="text-emerald-500 shrink-0 text-xs">✓</span>
                            <p className="text-xs text-slate-600 leading-snug">{f}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* Preguntas de gaps */}
                  <div className="px-5 py-4 space-y-5" style={{ background: 'white' }}>
                    {(cvQuality.gaps || []).map((gap) => (
                      <div key={gap.id} className="space-y-2">
                        <div className="flex items-start gap-2">
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 mt-0.5"
                            style={{ background: gap.impacto === 'Alto' ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)', color: gap.impacto === 'Alto' ? '#dc2626' : '#d97706', border: `1px solid ${gap.impacto === 'Alto' ? 'rgba(239,68,68,0.20)' : 'rgba(245,158,11,0.20)'}` }}>
                            {gap.impacto}
                          </span>
                          <p className="text-sm font-medium text-slate-800 leading-snug">{gap.pregunta}</p>
                        </div>
                        <p className="text-xs text-slate-400 pl-px">{gap.campo}</p>
                        <input
                          type="text"
                          value={cvGapAnswers[gap.id] || ''}
                          onChange={e => setCvGapAnswers(prev => ({ ...prev, [gap.id]: e.target.value }))}
                          placeholder={gap.placeholder || 'Tu respuesta...'}
                          className="w-full rounded-xl px-4 py-2.5 text-sm text-slate-800 outline-none transition-all"
                          style={{ background: '#f8fafc', border: `1px solid ${cvGapAnswers[gap.id]?.trim() ? 'rgba(0,119,181,0.40)' : 'rgba(0,119,181,0.15)'}` }}
                        />
                      </div>
                    ))}
                    {rateLimitEvento === 'cv' && <RateLimitUI secs={rateLimitSecs} evento={rateLimitEvento} email={waitlistEmail} onEmailChange={setWaitlistEmail} sent={waitlistSent} loading={waitlistLoading} onSubmit={handleWaitlist} />}
                    {cvError && !rateLimitEvento && <p className="text-xs text-red-500">{cvError}</p>}
                    <div className="flex flex-col gap-2 pt-1">
                      <button
                        onClick={() => callRegenerateCV(cvGapAnswers)}
                        disabled={cvLoading || !(cvQuality.gaps || []).filter(g => g.impacto === 'Alto').every(g => cvGapAnswers[g.id]?.trim())}
                        className="w-full py-3.5 rounded-xl text-sm font-semibold text-white transition-all"
                        style={{
                          background: (cvQuality.gaps || []).filter(g => g.impacto === 'Alto').every(g => cvGapAnswers[g.id]?.trim()) ? 'linear-gradient(135deg,#0077B5,#0ea5e9)' : '#94a3b8',
                          opacity: cvLoading ? 0.7 : 1,
                        }}
                      >
                        Incorporar estos datos al CV →
                      </button>
                      <button
                        onClick={() => { setCvFinalData(cvDraft); setCvStage('done'); setCvPreviewHtml(buildCvHtml(cvDraft, profilePhoto, profilePhotoMime, cvTemplate)); trackEvent('cv_gap_skipped') }}
                        className="w-full py-2.5 rounded-xl text-xs text-slate-400 transition-all hover:text-slate-600"
                        style={{ background: 'transparent' }}
                      >
                        Ver el borrador actual
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* CV listo — score + revisión consultor + botón imprimir */}
              {cvStage === 'done' && cvFinalData && (
                <div className="space-y-3">
                  {/* Template picker */}
                  <div className="rounded-2xl p-3 space-y-2"
                    style={{ background: 'rgba(0,119,181,0.04)', border: '1px solid rgba(0,119,181,0.14)' }}>
                    <p className="text-xs font-semibold text-slate-700">Diseño del CV</p>
                    <div className="grid grid-cols-5 gap-1.5">
                      {[
                        { id: 'clasico',   label: 'Clásico',   color: '#0d2137' },
                        { id: 'minimal',   label: 'Minimal',   color: '#374151' },
                        { id: 'ejecutivo', label: 'Ejecutivo', color: '#1e293b' },
                        { id: 'tech',      label: 'Tech',      color: '#134e4a' },
                        { id: 'creativo',  label: 'Creativo',  color: '#7c3aed' },
                      ].map(t => (
                        <button
                          key={t.id}
                          onClick={() => {
                            setCvTemplate(t.id)
                            if (cvFinalData) setCvPreviewHtml(buildCvHtml(cvFinalData, profilePhoto, profilePhotoMime, t.id))
                          }}
                          className="flex flex-col items-center gap-1 py-2 px-1 rounded-xl border transition-all text-center"
                          style={{
                            background: cvTemplate === t.id ? 'rgba(0,119,181,0.12)' : '#f8fafc',
                            borderColor: cvTemplate === t.id ? 'rgba(0,119,181,0.5)' : 'rgba(0,0,0,0.08)',
                          }}
                        >
                          <div className="w-full h-5 rounded-sm" style={{ background: t.color }} />
                          <span className="text-[9px] text-slate-600 font-medium leading-tight">{t.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Cuando el CV se restauró desde historial sin análisis asociado */}
                  {!result && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => setStep(STEPS.MODE_SELECT)}
                        className="flex-1 py-3 rounded-xl text-sm font-medium"
                        style={BTN_BACK_STYLE}>
                        ← Menú
                      </button>
                      <button
                        onClick={() => { setCvStage('idle'); setCvFinalData(null); setCvPreviewHtml(''); setStep(STEPS.MODE_SELECT) }}
                        className="flex-[2] py-3 rounded-xl text-sm font-medium"
                        style={BTN_BACK_STYLE}>
                        ↺ Hacer nuevo análisis
                      </button>
                    </div>
                  )}
                  {cvQuality && (
                    <div className="rounded-2xl overflow-hidden"
                      style={{ border: `1px solid ${cvQuality.score >= 8 ? 'rgba(34,197,94,0.25)' : 'rgba(0,119,181,0.18)'}` }}>
                      {/* Score header */}
                      <div className="flex items-center gap-3 px-4 py-3"
                        style={{ background: cvQuality.score >= 8 ? 'rgba(34,197,94,0.06)' : 'rgba(0,119,181,0.05)' }}>
                        <div className="shrink-0 w-12 h-12 rounded-full flex flex-col items-center justify-center font-black"
                          style={{ background: cvQuality.score >= 8 ? 'rgba(34,197,94,0.12)' : 'rgba(0,119,181,0.10)', color: cvQuality.score >= 8 ? '#16a34a' : '#0077B5', border: `1.5px solid ${cvQuality.score >= 8 ? 'rgba(34,197,94,0.30)' : 'rgba(0,119,181,0.25)'}` }}>
                          <span className="text-lg leading-none">{cvQuality.score}</span>
                          <span className="text-[9px] text-slate-500 font-normal">/10</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-slate-800">CV {cvQuality.nivel}</p>
                            {cvQuality.riesgo_ats && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
                                style={{
                                  background: cvQuality.riesgo_ats === 'Bajo' ? 'rgba(34,197,94,0.10)' : cvQuality.riesgo_ats === 'Alto' ? 'rgba(239,68,68,0.10)' : 'rgba(245,158,11,0.10)',
                                  color: cvQuality.riesgo_ats === 'Bajo' ? '#16a34a' : cvQuality.riesgo_ats === 'Alto' ? '#dc2626' : '#d97706',
                                }}>
                                ATS {cvQuality.riesgo_ats}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5 leading-snug">{cvQuality.nota_consultor || (cvQuality.score >= 8 ? 'Listo para enviar a reclutadores' : 'Generado con tu información real')}</p>
                        </div>
                      </div>
                      {/* Fortalezas del consultor */}
                      {cvQuality.fortalezas?.length > 0 && (
                        <div className="px-4 py-3 space-y-1.5 border-t" style={{ borderColor: 'rgba(0,0,0,0.06)', background: 'white' }}>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Fortalezas del CV</p>
                          {cvQuality.fortalezas.map((f, i) => (
                            <div key={i} className="flex items-start gap-2">
                              <span className="text-emerald-500 shrink-0 mt-0.5 text-xs">✓</span>
                              <p className="text-xs text-slate-600 leading-snug">{f}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {/* Foto de perfil — prompt cuando se restaura desde historial */}
                  <div className="rounded-2xl p-4 space-y-3"
                    style={{ background: profilePhotoPreview ? 'rgba(5,150,105,0.05)' : 'rgba(0,119,181,0.05)', border: `1px solid ${profilePhotoPreview ? 'rgba(5,150,105,0.2)' : 'rgba(0,119,181,0.18)'}` }}>
                    <p className="text-xs font-semibold text-slate-700">
                      {profilePhotoPreview ? '📸 Foto de perfil cargada' : '📸 ¿Querés agregar tu foto de perfil al CV?'}
                    </p>
                    {!profilePhotoPreview && (
                      <p className="text-xs text-slate-500">Las fotos no se guardan en el historial. Podés cargarla ahora o continuar sin ella.</p>
                    )}
                    <div className="flex items-center gap-3">
                      {profilePhotoPreview && (
                        <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 relative"
                          style={{ border: '2px solid rgba(5,150,105,0.4)' }}>
                          <img src={profilePhotoPreview} alt="Foto" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                      )}
                      <label htmlFor="cv-done-photo" className="cursor-pointer px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                        style={{ background: 'rgba(0,119,181,0.12)', color: '#0077B5', border: '1px solid rgba(0,119,181,0.25)' }}>
                        {profilePhotoPreview ? 'Cambiar foto' : 'Cargar foto'}
                      </label>
                      <input id="cv-done-photo" type="file" accept="image/*" className="hidden" onChange={handleCvPhotoUpload} />
                      {profilePhotoPreview && (
                        <button onClick={() => { setProfilePhotoPreview(null); setProfilePhoto(null); setProfilePhotoMime('image/jpeg'); if (cvFinalData) setCvPreviewHtml(buildCvHtml(cvFinalData, null, 'image/jpeg', cvTemplate)) }}
                          className="text-xs transition-colors" style={{ color: '#94a3b8' }}>
                          ✕ Quitar
                        </button>
                      )}
                    </div>
                  </div>

                  {/* ── CV Editor ── */}
                  <div>
                    <button
                      onClick={() => setCvEditing(prev => !prev)}
                      className="w-full py-3 rounded-xl text-sm font-semibold transition-all"
                      style={{
                        background: cvEditing ? 'rgba(245,158,11,0.10)' : 'rgba(0,119,181,0.07)',
                        border: `1px solid ${cvEditing ? 'rgba(245,158,11,0.35)' : 'rgba(0,119,181,0.20)'}`,
                        color: cvEditing ? '#d97706' : '#0077B5',
                      }}
                    >
                      {cvEditing ? '✓ Cerrar editor' : '✏️ Editar CV'}
                    </button>

                    {cvEditing && cvFinalData && (
                      <div className="mt-3 rounded-2xl p-4 space-y-5"
                        style={{ background: 'rgba(254,252,232,0.6)', border: '1px solid rgba(245,158,11,0.25)' }}>

                        {/* Datos personales */}
                        <div className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#d97706' }}>Datos personales</p>
                          <input className="w-full px-3 py-2 rounded-lg text-sm border bg-white focus:outline-none"
                            style={{ borderColor: 'rgba(0,0,0,0.12)' }}
                            placeholder="Nombre completo"
                            value={cvFinalData.nombre || ''}
                            onChange={e => updateCv({ ...cvFinalData, nombre: e.target.value })}
                          />
                          <textarea className="w-full px-3 py-2 rounded-lg text-sm border bg-white resize-none focus:outline-none"
                            style={{ borderColor: 'rgba(0,0,0,0.12)' }}
                            placeholder="Titular / Rol profesional"
                            rows={2}
                            value={cvFinalData.titular || ''}
                            onChange={e => updateCv({ ...cvFinalData, titular: e.target.value })}
                          />
                          <textarea className="w-full px-3 py-2 rounded-lg text-sm border bg-white resize-none focus:outline-none"
                            style={{ borderColor: 'rgba(0,0,0,0.12)' }}
                            placeholder="Resumen profesional (2 oraciones máx.)"
                            rows={3}
                            value={cvFinalData.resumen || ''}
                            onChange={e => updateCv({ ...cvFinalData, resumen: e.target.value })}
                          />
                          <div className="grid grid-cols-2 gap-2">
                            {[
                              { field: 'email',    ph: 'Email' },
                              { field: 'telefono', ph: 'Teléfono' },
                              { field: 'linkedin', ph: 'URL LinkedIn' },
                              { field: 'ubicacion',ph: 'Ciudad / País' },
                            ].map(({ field, ph }) => (
                              <input key={field}
                                className="px-2 py-1.5 rounded-lg text-xs border bg-white focus:outline-none"
                                style={{ borderColor: 'rgba(0,0,0,0.12)' }}
                                placeholder={ph}
                                value={cvFinalData[field] || ''}
                                onChange={e => updateCv({ ...cvFinalData, [field]: e.target.value || null })}
                              />
                            ))}
                          </div>
                        </div>

                        {/* Experiencias */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#d97706' }}>Experiencia</p>
                            <button
                              onClick={() => updateCv({ ...cvFinalData, experiencias: [...(cvFinalData.experiencias || []), { cargo: '', empresa: '', periodo: '', logros: [''] }] })}
                              className="text-xs px-2 py-1 rounded-lg font-semibold"
                              style={{ background: 'rgba(245,158,11,0.12)', color: '#d97706', border: '1px solid rgba(245,158,11,0.3)' }}
                            >+ Agregar</button>
                          </div>
                          {(cvFinalData.experiencias || []).map((exp, i) => (
                            <div key={i} className="rounded-xl p-3 space-y-2 relative bg-white"
                              style={{ border: '1px solid rgba(0,0,0,0.08)' }}>
                              <button
                                onClick={() => updateCv({ ...cvFinalData, experiencias: cvFinalData.experiencias.filter((_, idx) => idx !== i) })}
                                className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center text-[10px]"
                                style={{ background: 'rgba(239,68,68,0.10)', color: '#ef4444' }}
                              >✕</button>
                              <div className="grid grid-cols-2 gap-2 pr-6">
                                <input className="px-2 py-1.5 rounded-lg text-xs border focus:outline-none"
                                  style={{ borderColor: 'rgba(0,0,0,0.12)' }}
                                  placeholder="Cargo"
                                  value={exp.cargo || ''}
                                  onChange={e => { const xs = cvFinalData.experiencias.map((x, xi) => xi === i ? { ...x, cargo: e.target.value } : x); updateCv({ ...cvFinalData, experiencias: xs }) }}
                                />
                                <input className="px-2 py-1.5 rounded-lg text-xs border focus:outline-none"
                                  style={{ borderColor: 'rgba(0,0,0,0.12)' }}
                                  placeholder="Empresa"
                                  value={exp.empresa || ''}
                                  onChange={e => { const xs = cvFinalData.experiencias.map((x, xi) => xi === i ? { ...x, empresa: e.target.value } : x); updateCv({ ...cvFinalData, experiencias: xs }) }}
                                />
                              </div>
                              <input className="w-full px-2 py-1.5 rounded-lg text-xs border focus:outline-none"
                                style={{ borderColor: 'rgba(0,0,0,0.12)' }}
                                placeholder="Período (ej: mar 2020 – dic 2023)"
                                value={exp.periodo || ''}
                                onChange={e => { const xs = cvFinalData.experiencias.map((x, xi) => xi === i ? { ...x, periodo: e.target.value } : x); updateCv({ ...cvFinalData, experiencias: xs }) }}
                              />
                              <div className="space-y-1.5">
                                <p className="text-[10px] text-slate-400 font-medium">Logros</p>
                                {(exp.logros || []).map((logro, j) => (
                                  <div key={j} className="flex gap-1.5 items-start">
                                    <textarea
                                      className="flex-1 px-2 py-1.5 rounded-lg text-xs border resize-none focus:outline-none"
                                      style={{ borderColor: 'rgba(0,0,0,0.12)' }}
                                      rows={2}
                                      placeholder="Describí un logro concreto..."
                                      value={logro}
                                      onChange={e => {
                                        const xs = cvFinalData.experiencias.map((x, xi) => {
                                          if (xi !== i) return x
                                          return { ...x, logros: x.logros.map((l, li) => li === j ? e.target.value : l) }
                                        })
                                        updateCv({ ...cvFinalData, experiencias: xs })
                                      }}
                                    />
                                    {(exp.logros || []).length > 1 && (
                                      <button
                                        onClick={() => {
                                          const xs = cvFinalData.experiencias.map((x, xi) => xi !== i ? x : { ...x, logros: x.logros.filter((_, li) => li !== j) })
                                          updateCv({ ...cvFinalData, experiencias: xs })
                                        }}
                                        className="mt-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0"
                                        style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444' }}
                                      >✕</button>
                                    )}
                                  </div>
                                ))}
                                <button
                                  onClick={() => {
                                    const xs = cvFinalData.experiencias.map((x, xi) => xi === i ? { ...x, logros: [...(x.logros || []), ''] } : x)
                                    updateCv({ ...cvFinalData, experiencias: xs })
                                  }}
                                  className="text-[10px] px-2 py-1 rounded font-semibold"
                                  style={{ background: 'rgba(0,119,181,0.08)', color: '#0077B5' }}
                                >+ logro</button>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Educación */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#d97706' }}>Educación</p>
                            <button
                              onClick={() => updateCv({ ...cvFinalData, educacion: [...(cvFinalData.educacion || []), { titulo: '', institucion: '', periodo: '' }] })}
                              className="text-xs px-2 py-1 rounded-lg font-semibold"
                              style={{ background: 'rgba(245,158,11,0.12)', color: '#d97706', border: '1px solid rgba(245,158,11,0.3)' }}
                            >+ Agregar</button>
                          </div>
                          {(cvFinalData.educacion || []).map((ed, i) => (
                            <div key={i} className="rounded-xl p-3 space-y-2 relative bg-white"
                              style={{ border: '1px solid rgba(0,0,0,0.08)' }}>
                              <button
                                onClick={() => updateCv({ ...cvFinalData, educacion: cvFinalData.educacion.filter((_, idx) => idx !== i) })}
                                className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center text-[10px]"
                                style={{ background: 'rgba(239,68,68,0.10)', color: '#ef4444' }}
                              >✕</button>
                              <input className="w-full px-2 py-1.5 rounded-lg text-xs border focus:outline-none pr-6"
                                style={{ borderColor: 'rgba(0,0,0,0.12)' }}
                                placeholder="Título / Carrera"
                                value={ed.titulo || ''}
                                onChange={e => { const xs = cvFinalData.educacion.map((x, xi) => xi === i ? { ...x, titulo: e.target.value } : x); updateCv({ ...cvFinalData, educacion: xs }) }}
                              />
                              <input className="w-full px-2 py-1.5 rounded-lg text-xs border focus:outline-none"
                                style={{ borderColor: 'rgba(0,0,0,0.12)' }}
                                placeholder="Institución"
                                value={ed.institucion || ''}
                                onChange={e => { const xs = cvFinalData.educacion.map((x, xi) => xi === i ? { ...x, institucion: e.target.value } : x); updateCv({ ...cvFinalData, educacion: xs }) }}
                              />
                              <input className="w-full px-2 py-1.5 rounded-lg text-xs border focus:outline-none"
                                style={{ borderColor: 'rgba(0,0,0,0.12)' }}
                                placeholder="Período (ej: 2014 – 2019)"
                                value={ed.periodo || ''}
                                onChange={e => { const xs = cvFinalData.educacion.map((x, xi) => xi === i ? { ...x, periodo: e.target.value } : x); updateCv({ ...cvFinalData, educacion: xs }) }}
                              />
                            </div>
                          ))}
                        </div>

                        {/* Habilidades */}
                        <div className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#d97706' }}>Habilidades</p>
                          <div className="flex flex-wrap gap-1.5 mb-1.5">
                            {(cvFinalData.habilidades || []).map((h, i) => (
                              <span key={i} className="flex items-center gap-1 text-xs px-2 py-1 rounded-full"
                                style={{ background: 'rgba(0,119,181,0.10)', color: '#0077B5', border: '1px solid rgba(0,119,181,0.25)' }}>
                                {h}
                                <button onClick={() => updateCv({ ...cvFinalData, habilidades: cvFinalData.habilidades.filter((_, idx) => idx !== i) })}
                                  style={{ color: '#94a3b8', fontSize: '9px', marginLeft: '2px', lineHeight: 1 }}>✕</button>
                              </span>
                            ))}
                          </div>
                          <TagInput placeholder="Nueva habilidad → Enter" onAdd={tag => updateCv({ ...cvFinalData, habilidades: [...(cvFinalData.habilidades || []), tag] })} />
                        </div>

                        {/* Idiomas */}
                        <div className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#d97706' }}>Idiomas</p>
                          <div className="flex flex-wrap gap-1.5 mb-1.5">
                            {(cvFinalData.idiomas || []).map((id, i) => (
                              <span key={i} className="flex items-center gap-1 text-xs px-2 py-1 rounded-full"
                                style={{ background: 'rgba(99,102,241,0.08)', color: '#6366f1', border: '1px solid rgba(99,102,241,0.25)' }}>
                                {id}
                                <button onClick={() => updateCv({ ...cvFinalData, idiomas: cvFinalData.idiomas.filter((_, idx) => idx !== i) })}
                                  style={{ color: '#94a3b8', fontSize: '9px', marginLeft: '2px', lineHeight: 1 }}>✕</button>
                              </span>
                            ))}
                          </div>
                          <TagInput placeholder="Nuevo idioma → Enter" onAdd={tag => updateCv({ ...cvFinalData, idiomas: [...(cvFinalData.idiomas || []), tag] })} />
                        </div>

                      </div>
                    )}
                  </div>

                  {/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ? (
                    <div className="rounded-xl p-3.5 text-xs text-center space-y-1.5"
                      style={{ background: 'rgba(0,119,181,0.05)', border: '1px solid rgba(0,119,181,0.14)' }}>
                      <p className="text-slate-700 font-medium">📸 Capturá una pantalla del CV que aparece abajo</p>
                      <p className="text-slate-400">Para descargarlo como PDF accedé desde una computadora</p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <button
                        onClick={saveCvDesktop}
                        className="w-full py-4 rounded-xl text-sm font-semibold text-white transition-all"
                        style={{ background: 'linear-gradient(135deg,#059669,#10b981)', boxShadow: '0 4px 12px rgba(5,150,105,0.25)' }}
                      >
                        📥 Guardar como PDF
                      </button>
                      <p className="text-center text-xs text-slate-400">Se abre el diálogo de impresión → destino: <strong>Guardar como PDF</strong></p>
                      {cvSuccess && <p className="text-xs text-center" style={{ color: '#059669' }}>✓ {cvSuccess}</p>}
                    </div>
                  )}
                  <button
                    onClick={() => { setJobCvForAdapter(cvFinalData); setJobPosting(''); setJobResult(null); setJobError(''); setShowJobModal(true); trackEvent('job_adapter_opened') }}
                    className="w-full py-3.5 rounded-xl text-sm font-semibold transition-all"
                    style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)', color: '#6366f1' }}
                  >
                    📝 Adaptar para un aviso de empleo →
                  </button>
                  <button
                    onClick={() => { setCvStage('idle'); setCvDraft(null); setCvFinalData(null); setCvQuality(null); setCvPreviewHtml('') }}
                    className="w-full py-2 rounded-xl text-xs text-slate-400 hover:text-slate-600 transition-all"
                    style={{ background: 'transparent' }}
                  >
                    Generar nuevo CV
                  </button>
                </div>
              )}

              {rateLimitEvento === 'cv' && <RateLimitUI secs={rateLimitSecs} evento={rateLimitEvento} email={waitlistEmail} onEmailChange={setWaitlistEmail} sent={waitlistSent} loading={waitlistLoading} onSubmit={handleWaitlist} />}
              {cvError && cvStage === 'idle' && !rateLimitEvento && <p className="text-xs text-red-500 text-center">{cvError}</p>}
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

            {/* ── LinkedIn Growth: banner + networking ── */}
            <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(0,119,181,0.20)' }}>
              <button
                className="w-full flex items-center justify-between px-5 py-4 text-left transition-all"
                style={{ background: showGrowthSection ? 'rgba(0,119,181,0.08)' : 'rgba(0,119,181,0.04)' }}
                onClick={() => setShowGrowthSection(v => !v)}
              >
                <div>
                  <p className="text-sm font-bold text-slate-800">🚀 Ideas de banner + plan de networking</p>
                  <p className="text-xs text-slate-500 mt-0.5">Diseños para tu portada y acciones concretas para crecer en LinkedIn</p>
                </div>
                <span className="text-slate-400 text-sm ml-3">{showGrowthSection ? '▲' : '▼'}</span>
              </button>

              {showGrowthSection && (
                <div className="px-5 pb-5 pt-3 space-y-4" style={{ background: 'white' }}>
                  {/* Input seguidores + CTA */}
                  {!linkedinGrowth && (
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <input
                          className="flex-1 px-3 py-2 rounded-xl text-sm border focus:outline-none"
                          style={{ borderColor: 'rgba(0,119,181,0.25)' }}
                          placeholder="¿Cuántos seguidores tenés? (opcional)"
                          value={seguidores}
                          onChange={e => setSeguidores(e.target.value)}
                          type="number"
                          min="0"
                        />
                        <button
                          onClick={callLinkedinGrowth}
                          disabled={growthLoading}
                          className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all"
                          style={{ background: growthLoading ? '#94a3b8' : 'linear-gradient(135deg,#0077B5,#0ea5e9)', minWidth: '90px' }}
                        >
                          {growthLoading ? <span className="flex items-center gap-1.5"><Spinner size={3} />Generando…</span> : 'Generar →'}
                        </button>
                      </div>
                      {growthError && <p className="text-xs text-red-500">{growthError}</p>}
                      <p className="text-xs text-slate-400">La IA analiza tu perfil y genera 3 ideas de banner personalizadas + un plan de acción semanal.</p>
                    </div>
                  )}

                  {linkedinGrowth && (
                    <div className="space-y-5">
                      {/* Banner ideas */}
                      {(linkedinGrowth.banner_ideas || []).length > 0 && (
                        <div className="space-y-3">
                          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#0077B5' }}>🖼 Ideas de banner</p>
                          {(linkedinGrowth.banner_ideas || []).map((idea, i) => (
                            <div key={i} className="rounded-xl p-4 space-y-2.5" style={{ border: '1px solid rgba(0,0,0,0.08)', background: '#fafafa' }}>
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-bold text-slate-800">{idea.titulo}</p>
                                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0"
                                  style={{ background: 'rgba(0,119,181,0.10)', color: '#0077B5' }}>{idea.estilo}</span>
                              </div>
                              {(idea.paleta || []).length > 0 && (
                                <div className="flex gap-1.5 items-center">
                                  {idea.paleta.map((color, ci) => (
                                    <div key={ci} className="w-6 h-6 rounded-full border-2 border-white shadow-sm" style={{ background: color }} title={color} />
                                  ))}
                                  <span className="text-[10px] text-slate-400 ml-1">{idea.paleta.join(' · ')}</span>
                                </div>
                              )}
                              <div className="rounded-lg p-3 space-y-1" style={{ background: (idea.paleta || [])[0] || '#0d2137', minHeight: '52px' }}>
                                <p className="font-bold leading-tight" style={{ color: (idea.paleta || [])[2] || 'white', fontSize: '13px' }}>{idea.copy_principal}</p>
                                {idea.copy_secundario && <p style={{ color: (idea.paleta || [])[2] ? (idea.paleta[2] + 'cc') : 'rgba(255,255,255,0.7)', fontSize: '10px' }}>{idea.copy_secundario}</p>}
                              </div>
                              <p className="text-xs text-slate-500 leading-snug">{idea.concepto}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Networking plan */}
                      {linkedinGrowth.plan_networking && (
                        <div className="space-y-3">
                          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#0077B5' }}>📅 Plan de networking (90 días)</p>
                          {linkedinGrowth.plan_networking.objetivo_resumido && (
                            <p className="text-sm text-slate-700 leading-relaxed italic">"{linkedinGrowth.plan_networking.objetivo_resumido}"</p>
                          )}
                          {(linkedinGrowth.plan_networking.acciones_semanales || []).length > 0 && (
                            <div className="space-y-2">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Acciones concretas</p>
                              {linkedinGrowth.plan_networking.acciones_semanales.map((a, i) => (
                                <div key={i} className="rounded-xl p-3 space-y-1" style={{ background: 'rgba(0,119,181,0.05)', border: '1px solid rgba(0,119,181,0.12)' }}>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: 'rgba(0,119,181,0.12)', color: '#0077B5' }}>{a.frecuencia}</span>
                                    <p className="text-xs font-semibold text-slate-700">{a.accion}</p>
                                  </div>
                                  {a.ejemplo && <p className="text-[11px] text-slate-500 pl-1 leading-snug">↳ {a.ejemplo}</p>}
                                </div>
                              ))}
                            </div>
                          )}
                          {(linkedinGrowth.plan_networking.contenido_sugerido || []).length > 0 && (
                            <div className="space-y-2">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Contenido a publicar</p>
                              {linkedinGrowth.plan_networking.contenido_sugerido.map((c, i) => (
                                <div key={i} className="flex items-start gap-2.5 py-1.5">
                                  <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold shrink-0" style={{ background: 'rgba(99,102,241,0.10)', color: '#6366f1' }}>{c.formato}</span>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs text-slate-700">{c.tema}</p>
                                    <p className="text-[10px] text-slate-400">{c.frecuencia}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          {linkedinGrowth.plan_networking.metrica_90dias && (
                            <div className="rounded-xl p-3" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)' }}>
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600 mb-1">🎯 Meta a 90 días</p>
                              <p className="text-sm text-slate-700">{linkedinGrowth.plan_networking.metrica_90dias}</p>
                            </div>
                          )}
                        </div>
                      )}

                      <button
                        onClick={() => { setLinkedinGrowth(null); setGrowthError('') }}
                        className="text-xs text-slate-400 underline underline-offset-2"
                      >Regenerar</button>
                    </div>
                  )}
                </div>
              )}
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

            {/* Premium banner */}
            {!user?.es_premium && (
              <div className="rounded-2xl p-4 space-y-2.5"
                style={{ background: 'rgba(0,119,181,0.04)', border: '1px solid rgba(0,119,181,0.15)' }}>
                <div>
                  <p className="text-slate-700 text-sm font-semibold">💾 ¿Querés guardar este resultado?</p>
                  <p className="text-slate-500 text-xs mt-0.5 leading-snug">
                    Podés seguir usando la app sin guardar nada. Si querés acceder a tu historial después, Premium incluye <strong>7 días gratis</strong> — luego $3.000/mes.
                  </p>
                </div>
                <button onClick={() => setShowPremiumModal(true)}
                  disabled={subscriptionLoading}
                  className="px-4 py-2 rounded-xl text-white text-xs font-semibold"
                  style={{ background: LI_GRADIENT, opacity: subscriptionLoading ? 0.7 : 1 }}>
                  {subscriptionLoading ? '...' : 'Probar 7 días gratis'}
                </button>
              </div>
            )}

            <button
              onClick={() => { trackEvent('click_simulador', { location: 'post_analisis' }); resetInterview(); setStep(STEPS.INTERVIEW_INTRO) }}
              className="btn-glow w-full font-semibold py-4 rounded-2xl text-white text-sm"
              style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
            >
              🎙️ Simulá una entrevista inicial →
            </button>

            <div className="flex gap-2">
              <button
                onClick={() => setStep(STEPS.MODE_SELECT)}
                className="flex-1 font-medium py-3.5 rounded-2xl text-sm transition-all"
                style={BTN_BACK_STYLE}
              >
                ← Menú
              </button>
              <button
                onClick={() => { trackEvent('click_analizar_otro', { location: 'post_analisis' }); reset() }}
                className="flex-[2] font-semibold py-3.5 rounded-2xl text-sm transition-all"
                style={BTN_BACK_STYLE}
              >
                ↺ Analizar otro perfil
              </button>
            </div>
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
                  style={{ background: 'white', border: '1px solid rgba(0,119,181,0.15)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
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
                onClick={() => result ? setStep(STEPS.RESULTS) : setStep(STEPS.MODE_SELECT)}
                className="w-full font-medium py-3 rounded-2xl text-sm transition-all"
                style={BTN_BACK_STYLE}
              >
                {result ? '← Volver a mis resultados' : '← Volver al menú'}
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
            ) : rateLimitEvento === 'entrevista' ? (
              <div className="space-y-4">
                <RateLimitUI secs={rateLimitSecs} evento={rateLimitEvento}
                  email={waitlistEmail} onEmailChange={setWaitlistEmail}
                  sent={waitlistSent} loading={waitlistLoading} onSubmit={handleWaitlist} />
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

                {/* Fortalezas / áreas — completo, sin restricción */}
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

                {/* Feedback detallado por respuesta — completo, visible */}
                {(interviewFeedback.feedback_por_respuesta || []).length > 0 && (
                  <ResultCard title="Feedback por respuesta" accent="#6366f1">
                    <div className="space-y-4">
                      {(interviewFeedback.feedback_por_respuesta || []).map((fb, i) => (
                        <div key={i} className="rounded-xl p-4"
                          style={{ background: '#f8fafc', border: '1px solid rgba(99,102,241,0.12)' }}>
                          <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#6366f1' }}>
                            Pregunta {fb.numero}
                          </p>
                          {fb.aspecto_positivo && (
                            <p className="text-sm text-slate-600 mb-1">✅ {fb.aspecto_positivo}</p>
                          )}
                          {fb.sugerencia && (
                            <p className="text-sm text-slate-600">💡 {fb.sugerencia}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </ResultCard>
                )}

                {/* Recomendación final */}
                {interviewFeedback.recomendacion_final && (
                  <div className="rounded-xl p-4"
                    style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.20)' }}>
                    <p className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: '#6366f1' }}>⚡ Recomendación final</p>
                    <p className="text-sm text-slate-700 leading-relaxed">{interviewFeedback.recomendacion_final}</p>
                  </div>
                )}

                {/* Contribución $5.000 — después del informe completo */}
                <div className="rounded-2xl overflow-hidden"
                  style={{ border: '1.5px solid rgba(0,180,150,0.30)', boxShadow: '0 4px 16px rgba(0,180,150,0.10)' }}>
                  <div className="px-5 pt-4 pb-3 text-center"
                    style={{ background: 'linear-gradient(135deg,rgba(0,180,150,0.10),rgba(0,212,170,0.06))' }}>
                    <p className="text-slate-800 font-bold text-base">☕ ¿Te fue útil el informe?</p>
                    <p className="text-slate-500 text-xs mt-1 leading-relaxed">
                      La app es 100% gratuita. Una colaboración de $5.000 ayuda a mantenerla disponible para todos.
                    </p>
                  </div>
                  <div className="px-5 py-4 bg-white space-y-3">
                    <a href={MP_URL} target="_blank" rel="noopener noreferrer"
                      onClick={() => trackEvent('click_externo', { destino: 'mercadopago', ubicacion: 'interview_feedback' })}
                      className="btn-glow w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-white text-sm font-semibold"
                      style={{ background: 'linear-gradient(135deg,#00b496,#00d4aa)' }}>
                      ☕ Colaborar con $5.000
                    </a>
                    <p className="text-slate-400 text-xs text-center">
                      Mercado Pago · Pago único · No es suscripción
                    </p>
                  </div>
                </div>

                {/* Seguir en LinkedIn — Ramiro + página */}
                <div className="rounded-2xl overflow-hidden"
                  style={{ border: '1px solid rgba(0,119,181,0.15)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
                  <div className="px-5 pt-4 pb-3 text-center"
                    style={{ background: 'linear-gradient(135deg,rgba(0,119,181,0.06),rgba(14,165,233,0.08))' }}>
                    <p className="text-slate-900 font-bold text-sm">Si este análisis te sirvió, seguinos</p>
                    <p className="text-slate-500 text-xs mt-1 leading-relaxed">Tips de empleabilidad y recursos para potenciar tu búsqueda.</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
                    <div className="p-4 flex flex-col gap-2.5 items-center text-center">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: LI_GRADIENT }}>
                        <LinkedInIcon className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <p className="text-slate-900 text-xs font-semibold">Perfil de Ramiro</p>
                        <p className="text-slate-500 text-xs mt-0.5 leading-relaxed">Mejoras concretas y casos reales de optimización.</p>
                      </div>
                      <a href={RAMIRO_LINKEDIN_URL} target="_blank" rel="noopener noreferrer"
                        onClick={() => trackEvent('click_externo', { destino: 'linkedin_ramiro', ubicacion: 'interview_feedback' })}
                        className="btn-glow w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-xl text-white text-xs font-semibold mt-auto"
                        style={{ background: LI_GRADIENT }}>
                        <LinkedInIcon className="w-3.5 h-3.5" /> Seguir a Ramiro
                      </a>
                    </div>
                    <div className="p-4 flex flex-col gap-2.5 items-center text-center">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: LI_GRADIENT }}>
                        <LinkedInIcon className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <p className="text-slate-900 text-xs font-semibold">Página OptimizaLK</p>
                        <p className="text-slate-500 text-xs mt-0.5 leading-relaxed">Guías y contenido sobre búsqueda de empleo.</p>
                      </div>
                      <a href={COMPANY_LINKEDIN_URL} target="_blank" rel="noopener noreferrer"
                        onClick={() => trackEvent('click_externo', { destino: 'linkedin_pagina', ubicacion: 'interview_feedback' })}
                        className="btn-glow w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-xl text-white text-xs font-semibold mt-auto"
                        style={{ background: LI_GRADIENT }}>
                        <LinkedInIcon className="w-3.5 h-3.5" /> Seguir la página
                      </a>
                    </div>
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
                    onClick={() => {
                      trackEvent('lead_modal_open', { ubicacion: 'interview_feedback' })
                      !leadSaving && !leadSent && setShowLeadModal(true)
                    }}
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

                {/* Premium banner */}
                {!user?.es_premium && (
                  <div className="rounded-2xl p-4 space-y-2.5"
                    style={{ background: 'rgba(0,119,181,0.04)', border: '1px solid rgba(0,119,181,0.15)' }}>
                    <div>
                      <p className="text-slate-700 text-sm font-semibold">💾 ¿Querés guardar esta entrevista?</p>
                      <p className="text-slate-500 text-xs mt-0.5 leading-snug">
                        Podés seguir usando la app sin guardar nada. Si querés acceder a tu historial después, Premium incluye <strong>7 días gratis</strong> — luego $3.000/mes.
                      </p>
                    </div>
                    <button onClick={() => setShowPremiumModal(true)}
                      disabled={subscriptionLoading}
                      className="px-4 py-2 rounded-xl text-white text-xs font-semibold"
                      style={{ background: LI_GRADIENT, opacity: subscriptionLoading ? 0.7 : 1 }}>
                      {subscriptionLoading ? '...' : 'Probar 7 días gratis'}
                    </button>
                  </div>
                )}

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
                  onClick={() => result ? setStep(STEPS.RESULTS) : setStep(STEPS.MODE_SELECT)}
                  className="w-full font-semibold py-4 rounded-2xl text-sm"
                  style={BTN_BACK_STYLE}
                >
                  {result ? '← Volver a mi análisis' : '← Volver al menú'}
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
                  style={{ background: 'white', border: '1px solid rgba(99,102,241,0.20)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
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
                <button onClick={() => { trackEvent('star_back', { from: 'theory' }); interviewFeedback ? setStep(STEPS.INTERVIEW_FEEDBACK) : setStep(STEPS.MODE_SELECT) }}
                  className="w-full py-3 rounded-2xl text-sm font-semibold" style={BTN_BACK_STYLE}>
                  {interviewFeedback ? '← Volver al feedback' : '← Menú'}
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
                    {rateLimitEvento === 'star' && <RateLimitUI secs={rateLimitSecs} evento={rateLimitEvento} email={waitlistEmail} onEmailChange={setWaitlistEmail} sent={waitlistSent} loading={waitlistLoading} onSubmit={handleWaitlist} />}
                    {starError && !rateLimitEvento && <p className="text-xs text-red-500">{starError}</p>}
                    <button
                      disabled={starAnswer.trim().length < 40 || starLoading}
                      onClick={() => { trackEvent('star_practice_submit', { question_idx: starQuestionIdx }); callStarFeedback() }}
                      className={`w-full py-4 rounded-2xl text-sm font-semibold text-white transition-all ${starAnswer.trim().length >= 40 && !starLoading ? 'btn-glow' : ''}`}
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
                      style={{ background: 'white', border: '1px solid rgba(99,102,241,0.15)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
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
                        className="btn-glow flex-1 py-3 rounded-xl text-sm font-semibold text-white"
                        style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
                      >
                        Nueva pregunta →
                      </button>
                    </div>
                  </div>
                )}

                {/* Seguir + contribución — solo se muestra cuando hay feedback */}
                {starFeedback && (
                  <>
                    {/* Follows */}
                    <div className="rounded-2xl overflow-hidden"
                      style={{ border: '1px solid rgba(0,119,181,0.15)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
                      <div className="px-5 pt-4 pb-3 text-center"
                        style={{ background: 'linear-gradient(135deg,rgba(0,119,181,0.06),rgba(14,165,233,0.08))' }}>
                        <p className="text-slate-900 font-bold text-sm">Si este análisis te sirvió, seguinos</p>
                        <p className="text-slate-500 text-xs mt-1 leading-relaxed">Tips de empleabilidad y recursos para potenciar tu búsqueda.</p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
                        <div className="p-4 flex flex-col gap-2.5 items-center text-center">
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                            style={{ background: LI_GRADIENT }}>
                            <LinkedInIcon className="w-4 h-4 text-white" />
                          </div>
                          <div>
                            <p className="text-slate-900 text-xs font-semibold">Perfil de Ramiro</p>
                            <p className="text-slate-500 text-xs mt-0.5 leading-relaxed">Mejoras concretas y casos reales de optimización.</p>
                          </div>
                          <a href={RAMIRO_LINKEDIN_URL} target="_blank" rel="noopener noreferrer"
                            onClick={() => trackEvent('click_externo', { destino: 'linkedin_ramiro', ubicacion: 'star_feedback' })}
                            className="btn-glow w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-xl text-white text-xs font-semibold mt-auto"
                            style={{ background: LI_GRADIENT }}>
                            <LinkedInIcon className="w-3.5 h-3.5" /> Seguir a Ramiro
                          </a>
                        </div>
                        <div className="p-4 flex flex-col gap-2.5 items-center text-center">
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                            style={{ background: LI_GRADIENT }}>
                            <LinkedInIcon className="w-4 h-4 text-white" />
                          </div>
                          <div>
                            <p className="text-slate-900 text-xs font-semibold">Página OptimizaLK</p>
                            <p className="text-slate-500 text-xs mt-0.5 leading-relaxed">Guías y contenido sobre búsqueda de empleo.</p>
                          </div>
                          <a href={COMPANY_LINKEDIN_URL} target="_blank" rel="noopener noreferrer"
                            onClick={() => trackEvent('click_externo', { destino: 'linkedin_pagina', ubicacion: 'star_feedback' })}
                            className="btn-glow w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-xl text-white text-xs font-semibold mt-auto"
                            style={{ background: LI_GRADIENT }}>
                            <LinkedInIcon className="w-3.5 h-3.5" /> Seguir la página
                          </a>
                        </div>
                      </div>
                    </div>

                    {/* Contribución $5.000 */}
                    <div className="flex items-center justify-between gap-3 px-5 py-3 rounded-2xl"
                      style={{ borderTop: '1px solid rgba(0,180,150,0.15)', background: 'rgba(0,180,150,0.03)', border: '1px solid rgba(0,180,150,0.15)' }}>
                      <p className="text-slate-500 text-xs leading-snug">
                        ☕ $5.000 únicos — el precio de un café para mantener esto gratis para todos.
                      </p>
                      <a href={MP_URL} target="_blank" rel="noopener noreferrer"
                        onClick={() => trackEvent('click_externo', { destino: 'mercadopago', ubicacion: 'star_feedback' })}
                        className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-xs font-semibold transition-all duration-200"
                        style={{ background: 'linear-gradient(135deg,#00b496,#00d4aa)' }}>
                        ☕ Apoyar · $5.000
                      </a>
                    </div>
                  </>
                )}

                <button onClick={() => { trackEvent('star_back', { from: 'practice' }); result ? setStep(STEPS.RESULTS) : setStep(STEPS.MODE_SELECT) }}
                  className="w-full py-3 rounded-2xl text-sm font-semibold" style={BTN_BACK_STYLE}>
                  {result ? '← Volver a mi análisis' : '← Volver al menú'}
                </button>
              </>
            )}
          </div>
        )}

        {/* ── TRACKING ── */}
        {step === STEPS.TRACKING && (
          <div className="step-transition w-full" style={{ minHeight: '70vh' }}>
            {!user?.es_premium ? (
              /* Non-premium teaser */
              <div className="text-center space-y-5 py-12 px-4">
                <div className="text-5xl">📍</div>
                <h2 className="text-xl font-bold" style={{ color: '#0d2137' }}>Seguimiento de Postulaciones</h2>
                <p className="text-sm max-w-xs mx-auto" style={{ color: '#475569' }}>
                  Organizá todas tus postulaciones en un tablero kanban. Vinculá el CV adaptado a cada oferta y nunca más pierdas el hilo de tu búsqueda laboral.
                </p>
                <button onClick={() => setShowPremiumModal(true)}
                  className="px-6 py-3 rounded-xl text-sm font-semibold text-white"
                  style={{ background: LI_GRADIENT }}>
                  ⬆ Activar Premium para acceder
                </button>
                <button onClick={() => setStep(STEPS.MODE_SELECT)}
                  className="block mx-auto text-xs mt-2" style={{ color: '#94a3b8' }}>
                  Volver al menú
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Header */}
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h2 className="text-lg font-bold" style={{ color: '#0d2137' }}>📍 Mis Postulaciones</h2>
                  <div className="flex gap-2">
                    <button onClick={() => setShowAddColumna(true)}
                      className="text-xs px-3 py-1.5 rounded-lg font-medium"
                      style={BTN_GHOST_STYLE}>
                      + Columna
                    </button>
                    <button onClick={() => setStep(STEPS.MODE_SELECT)}
                      className="text-xs px-3 py-1.5 rounded-lg font-medium"
                      style={BTN_BACK_STYLE}>
                      ← Menú
                    </button>
                  </div>
                </div>

                {trackingError && (
                  <p className="text-xs text-red-500 text-center">{trackingError}</p>
                )}

                {trackingLoading ? (
                  <div className="text-center py-10">
                    <div className="inline-block w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                    <p className="text-xs mt-2" style={{ color: '#64748b' }}>Cargando tablero...</p>
                  </div>
                ) : (
                  /* Kanban board — horizontal scroll */
                  <div className="overflow-x-auto pb-4">
                    <div className="flex gap-4" style={{ minWidth: `${Math.max(trackingColumnas.length, 1) * 260}px` }}>
                      {trackingColumnas.map(col => {
                        const cards = trackingCards.filter(c => c.columna_id === col.id)
                        return (
                          <div key={col.id} className="flex-shrink-0 rounded-xl flex flex-col" style={{ width: 248, background: '#f8fafc', border: '1px solid rgba(0,0,0,0.07)' }}>
                            {/* Column header */}
                            <div className="flex items-center justify-between px-3 py-2.5 rounded-t-xl"
                              style={{ background: col.color + '18', borderBottom: `2px solid ${col.color}` }}>
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: col.color }} />
                                <span className="text-xs font-bold truncate" style={{ color: '#0d2137' }}>{col.nombre}</span>
                                <span className="text-xs shrink-0" style={{ color: '#94a3b8' }}>({cards.length})</span>
                              </div>
                              <div className="flex gap-1 shrink-0">
                                <button onClick={() => setRenameColumna({ id: col.id, nombre: col.nombre, color: col.color })}
                                  className="text-xs px-1.5 py-0.5 rounded hover:bg-black/10 transition-colors"
                                  title="Renombrar">✏️</button>
                                <button onClick={async () => {
                                  if (confirm(`¿Eliminar la columna "${col.nombre}"? Las postulaciones sin columna quedarán sin asignar.`))
                                    await deleteColumna(col.id)
                                }}
                                  className="text-xs px-1.5 py-0.5 rounded hover:bg-red-100 transition-colors"
                                  title="Eliminar">🗑</button>
                              </div>
                            </div>
                            {/* Cards */}
                            <div className="flex flex-col gap-2 p-2 flex-1 overflow-y-auto" style={{ maxHeight: 480 }}>
                              {cards.map(card => (
                                <div key={card.id}
                                  onClick={() => setEditCard(card)}
                                  className="rounded-lg p-3 cursor-pointer hover:shadow-md transition-shadow space-y-1"
                                  style={{ background: 'white', border: '1px solid rgba(0,0,0,0.08)' }}>
                                  <p className="text-xs font-bold truncate" style={{ color: '#0d2137' }}>{card.empresa}</p>
                                  <p className="text-xs truncate" style={{ color: '#0077B5' }}>{card.puesto}</p>
                                  <p className="text-xs" style={{ color: '#94a3b8' }}>{card.fecha_aplicacion}</p>
                                  {card.cv_data && (
                                    <span className="inline-block text-xs px-1.5 py-0.5 rounded"
                                      style={{ background: 'rgba(0,119,181,0.08)', color: '#0077B5' }}>📄 CV</span>
                                  )}
                                  {card.notas && (
                                    <p className="text-xs line-clamp-2 italic" style={{ color: '#64748b' }}>{card.notas}</p>
                                  )}
                                </div>
                              ))}
                              <button onClick={() => { setNewCardForm({ empresa: '', puesto: '', link_aviso: '', fecha_aplicacion: new Date().toISOString().slice(0, 10), notas: '' }); setShowAddCard(col.id) }}
                                className="w-full py-2 rounded-lg text-xs font-medium text-center transition-colors hover:bg-slate-100"
                                style={{ border: '1px dashed rgba(0,0,0,0.15)', color: '#94a3b8' }}>
                                + Agregar postulación
                              </button>
                            </div>
                          </div>
                        )
                      })}

                      {trackingColumnas.length === 0 && (
                        <div className="flex-1 text-center py-10">
                          <p className="text-sm" style={{ color: '#94a3b8' }}>No hay columnas. Hacé clic en "+ Columna" para empezar.</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      </div>

      {/* ── Modal: Agregar columna ── */}
      {showAddColumna && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowAddColumna(false) }}>
          <div className="w-full max-w-xs rounded-2xl p-6 space-y-4"
            style={{ background: 'white', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h3 className="text-base font-bold" style={{ color: '#0d2137' }}>Nueva columna</h3>
            <div className="space-y-3">
              <input
                autoFocus
                placeholder="Nombre de la columna"
                value={newColumnaName}
                onChange={e => setNewColumnaName(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                style={INPUT_STYLE}
                maxLength={50}
                onKeyDown={e => e.key === 'Enter' && newColumnaName.trim() && createColumna(newColumnaName.trim(), newColumnaColor).then(() => { setShowAddColumna(false); setNewColumnaName(''); setNewColumnaColor('#64748b') }).catch(() => {})}
              />
              <div className="flex items-center gap-3">
                <label className="text-xs font-medium" style={{ color: '#475569' }}>Color:</label>
                <input type="color" value={newColumnaColor} onChange={e => setNewColumnaColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0" />
                <div className="flex gap-1.5 flex-wrap">
                  {['#64748b','#0077B5','#16a34a','#dc2626','#d97706','#7c3aed'].map(c => (
                    <button key={c} onClick={() => setNewColumnaColor(c)}
                      className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110"
                      style={{ background: c, borderColor: newColumnaColor === c ? '#0d2137' : 'transparent' }} />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowAddColumna(false)}
                className="flex-1 py-2 rounded-xl text-sm" style={BTN_BACK_STYLE}>Cancelar</button>
              <button
                disabled={!newColumnaName.trim()}
                onClick={() => createColumna(newColumnaName.trim(), newColumnaColor).then(() => { setShowAddColumna(false); setNewColumnaName(''); setNewColumnaColor('#64748b') }).catch(() => {})}
                className="flex-1 py-2 rounded-xl text-sm font-semibold text-white"
                style={{ background: newColumnaName.trim() ? LI_GRADIENT : 'rgba(0,0,0,0.2)' }}>
                Crear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Renombrar columna ── */}
      {renameColumna && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) setRenameColumna(null) }}>
          <div className="w-full max-w-xs rounded-2xl p-6 space-y-4"
            style={{ background: 'white', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h3 className="text-base font-bold" style={{ color: '#0d2137' }}>Editar columna</h3>
            <div className="space-y-3">
              <input
                autoFocus
                value={renameColumna.nombre}
                onChange={e => setRenameColumna(prev => ({ ...prev, nombre: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                style={INPUT_STYLE}
                maxLength={50}
              />
              <div className="flex items-center gap-3">
                <label className="text-xs font-medium" style={{ color: '#475569' }}>Color:</label>
                <input type="color" value={renameColumna.color} onChange={e => setRenameColumna(prev => ({ ...prev, color: e.target.value }))} className="w-8 h-8 rounded cursor-pointer border-0" />
                <div className="flex gap-1.5 flex-wrap">
                  {['#64748b','#0077B5','#16a34a','#dc2626','#d97706','#7c3aed'].map(c => (
                    <button key={c} onClick={() => setRenameColumna(prev => ({ ...prev, color: c }))}
                      className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110"
                      style={{ background: c, borderColor: renameColumna.color === c ? '#0d2137' : 'transparent' }} />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setRenameColumna(null)}
                className="flex-1 py-2 rounded-xl text-sm" style={BTN_BACK_STYLE}>Cancelar</button>
              <button
                disabled={!renameColumna.nombre.trim()}
                onClick={() => updateColumna(renameColumna.id, { nombre: renameColumna.nombre.trim(), color: renameColumna.color }).then(() => setRenameColumna(null)).catch(() => {})}
                className="flex-1 py-2 rounded-xl text-sm font-semibold text-white"
                style={{ background: renameColumna.nombre.trim() ? LI_GRADIENT : 'rgba(0,0,0,0.2)' }}>
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Agregar postulación ── */}
      {showAddCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 overflow-y-auto"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowAddCard(null) }}>
          <div className="w-full max-w-sm rounded-2xl p-6 space-y-4"
            style={{ background: 'white', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h3 className="text-base font-bold" style={{ color: '#0d2137' }}>Nueva postulación</h3>
            <div className="space-y-3">
              {[
                { label: 'Empresa *', key: 'empresa', type: 'text', placeholder: 'Ej: Mercado Libre', max: 100 },
                { label: 'Puesto *', key: 'puesto', type: 'text', placeholder: 'Ej: Product Manager', max: 100 },
                { label: 'Link del aviso', key: 'link_aviso', type: 'url', placeholder: 'https://...' },
                { label: 'Fecha de aplicación', key: 'fecha_aplicacion', type: 'date' },
              ].map(({ label, key, type, placeholder, max }) => (
                <div key={key}>
                  <label className="text-xs font-medium block mb-1" style={{ color: '#475569' }}>{label}</label>
                  <input
                    type={type}
                    value={newCardForm[key]}
                    onChange={e => setNewCardForm(prev => ({ ...prev, [key]: e.target.value }))}
                    placeholder={placeholder}
                    maxLength={max}
                    className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                    style={INPUT_STYLE}
                  />
                </div>
              ))}
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: '#475569' }}>Notas</label>
                <textarea
                  value={newCardForm.notas}
                  onChange={e => setNewCardForm(prev => ({ ...prev, notas: e.target.value }))}
                  placeholder="Requisitos, contacto, estado..."
                  rows={3}
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none resize-none"
                  style={INPUT_STYLE}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowAddCard(null)}
                className="flex-1 py-2 rounded-xl text-sm" style={BTN_BACK_STYLE}>Cancelar</button>
              <button
                disabled={!newCardForm.empresa.trim() || !newCardForm.puesto.trim()}
                onClick={() => {
                  if (!newCardForm.empresa.trim() || !newCardForm.puesto.trim()) return
                  createCard(showAddCard, newCardForm).then(() => setShowAddCard(null)).catch(() => {})
                }}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white"
                style={{ background: newCardForm.empresa.trim() && newCardForm.puesto.trim() ? LI_GRADIENT : 'rgba(0,0,0,0.2)' }}>
                Agregar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Editar postulación ── */}
      {editCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 overflow-y-auto"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) setEditCard(null) }}>
          <div className="w-full max-w-sm rounded-2xl p-6 space-y-4"
            style={{ background: 'white', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold" style={{ color: '#0d2137' }}>Editar postulación</h3>
              <button onClick={async () => {
                if (confirm(`¿Eliminar "${editCard.empresa} — ${editCard.puesto}"?`)) {
                  await deleteCard(editCard.id)
                  setEditCard(null)
                }
              }} className="text-xs px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
                style={{ color: '#dc2626', border: '1px solid rgba(220,38,38,0.2)' }}>
                🗑 Eliminar
              </button>
            </div>
            <div className="space-y-3">
              {[
                { label: 'Empresa *', key: 'empresa', type: 'text', max: 100 },
                { label: 'Puesto *', key: 'puesto', type: 'text', max: 100 },
                { label: 'Link del aviso', key: 'link_aviso', type: 'url' },
                { label: 'Fecha de aplicación', key: 'fecha_aplicacion', type: 'date' },
              ].map(({ label, key, type, max }) => (
                <div key={key}>
                  <label className="text-xs font-medium block mb-1" style={{ color: '#475569' }}>{label}</label>
                  <input
                    type={type}
                    value={editCard[key] || ''}
                    onChange={e => setEditCard(prev => ({ ...prev, [key]: e.target.value }))}
                    maxLength={max}
                    className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                    style={INPUT_STYLE}
                  />
                </div>
              ))}
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: '#475569' }}>Columna</label>
                <select
                  value={editCard.columna_id || ''}
                  onChange={e => setEditCard(prev => ({ ...prev, columna_id: e.target.value || null }))}
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                  style={INPUT_STYLE}>
                  <option value="">Sin columna</option>
                  {trackingColumnas.map(col => (
                    <option key={col.id} value={col.id}>{col.nombre}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: '#475569' }}>Notas</label>
                <textarea
                  value={editCard.notas || ''}
                  onChange={e => setEditCard(prev => ({ ...prev, notas: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none resize-none"
                  style={INPUT_STYLE}
                />
              </div>
              {/* CV link section */}
              <div className="rounded-xl p-3 space-y-2"
                style={{ background: 'rgba(0,119,181,0.05)', border: '1px solid rgba(0,119,181,0.12)' }}>
                <p className="text-xs font-semibold" style={{ color: '#0077B5' }}>📄 CV vinculado</p>
                {editCard.cv_data ? (
                  <div className="space-y-2">
                    <p className="text-xs" style={{ color: '#475569' }}>
                      CV de <strong>{editCard.cv_data.nombreCompleto || 'candidato'}</strong> vinculado
                    </p>
                    <button onClick={() => setEditCard(prev => ({ ...prev, cv_data: null }))}
                      className="text-xs px-2 py-1 rounded-lg"
                      style={{ color: '#dc2626', border: '1px solid rgba(220,38,38,0.2)' }}>
                      Desvincular CV
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="text-xs" style={{ color: '#94a3b8' }}>No hay CV vinculado a esta postulación.</p>
                    {cvFinalData && (
                      <button onClick={() => setEditCard(prev => ({ ...prev, cv_data: cvFinalData }))}
                        className="text-xs px-2 py-1 rounded-lg font-medium"
                        style={{ background: 'rgba(0,119,181,0.08)', color: '#0077B5', border: '1px solid rgba(0,119,181,0.2)' }}>
                        Vincular CV actual ({cvFinalData.nombreCompleto || 'sin nombre'})
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditCard(null)}
                className="flex-1 py-2 rounded-xl text-sm" style={BTN_BACK_STYLE}>Cancelar</button>
              <button
                disabled={!editCard.empresa?.trim() || !editCard.puesto?.trim()}
                onClick={async () => {
                  if (!editCard.empresa?.trim() || !editCard.puesto?.trim()) return
                  const { id, user_id, created_at, updated_at, ...patch } = editCard
                  await updateCard(id, patch).catch(() => {})
                  setEditCard(null)
                }}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white"
                style={{ background: editCard.empresa?.trim() && editCard.puesto?.trim() ? LI_GRADIENT : 'rgba(0,0,0,0.2)' }}>
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Preview CV — overlay unificado (mobile + desktop) ── */}
      {cvPreviewHtml && cvStage === 'done' && (
        <div className="cv-print-overlay fixed inset-0 z-50 flex flex-col" style={{ background: '#fff' }}>
          {/* Barra superior */}
          <div className="flex items-center justify-between px-4 py-3 shrink-0"
            style={{ background: 'linear-gradient(135deg,#0077B5,#0ea5e9)', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
            <div className="flex items-center gap-3">
              <p className="text-white text-sm font-semibold">📄 Tu CV listo</p>
              {cvQuality && (
                <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                  style={{ background: 'rgba(255,255,255,0.20)', color: 'white' }}>
                  {cvQuality.score}/10 · {cvQuality.nivel}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) && (
                <button
                  onClick={saveCvDesktop}
                  className="text-white text-xs px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5"
                  style={{ background: 'rgba(255,255,255,0.25)', border: '1px solid rgba(255,255,255,0.35)' }}>
                  📥 Guardar PDF
                </button>
              )}
              <button
                onClick={() => { setCvPreviewHtml('') }}
                className="text-white text-xs px-3 py-1.5 rounded-lg"
                style={{ background: 'rgba(255,255,255,0.15)' }}>
                ✕
              </button>
            </div>
          </div>
          {/* Instrucción contextual */}
          <div className="px-4 py-2 shrink-0 text-xs text-center"
            style={{ background: '#f0f7ff', borderBottom: '1px solid rgba(0,119,181,0.12)', color: '#64748b' }}>
            {/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
              ? <span>📸 Sacá una <strong>captura de pantalla</strong> del CV · Para PDF usá una computadora</span>
              : <span>Clic en <strong>Guardar PDF</strong> → en el diálogo de impresión elegí <em>Guardar como PDF</em></span>
            }
          </div>
          <iframe
            id="cv-preview-iframe"
            srcDoc={cvPreviewHtml}
            title="Vista previa de tu CV"
            className="flex-1 w-full border-0"
            sandbox="allow-same-origin allow-scripts allow-modals"
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
                <li>✓ Solo datos reales — sin métricas inventadas</li>
                <li>✓ Titular y resumen optimizados de tu análisis</li>
                <li>✓ Foto de perfil incluida si la subiste</li>
                <li>✓ Evaluación de calidad automática con preguntas de mejora</li>
                <li>✓ ATS-compatible · un clic para imprimir como PDF</li>
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
              {/* Foto para el CV */}
              <div>
                <label className="text-xs block mb-2" style={{ color: '#cbd5e1' }}>
                  Foto de perfil <span style={{ color: '#64748b', fontWeight: 400 }}>(opcional — aparece en el CV)</span>
                </label>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full overflow-hidden shrink-0 relative flex-shrink-0"
                    style={{ border: '2px solid rgba(0,119,181,0.4)', background: '#0d2137' }}>
                    {profilePhotoPreview
                      ? <img src={profilePhotoPreview} alt="Foto" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span className="text-xl absolute inset-0 flex items-center justify-center">👤</span>
                    }
                  </div>
                  <label htmlFor="cv-modal-photo" className="cursor-pointer px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                    style={{ background: 'rgba(0,119,181,0.15)', color: '#60a5fa', border: '1px solid rgba(0,119,181,0.3)' }}>
                    {profilePhotoPreview ? 'Cambiar foto' : 'Subir foto'}
                  </label>
                  <input id="cv-modal-photo" type="file" accept="image/*" className="hidden" onChange={handleCvPhotoUpload} />
                  {profilePhotoPreview && (
                    <button onClick={() => { setProfilePhotoPreview(null); setProfilePhoto(null); setProfilePhotoMime('image/jpeg') }}
                      className="text-xs transition-colors" style={{ color: '#64748b' }}>
                      ✕ Quitar
                    </button>
                  )}
                </div>
                {!profilePhotoPreview && (
                  <p className="text-xs mt-1.5" style={{ color: '#475569' }}>
                    Sin foto el CV se genera igualmente, pero con foto tiene más impacto.
                  </p>
                )}
              </div>

              <p className="text-xs leading-relaxed pt-1" style={{ color: '#475569' }}>
                🔒 Tus datos se usan solo para confeccionar el CV y no se comparten con terceros.
              </p>
              <button
                onClick={() => {
                  if (!contactEmail.trim()) return
                  const contacto = { email: contactEmail.trim(), telefono: contactTelefono.trim(), linkedinUrl: contactLinkedin.trim() }
                  setPendingWithSupport(false)
                  setShowCvModal(false)
                  callGenerateCvPreQuestions(contacto)
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
                Crear mi CV →
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

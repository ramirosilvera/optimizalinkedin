export const WORKER_URL = import.meta.env.VITE_WORKER_URL
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
export const APP_TOKEN = import.meta.env.VITE_APP_TOKEN || ''

export const EMAILJS_SERVICE_ID       = import.meta.env.VITE_EMAILJS_SERVICE_ID        || ''
export const EMAILJS_PUBLIC_KEY       = import.meta.env.VITE_EMAILJS_PUBLIC_KEY        || ''
export const EMAILJS_TEMPLATE_WELCOME = import.meta.env.VITE_EMAILJS_TEMPLATE_WELCOME  || ''
export const EMAILJS_TEMPLATE_CANCEL  = import.meta.env.VITE_EMAILJS_TEMPLATE_CANCEL   || ''

export const WORKER_HEADERS = Object.freeze({
  'Content-Type': 'application/json',
  ...(APP_TOKEN ? { 'X-App-Token': APP_TOKEN } : {}),
})

export const sendEmail = (templateId, params) => {
  if (!EMAILJS_SERVICE_ID || !EMAILJS_PUBLIC_KEY || !templateId) return
  fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ service_id: EMAILJS_SERVICE_ID, template_id: templateId, user_id: EMAILJS_PUBLIC_KEY, template_params: params }),
  }).catch(() => {})
}

export function parseGeminiError(status, body) {
  if (status === 400) return 'API key inválida o solicitud incorrecta. Revisá la key ingresada.'
  if (status === 403) return 'API key sin permisos. Verificá que esté habilitada en Google AI Studio.'
  return `Error HTTP ${status}: ${body?.error?.message || 'Error desconocido'}`
}

export function makeRateLimitError() {
  return Object.assign(new Error('RATE_LIMIT'), { isRateLimit: true })
}

// ── Analytics context compartido — se enriquece automáticamente en cada evento ──
let _analyticsCtx = {}
export const setAnalyticsContext = (ctx) => { _analyticsCtx = { ..._analyticsCtx, ...ctx } }

export const trackEvent = (name, params = {}) => {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return
  window.gtag('event', name, {
    device_type: window.innerWidth < 768 ? 'mobile' : 'desktop',
    ..._analyticsCtx,
    ...params,
  })
}

// Error tracking — rellena el mayor punto ciego (catch silenciosos)
export const trackError = (feature, error_type, extra = {}) =>
  trackEvent('app_error', { feature, error_type, ...extra })

// Timing helper — agrega duration_ms automáticamente
export const trackTiming = (name, startMs, params = {}) =>
  trackEvent(name, { duration_ms: Math.round(Date.now() - startMs), ...params })

// Sincroniza contexto GA4 con el usuario autenticado
export const setGaUser = (user) => {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return
  const user_type = !user ? 'anonymous' : user.es_premium ? 'premium' : 'free'
  setAnalyticsContext({ user_type })
  window.gtag('set', 'user_properties', { user_type, is_premium: String(!!user?.es_premium) })
  if (user?.id) window.gtag('set', { user_id: user.id })
}

export const STEPS = {
  WELCOME: 0, QUESTIONS: 1, PROFILE_INPUT: 2, LOADING: 3, RESULTS: 4,
  INTERVIEW_INTRO: 5, INTERVIEW: 6, INTERVIEW_FEEDBACK: 7, STAR_TRAINING: 8,
  MODE_SELECT: 9, TRACKING: 10, CV: 11,
}

export const LI_GRADIENT   = 'linear-gradient(135deg,#0077B5,#0ea5e9)'
export const CARD_STYLE     = { background: 'white', border: '1px solid rgba(0,119,181,0.12)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }
export const INPUT_STYLE    = { background: 'white', border: '1px solid rgba(0,119,181,0.20)', color: '#0d2137' }
export const INPUT_ALT_STYLE = { background: '#f8fafc', border: '1px solid rgba(0,119,181,0.15)', color: '#0d2137' }
export const BTN_BACK_STYLE = { border: '1px solid rgba(0,119,181,0.15)', color: '#3d5a73', background: '#f0f4f8' }
export const BTN_GHOST_STYLE = { color: '#0077B5', background: 'rgba(0,119,181,0.08)', border: '1px solid rgba(0,119,181,0.2)' }

export const RAMIRO_LINKEDIN_URL  = 'https://www.linkedin.com/in/ramiro-silvera-b0819459'
export const COMPANY_LINKEDIN_URL = 'https://www.linkedin.com/company/optimiza-lk/'
export const MP_URL               = 'https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_plan_id=8aad681a5695404b962fcae2918079fe'
export const MAX_PDF_SIZE = 15 * 1024 * 1024

import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react'
import './index.css'

import {
  WORKER_URL, SUPABASE_URL, SUPABASE_KEY, WORKER_HEADERS,
  EMAILJS_TEMPLATE_WELCOME, EMAILJS_TEMPLATE_CANCEL,
  sendEmail, parseGeminiError, makeRateLimitError,
  trackEvent, trackError, trackTiming, setGaUser,
  STEPS, LI_GRADIENT, CARD_STYLE, INPUT_STYLE, INPUT_ALT_STYLE,
  BTN_BACK_STYLE, BTN_GHOST_STYLE, RAMIRO_LINKEDIN_URL,
  COMPANY_LINKEDIN_URL, MAX_PDF_SIZE,
} from './constants'
import {
  STATIC_QUESTIONS, INTERVIEW_QUESTIONS, INTERVIEW_QUESTIONS_BY_INDUSTRY, STAR_QUESTIONS,
  LOADING_MESSAGES_BY_SITUACION, LOADING_MESSAGES_DEFAULT,
} from './data'
import { AI_DEFAULTS, extractAIText, parseAIJson } from './utils/ai'
import { compressImage } from './utils/image'
import { buildCvHtml, sanitizeCv } from './cv/templates'
import RateLimitUI from './components/RateLimitUI'
import {
  LinkedInIcon, Logo, Spinner, OptionButton, CopyButton,
  TagInput, ScoreRing, ResultCard, BeforeAfter, ToastContainer,
} from './components/ui'
import CommentsSection from './components/CommentsSection'
import { useTracking } from './hooks/useTracking'
import WelcomeScreen from './components/screens/WelcomeScreen'
import ModeSelectScreen from './components/screens/ModeSelectScreen'

// Lazy-loaded screens (not needed on first render)
const AdminPanel             = lazy(() => import('./admin/AdminPanel'))
const QuestionnaireScreen    = lazy(() => import('./components/screens/QuestionnaireScreen'))
const LoadingScreen          = lazy(() => import('./components/screens/LoadingScreen'))
const ProfileInputScreen     = lazy(() => import('./components/screens/ProfileInputScreen'))
const ResultsScreen          = lazy(() => import('./components/screens/ResultsScreen'))
const OnboardingScreen       = lazy(() => import('./components/screens/OnboardingScreen'))
const CvScreen               = lazy(() => import('./components/screens/CvScreen'))
const InterviewIntroScreen   = lazy(() => import('./components/screens/InterviewIntroScreen'))
const InterviewScreen        = lazy(() => import('./components/screens/InterviewScreen'))
const InterviewFeedbackScreen= lazy(() => import('./components/screens/InterviewFeedbackScreen'))
const StarTrainingScreen     = lazy(() => import('./components/screens/StarTrainingScreen'))
const TrackingScreen         = lazy(() => import('./components/screens/TrackingScreen'))
const ReporteScreen          = lazy(() => import('./components/screens/ReporteScreen'))

// Lazy-loaded modals
const ScoreShareModal        = lazy(() => import('./components/modals/ScoreShareModal'))
const AuthModal              = lazy(() => import('./components/modals/AuthModal'))
const PremiumModal           = lazy(() => import('./components/modals/PremiumModal'))
const ManageSubscriptionModal= lazy(() => import('./components/modals/ManageSubscriptionModal'))
const HistorialDrawer        = lazy(() => import('./components/modals/HistorialDrawer'))
const PostPaymentModal       = lazy(() => import('./components/modals/PostPaymentModal'))
const JobAdapterModal        = lazy(() => import('./components/modals/JobAdapterModal'))
const StarModal              = lazy(() => import('./components/modals/StarModal'))
const CvModal                = lazy(() => import('./components/modals/CvModal'))
const LeadModal              = lazy(() => import('./components/modals/LeadModal'))

// ── Main App ───────────────────────────────────────────────────

export default function App() {
  const [step, setStep] = useState(STEPS.WELCOME)

  // Cuestionario estático
  const [qaHistory, setQaHistory] = useState([])
  const [currentQ, setCurrentQ] = useState(STATIC_QUESTIONS[0])
  const [selectedOption, setSelectedOption] = useState(null)
  const [textAnswer, setTextAnswer] = useState('')
  const [fastTrack, setFastTrack] = useState(false)

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
  const [inputMode, setInputMode] = useState('pdf') // 'pdf' | 'form' | 'sinperfil'
  const [linkedinUrl, setLinkedinUrl] = useState('')
  const [urlLoading, setUrlLoading] = useState(false)
  const [urlAttempted, setUrlAttempted] = useState(false)
  const [profilePhoto, setProfilePhoto] = useState(null)
  const [profilePhotoMime, setProfilePhotoMime] = useState('image/jpeg')
  const [profilePhotoPreview, setProfilePhotoPreview] = useState(null)
  const [profilePhotoId, setProfilePhotoId] = useState(null)
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
  const [dynamicInterviewQs, setDynamicInterviewQs] = useState(null)
  const [interviewQsLoading, setInterviewQsLoading] = useState(false)
  const [interviewJobContext, setInterviewJobContext] = useState(null) // { empresa, puesto } from Kanban
  const [kanbanListMode, setKanbanListMode] = useState(false)

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

  // CV de 1 página
  const [cvLoading, setCvLoading] = useState(false)
  const [cvError, setCvError] = useState('')
  const [cvSuccess, setCvSuccess] = useState('')

  const [cvPreviewHtml, setCvPreviewHtml] = useState('')
  const [showCvPreview, setShowCvPreview] = useState(false)
  const [cvVariant, setCvVariant] = useState(null) // null=base | 'optimizado' | { empresa, cargo }
  const [cvExportState, setCvExportState] = useState('idle') // 'idle' | 'loading'
  const [toasts, setToasts] = useState([])
  const toastIdRef = useRef(0)
  const lastSavedCvHashRef = useRef(null)  // guards duplicate historial saves
  const starSessionRef = useRef([])        // accumulates STAR answers for session-level save
  // Refs to latest photo state — lets event handlers (restoreFromHistorial, etc.) always
  // read the current photo without relying on closure capture timing.
  const profilePhotoRef = useRef(null)
  const profilePhotoMimeRef = useRef('image/jpeg')
  profilePhotoRef.current = profilePhoto
  profilePhotoMimeRef.current = profilePhotoMime
  const [cvOptimizing, setCvOptimizing] = useState(false)
  const [cvOptimizeError, setCvOptimizeError] = useState('')
  const [cvOptimizeSuggestion, setCvOptimizeSuggestion] = useState(null)
  const [showCvOptimizePanel, setShowCvOptimizePanel] = useState(false)
  const [cvBeforeOptimize, setCvBeforeOptimize] = useState(null)
  const [cvOptimizeApplied, setCvOptimizeApplied] = useState(false)
  const [showCvModal, setShowCvModal] = useState(false)
  const [cvOptimizePhase, setCvOptimizePhase] = useState('idle') // 'idle'|'loading_q'|'questions'|'optimizing'
  const [cvOptimizeQuestions, setCvOptimizeQuestions] = useState([])
  const [cvOptimizeAnswers, setCvOptimizeAnswers] = useState({})
  const [linkedinProfileId, setLinkedinProfileId] = useState(null)
  const [contactEmail, setContactEmail] = useState('')
  const [contactTelefono, setContactTelefono] = useState('')
  const [contactLinkedin, setContactLinkedin] = useState('')

  // CV iterativo — pipeline de calidad y gaps
  const [cvDraft, setCvDraft] = useState(null)
  const [cvQuality, setCvQuality] = useState(null)
  const [cvGapAnswers, setCvGapAnswers] = useState({})
  const [cvStage, setCvStage] = useState('idle') // 'idle'|'drafting'|'gap_form'|'regenerating'|'done'
  const [cvTemplate, setCvTemplate] = useState('clasico')
  const [cvEditing, setCvEditing] = useState(false)
  const [linkedinGrowth, setLinkedinGrowth] = useState(null)
  const [growthLoading, setGrowthLoading] = useState(false)
  const [growthError, setGrowthError] = useState('')
  const [seguidores, setSeguidores] = useState('')
  const [showGrowthSection, setShowGrowthSection] = useState(false)
  const [cvFinalData, setCvFinalData] = useState(null)
  const [cvContacto, setCvContacto] = useState(null)

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
  const [isAdmin, setIsAdmin] = useState(false)
  const [showAdminPanel, setShowAdminPanel] = useState(false)
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
  const [showScoreShare, setShowScoreShare] = useState(false)
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
  const {
    trackingColumnas, setTrackingColumnas,
    trackingCards, setTrackingCards,
    trackingLoading, setTrackingLoading,
    showAddCard, setShowAddCard,
    newCardForm, setNewCardForm,
    editCard, setEditCard,
    showAddColumna, setShowAddColumna,
    newColumnaName, setNewColumnaName,
    newColumnaColor, setNewColumnaColor,
    renameColumna, setRenameColumna,
    trackingError, setTrackingError,
    loadTracking, createCard, updateCard, deleteCard,
    createColumna, updateColumna, deleteColumna, moveCard,
  } = useTracking()

  // Job adapter + cover letter
  const [showJobModal, setShowJobModal] = useState(false)
  const [jobPosting, setJobPosting] = useState('')
  const [jobResult, setJobResult] = useState(null)
  const [jobLoading, setJobLoading] = useState(false)
  const [jobError, setJobError] = useState('')
  const [jobCvForAdapter, setJobCvForAdapter] = useState(null)
  const [jobAdapterNoCv, setJobAdapterNoCv] = useState(false)
  const [jobAdapterCheckLoading, setJobAdapterCheckLoading] = useState(false)
  const [jobSaveLoading, setJobSaveLoading] = useState(false)
  const [jobSaved, setJobSaved] = useState(false)
  const [jobSaveError, setJobSaveError] = useState('')
  const [jobSavedCardId, setJobSavedCardId] = useState(null)

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
    setIsAdmin(false)
    setShowAdminPanel(false)
  }

  const checkAdminStatus = async (token) => {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_my_admin_role`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      })
      if (!res.ok) { setIsAdmin(false); return }
      const role = await res.json()
      setIsAdmin(typeof role === 'string' && role.length > 0)
    } catch {
      setIsAdmin(false)
    }
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
      checkAdminStatus(data.access_token)
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

  // ── LinkedIn Profile persistence ──────────────────────────────────────────

  const getOrCreateSessionKey = () => {
    let key = localStorage.getItem('ol_session_key')
    if (!key) {
      key = crypto.randomUUID()
      localStorage.setItem('ol_session_key', key)
    }
    return key
  }

  const saveLinkedinProfile = async (structured) => {
    const sessionKey = getOrCreateSessionKey()

    // Always persist to localStorage for instant restore on refresh
    const snapshot = {
      ...structured,
      session_key: sessionKey,
      savedAt: Date.now(),
    }
    localStorage.setItem('ol_profile_v1', JSON.stringify(snapshot))

    // For logged-in users: also persist to Supabase
    const token = localStorage.getItem('ol_at')
    const uid   = localStorage.getItem('ol_uid')
    if (!SUPABASE_URL || !SUPABASE_KEY || !token || !uid) return

    try {
      const row = {
        session_key:  sessionKey,
        user_id:      uid,
        nombre:       structured.nombre       || null,
        headline:     structured.headline     || null,
        location:     structured.location     || null,
        email:        structured.email        || null,
        linkedin_url: structured.linkedin_url || null,
        about:        structured.about        || null,
        experiencias: structured.experiencias || [],
        educacion:    structured.educacion    || [],
        habilidades:  structured.habilidades  || [],
        idiomas:      structured.idiomas      || [],
        certificaciones: structured.certificaciones || [],
        profile_text: structured.profile_text || null,
        fuente:       structured.fuente       || 'manual',
        synced_at:    new Date().toISOString(),
      }
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/linkedin_profiles?session_key=eq.${sessionKey}`,
        {
          method: 'POST',
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates,return=representation',
          },
          body: JSON.stringify(row),
        }
      )
      if (res.ok) {
        const saved = await res.json().catch(() => [])
        const id = (Array.isArray(saved) ? saved[0] : saved)?.id
        if (id) setLinkedinProfileId(id)
      }
    } catch { /* silencioso — localStorage ya tiene el dato */ }
  }

  const loadLinkedinProfile = async () => {
    // 1. Try localStorage first (fast, works for anon)
    try {
      const raw = localStorage.getItem('ol_profile_v1')
      if (raw) {
        const saved = JSON.parse(raw)
        // Restore form state from saved profile (if still fresh — 30 days)
        const ageMs = Date.now() - (saved.savedAt || 0)
        if (ageMs < 30 * 24 * 60 * 60 * 1000) {
          if (saved.headline)         setFormTitular(saved.headline)
          if (saved.about)            setFormResumen(saved.about)
          if (saved.habilidades?.length > 0)
            setFormHabilidades(Array.isArray(saved.habilidades) ? saved.habilidades.join(', ') : saved.habilidades)
          if (saved.experiencias?.length > 0)
            setFormExperiencias(saved.experiencias.map(e => ({
              cargo: e.cargo || e.title || '',
              empresa: e.empresa || e.companyName || '',
              periodo: e.periodo || (e.startYear ? `${e.startYear}–${e.endYear || 'presente'}` : ''),
              descripcion: e.descripcion || e.description || '',
            })))
          if (saved.educacion?.length > 0)
            setFormEducacion(saved.educacion.map(e => ({
              institucion: e.institucion || e.schoolName || '',
              titulo: e.titulo || e.degreeName || '',
              periodo: e.periodo || (e.startYear ? `${e.startYear}–${e.endYear || ''}` : ''),
            })))
          if (saved.profile_text) {
            setProfileText(saved.profile_text)
            setFormConfirmed(true)
          }
        }
      }
    } catch { /* silencioso */ }

    // 2. For logged-in users: also try Supabase (may have richer/newer data)
    const token = localStorage.getItem('ol_at')
    const uid   = localStorage.getItem('ol_uid')
    if (!SUPABASE_URL || !SUPABASE_KEY || !token || !uid) return
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/linkedin_profiles?user_id=eq.${uid}&order=synced_at.desc&limit=1`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` } }
      )
      if (!res.ok) return
      const rows = await res.json().catch(() => [])
      const p = rows?.[0]
      if (!p) return
      setLinkedinProfileId(p.id)
      // Supabase has richer/newer data — restore form state
      if (p.headline)         setFormTitular(p.headline)
      if (p.about)            setFormResumen(p.about)
      if (p.habilidades?.length > 0)
        setFormHabilidades(Array.isArray(p.habilidades) ? p.habilidades.join(', ') : p.habilidades)
      if (p.experiencias?.length > 0)
        setFormExperiencias(p.experiencias.map(e => ({
          cargo: e.cargo || '', empresa: e.empresa || '',
          periodo: e.periodo || '', descripcion: e.descripcion || '',
        })))
      if (p.educacion?.length > 0)
        setFormEducacion(p.educacion.map(e => ({
          institucion: e.institucion || '', titulo: e.titulo || '', periodo: e.periodo || '',
        })))
      if (p.profile_text) {
        setProfileText(p.profile_text)
        setFormConfirmed(true)
      }
    } catch { /* silencioso */ }
  }

  const saveToHistorial = async (tipo, datos, titulo = '', puntaje = null) => {
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
        body: JSON.stringify({ user_id: uid, tipo, titulo, datos, puntaje }),
      })
    } catch { /* silencioso */ }
  }

  // Saves a CV version only if content changed since last save (prevents export duplicates)
  const saveCvToHistorial = (cv, titulo) => {
    const hash = cv ? JSON.stringify(cv).slice(0, 400) : null
    if (!hash || hash === lastSavedCvHashRef.current) return
    lastSavedCvHashRef.current = hash
    saveToHistorial('cv', cv, titulo, null)
  }

  const addToast = (msg, type = 'success', duration = 4000) => {
    const id = ++toastIdRef.current
    setToasts(prev => [...prev, { id, msg, type }])
    if (duration > 0) setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration)
    return id
  }

  const dismissToast = (id) => setToasts(prev => prev.filter(t => t.id !== id))

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
        // init_point de MP es una Universal Link (iOS) / App Link (Android).
        // Usar window.location.href directamente — la app MP intercepta la URL
        // con el preapproval_id completo y navega al checkout correcto.
        // El scheme mercadopago:// NO funciona: abre el home de la app sin contexto.
        addToast('Redirigiendo a Mercado Pago…', 'loading', 0)
        window.location.href = data.init_point
      } else {
        addToast(data.error || 'No se pudo iniciar el pago. Intentá de nuevo.', 'error')
      }
    } catch (err) {
      addToast('Error de conexión. Revisá tu internet e intentá de nuevo.', 'error')
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
        const latestAnalisis = historial.find(i => i.tipo === 'analisis')
        if (latestAnalisis) setResult(latestAnalisis.datos)
        else setResult(null)
        setCvFinalData(item.datos)
        setCvDraft(item.datos)
        // Use refs (always-current) so photo is never stale even if closure timing is off.
        // The reactive useEffect will also re-run when cvFinalData/profilePhoto settle.
        setCvPreviewHtml(buildCvHtml(item.datos, profilePhotoRef.current, profilePhotoMimeRef.current, cvTemplate || 'clasico'))
        setCvStage('done')
        setShowCvPreview(true)
        setStep(STEPS.CV)
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
    const cvText = JSON.stringify(jobCvForAdapter, (k, v) => (v === null || v === '' || (Array.isArray(v) && v.length === 0)) ? undefined : v)
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
      const parsed = parseAIJson(extractAIText(data), AI_DEFAULTS.job_adapter, 'No se pudo procesar la respuesta. Intentá de nuevo.')
      setJobResult(parsed)
      trackEvent('job_adapter_generated')
    } catch (err) {
      setJobError(err.name === 'AbortError' ? 'El pedido tardó demasiado. Intentá de nuevo.' : err.message || 'Error al generar. Intentá de nuevo.')
    } finally {
      clearTimeout(timeoutId)
      setJobLoading(false)
    }
  }

  const saveAdaptedCvAsPostulacion = async (empresa, puesto) => {
    if (!jobResult || jobSaveLoading) return
    if (!user) { setShowAuthModal(true); return }
    setJobSaveLoading(true)
    setJobSaveError('')
    try {
      let cols = trackingColumnas
      if (!cols || cols.length === 0) {
        const uid = localStorage.getItem('ol_uid')
        const at = localStorage.getItem('ol_at')
        const colRes = await fetch(`${SUPABASE_URL}/rest/v1/kanban_columnas?user_id=eq.${uid}&order=orden.asc`, {
          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' },
        })
        cols = await colRes.json().catch(() => [])
      }
      const primeraColumna = Array.isArray(cols) && cols.length > 0 ? cols[0] : null
      if (!primeraColumna) throw new Error('Primero abrí el tablero para inicializar las columnas')
      const card = await createCard(primeraColumna.id, {
        empresa: empresa || jobResult.empresa_detectada || '',
        puesto:  puesto  || jobResult.cargo_detectado  || '',
        fecha_aplicacion: new Date().toISOString().slice(0, 10),
        cv_data:          jobResult.cv_adaptado || null,
        job_description:  jobPosting || null,
        cover_letter:     jobResult.carta_de_presentacion || null,
        ats_keywords:     jobResult.palabras_clave_incorporadas?.join(', ') || null,
        seniority:        jobResult.seniority_detectado || null,
        adaptation_notes: jobResult.ajustes_principales?.join('\n') || null,
      })
      setJobSaved(true)
      setJobSavedCardId(card?.id || null)
      trackEvent('job_adapter_saved_to_kanban')
    } catch (err) {
      setJobSaveError(err.message || 'Error al guardar. Intentá de nuevo.')
    } finally {
      setJobSaveLoading(false)
    }
  }

  const applyCoupon = async () => {
    const emailToUse = user?.email || couponEmail.trim()
    if (!couponCode.trim() || !emailToUse) return
    setCouponLoading(true)
    setCouponError('')
    try {
      const token = localStorage.getItem('ol_at')
      const headers = token
        ? { ...WORKER_HEADERS, Authorization: `Bearer ${token}` }
        : WORKER_HEADERS
      const res = await fetch(WORKER_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'apply_promo_code', code: couponCode.trim(), email: emailToUse }),
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
            premium_hasta: data.premium_hasta || '',
          })
          return { ...prev, es_premium: true, premium_hasta: data.premium_hasta || null, premium_source: 'promo_code' }
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
        setCouponError(data.error || 'Código incorrecto o ya no está disponible')
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
              return { ...prev, es_premium: true, premium_hasta: data.premium_hasta, premium_source: data.premium_source || prev.premium_source || null }
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
    // Restore profile from localStorage for anonymous users (fast, no network)
    loadLinkedinProfile()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
          premium_source: perfil?.premium_source || null,
        }
        applySession(data.access_token, data.refresh_token, userData)
        checkAdminStatus(data.access_token)
        // After session restored: load profile from Supabase (may be richer than localStorage)
        loadLinkedinProfile()
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
          premium_source: perfil?.premium_source || null,
        }
        if (userObj.es_premium) {
          applySession(accessToken, refreshToken || '', userObj)
          setAuthSuccess('login')
        } else {
          // No es premium: aplicar sesión temporalmente y pedir que active
          applySession(accessToken, refreshToken || '', userObj)
          setAuthSuccess('linkedin_needs_premium')
        }
        checkAdminStatus(accessToken)
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
        setInputMode('pdf')
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

  // GA4: sincronizar contexto de usuario (user_type, is_premium) en cada evento
  useEffect(() => { setGaUser(user) }, [user])

  // GA4: trackear cuando el modal premium se abre (sin importar desde dónde)
  useEffect(() => { if (showPremiumModal) trackEvent('premium_modal_shown') }, [showPremiumModal])

  // Aviso antes de cerrar pestaña si hay resultados
  useEffect(() => {
    if (step < STEPS.RESULTS) return
    const handler = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [step])

  // Flush STAR session to historial when user leaves the STAR screen
  useEffect(() => {
    if (step === STEPS.STAR_TRAINING) {
      starSessionRef.current = [] // reset on enter
    } else if (starSessionRef.current.length > 0) {
      const session = starSessionRef.current
      starSessionRef.current = []
      const avgPuntaje = Math.round(session.reduce((s, r) => s + (r.puntaje || 0), 0) / session.length)
      saveToHistorial('star', { preguntas: session }, 'Sesión STAR', avgPuntaje || null)
    }
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  // Single source of truth: rebuild CV preview whenever photo, CV data, stage, or template changes.
  // Covers all async paths: upload, storage auto-load, historial restore, template switch.
  useEffect(() => {
    if (!cvFinalData || cvStage !== 'done') return
    setCvPreviewHtml(buildCvHtml(cvFinalData, profilePhoto, profilePhotoMime, cvTemplate))
  }, [cvFinalData, cvStage, profilePhoto, profilePhotoMime, cvTemplate])

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
    setDynamicInterviewQs(null)
    setInterviewQsLoading(false)
    setInterviewJobContext(null)
    setLeadSaving(false)
    setLeadSent(false)
    setShowLeadModal(false)
    setLeadNombre('')
    setLeadApellido('')
  }

  const generatePersonalizedInterviewQs = async (contextOverride = null) => {
    const profesion = qaHistory.find(h => h.questionId === 'profesion')?.answer || qaHistory[0]?.answer || ''
    const industria = qaHistory.find(h => h.questionId === 'industria')?.answer || ''
    const seniority = qaHistory.find(h => h.questionId === 'seniority')?.answer || ''
    if (!profesion || !WORKER_URL) return
    const activeJobContext = contextOverride || interviewJobContext
    if (contextOverride) setInterviewJobContext(contextOverride)
    setInterviewQsLoading(true)
    try {
      const jobCtx = activeJobContext ? ` · ${activeJobContext.empresa ? `Empresa: ${activeJobContext.empresa} · ` : ''}Puesto: ${activeJobContext.puesto}` : ''
      const prompt = `Sos un headhunter experto generando preguntas de entrevista laboral personalizadas.

Candidato: ${profesion}${industria ? ` · Industria: ${industria}` : ''}${seniority ? ` · Nivel: ${seniority}` : ''}${jobCtx}

Generá exactamente 5 preguntas de entrevista adaptadas a este perfil.${activeJobContext ? ` Las preguntas deben ser específicas para el puesto de "${activeJobContext.puesto}"${activeJobContext.empresa ? ` en "${activeJobContext.empresa}"` : ''}.` : ' Deben ser relevantes para su profesión y nivel, no genéricas.'}
Formato JSON exacto: [{"pregunta": "...", "hint": "..."}]

Devolvé solo el array JSON, sin markdown ni explicación.`
      const res = await fetch(WORKER_URL, {
        method: 'POST',
        headers: WORKER_HEADERS,
        body: JSON.stringify({
          action: 'ai_generic',
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 900 },
        }),
      })
      if (!res.ok) throw new Error('err')
      const data = await res.json()
      const parsed = JSON.parse(extractAIText(data))
      if (Array.isArray(parsed) && parsed.length === 5 && parsed[0]?.pregunta) {
        setDynamicInterviewQs(parsed)
      }
    } catch {
      // silently fallback to static questions
    } finally {
      setInterviewQsLoading(false)
    }
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
    setFastTrack(false)
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
    setProfilePhotoId(null)
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
    const totalQs = fastTrack ? 3 : STATIC_QUESTIONS.length
    trackEvent('paso_completado', { paso: nextIndex, id: currentQ.id, fast_track: fastTrack })
    if (nextIndex < totalQs) {
      setCurrentQ(STATIC_QUESTIONS[nextIndex])
    } else {
      trackEvent('cuestionario_completado', { fast_track: fastTrack })
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
    const pt = parts.join('\n\n')
    setProfileText(pt)
    setFormConfirmed(true)
    trackEvent('cv_subido', { metodo: 'linkedin_oauth' })
    saveLinkedinProfile({
      nombre: name || '',
      email: email || '',
      headline: formTitular.trim(),
      about: formResumen.trim(),
      habilidades: formHabilidades.split(',').map(h => h.trim()).filter(Boolean),
      experiencias: (positions || []).map(p => ({
        cargo: p.title || '', empresa: p.companyName || '',
        periodo: p.startYear ? `${p.startYear}–${p.endYear || 'presente'}` : '',
        descripcion: p.description || '',
      })),
      educacion: formEducacion.filter(e => e.institucion.trim() || e.titulo.trim()).map(e => ({
        institucion: e.institucion.trim(), titulo: e.titulo.trim(), periodo: e.periodo.trim(),
      })),
      profile_text: pt,
      fuente: 'oauth',
    })
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
    const pt = parts.join('\n\n')
    setProfileText(pt)
    setFormConfirmed(true)
    trackEvent('cv_subido', { metodo: 'formulario' })
    saveLinkedinProfile({
      nombre: '',
      headline: formTitular.trim(),
      about: formResumen.trim(),
      habilidades: formHabilidades.split(',').map(h => h.trim()).filter(Boolean),
      experiencias: formExperiencias.filter(e => e.cargo.trim() || e.empresa.trim()).map(e => ({
        cargo: e.cargo.trim(), empresa: e.empresa.trim(), periodo: e.periodo.trim(), descripcion: e.descripcion.trim(),
      })),
      educacion: formEducacion.filter(e => e.institucion.trim() || e.titulo.trim()).map(e => ({
        institucion: e.institucion.trim(), titulo: e.titulo.trim(), periodo: e.periodo.trim(),
      })),
      profile_text: pt,
      fuente: 'form',
    })
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
  const uploadPhotoToStorage = async (base64, mime) => {
    if (!user || !authToken) return null
    try {
      const res = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { ...WORKER_HEADERS, Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ action: 'upload_profile_photo', photo_base64: base64, mime_type: mime }),
      })
      const data = await res.json()
      if (data.ok && data.photo_id) {
        if (!data.deduplicated) addToast('Foto guardada en tu cuenta', 'success', 3000)
        return { photoId: data.photo_id, signedUrl: data.signed_url }
      }
      if (data.error) addToast(data.error, 'error')
    } catch {}
    return null
  }

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const { base64, mime, previewUrl } = await compressImage(file)
      setProfilePhotoMime(mime)
      setProfilePhotoPreview(previewUrl)
      setProfilePhoto(base64)
      setFormConfirmed(false)
      setProfileText('')
      const stored = await uploadPhotoToStorage(base64, mime)
      if (stored) setProfilePhotoId(stored.photoId)
    } catch (err) {
      addToast(err.message || 'Error al cargar la foto.', 'error')
    }
  }

  // Solo actualiza la foto sin borrar el profileText (para el modal de CV)
  const handleCvPhotoUpload = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const { base64, mime, previewUrl } = await compressImage(file)
      setProfilePhotoMime(mime)
      setProfilePhotoPreview(previewUrl)
      setProfilePhoto(base64)
      if (cvFinalData && cvStage === 'done') {
        setCvPreviewHtml(buildCvHtml(cvFinalData, base64, mime, cvTemplate))
      }
      const stored = await uploadPhotoToStorage(base64, mime)
      if (stored) setProfilePhotoId(stored.photoId)
    } catch (err) {
      addToast(err.message || 'Error al cargar la foto.', 'error')
    }
  }

  // ── Saved photo management ─────────────────────────────────────────────────

  const loadSavedPhotos = async () => {
    if (!user || !authToken) return []
    try {
      const res = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { ...WORKER_HEADERS, Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ action: 'get_profile_photos' }),
      })
      const data = await res.json()
      return Array.isArray(data.photos) ? data.photos : []
    } catch { return [] }
  }

  const selectSavedPhoto = async (photo) => {
    if (!photo.signed_url) return
    try {
      const res = await fetch(photo.signed_url)
      if (!res.ok) throw new Error('No se pudo cargar la foto')
      const blob = await res.blob()
      const reader = new FileReader()
      return new Promise((resolve) => {
        reader.onload = () => {
          const base64 = reader.result.split(',')[1]
          const mime = photo.mime_type || 'image/jpeg'
          const previewUrl = URL.createObjectURL(blob)
          setProfilePhotoMime(mime)
          setProfilePhotoPreview(previewUrl)
          setProfilePhoto(base64)    // triggers reactive useEffect → rebuilds cvPreviewHtml
          setProfilePhotoId(photo.id)
          resolve()
        }
        reader.readAsDataURL(blob)
      })
    } catch (err) {
      addToast(err.message || 'No se pudo cargar la foto guardada.', 'error')
    }
  }

  const deleteSavedPhoto = async (photoId) => {
    if (!user || !authToken) return
    try {
      const res = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { ...WORKER_HEADERS, Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ action: 'delete_profile_photo', photo_id: photoId }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Error al eliminar')
      if (profilePhotoId === photoId) {
        setProfilePhoto(null)          // triggers reactive useEffect → rebuilds preview without photo
        setProfilePhotoMime('image/jpeg')
        setProfilePhotoPreview(null)
        setProfilePhotoId(null)
      }
    } catch (err) {
      addToast(err.message || 'No se pudo eliminar la foto.', 'error')
    }
  }

  const setDefaultPhoto = async (photoId) => {
    if (!user || !authToken) return
    try {
      const res = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { ...WORKER_HEADERS, Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ action: 'set_default_photo', photo_id: photoId }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Error al guardar')
    } catch (err) {
      addToast(err.message || 'No se pudo establecer la foto por defecto.', 'error')
    }
  }

  // Auto-load default saved photo when user logs in (only if no photo already loaded)
  useEffect(() => {
    if (!user || !authToken || profilePhoto) return
    let cancelled = false
    ;(async () => {
      const photos = await loadSavedPhotos()
      if (cancelled) return
      const def = photos.find(p => p.es_default) || photos[0]
      if (def) await selectSavedPhoto(def)
    })()
    return () => { cancelled = true }
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

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
          generationConfig: { maxOutputTokens: 2500 },
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
      saveLinkedinProfile({ profile_text: text, fuente: 'pdf' })
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
      const parsed = parseAIJson(extractAIText(data), AI_DEFAULTS.linkedin_growth, 'No se pudo procesar la respuesta.')
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

Perfil LinkedIn:
${profileText.slice(0, 4500)}

JSON:
{"puntaje_general":1-10,"nivel_seo":"Alto"|"Medio"|"Bajo","resumen_diagnostico":"2-3 oraciones sobre estado actual","accion_prioritaria":"1 acción concreta para hoy","fortalezas":["str","str","str"],"areas_de_mejora":["str","str","str"],"palabras_clave_sugeridas":["kw1","kw2","kw3","kw4","kw5","kw6","kw7","kw8"],"titular_actual":"str","titular_propuesto":"titular con keywords y propuesta de valor","resumen_actual":"str","resumen_propuesto":"máx 5 oraciones con propuesta de valor, logros y CTA","recomendaciones":[{"titulo":"str","descripcion":"str"},{"titulo":"str","descripcion":"str"},{"titulo":"str","descripcion":"str"}],"estrategia_contenido":"2-3 oraciones de sugerencia de contenido","analisis_foto":"evaluación de foto o importancia si no se incluyó"}`

    const controller = new AbortController()
    analysisAbortRef.current = controller
    const timeoutId = setTimeout(() => controller.abort(), 58000)
    const _tAnalysis = Date.now()
    try {
      trackEvent('analysis_started', { mode: sinPerfilMode ? 'sin_perfil' : 'con_perfil', has_photo: !!profilePhoto })
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
          generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 2000 },
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
      const parsed = parseAIJson(extractAIText(data), AI_DEFAULTS.analyze_linkedin, 'Error al procesar la respuesta. Intentá de nuevo.')
      setResult(parsed)
      trackTiming('analysis_completed', _tAnalysis, { puntaje: parsed.puntaje_general, nivel_seo: parsed.nivel_seo, mode: sinPerfilMode ? 'sin_perfil' : 'con_perfil' })
      setStep(STEPS.ONBOARDING)
      saveToHistorial('analisis', { ...parsed, fortalezas: parsed.fortalezas||[], areas_de_mejora: parsed.areas_de_mejora||[], palabras_clave_sugeridas: parsed.palabras_clave_sugeridas||[] }, parsed.nombre_titular || 'Análisis LinkedIn', parsed.puntaje_general ?? null)
    } catch (err) {
      trackError('analysis', err.isRateLimit ? 'rate_limit' : err.name === 'AbortError' ? 'timeout' : 'api_error')
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
  const saveAndConnectRamiro = async (nombre, apellido) => {
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
      trackEvent('lead_saved', {})
      window.open(RAMIRO_LINKEDIN_URL, '_blank', 'noopener,noreferrer')
    }
  }

  // ── Call AI with completed interview answers ──
  const callInterviewFeedback = async (answers) => {
    if (interviewLoading) return
    setInterviewLoading(true)
    setStep(STEPS.INTERVIEW_FEEDBACK)
    setInterviewError('')
    const _tInterview = Date.now()

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
    { "numero": 1, "puntaje": número del 1 al 10, "aspecto_positivo": "qué estuvo bien", "sugerencia": "cómo mejorar esta respuesta concretamente" },
    { "numero": 2, "puntaje": número del 1 al 10, "aspecto_positivo": "...", "sugerencia": "..." },
    { "numero": 3, "puntaje": número del 1 al 10, "aspecto_positivo": "...", "sugerencia": "..." },
    { "numero": 4, "puntaje": número del 1 al 10, "aspecto_positivo": "...", "sugerencia": "..." },
    { "numero": 5, "puntaje": número del 1 al 10, "aspecto_positivo": "...", "sugerencia": "..." }
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
      const parsed = parseAIJson(extractAIText(data), AI_DEFAULTS.interview_feedback, 'Error al procesar el feedback. Intentá de nuevo.')
      setInterviewFeedback(parsed)
      trackTiming('entrevista_completada', _tInterview, { puntaje: parsed.puntaje_entrevista })
      saveToHistorial('entrevista', { feedback: parsed, respuestas: answers }, 'Sesión de Entrenamiento', parsed?.puntaje_entrevista ?? null)
    } catch (err) {
      trackError('interview', err.isRateLimit ? 'rate_limit' : err.name === 'AbortError' ? 'timeout' : 'api_error')
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
    const _tStar = Date.now()
    const pregunta = STAR_QUESTIONS[starQuestionIdx]
    const profesionCtx = (qaHistory.find(h => h.questionId === 'profesion')?.answer || qaHistory[0]?.answer || '').trim()
    const userPrompt = `Pregunta de entrevista: "${pregunta}"\n${profesionCtx ? `\nContexto del candidato: ${profesionCtx}\n` : ''}\nRespuesta del candidato:\n"${starAnswer}"\n\nEvaluá si la respuesta aplica la metodología STAR. Respondé con este JSON exacto:\n{\n  "puntaje": número del 1 al 10,\n  "situacion": { "presente": true/false, "comentario": "max 1 oración" },\n  "tarea": { "presente": true/false, "comentario": "max 1 oración" },\n  "accion": { "presente": true/false, "comentario": "max 1 oración" },\n  "resultado": { "presente": true/false, "comentario": "max 1 oración" },\n  "sugerencia_clave": "1 mejora concreta y específica para esta respuesta"\n}`
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
      const parsed = parseAIJson(extractAIText(data), AI_DEFAULTS.star_feedback, 'La IA devolvió una respuesta inesperada. Intentá de nuevo.')
      setStarFeedback(parsed)
      trackTiming('star_feedback_received', _tStar, { puntaje: parsed.puntaje, question_idx: starQuestionIdx })
      // Accumulate in session buffer — save consolidated at session end (see step-change useEffect)
      starSessionRef.current = [...starSessionRef.current, { pregunta, respuesta: starAnswer, feedback_star: parsed, puntaje: parsed?.puntaje ?? null }]
    } catch (err) {
      trackError('star', err.isRateLimit ? 'rate_limit' : err.name === 'AbortError' ? 'timeout' : 'api_error')
      if (!err.isRateLimit) setStarError(err.name === 'AbortError' ? 'El pedido tardó demasiado. Intentá de nuevo.' : err.message || 'No se pudo obtener el feedback.')
    } finally {
      clearTimeout(timeoutId)
      setStarLoading(false)
    }
  }

  // ── CV de 1 página ──────────────────────────────────────────

  const updateCv = (newData, variant = undefined) => {
    setCvFinalData(newData)
    if (variant !== undefined) setCvVariant(variant)
    if (showCvPreview) {
      setCvPreviewHtml(buildCvHtml(newData, profilePhotoRef.current, profilePhotoMimeRef.current, cvTemplate))
    }
    // Solo guardar historial en snapshots intencionales (cuando variant está presente).
    // Ediciones manuales (sin variant) NO crean registros — evita explosión de versiones.
    if (variant !== undefined) {
      const titulo = variant === 'optimizado'
        ? `CV optimizado — ${newData.nombre || 'CV'}`
        : newData.nombre || 'CV'
      saveCvToHistorial(newData, titulo)
      if (user?.es_premium) {
        setCvSuccess('✓ Versión guardada en historial')
        setTimeout(() => setCvSuccess(''), 3000)
      }
    }
  }

  // Snapshot manual explícito (botón "Guardar versión")
  const saveCvSnapshot = () => {
    if (!cvFinalData) return
    const titulo = cvFinalData.nombre || 'CV guardado'
    saveToHistorial('cv', cvFinalData, titulo, null)
    if (user?.es_premium) {
      setCvSuccess('✓ Versión guardada')
      setTimeout(() => setCvSuccess(''), 3000)
    }
  }

  const buildCvPromptBase = (contacto, analysisResult = null, overrideProfileText = null, overrideQaHistory = null) => {
    const r = analysisResult || result
    const pText = overrideProfileText ?? profileText
    const qa = overrideQaHistory ?? qaHistory
    const nombre = r?.nombre_completo || ''
    const titular = r?.titular_propuesto || r?.titular_actual || ''
    const resumen = r?.resumen_propuesto || ''
    const keywords = (r?.palabras_clave_sugeridas || []).join(', ')
    let p = `Generá el CV en JSON usando esta información del profesional.\n\n`
    p += `Nombre: ${nombre}\nTitular propuesto: ${titular}\nResumen propuesto: ${resumen}\nKeywords sugeridas: ${keywords}\n\n`
    if (contacto.email)       p += `Email de contacto: ${contacto.email}\n`
    if (contacto.telefono)    p += `Teléfono: ${contacto.telefono}\n`
    if (contacto.linkedinUrl) p += `URL LinkedIn: ${contacto.linkedinUrl}\n`

    const qaLines = qa
      .filter(h => h.answer?.trim())
      .map(h => `- ${h.question}: ${h.answer}`)
      .join('\n')
    if (qaLines) {
      p += `\nInformación adicional del candidato (incorporá estos datos en titular, resumen Y bullets de la experiencia correspondiente):\n${qaLines}\n`
    }

    p += `\nPerfil LinkedIn:\n${pText.slice(0, r ? 7000 : 8000)}\n\n`
    return p
  }

  const callGenerateCV = async (contacto = {}, analysisResult = null, overrideProfileText = null, overrideQaHistory = null) => {
    if (cvLoading) return
    lastSavedCvHashRef.current = null  // reset so new CV generation can always be saved
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
    const _tCv = Date.now()
    trackEvent('cv_generation_started', { has_analysis: !!analysisResult })

    const userPrompt = buildCvPromptBase(resolvedContacto, analysisResult, overrideProfileText, overrideQaHistory)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 70000)
    try {
      if (!WORKER_URL) throw new Error('Worker URL no configurada.')
      const res = await fetch(WORKER_URL, {
        method: 'POST',
        headers: WORKER_HEADERS,
        signal: controller.signal,
        body: JSON.stringify({
          action: 'ai_generate_cv_full',
          contents: [{ parts: [{ text: userPrompt }] }],
          generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 4000 },
        }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        if (res.status === 429) { setRateLimitEvento('cv'); setRateLimitSecs(60); setWaitlistSent(false); throw makeRateLimitError() }
        throw new Error(parseGeminiError(res.status, e))
      }
      const data = await res.json()
      const parsed = parseAIJson(extractAIText(data), AI_DEFAULTS.generate_cv_full, 'No se pudo interpretar el CV generado. Intentá de nuevo.')
      const cv = sanitizeCv(parsed.cv || parsed)
      const quality = parsed.quality || null
      setCvDraft(cv)
      setCvQuality(quality)
      trackTiming('cv_generation_completed', _tCv, { with_photo: !!profilePhoto, template: cvTemplate })
      if (quality) {
        trackEvent('cv_quality_scored', { score: quality.score, nivel: quality.nivel, gap_count: quality.gaps?.length || 0 })
      }

      const hasHighImpactGaps = quality?.gaps?.some(g => g.impacto === 'Alto')
      if (!quality || quality.aprobado || !hasHighImpactGaps) {
        setCvFinalData(cv)
        setCvVariant(null)
        setCvStage('done')
        setCvPreviewHtml(buildCvHtml(cv, profilePhotoRef.current, profilePhotoMimeRef.current, cvTemplate))
        setShowCvPreview(true)
        // Not saving here — export action is the canonical save point
      } else {
        trackEvent('cv_gap_form_shown', { gap_count: quality.gaps?.length || 0 })
        setCvStage('gap_form')
      }
    } catch (err) {
      trackError('cv', err.isRateLimit ? 'rate_limit' : err.name === 'AbortError' ? 'timeout' : 'api_error')
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

    let userPrompt = buildCvPromptBase(cvContacto)
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
      const cv = parseAIJson(extractAIText(data), AI_DEFAULTS.generate_cv, 'No se pudo regenerar el CV. Intentá de nuevo.')
      setCvFinalData(cv)
      setCvVariant(null)
      setCvStage('done')
      setCvPreviewHtml(buildCvHtml(cv, profilePhotoRef.current, profilePhotoMimeRef.current, cvTemplate))
      setShowCvPreview(true)
      trackEvent('cv_regenerated', { answered_count: Object.keys(gapAnswers).length })
      // Not saving here — export action is the canonical save point
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

  // ── Mostrar overlay de preview (acción explícita del usuario) ──────────────
  const openCvPreview = () => {
    if (!cvFinalData) return
    const html = buildCvHtml(cvFinalData, profilePhotoRef.current, profilePhotoMimeRef.current, cvTemplate)
    setCvPreviewHtml(html)
    setShowCvPreview(true)
    trackEvent('cv_preview_open')
  }

  // ── Abre preview con el CV adaptado (cierra el modal del job adapter) ───────
  const openAdaptedCvPreview = (adaptedCv, empresa, cargo) => {
    if (!adaptedCv) return
    setCvFinalData(adaptedCv)
    setCvVariant({ empresa: empresa || null, cargo: cargo || null })
    setCvPreviewHtml(buildCvHtml(adaptedCv, profilePhotoRef.current, profilePhotoMimeRef.current, cvTemplate))
    setShowCvPreview(true)
    setShowJobModal(false)
    setJobResult(null)
    trackEvent('job_adapter_open_preview')
  }

  // ── Exportar CV: guarda snapshot + Web Share API en mobile, popup+print en desktop ──
  const exportCvPdf = async () => {
    if (!cvFinalData || cvExportState === 'loading') return
    setCvExportState('loading')
    trackEvent('cv_export_start')

    // Guardar snapshot en historial solo si el contenido cambió (evita duplicados por exports múltiples)
    const snapshotTitulo = (() => {
      if (!cvVariant) return cvFinalData.nombre || 'CV base'
      if (cvVariant === 'optimizado') return `${cvFinalData.nombre || 'CV'} — optimizado`
      if (typeof cvVariant === 'object' && cvVariant.empresa) return `CV adaptado — ${cvVariant.empresa}`
      return cvFinalData.nombre || 'CV'
    })()
    saveCvToHistorial(cvFinalData, snapshotTitulo)

    const loadingId = addToast('Preparando tu CV…', 'loading', 0)

    try {
      const html = buildCvHtml(cvFinalData, profilePhotoRef.current, profilePhotoMimeRef.current, cvTemplate, { forExport: true })
      const filename = `CV-${_cvFileName()}`
      const htmlBlob = new Blob([html], { type: 'text/html; charset=utf-8' })
      const htmlFile = new File([htmlBlob], `${filename}.html`, { type: 'text/html' })

      // Web Share API Level 2 — iOS 14.5+, Android Chrome 89+
      if (navigator.canShare && navigator.canShare({ files: [htmlFile] })) {
        await navigator.share({ files: [htmlFile], title: `CV - ${cvFinalData?.nombre || 'Mi CV'}` })
        dismissToast(loadingId)
        addToast('CV exportado · Versión guardada en historial', 'success')
        trackEvent('cv_export_share')
        setCvExportState('idle')
        return
      }

      // Desktop: popup + print dialog → "Guardar como PDF"
      const printHtml = html.replace('</body>', `<script>window.onload=function(){setTimeout(function(){window.print()},350)}<\/script></body>`)
      const win = window.open('', '_blank', 'width=900,height=750')
      if (win) {
        win.document.open(); win.document.write(printHtml); win.document.close()
        dismissToast(loadingId)
        addToast('CV exportado · Versión guardada en historial', 'success')
        trackEvent('cv_export_print')
      } else {
        // Popup bloqueado: descarga HTML con instrucción
        const a = document.createElement('a')
        a.href = URL.createObjectURL(htmlBlob)
        a.download = `${filename}.html`
        document.body.appendChild(a); a.click(); document.body.removeChild(a)
        setTimeout(() => URL.revokeObjectURL(a.href), 2000)
        dismissToast(loadingId)
        addToast('Abrí el archivo en Chrome → Ctrl+P → Guardar como PDF', 'success', 8000)
        trackEvent('cv_export_html_download')
      }
    } catch (err) {
      dismissToast(loadingId)
      if (err.name === 'AbortError') {
        trackEvent('cv_export_aborted')
      } else {
        addToast(err.message || 'No se pudo exportar. Intentá de nuevo.', 'error')
        trackEvent('cv_export_error', { reason: err.message })
      }
    } finally {
      setCvExportState('idle')
    }
  }


  // ── Merge seguro: solo aplica campos con contenido real, nunca sobreescribe con vacíos ──
  const safeMergeOptimized = (original, optimized) => {
    const result = { ...original }
    if (optimized.nombre?.trim())   result.nombre = optimized.nombre
    if (optimized.titular?.trim())  result.titular = optimized.titular
    if (optimized.resumen?.trim())  result.resumen = optimized.resumen
    for (const f of ['email', 'telefono', 'linkedin', 'ubicacion']) {
      if (optimized[f]?.trim()) result[f] = optimized[f]
    }
    if (optimized.experiencias?.length > 0)            result.experiencias = optimized.experiencias
    if (optimized.educacion?.length > 0)               result.educacion = optimized.educacion
    if (optimized.habilidades?.length > 0)             result.habilidades = optimized.habilidades
    if (optimized.idiomas?.length > 0)                 result.idiomas = optimized.idiomas
    if (optimized.experiencias_anteriores?.length > 0) result.experiencias_anteriores = optimized.experiencias_anteriores
    return sanitizeCv(result)
  }

  // ── Optimizar CV con IA ────────────────────────────────────────────────────
  const serializeCvForAI = (cv) => {
    const lines = []
    if (cv.nombre)   lines.push(`NOMBRE: ${cv.nombre}`)
    if (cv.titular)  lines.push(`TITULAR: ${cv.titular}`)
    if (cv.resumen)  lines.push(`RESUMEN:\n${cv.resumen}`)
    const contacto = [cv.email, cv.telefono, cv.linkedin, cv.ubicacion].filter(Boolean).join(' | ')
    if (contacto) lines.push(`CONTACTO: ${contacto}`)
    if (cv.experiencias?.length) {
      lines.push('\nEXPERIENCIAS:')
      cv.experiencias.forEach(exp => {
        lines.push(`  ${exp.cargo} en ${exp.empresa} (${exp.periodo || 'sin fecha'})`)
        ;(exp.logros || []).forEach(l => lines.push(`    - ${l}`))
      })
    }
    if (cv.educacion?.length) {
      lines.push('\nEDUCACIÓN:')
      cv.educacion.forEach(ed => lines.push(`  ${ed.titulo} — ${ed.institucion} (${ed.periodo || 'sin fecha'})`))
    }
    if (cv.habilidades?.length)             lines.push(`\nHABILIDADES: ${cv.habilidades.join(', ')}`)
    if (cv.idiomas?.length)                 lines.push(`IDIOMAS: ${cv.idiomas.join(', ')}`)
    if (cv.experiencias_anteriores?.length) {
      lines.push('\nEXPERIENCIAS ANTERIORES:')
      cv.experiencias_anteriores.forEach(ex => lines.push(`  ${ex.cargo} en ${ex.empresa}`))
    }
    return lines.join('\n')
  }

  const startCvConsultation = async () => {
    if (!cvFinalData || cvOptimizePhase !== 'idle') return
    setCvOptimizePhase('loading_q')
    setCvOptimizeQuestions([])
    setCvOptimizeAnswers({})
    setCvOptimizeError('')
    setCvOptimizeSuggestion(null)
    setShowCvOptimizePanel(false)
    setCvOptimizeApplied(false)
    try {
      const cvText = serializeCvForAI(cvFinalData)
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 25000)
      const res = await fetch(WORKER_URL, {
        method: 'POST',
        headers: WORKER_HEADERS,
        signal: controller.signal,
        body: JSON.stringify({
          action: 'ai_cv_optimize_consult',
          contents: [{ parts: [{ text: `CV a analizar:\n\n${cvText}` }] }],
          generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 800 },
        }),
      })
      clearTimeout(timeoutId)
      if (!res.ok) { setCvOptimizePhase('idle'); callOptimizeCv({}); return }
      const data = await res.json()
      let parsed
      try { parsed = parseAIJson(extractAIText(data), AI_DEFAULTS.cv_pre_questions) } catch { parsed = AI_DEFAULTS.cv_pre_questions }
      const preguntas = parsed?.preguntas?.filter(q => q.id && q.pregunta) || []
      if (preguntas.length === 0) {
        setCvOptimizePhase('idle')
        callOptimizeCv({})
      } else {
        setCvOptimizeQuestions(preguntas)
        setCvOptimizePhase('questions')
        trackEvent('cv_optimize_consult_shown', { count: preguntas.length })
      }
    } catch {
      setCvOptimizePhase('idle')
      callOptimizeCv({})
    }
  }

  const callOptimizeCv = async (consultAnswers = {}) => {
    if (!cvFinalData || cvOptimizing) return
    setCvOptimizing(true)
    setCvOptimizePhase('optimizing')
    setCvOptimizeError('')
    setCvOptimizeSuggestion(null)
    setCvOptimizeApplied(false)
    setShowCvOptimizePanel(false)
    try {
      // Send JSON directly — AI receives same structure it must return (not serialized text)
      const cvJson = JSON.stringify(cvFinalData, null, 2)

      // Include question text alongside answers so AI knows what each answer refers to
      const answersEntries = Object.entries(consultAnswers).filter(([, v]) => v?.trim())
      const answersText = answersEntries.length > 0
        ? '\n\nINFORMACIÓN ADICIONAL DEL CANDIDATO (incorporá estos datos en los bullets correspondientes):\n' +
          answersEntries.map(([k, v]) => {
            const question = cvOptimizeQuestions.find(q => q.id === k)
            return `- ${question?.pregunta || k}: ${v}`
          }).join('\n')
        : ''

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 45000)
      const res = await fetch(WORKER_URL, {
        method: 'POST',
        headers: WORKER_HEADERS,
        signal: controller.signal,
        body: JSON.stringify({
          action: 'ai_optimize_cv',
          contents: [{ parts: [{ text: `CV a optimizar (JSON):\n\n${cvJson}${answersText}` }] }],
          generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 2500 },
        }),
      })
      clearTimeout(timeoutId)
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error(parseGeminiError(res.status, e))
      }
      const data = await res.json()
      const raw = parseAIJson(extractAIText(data), null, 'La IA devolvió una respuesta inválida. Tu CV fue preservado sin cambios.')

      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error('La IA devolvió una respuesta inesperada. Intentá de nuevo.')
      }

      const merged = safeMergeOptimized(cvFinalData, raw)

      // Calculate diff for UX summary (informational only — never blocks the panel)
      const titularChanged = merged.titular !== cvFinalData.titular
      const resumenChanged = merged.resumen !== cvFinalData.resumen
      const bulletsChanged = (merged.experiencias || []).filter((exp, i) => {
        const orig = (cvFinalData.experiencias || [])[i]
        return orig && JSON.stringify(exp.logros) !== JSON.stringify(orig.logros)
      }).length
      const habilidadesChanged = JSON.stringify(merged.habilidades) !== JSON.stringify(cvFinalData.habilidades)

      setCvOptimizeSuggestion(merged)
      setShowCvOptimizePanel(true)
      trackEvent('cv_optimized', { titular_changed: titularChanged, resumen_changed: resumenChanged, bullets_improved: bulletsChanged, habilidades_changed: habilidadesChanged, with_answers: answersEntries.length > 0 })
    } catch (err) {
      setCvOptimizeError(err.name === 'AbortError' ? 'El análisis tardó demasiado. Intentá de nuevo.' : err.message || 'Error al optimizar el CV. Tu contenido fue preservado.')
    } finally {
      setCvOptimizing(false)
      setCvOptimizePhase('idle')
    }
  }

  // ── Avanzar en la entrevista ──
  const handleInterviewNext = (answer) => {
    if (interviewLoading) return
    const industria = qaHistory.find(h => h.questionId === 'industria')?.answer
    const industryQs = !dynamicInterviewQs && industria ? INTERVIEW_QUESTIONS_BY_INDUSTRY[industria] : null
    const activeQs = dynamicInterviewQs || industryQs || INTERVIEW_QUESTIONS
    const newAnswers = [...interviewAnswers, { pregunta: activeQs[interviewIdx].pregunta, respuesta: answer }]
    setInterviewAnswers(newAnswers)
    setInterviewAnswer('')
    if (newAnswers.length < activeQs.length) {
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

  // ── Readiness Index ────────────────────────────────────────
  // Weighted average of all available scores (0-10 scale)
  // Weights: interview 30%, linkedin 25%, cv 25%, star 20%
  const readinessIndex = (() => {
    const scores = []
    const linkedinScore = result?.puntaje_general
    const cvScore = cvQuality?.score
    const interviewScore = interviewFeedback?.puntaje_entrevista
    const starScore = starFeedback?.puntaje

    if (linkedinScore != null) scores.push({ value: linkedinScore, weight: 0.25 })
    if (cvScore != null) scores.push({ value: cvScore, weight: 0.25 })
    if (interviewScore != null) scores.push({ value: interviewScore, weight: 0.30 })
    if (starScore != null) scores.push({ value: starScore, weight: 0.20 })

    if (scores.length === 0) return null
    const totalWeight = scores.reduce((acc, s) => acc + s.weight, 0)
    const weighted = scores.reduce((acc, s) => acc + s.value * s.weight, 0)
    return Math.round((weighted / totalWeight) * 10) / 10
  })()

  // ── Render ─────────────────────────────────────────────────

  return (
    <Suspense fallback={null}>
    <main
      className="min-h-dvh flex flex-col items-center px-4 py-8 sm:py-14"
      style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
    >

      {/* ── Admin Panel ── */}
      {showAdminPanel && authToken && (
        <Suspense fallback={null}>
          <AdminPanel authToken={authToken} onClose={() => setShowAdminPanel(false)} />
        </Suspense>
      )}

      {/* ── Auth Modal ── */}
      {showAuthModal && <AuthModal
        user={user}
        authSuccess={authSuccess}
        setAuthSuccess={setAuthSuccess}
        setShowAuthModal={setShowAuthModal}
        setShowPremiumModal={setShowPremiumModal}
        authError={authError}
        setAuthError={setAuthError}
        authEmail={authEmail}
        setAuthEmail={setAuthEmail}
        authPassword={authPassword}
        setAuthPassword={setAuthPassword}
        authLoading={authLoading}
        authLogin={authLogin}
        authRegister={authRegister}
        authLogout={authLogout}
        handleLinkedinAuthViaSupabase={handleLinkedinAuthViaSupabase}
      />}

      {showScoreShare && result && <ScoreShareModal result={result} setShowScoreShare={setShowScoreShare} />}

      {/* ── Premium Modal ── */}
      {showPremiumModal && <PremiumModal
        user={user}
        setShowPremiumModal={setShowPremiumModal}
        subscriptionLoading={subscriptionLoading}
        premiumEmail={premiumEmail}
        setPremiumEmail={setPremiumEmail}
        startSubscription={startSubscription}
        couponCode={couponCode}
        setCouponCode={setCouponCode}
        couponEmail={couponEmail}
        setCouponEmail={setCouponEmail}
        couponLoading={couponLoading}
        applyCoupon={applyCoupon}
        couponError={couponError}
        setCouponError={setCouponError}
        couponSuccess={couponSuccess}
        setCouponSuccess={setCouponSuccess}
        showCouponField={showCouponField}
        setShowCouponField={setShowCouponField}
        handleLinkedinAuthViaSupabase={handleLinkedinAuthViaSupabase}
      />}

      {/* ── Gestionar Suscripción Modal ── */}
      {showManageModal && <ManageSubscriptionModal
        user={user}
        setShowManageModal={setShowManageModal}
        cancelConfirm={cancelConfirm}
        setCancelConfirm={setCancelConfirm}
        cancelDone={cancelDone}
        setCancelDone={setCancelDone}
        cancelLoading={cancelLoading}
        cancelSubscription={cancelSubscription}
      />}

      {/* ── Historial Modal ── */}
      {showHistorial && <HistorialDrawer
        historial={historial}
        historialLoading={historialLoading}
        setShowHistorial={setShowHistorial}
        deletingHistorialId={deletingHistorialId}
        setDeletingHistorialId={setDeletingHistorialId}
        deleteHistorialLoading={deleteHistorialLoading}
        deleteHistorialItem={deleteHistorialItem}
        restoreFromHistorial={restoreFromHistorial}
        user={user}
      />}

      {/* ── Post-Payment Modal ── */}
      {showPostPayment && <PostPaymentModal
        postPaymentEmail={postPaymentEmail}
        postPaymentPassword={postPaymentPassword}
        setPostPaymentPassword={setPostPaymentPassword}
        postPaymentLoading={postPaymentLoading}
        postPaymentError={postPaymentError}
        createAccountPostPayment={createAccountPostPayment}
      />}

      {/* ── Job Adapter Modal ── */}
      {showJobModal && <JobAdapterModal
        setShowJobModal={setShowJobModal}
        jobPosting={jobPosting}
        setJobPosting={setJobPosting}
        callAdaptCvForJob={callAdaptCvForJob}
        jobLoading={jobLoading}
        jobResult={jobResult}
        setJobResult={setJobResult}
        jobError={jobError}
        setJobError={setJobError}
        profilePhotoPreview={profilePhotoPreview}
        setProfilePhotoPreview={setProfilePhotoPreview}
        profilePhoto={profilePhoto}
        setProfilePhoto={setProfilePhoto}
        profilePhotoMime={profilePhotoMime}
        setProfilePhotoMime={setProfilePhotoMime}
        handleCvPhotoUpload={handleCvPhotoUpload}
        cvTemplate={cvTemplate}
        user={user}
        jobSaveLoading={jobSaveLoading}
        jobSaved={jobSaved}
        setJobSaved={setJobSaved}
        jobSaveError={jobSaveError}
        setJobSaveError={setJobSaveError}
        saveAdaptedCvAsPostulacion={saveAdaptedCvAsPostulacion}
        openAdaptedCvPreview={openAdaptedCvPreview}
        onGoToTracking={() => { setShowJobModal(false); setJobResult(null); setJobPosting(''); setJobSaved(false); setJobSavedCardId(null); loadTracking(); setStep(STEPS.TRACKING) }}
      />}

      {/* ── Barra de usuario ── */}
      <div className="w-full max-w-xl mb-2 flex justify-end items-center gap-1.5 flex-wrap">
        {checkingPremium && (
          <span className="text-xs font-medium px-2.5 py-1 rounded-full animate-pulse"
            style={{ background: 'rgba(0,119,181,0.10)', color: '#0077B5' }}>
            ⏳ Verificando...
          </span>
        )}
        {user ? (
          <>
            {user.es_premium && (() => {
              const hasta = user.premium_hasta ? new Date(user.premium_hasta) : null
              return (
                <button onClick={() => { setCancelConfirm(false); setCancelDone(false); setShowManageModal(true) }}
                  className="text-xs font-bold px-2.5 py-1 rounded-full transition-opacity hover:opacity-80"
                  style={{ background: LI_GRADIENT, color: 'white' }}
                  title={hasta ? `Premium hasta ${hasta.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}` : 'Gestionar suscripción'}>
                  <span>✦ Premium</span>
                  {hasta && <span className="hidden sm:inline"> hasta {hasta.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}</span>}
                </button>
              )
            })()}
            <span className="hidden sm:inline text-sm text-slate-500 font-medium">{user.nombre || user.email}</span>
            {!user.es_premium && (
              <button onClick={() => setShowPremiumModal(true)} disabled={subscriptionLoading}
                className="text-xs font-semibold px-2.5 py-1.5 rounded-full"
                style={{ background: LI_GRADIENT, color: 'white', opacity: subscriptionLoading ? 0.7 : 1 }}>
                {subscriptionLoading ? '...' : '⬆ Premium'}
              </button>
            )}
            {user.es_premium && (
              <button onClick={() => { loadHistorial(); setShowHistorial(true) }}
                className="text-xs font-medium px-2.5 py-1.5 rounded-full"
                style={BTN_GHOST_STYLE}
                title="Mi historial">
                <span>📊</span><span className="hidden sm:inline"> Mi historial</span>
              </button>
            )}
            {user.es_premium && (
              <button onClick={() => { loadTracking(); setStep(STEPS.TRACKING) }}
                className="text-xs font-medium px-2.5 py-1.5 rounded-full"
                style={BTN_GHOST_STYLE}
                title="Postulaciones">
                <span>📍</span><span className="hidden sm:inline"> Postulaciones</span>
              </button>
            )}
            {isAdmin && (
              <button onClick={() => setShowAdminPanel(true)}
                className="text-xs font-bold px-2.5 py-1.5 rounded-full transition-all"
                style={{ background: 'linear-gradient(135deg,#1e1b4b,#4338ca)', color: 'white' }}
                title="Panel de administración">
                ⚙
              </button>
            )}
            <button onClick={authLogout} className="text-xs text-slate-400 hover:text-slate-600 transition-colors px-1 py-1.5">
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

        {/* ── Journey progress indicator ── */}
        {step > STEPS.WELCOME && step !== STEPS.MODE_SELECT && step !== STEPS.REPORT && (() => {
          const journeySteps = [
            { label: 'Perfil', active: step >= STEPS.QUESTIONS && step <= STEPS.LOADING, done: !!result || step > STEPS.LOADING },
            { label: 'Análisis', active: step === STEPS.RESULTS || step === STEPS.ONBOARDING, done: !!result && (step > STEPS.RESULTS || step === STEPS.CV) && step !== STEPS.ONBOARDING },
            { label: 'CV', active: step === STEPS.CV, done: !!cvFinalData && step !== STEPS.CV },
            { label: 'Entrevista', active: step === STEPS.INTERVIEW_INTRO || step === STEPS.INTERVIEW || step === STEPS.INTERVIEW_FEEDBACK, done: !!interviewFeedback },
          ]
          const hasProgress = journeySteps.some(s => s.active || s.done)
          if (!hasProgress) return null
          return (
            <div className="flex items-center gap-1 mb-3 px-1">
              {journeySteps.map((s, i) => (
                <div key={s.label} className="flex items-center gap-1 flex-1 min-w-0">
                  <div className="flex flex-col items-center gap-0.5 flex-1 min-w-0">
                    <div className={`w-full h-1 rounded-full transition-all duration-500`}
                      style={{
                        background: s.done ? '#059669' : s.active ? LI_GRADIENT : 'rgba(0,119,181,0.12)',
                      }} />
                    <span className="text-[9px] font-medium truncate"
                      style={{ color: s.done ? '#059669' : s.active ? '#0077B5' : '#cbd5e1' }}>
                      {s.done ? '✓ ' : ''}{s.label}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )
        })()}

        {/* ── WELCOME ── */}
        {step === STEPS.WELCOME && (
          <WelcomeScreen
            setStep={setStep}
            handleModeSelectJobAdapter={handleModeSelectJobAdapter}
            jobAdapterCheckLoading={jobAdapterCheckLoading}
            jobAdapterNoCv={jobAdapterNoCv}
            setJobAdapterNoCv={setJobAdapterNoCv}
            result={result}
            onStartFastTrack={() => {
              trackEvent('click_fast_track')
              setFastTrack(true)
              setQaHistory([])
              setCurrentQ(STATIC_QUESTIONS[0])
              setStep(STEPS.QUESTIONS)
            }}
          />
        )}

        {/* ── MODE SELECT ── */}
        {step === STEPS.MODE_SELECT && (
          <ModeSelectScreen
            setStep={setStep}
            handleModeSelectJobAdapter={handleModeSelectJobAdapter}
            jobAdapterCheckLoading={jobAdapterCheckLoading}
            jobAdapterNoCv={jobAdapterNoCv}
            setJobAdapterNoCv={setJobAdapterNoCv}
            resetInterview={resetInterview}
            setStarPhase={setStarPhase}
            cvFinalData={cvFinalData}
            result={result}
            cvOptimizeApplied={cvOptimizeApplied}
            interviewFeedback={interviewFeedback}
            callGenerateCV={callGenerateCV}
            readinessIndex={readinessIndex}
            cvQuality={cvQuality}
            starFeedback={starFeedback}
          />
        )}

        {/* ── QUESTIONS ── */}
        {step === STEPS.QUESTIONS && (
          <QuestionnaireScreen
            qaHistory={qaHistory}
            currentQ={currentQ}
            selectedOption={selectedOption}
            setSelectedOption={setSelectedOption}
            textAnswer={textAnswer}
            setTextAnswer={setTextAnswer}
            handleAnswer={handleAnswer}
            handleBack={handleBack}
            fastTrack={fastTrack}
          />
        )}
        {/* ── PROFILE INPUT ── */}
        {step === STEPS.PROFILE_INPUT && (
          <ProfileInputScreen
            rateLimitEvento={rateLimitEvento}
            rateLimitSecs={rateLimitSecs}
            waitlistEmail={waitlistEmail}
            setWaitlistEmail={setWaitlistEmail}
            waitlistSent={waitlistSent}
            waitlistLoading={waitlistLoading}
            handleWaitlist={handleWaitlist}
            inputMode={inputMode}
            handleInputModeSwitch={handleInputModeSwitch}
            instrTab={instrTab}
            setInstrTab={setInstrTab}
            pdfLoading={pdfLoading}
            pdfFileName={pdfFileName}
            setPdfFileName={setPdfFileName}
            setPdfLoading={setPdfLoading}
            pdfError={pdfError}
            setPdfError={setPdfError}
            mobileSlide={mobileSlide}
            setMobileSlide={setMobileSlide}
            touchStartX={touchStartX}
            isDragging={isDragging}
            handlePdfUpload={handlePdfUpload}
            handleDragOver={handleDragOver}
            handleDragLeave={handleDragLeave}
            handleDrop={handleDrop}
            profilePhotoPreview={profilePhotoPreview}
            setProfilePhotoPreview={setProfilePhotoPreview}
            profilePhoto={profilePhoto}
            setProfilePhoto={setProfilePhoto}
            profilePhotoMime={profilePhotoMime}
            setProfilePhotoMime={setProfilePhotoMime}
            formConfirmed={formConfirmed}
            setFormConfirmed={setFormConfirmed}
            formTitular={formTitular}
            setFormTitular={setFormTitular}
            formResumen={formResumen}
            setFormResumen={setFormResumen}
            formExperiencias={formExperiencias}
            setFormExperiencias={setFormExperiencias}
            formEducacion={formEducacion}
            setFormEducacion={setFormEducacion}
            formHabilidades={formHabilidades}
            setFormHabilidades={setFormHabilidades}
            handleFormConfirm={handleFormConfirm}
            handlePhotoUpload={handlePhotoUpload}
            liAutofillDone={liAutofillDone}
            liAutofillLoading={liAutofillLoading}
            handleLinkedinAutofill={handleLinkedinAutofill}
            liAutofillError={liAutofillError}
            sinPerfilMode={sinPerfilMode}
            setSinPerfilMode={setSinPerfilMode}
            profileText={profileText}
            setProfileText={setProfileText}
            qaHistory={qaHistory}
            analysisError={analysisError}
            callGemini={callGemini}
            analyzing={analyzing}
            handleBack={handleBack}
            setStep={setStep}
          />
        )}

        {/* ── LOADING ── */}
        {step === STEPS.LOADING && (
          <LoadingScreen
            loadingMsgs={loadingMsgs}
            loadingMsgIdx={loadingMsgIdx}
            analysisAbortRef={analysisAbortRef}
            setAnalyzing={setAnalyzing}
            setStep={setStep}
          />
        )}

        {/* ── RESULTS ── */}
        {step === STEPS.RESULTS && result && (
          <ResultsScreen
            result={result}
            cvStage={cvStage}
            cvFinalData={cvFinalData}
            callGenerateCV={callGenerateCV}
            setShowLeadModal={setShowLeadModal}
            user={user}
            setShowPremiumModal={setShowPremiumModal}
            subscriptionLoading={subscriptionLoading}
            setStep={setStep}
            resetInterview={resetInterview}
            setJobCvForAdapter={setJobCvForAdapter}
            setJobPosting={setJobPosting}
            setJobResult={setJobResult}
            setJobError={setJobError}
            setShowJobModal={setShowJobModal}
            showGrowthSection={showGrowthSection}
            setShowGrowthSection={setShowGrowthSection}
            linkedinGrowth={linkedinGrowth}
            setLinkedinGrowth={setLinkedinGrowth}
            seguidores={seguidores}
            setSeguidores={setSeguidores}
            callLinkedinGrowth={callLinkedinGrowth}
            growthLoading={growthLoading}
            growthError={growthError}
            setGrowthError={setGrowthError}
            reset={reset}
            setShowScoreShare={setShowScoreShare}
          />
        )}

        {/* ── ONBOARDING ── */}
        {step === STEPS.ONBOARDING && result && (
          <OnboardingScreen result={result} setStep={setStep} />
        )}

        {/* ── CV ── */}
        {step === STEPS.CV && (
          <CvScreen
            result={result}
            cvStage={cvStage}
            setCvStage={setCvStage}
            cvFinalData={cvFinalData}
            setCvFinalData={setCvFinalData}
            cvQuality={cvQuality}
            cvDraft={cvDraft}
            setCvDraft={setCvDraft}
            setCvQuality={setCvQuality}
            cvPreviewHtml={cvPreviewHtml}
            setCvPreviewHtml={setCvPreviewHtml}
            showCvPreview={showCvPreview}
            setShowCvPreview={setShowCvPreview}
            callGenerateCV={callGenerateCV}
            callRegenerateCV={callRegenerateCV}
            cvLoading={cvLoading}
            cvError={cvError}
            cvGapAnswers={cvGapAnswers}
            setCvGapAnswers={setCvGapAnswers}
            cvTemplate={cvTemplate}
            setCvTemplate={setCvTemplate}
            profilePhoto={profilePhoto}
            setProfilePhoto={setProfilePhoto}
            profilePhotoMime={profilePhotoMime}
            setProfilePhotoMime={setProfilePhotoMime}
            profilePhotoPreview={profilePhotoPreview}
            setProfilePhotoPreview={setProfilePhotoPreview}
            profilePhotoId={profilePhotoId}
            setProfilePhotoId={setProfilePhotoId}
            handleCvPhotoUpload={handleCvPhotoUpload}
            loadSavedPhotos={loadSavedPhotos}
            selectSavedPhoto={selectSavedPhoto}
            deleteSavedPhoto={deleteSavedPhoto}
            setDefaultPhoto={setDefaultPhoto}
            openCvPreview={openCvPreview}
            cvEditing={cvEditing}
            setCvEditing={setCvEditing}
            updateCv={updateCv}
            cvSuccess={cvSuccess}
            cvOptimizePhase={cvOptimizePhase}
            setCvOptimizePhase={setCvOptimizePhase}
            showCvOptimizePanel={showCvOptimizePanel}
            setShowCvOptimizePanel={setShowCvOptimizePanel}
            cvOptimizing={cvOptimizing}
            startCvConsultation={startCvConsultation}
            cvOptimizeQuestions={cvOptimizeQuestions}
            setCvOptimizeQuestions={setCvOptimizeQuestions}
            cvOptimizeAnswers={cvOptimizeAnswers}
            setCvOptimizeAnswers={setCvOptimizeAnswers}
            callOptimizeCv={callOptimizeCv}
            cvOptimizeError={cvOptimizeError}
            cvOptimizeSuggestion={cvOptimizeSuggestion}
            setCvOptimizeSuggestion={setCvOptimizeSuggestion}
            cvOptimizeApplied={cvOptimizeApplied}
            setCvOptimizeApplied={setCvOptimizeApplied}
            cvBeforeOptimize={cvBeforeOptimize}
            setCvBeforeOptimize={setCvBeforeOptimize}
            rateLimitEvento={rateLimitEvento}
            rateLimitSecs={rateLimitSecs}
            waitlistEmail={waitlistEmail}
            setWaitlistEmail={setWaitlistEmail}
            waitlistSent={waitlistSent}
            waitlistLoading={waitlistLoading}
            handleWaitlist={handleWaitlist}
            exportCvPdf={exportCvPdf}
            cvExportState={cvExportState}
            setStep={setStep}
            setJobCvForAdapter={setJobCvForAdapter}
            setJobPosting={setJobPosting}
            setJobResult={setJobResult}
            setJobError={setJobError}
            setShowJobModal={setShowJobModal}
          />
        )}

        {/* ── INTERVIEW INTRO ── */}
        {step === STEPS.INTERVIEW_INTRO && (
          <InterviewIntroScreen
            interviewJobContext={interviewJobContext}
            setInterviewJobContext={setInterviewJobContext}
            generatePersonalizedInterviewQs={generatePersonalizedInterviewQs}
            setStep={setStep}
            result={result}
          />
        )}

        {/* ── INTERVIEW ── */}
        {step === STEPS.INTERVIEW && (() => {
          const interviewIndustria = qaHistory.find(h => h.questionId === 'industria')?.answer
          const interviewIndustryQs = !dynamicInterviewQs && interviewIndustria
            ? INTERVIEW_QUESTIONS_BY_INDUSTRY[interviewIndustria]
            : null
          return (
            <InterviewScreen
              interviewQsLoading={interviewQsLoading}
              dynamicInterviewQs={dynamicInterviewQs}
              industryQs={interviewIndustryQs}
              industryLabel={interviewIndustria}
              interviewIdx={interviewIdx}
              interviewAnswer={interviewAnswer}
              setInterviewAnswer={setInterviewAnswer}
              handleInterviewNext={handleInterviewNext}
              handleInterviewBack={handleInterviewBack}
            />
          )
        })()}

        {/* ── INTERVIEW FEEDBACK ── */}
        {step === STEPS.INTERVIEW_FEEDBACK && (
          <InterviewFeedbackScreen
            interviewLoading={interviewLoading}
            rateLimitEvento={rateLimitEvento}
            rateLimitSecs={rateLimitSecs}
            waitlistEmail={waitlistEmail}
            setWaitlistEmail={setWaitlistEmail}
            waitlistSent={waitlistSent}
            waitlistLoading={waitlistLoading}
            handleWaitlist={handleWaitlist}
            interviewError={interviewError}
            setInterviewError={setInterviewError}
            callInterviewFeedback={callInterviewFeedback}
            interviewAnswers={interviewAnswers}
            interviewFeedback={interviewFeedback}
            user={user}
            leadSaving={leadSaving}
            leadSent={leadSent}
            setShowLeadModal={setShowLeadModal}
            setShowPremiumModal={setShowPremiumModal}
            subscriptionLoading={subscriptionLoading}
            setShowStarModal={setShowStarModal}
            result={result}
            setStep={setStep}
          />
        )}

        {/* ── STAR TRAINING ── */}
        {step === STEPS.STAR_TRAINING && (
          <StarTrainingScreen
            starPhase={starPhase}
            setStarPhase={setStarPhase}
            starQuestionIdx={starQuestionIdx}
            setStarQuestionIdx={setStarQuestionIdx}
            starAnswer={starAnswer}
            setStarAnswer={setStarAnswer}
            starFeedback={starFeedback}
            setStarFeedback={setStarFeedback}
            starLoading={starLoading}
            starError={starError}
            setStarError={setStarError}
            rateLimitEvento={rateLimitEvento}
            rateLimitSecs={rateLimitSecs}
            waitlistEmail={waitlistEmail}
            setWaitlistEmail={setWaitlistEmail}
            waitlistSent={waitlistSent}
            waitlistLoading={waitlistLoading}
            handleWaitlist={handleWaitlist}
            callStarFeedback={callStarFeedback}
            resetInterview={resetInterview}
            interviewFeedback={interviewFeedback}
            user={user}
            result={result}
            setStep={setStep}
            setShowPremiumModal={setShowPremiumModal}
          />
        )}

        {/* ── TRACKING ── */}
        {step === STEPS.TRACKING && (
          <TrackingScreen
            user={user}
            setShowPremiumModal={setShowPremiumModal}
            setStep={setStep}
            kanbanListMode={kanbanListMode}
            setKanbanListMode={setKanbanListMode}
            trackingColumnas={trackingColumnas}
            trackingCards={trackingCards}
            trackingLoading={trackingLoading}
            trackingError={trackingError}
            showAddCard={showAddCard}
            setShowAddCard={setShowAddCard}
            newCardForm={newCardForm}
            setNewCardForm={setNewCardForm}
            editCard={editCard}
            setEditCard={setEditCard}
            showAddColumna={showAddColumna}
            setShowAddColumna={setShowAddColumna}
            newColumnaName={newColumnaName}
            setNewColumnaName={setNewColumnaName}
            newColumnaColor={newColumnaColor}
            setNewColumnaColor={setNewColumnaColor}
            renameColumna={renameColumna}
            setRenameColumna={setRenameColumna}
            createCard={createCard}
            updateCard={updateCard}
            deleteCard={deleteCard}
            createColumna={createColumna}
            updateColumna={updateColumna}
            deleteColumna={deleteColumna}
            moveCard={moveCard}
            setInterviewJobContext={setInterviewJobContext}
            resetInterview={resetInterview}
            cvFinalData={cvFinalData}
            loadTracking={loadTracking}
          />
        )}

        {/* ── REPORT ── */}
        {step === STEPS.REPORT && (
          <ReporteScreen
            setStep={setStep}
            readinessIndex={readinessIndex}
            result={result}
            cvQuality={cvQuality}
            interviewFeedback={interviewFeedback}
            starFeedback={starFeedback}
            user={user}
          />
        )}

      </div>


      {/* ── Preview CV — overlay unificado (mobile + desktop) ── */}
      {showCvPreview && cvPreviewHtml && (
        <div className="cv-print-overlay fixed inset-0 z-50 flex flex-col" style={{ background: '#fff' }}>
          {/* Barra superior — con safe area top para iPhone notch */}
          <div
            className="flex items-center justify-between shrink-0"
            style={{
              background: 'linear-gradient(135deg,#0077B5,#0ea5e9)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              paddingTop: 'max(0.75rem, env(safe-area-inset-top))',
              paddingBottom: '0.75rem',
              paddingLeft: 'max(1rem, env(safe-area-inset-left))',
              paddingRight: 'max(1rem, env(safe-area-inset-right))',
            }}>
            {/* Left: title + variant badges — flex-wrap para mobile */}
            <div className="flex items-center gap-1.5 flex-wrap min-w-0 flex-1 mr-2">
              <p className="text-white text-sm font-semibold shrink-0">📄 Tu CV</p>
              {cvVariant === 'optimizado' && (
                <span className="text-xs px-2 py-0.5 rounded-full font-semibold shrink-0"
                  style={{ background: 'rgba(245,158,11,0.35)', color: '#fef3c7' }}>
                  ✨ Opt.
                </span>
              )}
              {cvVariant && typeof cvVariant === 'object' && (cvVariant.empresa || cvVariant.cargo) && (
                <span className="text-xs px-2 py-0.5 rounded-full font-semibold truncate max-w-[120px] sm:max-w-[200px]"
                  style={{ background: 'rgba(5,150,105,0.35)', color: '#d1fae5' }}>
                  🎯 {cvVariant.cargo || cvVariant.empresa}
                </span>
              )}
              {cvQuality && (
                <span className="hidden sm:inline text-xs px-2 py-0.5 rounded-full font-semibold"
                  style={{ background: 'rgba(255,255,255,0.20)', color: 'white' }}>
                  {cvQuality.score}/10 · {cvQuality.nivel}
                </span>
              )}
            </div>
            {/* Right: actions — siempre en una línea */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={exportCvPdf}
                disabled={cvExportState === 'loading'}
                className="text-white text-xs px-2.5 py-2 rounded-lg font-semibold flex items-center gap-1"
                style={{ background: 'rgba(255,255,255,0.25)', border: '1px solid rgba(255,255,255,0.35)', opacity: cvExportState === 'loading' ? 0.6 : 1 }}>
                {cvExportState === 'loading'
                  ? <span className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin inline-block" />
                  : <><span>📥</span><span className="hidden sm:inline"> Exportar CV</span></>}
              </button>
              <button
                onClick={() => setShowCvPreview(false)}
                className="text-white text-sm w-9 h-9 rounded-lg flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.15)' }}>
                ✕
              </button>
            </div>
          </div>
          {/* iframe ocupa el resto — paddingBottom para home indicator de iPhone */}
          <div className="cv-iframe-wrapper flex-1 overflow-hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
            <iframe
              id="cv-preview-iframe"
              srcDoc={cvPreviewHtml}
              title="Vista previa de tu CV"
              className="w-full h-full border-0"
              sandbox="allow-same-origin allow-scripts allow-modals"
            />
          </div>
        </div>
      )}

      {/* ── Modal STAR paywall ── */}
      {showStarModal && <StarModal
        setShowStarModal={setShowStarModal}
        setStarPhase={setStarPhase}
        setStarFeedback={setStarFeedback}
        setStarAnswer={setStarAnswer}
        setStep={setStep}
      />}

      {/* ── Modal CV de 1 página ── */}
      {showCvModal && <CvModal
        setShowCvModal={setShowCvModal}
        contactEmail={contactEmail}
        setContactEmail={setContactEmail}
        contactTelefono={contactTelefono}
        setContactTelefono={setContactTelefono}
        contactLinkedin={contactLinkedin}
        setContactLinkedin={setContactLinkedin}
        profilePhotoPreview={profilePhotoPreview}
        setProfilePhotoPreview={setProfilePhotoPreview}
        setProfilePhoto={setProfilePhoto}
        setProfilePhotoMime={setProfilePhotoMime}
        handleCvPhotoUpload={handleCvPhotoUpload}
        callGenerateCV={callGenerateCV}
      />}

      {/* ── Modal nombre + colaboración ── */}
      {showLeadModal && <LeadModal
        setShowLeadModal={setShowLeadModal}
        leadNombre={leadNombre}
        setLeadNombre={setLeadNombre}
        leadApellido={leadApellido}
        setLeadApellido={setLeadApellido}
        saveAndConnectRamiro={saveAndConnectRamiro}
      />}

      <ToastContainer toasts={toasts} dismissToast={dismissToast} />
    </main>
    </Suspense>
  )
}

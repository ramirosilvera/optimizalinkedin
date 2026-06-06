import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { STEPS, LI_GRADIENT, BTN_BACK_STYLE, BTN_GHOST_STYLE, CARD_STYLE, WORKER_URL, WORKER_HEADERS, trackEvent, trackTiming, trackError } from '../../constants'
import { Spinner } from '../ui'

// ─────────────────────────────────────────────────────────────────────────────
// JobRecommendationsScreen
//
// UX SPEC: "Oportunidades Recomendadas por IA"
// Mobile-first, 375 px baseline. All touch targets ≥ 44 × 44 px.
//
// PROPS CONTRACT
//   profileText       string   — LinkedIn / form profile text (required for AI call)
//   result            object   — diagnosis result (used for profile summary header)
//   user              object   — { id, nombre, es_premium }
//   authToken         string
//   cvFinalData       object   — latest CV (for CV adapter integration)
//   trackingColumnas  array    — kanban columns (for save-to-kanban)
//   createCard        fn       — useTracking().createCard
//   addToast          fn       — global toast system
//   setStep           fn       — navigate to STEPS.*
//   setShowPremiumModal fn     — open premium gate
//   setShowJobModal   fn       — open JobAdapterModal
//   setJobCvForAdapter fn      — pre-fill adapter CV
//   setJobPosting     fn       — pre-fill adapter job posting
//   setJobResult      fn
//   setJobError       fn
//   resetInterview    fn
//   setInterviewJobContext fn  — pre-configure interview for this job
//   generatePersonalizedInterviewQs fn
//   onBack            fn       — navigate back (usually to ModeSelectScreen)
// ─────────────────────────────────────────────────────────────────────────────

// ── Colour helpers ────────────────────────────────────────────────────────────
// Score language follows a "high-performance coach" framing:
//   80–100 → "Altamente Competitivo" — you are a strong differentiator, go for it
//   60–79  → "Perfil Compatible"    — solid fit, a few gaps you can address
//   40–59  → "Potencial a Desarrollar" — shown with coaching framing, not dismissal
//   < 40   → shown to all users — free gets full quality, just 1x/month
function matchColor(pct) {
  if (pct >= 80) return { stroke: '#16a34a', glow: 'rgba(22,163,74,0.28)',   badge: 'rgba(22,163,74,0.10)',   text: '#15803d', label: 'Altamente Competitivo',  icon: '🏆' }
  if (pct >= 60) return { stroke: '#d97706', glow: 'rgba(217,119,6,0.28)',   badge: 'rgba(217,119,6,0.10)',   text: '#92400e', label: 'Perfil Compatible',       icon: '📈' }
  if (pct >= 40) return { stroke: '#6366f1', glow: 'rgba(99,102,241,0.24)',  badge: 'rgba(99,102,241,0.08)',  text: '#4338ca', label: 'Potencial a Desarrollar', icon: '🎯' }
  return               { stroke: '#94a3b8', glow: 'rgba(148,163,184,0.18)',  badge: 'rgba(148,163,184,0.07)', text: '#475569', label: 'Brecha Significativa',     icon: '📋' }
}

// ── MatchScoreRing ────────────────────────────────────────────────────────────
// Option A: circular progress ring (mirrors existing ScoreRing component style).
// score: 0–100 percentage. animated: triggers count-up on mount.
function MatchScoreRing({ score, size = 56, animated = true }) {
  const [displayed, setDisplayed] = useState(animated ? 0 : score)
  const animRef = useRef(null)

  useEffect(() => {
    if (!animated) { setDisplayed(score); return }
    // Minimum 1.5 s display before score settles — builds trust in AI processing
    const duration  = 1400
    const startTime = performance.now()
    const tick = (now) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayed(Math.round(eased * score))
      if (progress < 1) animRef.current = requestAnimationFrame(tick)
    }
    animRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animRef.current)
  }, [score, animated])

  const r     = size * 0.38
  const circ  = 2 * Math.PI * r
  const pct   = Math.min(Math.max(displayed, 0), 100)
  const c     = matchColor(pct)
  const sw    = size * 0.10   // stroke-width proportional to ring size
  const cx    = size / 2
  const fs    = size * 0.24   // font-size for number

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
      style={{ filter: `drop-shadow(0 0 ${size * 0.08}px ${c.glow})` }}>
      {/* Track */}
      <circle cx={cx} cy={cx} r={r} stroke="rgba(0,0,0,0.08)" strokeWidth={sw} fill="none" />
      {/* Progress arc */}
      <circle cx={cx} cy={cx} r={r}
        stroke={c.stroke} strokeWidth={sw} fill="none"
        strokeDasharray={circ}
        strokeDashoffset={circ - (circ * pct) / 100}
        strokeLinecap="round"
        style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', transition: animated ? 'none' : 'stroke-dashoffset 1.3s cubic-bezier(0.16,1,0.3,1)' }}
      />
      {/* Score text */}
      <text x={cx} y={cx} textAnchor="middle" dominantBaseline="central"
        fill="#0d2137" fontSize={fs} fontWeight="700">{pct}%</text>
    </svg>
  )
}

// ── SkeletonCard ──────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="rounded-2xl p-4 space-y-3 animate-pulse"
      style={{ background: 'white', border: '1px solid rgba(0,119,181,0.10)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
      <div className="flex items-start gap-3">
        {/* Logo placeholder */}
        <div className="w-10 h-10 rounded-xl shrink-0" style={{ background: '#e2e8f0' }} />
        <div className="flex-1 space-y-2">
          <div className="h-4 rounded-lg" style={{ background: '#e2e8f0', width: '70%' }} />
          <div className="h-3 rounded-lg" style={{ background: '#f1f5f9', width: '45%' }} />
        </div>
        {/* Score ring skeleton */}
        <div className="w-14 h-14 rounded-full shrink-0" style={{ background: '#e2e8f0' }} />
      </div>
      <div className="space-y-1.5">
        <div className="h-3 rounded-lg" style={{ background: '#f1f5f9', width: '90%' }} />
        <div className="h-3 rounded-lg" style={{ background: '#f1f5f9', width: '75%' }} />
      </div>
      <div className="flex gap-2">
        <div className="h-8 rounded-xl flex-1" style={{ background: '#f1f5f9' }} />
        <div className="h-8 rounded-xl flex-1" style={{ background: '#f1f5f9' }} />
        <div className="h-8 rounded-xl flex-1" style={{ background: '#f1f5f9' }} />
      </div>
    </div>
  )
}

// ── LoadingStage ──────────────────────────────────────────────────────────────
// Progressive loading messages — each one builds anticipation like a coach
// briefing an athlete before a competition. They reference the process, not
// just the technology. Cycles at 2 s intervals.
const LOADING_STAGES = [
  {
    icon: '🌐',
    msg: 'Buscando oportunidades en las mejores bolsas de empleo',
    sub: 'ATS corporativos (Greenhouse, Lever, Ashby), Google Jobs, Himalayas y portales LATAM.',
  },
  {
    icon: '🔍',
    msg: 'Escaneando bolsas laborales en tiempo real',
    sub: 'RemoteOK, Remotive, Jooble, GetOnBoard, Adzuna y fuentes regionales LATAM activas.',
  },
  {
    icon: '🧬',
    msg: 'Extrayendo señales clave de tu perfil',
    sub: 'Área funcional, nivel de seniority, industria y diferenciadores únicos de tu trayectoria.',
  },
  {
    icon: '📍',
    msg: 'Filtrando por compatibilidad geográfica y modalidad',
    sub: 'Presencial e híbrido en tu zona, más remoto con zona horaria compatible con LATAM.',
  },
  {
    icon: '🤖',
    msg: 'Analizando compatibilidad funcional y de seniority',
    sub: 'Comparamos trayectoria real, no solo palabras clave — coherencia de carrera con cada aviso.',
  },
  {
    icon: '✨',
    msg: 'Activando expansión IA · Google Jobs · sourcing avanzado',
    sub: 'Generando términos alternativos y ampliando cobertura con Google Jobs + ATS para tu perfil.',
  },
  {
    icon: '📊',
    msg: 'Calculando score de compatibilidad para cada vacante',
    sub: 'Puntaje 0–100 basado en trayectoria, industria, seniority y brecha de skills detectada.',
  },
  {
    icon: '🏆',
    msg: 'Ordenando las oportunidades donde más destacás',
    sub: 'Las posiciones donde sos candidato/a diferenciador/a — las que más vale la pena explorar primero.',
  },
]

function getVisibleStages() {
  return LOADING_STAGES
}

function LoadingStage({ stage }) {
  const visibleStages = getVisibleStages()
  const s = visibleStages[Math.min(stage, visibleStages.length - 1)]
  return (
    <div className="flex flex-col items-center gap-4 py-12 px-4">
      {/* Animated pulse ring — crimson matches Radar Laboral brand color */}
      <div className="relative w-16 h-16 flex items-center justify-center">
        <span className="absolute inset-0 rounded-full animate-ping opacity-25"
          style={{ background: 'rgba(194,24,91,0.30)', animationDuration: '1.6s' }} />
        <span className="relative w-16 h-16 rounded-full flex items-center justify-center text-3xl"
          style={{ background: 'rgba(194,24,91,0.08)', border: '1.5px solid rgba(194,24,91,0.22)' }}>
          {s.icon}
        </span>
      </div>
      <div className="text-center space-y-1.5">
        <p className="text-sm font-semibold" style={{ color: '#0d2137' }}>{s.msg}</p>
        <p className="text-xs leading-relaxed max-w-xs mx-auto" style={{ color: '#94a3b8' }}>{s.sub}</p>
      </div>
      {/* Progress dots */}
      <div className="flex gap-1.5 mt-1">
        {visibleStages.map((_, i) => (
          <span key={i} className="w-2 h-2 rounded-full transition-all duration-500"
            style={{ background: i <= stage ? '#c2185b' : 'rgba(194,24,91,0.18)' }} />
        ))}
      </div>
    </div>
  )
}

// ── Brand identity maps (module-scope — shared by JobCard + CompanyMatchBar) ──
const COMPANY_COLORS = {
  'mercado libre': { bg: '#FFE600', text: '#333' },
  'globant':       { bg: '#00B140', text: '#fff' },
  'uala':          { bg: '#7C3AED', text: '#fff' },
  'naranja x':     { bg: '#F97316', text: '#fff' },
  'despegar':      { bg: '#0EA5E9', text: '#fff' },
  'pedidosya':     { bg: '#E11D48', text: '#fff' },
  'delivery hero': { bg: '#E11D48', text: '#fff' },
  'ripio':         { bg: '#1D4ED8', text: '#fff' },
  'tienda nube':   { bg: '#7C3AED', text: '#fff' },
  'etermax':       { bg: '#F59E0B', text: '#333' },
  'mural':         { bg: '#0F172A', text: '#fff' },
  'satellogic':    { bg: '#1E40AF', text: '#fff' },
  'rappi':         { bg: '#FF441F', text: '#fff' },
  'pomelo':        { bg: '#10B981', text: '#fff' },
  'bitso':         { bg: '#FBBF24', text: '#333' },
  'auth0':         { bg: '#EB5424', text: '#fff' },
  'linear':        { bg: '#5B6AD0', text: '#fff' },
  'vercel':        { bg: '#000', text: '#fff' },
}
const TOP_EMPLOYERS = new Set([
  'mercado libre','globant','uala','naranja x','despegar',
  'pedidosya','delivery hero','etermax','rappi','mural','satellogic',
])

// ── CompanyMatchBar ───────────────────────────────────────────────────────────
// Horizontal scrollable strip: "Empresas con roles para vos".
// Appears between the count header and job cards when ≥ 2 companies are present.
const ATS_SOURCES_SET = new Set(['greenhouse','lever','smartrecruiters','ashby'])

function CompanyMatchBar({ recommendations }) {
  const counts  = {}
  const details = {}
  for (const rec of recommendations) {
    const co = rec.job?.company
    if (!co) continue
    counts[co]  = (counts[co]  || 0) + 1
    details[co] = rec.job
  }
  const sorted = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)

  if (sorted.length < 2) return null

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#94a3b8' }}>
        Empresas con roles para vos
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        {sorted.map(([company, count]) => {
          const job      = details[company]
          const key      = company.toLowerCase().trim()
          const colors   = COMPANY_COLORS[key] || { bg: 'rgba(0,119,181,0.10)', text: '#0077B5' }
          const isDirect = ATS_SOURCES_SET.has(job?.source)
          return (
            <div key={company}
              className="shrink-0 flex items-center gap-2 px-2.5 py-1.5 rounded-xl"
              style={{ background: 'rgba(0,119,181,0.05)', border: '1px solid rgba(0,119,181,0.11)' }}>
              <div className="w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-bold shrink-0"
                style={{ background: colors.bg, color: colors.text }}>
                {company[0].toUpperCase()}
              </div>
              <div className="flex flex-col leading-tight min-w-0">
                <span className="text-xs font-semibold truncate max-w-[72px]" style={{ color: '#0d2137' }}>
                  {company}
                </span>
                <span className="text-[9px] whitespace-nowrap" style={{ color: isDirect ? '#15803d' : '#94a3b8' }}>
                  {count} rol{count > 1 ? 'es' : ''}{isDirect ? ' · directo' : ''}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── FilterBottomSheet ─────────────────────────────────────────────────────────
// Mobile-first bottom sheet for filters (NOT a sidebar).
function FilterBottomSheet({ open, onClose, filters, onChange, onApply }) {
  const sheetRef = useRef(null)

  // Trap clicks outside the sheet
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (!sheetRef.current?.contains(e.target)) onClose() }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }}>
      <div ref={sheetRef}
        className="w-full rounded-t-3xl pt-4 pb-8 px-5 space-y-5"
        style={{ background: 'white', boxShadow: '0 -8px 40px rgba(0,0,0,0.15)',
          paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}>

        {/* Drag handle */}
        <div className="w-10 h-1 rounded-full mx-auto" style={{ background: '#cbd5e1' }} />

        <div className="flex items-center justify-between">
          <h3 className="font-bold text-base" style={{ color: '#0d2137' }}>Filtrar oportunidades</h3>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-slate-400 text-2xl leading-none">×</button>
        </div>

        {/* Seniority */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#64748b' }}>Seniority</p>
          <div className="flex flex-wrap gap-2">
            {['Junior', 'Semi Senior', 'Senior', 'Lead'].map(s => (
              <button key={s}
                onClick={() => onChange('seniority', s)}
                className="px-3 py-1.5 rounded-xl text-sm font-medium transition-all"
                style={filters.seniority === s
                  ? { background: LI_GRADIENT, color: 'white' }
                  : BTN_GHOST_STYLE}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Remote */}
        <div className="flex items-center justify-between py-1">
          <div>
            <p className="text-sm font-medium" style={{ color: '#0d2137' }}>Solo remoto</p>
            <p className="text-xs" style={{ color: '#94a3b8' }}>Incluir solo posiciones 100% remotas</p>
          </div>
          <button
            onClick={() => onChange('remoteOnly', !filters.remoteOnly)}
            className="w-12 h-7 rounded-full transition-all duration-300 relative shrink-0"
            style={{ background: filters.remoteOnly ? '#0077B5' : '#cbd5e1' }}>
            <span className="absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all duration-300"
              style={{ left: filters.remoteOnly ? '26px' : '4px' }} />
          </button>
        </div>

        {/* Location */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#64748b' }}>Ubicación preferida</p>
          <div className="flex flex-wrap gap-2">
            {['Argentina', 'Colombia', 'México', 'Chile', 'Uruguay', 'España'].map(loc => (
              <button key={loc}
                onClick={() => onChange('location', filters.location === loc ? '' : loc)}
                className="px-3 py-1.5 rounded-xl text-sm font-medium transition-all"
                style={filters.location === loc
                  ? { background: LI_GRADIENT, color: 'white' }
                  : BTN_GHOST_STYLE}>
                {loc}
              </button>
            ))}
          </div>
        </div>

        {/* Salary range (free text for now) */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#64748b' }}>Rango salarial mínimo (USD)</p>
          <div className="flex gap-2">
            {[null, 1000, 2000, 3000, 5000].map(v => (
              <button key={v}
                onClick={() => onChange('minSalary', filters.minSalary === v ? null : v)}
                className="flex-1 py-2 rounded-xl text-xs font-medium transition-all"
                style={filters.minSalary === v
                  ? { background: LI_GRADIENT, color: 'white' }
                  : BTN_GHOST_STYLE}>
                {v ? `$${v}` : 'Cualquiera'}
              </button>
            ))}
          </div>
        </div>

        <button onClick={onApply}
          className="w-full py-3.5 rounded-2xl text-sm font-semibold text-white"
          style={{ background: LI_GRADIENT }}>
          Aplicar filtros
        </button>
      </div>
    </div>
  )
}

// ── JobCard ───────────────────────────────────────────────────────────────────
// The card that shows each recommendation.
// Collapsed (default) shows key info + quick actions.
// Expanded shows full match analysis, all strengths/gaps + integration CTAs.
//
// SWIPE UX (mobile):
//   swipe right → save to Kanban (primary action)
//   swipe left  → dismiss
function JobCard({
  rec,
  index,
  isPremium,
  blurred,
  onSave,
  onDismiss,
  onGoToKanban,
  onUpgrade,
  addToast,
}) {
  const [expanded, setExpanded]               = useState(false)
  const [saved, setSaved]                     = useState(false)
  const [alreadyExists, setAlreadyExists]     = useState(false)
  const [showSaveConfirm, setShowSaveConfirm] = useState(false)
  const [saveError, setSaveError]             = useState(false)
  const [dismissed, setDismissed]             = useState(false)
  const [saveLoading, setSaveLoading]         = useState(false)
  const [swipeDelta, setSwipeDelta]           = useState(0)
  const touchStartRef                         = useRef(null)
  const touchStartYRef                        = useRef(null)
  const saveAttemptRef                        = useRef(false)
  const cardRef                               = useRef(null)

  const { job, match_score, match_type, strengths, gaps, summary, rec_id, geo_score, from_expansion, ai_fallback, headhunter_note, priority } = rec

  // Convert 0–10 scale from API to 0–100 percentage
  const scorePct = match_score != null ? Math.round(match_score * 10) : null
  const c        = scorePct != null ? matchColor(scorePct) : null

  // ── Days since posted ──────────────────────────────────────────────────────
  const postedDays = (() => {
    if (!job.posted_at) return null
    return Math.floor((Date.now() - new Date(job.posted_at).getTime()) / 86400000)
  })()
  const daysAgo = (() => {
    if (postedDays === null) return null
    if (postedDays === 0) return 'today'
    if (postedDays === 1) return 'Ayer'
    if (postedDays < 7)  return `Hace ${postedDays} días`
    if (postedDays < 30) return `Hace ${Math.floor(postedDays / 7)} sem.`
    return `Hace ${Math.floor(postedDays / 30)} mes.`
  })()
  const isStale         = postedDays != null && postedDays > 14
  const isPublishedToday = postedDays === 0
  // Market segment: global remote sources vs. local LATAM aggregators
  const isGlobalRemote = ['remoteok', 'remotive', 'jobicy'].includes(job.source)
  const isLocalMarket  = ['jooble', 'adzuna'].includes(job.source)
  const isDirectAts    = ['greenhouse','lever','smartrecruiters','ashby'].includes(job.source)
  const ATS_NAMES      = { greenhouse: 'Greenhouse', lever: 'Lever', smartrecruiters: 'SmartRecruiters', ashby: 'Ashby', workable: 'Workable', teamtailor: 'TeamTailor', recruitee: 'Recruitee', personio: 'Personio', workday: 'Workday' }

  const companyKey    = (job.company || '').toLowerCase().trim()
  const avatarColors  = COMPANY_COLORS[companyKey] || { bg: 'linear-gradient(135deg,#e2e8f0,#cbd5e1)', text: '#64748b' }
  const isTopEmployer = TOP_EMPLOYERS.has(companyKey)

  // ── Touch swipe handlers ───────────────────────────────────────────────────
  const onTouchStart = (e) => {
    touchStartRef.current  = e.touches[0].clientX
    touchStartYRef.current = e.touches[0].clientY
  }
  const onTouchMove = (e) => {
    if (touchStartRef.current === null) return
    const deltaX = e.touches[0].clientX - touchStartRef.current
    const deltaY = e.touches[0].clientY - touchStartYRef.current
    // Cancel swipe if gesture is primarily vertical — let native scroll handle it
    if (Math.abs(deltaY) > Math.abs(deltaX) + 8) {
      setSwipeDelta(0)
      touchStartRef.current  = null
      touchStartYRef.current = null
      return
    }
    setSwipeDelta(Math.max(-80, Math.min(80, deltaX)))
  }
  const onTouchEnd = () => {
    if (swipeDelta > 55) {
      handleSave()
    } else if (swipeDelta < -55) {
      handleDismiss()
    }
    setSwipeDelta(0)
    touchStartRef.current  = null
    touchStartYRef.current = null
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (saved || saveLoading || saveAttemptRef.current) return
    if (!isPremium && blurred) { onUpgrade?.(); return }
    saveAttemptRef.current = true
    setSaveLoading(true)
    setSaveError(false)
    try {
      const result = await onSave?.(rec)
      if (result !== undefined) {
        setSaved(true)
        setAlreadyExists(result?.alreadyExists || false)
        setShowSaveConfirm(!result?.alreadyExists)
        trackEvent('job_recommendation_saved', { rec_id, score: scorePct })
      } else {
        setSaveError(true)
      }
    } catch (err) {
      console.error('[Radar] Save error:', err?.message || err)
      setSaveError(true)
    } finally {
      setSaveLoading(false)
      saveAttemptRef.current = false
    }
  }

  const handleDismiss = () => {
    setDismissed(true)
    onDismiss?.(rec)
    trackEvent('job_recommendation_dismissed', { rec_id, score: scorePct })
  }

  // ── Celebration pulse for high-match ──────────────────────────────────────
  const [showCelebration, setShowCelebration] = useState(false)
  useEffect(() => {
    // Trigger for "Altamente Competitivo" (80+) on first 3 cards
    if (scorePct >= 80 && index < 3) {
      const t = setTimeout(() => setShowCelebration(true), 300 + index * 150)
      const t2 = setTimeout(() => setShowCelebration(false), 3000 + index * 150)
      return () => { clearTimeout(t); clearTimeout(t2) }
    }
  }, [scorePct, index])

  if (dismissed) return null

  // ── Blurred card (freemium gate) ─────────────────────────────────────────────
  // Design decisions:
  //   blur(5px): enough to obscure content, light enough to show shape/structure
  //   Score IS revealed even on blurred cards — the % creates urgency to unlock
  //   ("esta posición tiene 84% de compatibilidad — y no la podés ver aún")
  //   We intentionally avoid blur(8px)+ which makes cards look broken/empty
  //   Lock overlay: semi-transparent white, NOT full white — preserves depth cue
  if (blurred) {
    return (
      <div className="rounded-2xl overflow-hidden relative"
        style={{ ...CARD_STYLE, minHeight: 130 }}>
        {/* Blurred content preview — filter:blur(5px) chosen for shape visibility */}
        <div style={{ filter: 'blur(5px)', pointerEvents: 'none', userSelect: 'none' }}
          className="p-4 space-y-2">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center text-sm font-bold"
              style={{ background: 'linear-gradient(135deg,#e2e8f0,#cbd5e1)', color: '#64748b' }}>
              {String.fromCharCode(65 + (index % 26))}
            </div>
            <div className="flex-1">
              <p className="font-semibold text-sm text-slate-800">Posición disponible</p>
              <p className="text-xs text-slate-500 mt-0.5">Empresa · Remoto · Publicado recientemente</p>
            </div>
            {/* Score IS visible on blurred cards — creates desire to unlock */}
            {scorePct != null && scorePct >= 40 && (
              <MatchScoreRing score={scorePct} size={48} animated={false} />
            )}
          </div>
          <div className="space-y-1.5 pt-1">
            <div className="h-3 rounded-lg bg-slate-200" style={{ width: '85%' }} />
            <div className="h-3 rounded-lg bg-slate-100" style={{ width: '65%' }} />
          </div>
        </div>

        {/* Premium overlay — rgba(255,255,255,0.78) keeps blur shape visible */}
        <div className="absolute inset-0 flex flex-col items-center justify-center px-5 text-center"
          style={{ background: 'rgba(255,255,255,0.80)', backdropFilter: 'blur(1px)' }}>
          <span className="text-base mb-1">🔒</span>
          <p className="text-xs font-bold mb-1" style={{ color: '#0d2137' }}>Resultado Premium</p>
          {scorePct != null && scorePct >= 40 && (
            <p className="text-xs mb-3 leading-snug" style={{ color: '#475569' }}>
              Esta posición tiene{' '}
              <strong style={{ color: c?.text }}>{scorePct}% de compatibilidad</strong>{' '}
              con tu perfil. Desbloqueala para ver el análisis completo.
            </p>
          )}
          {scorePct != null && scorePct < 40 && (
            <p className="text-xs mb-3 leading-snug" style={{ color: '#64748b' }}>
              Análisis de compatibilidad disponible con Premium.
            </p>
          )}
          {/* Urgency: quantified — shown in parent via banner, but button reinforces */}
          <button onClick={onUpgrade}
            className="px-5 py-2.5 rounded-xl text-xs font-bold text-white transition-all active:scale-[0.97]"
            style={{ background: 'linear-gradient(135deg,#0d2137,#0077B5)', boxShadow: '0 4px 16px rgba(0,119,181,0.30)' }}>
            Desbloquear acceso completo →
          </button>
        </div>
      </div>
    )
  }

  // ── Normal card ────────────────────────────────────────────────────────────
  return (
    <div
      ref={cardRef}
      className="rounded-2xl overflow-hidden transition-all duration-300"
      style={{
        ...CARD_STYLE,
        transform: `translateX(${swipeDelta}px) scale(${Math.abs(swipeDelta) > 20 ? 0.98 : 1})`,
        opacity: Math.abs(swipeDelta) > 60 ? 0.7 : 1,
        background: swipeDelta > 30
          ? 'rgba(34,197,94,0.05)'
          : swipeDelta < -30
            ? 'rgba(239,68,68,0.05)'
            : 'white',
        outline: showCelebration ? '2px solid #22c55e' : 'none',
        transition: swipeDelta === 0 ? 'all 0.25s' : 'none',
        touchAction: 'pan-y',
        userSelect: 'none',
      }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}>

      {/* ── Swipe direction overlays ──
          RIGHT → green background tint + save icon + label (grows with delta)
          LEFT  → rose background tint + dismiss icon + label
          Both use position:relative on the card so these absolute children work. */}
      {swipeDelta > 30 && (
        <div
          className="absolute inset-0 pointer-events-none z-10 flex items-center justify-start pl-4"
          style={{ background: `rgba(22,163,74,${Math.min((swipeDelta - 30) / 50, 0.18)})` }}
        >
          <div className="flex items-center gap-2">
            <span className="text-xl" style={{ opacity: Math.min((swipeDelta - 30) / 25, 1) }}>🔖</span>
            <span
              className="text-xs font-bold"
              style={{ color: '#16a34a', opacity: Math.min((swipeDelta - 30) / 25, 1) }}
            >
              Guardar en tablero
            </span>
          </div>
        </div>
      )}
      {swipeDelta < -30 && (
        <div
          className="absolute inset-0 pointer-events-none z-10 flex items-center justify-end pr-4"
          style={{ background: `rgba(239,68,68,${Math.min((Math.abs(swipeDelta) - 30) / 50, 0.12)})` }}
        >
          <div className="flex items-center gap-2">
            <span
              className="text-xs font-bold"
              style={{ color: '#dc2626', opacity: Math.min((Math.abs(swipeDelta) - 30) / 25, 1) }}
            >
              Descartar
            </span>
            <span className="text-xl" style={{ opacity: Math.min((Math.abs(swipeDelta) - 30) / 25, 1) }}>✕</span>
          </div>
        </div>
      )}

      {/* High-match "Altamente Competitivo" celebration badge */}
      {showCelebration && (
        <div className="absolute top-0 left-0 right-0 flex justify-center pt-1 z-10 pointer-events-none">
          <span className="px-3 py-0.5 rounded-b-xl text-xs font-bold text-white animate-bounce"
            style={{ background: '#16a34a', boxShadow: '0 2px 10px rgba(22,163,74,0.45)' }}>
            🏆 Altamente Competitivo
          </span>
        </div>
      )}

      {/* Top Employer honor bar — 4px crimson strip for registry companies */}
      {isTopEmployer && (
        <div style={{ height: 4, background: 'linear-gradient(90deg,#c2185b,#e91e63)', borderRadius: '16px 16px 0 0' }} />
      )}

      <div className="p-4 space-y-3">
        {/* ── Row 1: Logo + Title + Score ── */}
        <div className="flex items-start gap-3">
          {/* Company avatar — brand color for known companies, gray for unknown */}
          <div className="relative w-10 h-10 rounded-xl shrink-0 flex items-center justify-center text-sm font-bold"
            style={{ background: avatarColors.bg, color: avatarColors.text }}>
            {(job.company || '?')[0].toUpperCase()}
            {/* "Oferta directa" micro-badge for ATS-sourced jobs */}
            {isDirectAts && (
              <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[8px]"
                style={{ background: '#16a34a', border: '1.5px solid white' }}>✓</div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm leading-snug truncate" style={{ color: '#0d2137' }}>
              {job.title}
            </p>
            <p className="text-xs mt-0.5 truncate" style={{ color: '#64748b' }}>
              {job.company}
              {isTopEmployer && <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wide" style={{ color: '#c2185b' }}>Top Employer</span>}
            </p>
            {/* Location + remote + market badges */}
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {job.remote && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                  style={{ background: 'rgba(34,197,94,0.12)', color: '#15803d' }}>
                  Remoto
                </span>
              )}
              {isDirectAts && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                  style={{ background: 'rgba(22,163,74,0.10)', color: '#15803d', border: '1px solid rgba(22,163,74,0.25)' }}>
                  ✓ Via {ATS_NAMES[job.source] || 'ATS'}
                </span>
              )}
              {!isDirectAts && isGlobalRemote && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                  style={{ background: 'rgba(99,102,241,0.10)', color: '#4f46e5', border: '1px solid rgba(99,102,241,0.2)' }}>
                  Global
                </span>
              )}
              {isLocalMarket && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                  style={{ background: 'rgba(0,119,181,0.10)', color: '#0077B5', border: '1px solid rgba(0,119,181,0.2)' }}>
                  Mercado local
                </span>
              )}
              {job.location && !job.remote && (
                <span className="text-[10px]" style={{ color: '#94a3b8' }}>
                  {job.location}
                </span>
              )}
              {/* Freshness: "Publicado hoy" pill or regular date */}
              {isPublishedToday ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                  style={{ background: 'rgba(22,197,94,0.15)', color: '#15803d', border: '1px solid rgba(22,163,74,0.30)' }}>
                  🟢 Publicado hoy
                </span>
              ) : daysAgo ? (
                <span className="text-[10px]" style={{ color: isStale ? '#f59e0b' : '#94a3b8' }}>· {daysAgo}</span>
              ) : null}
            </div>
            {/* Seniority + industry + geo + expansion badges */}
            {!expanded && (
              <div className="flex gap-1.5 mt-1 flex-wrap">
                {job.seniority && job.seniority !== 'No especificado' && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                    style={{ background: 'rgba(0,119,181,0.08)', color: '#0077B5' }}>
                    {job.seniority}
                  </span>
                )}
                {job.industry && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                    style={{ background: 'rgba(100,116,139,0.08)', color: '#475569' }}>
                    {job.industry}
                  </span>
                )}
                {/* Geo badge — shown when we confirmed it's near the candidate */}
                {!job.remote && geo_score != null && geo_score >= 0.85 && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                    style={{ background: 'rgba(16,185,129,0.09)', color: '#059669' }}>
                    🧭 Tu zona
                  </span>
                )}
                {priority === 'alta' && (
                  <span style={{ background: '#c2185b', color: '#fff', borderRadius: 4, padding: '2px 7px', fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>
                    🎯 PRIORIDAD ALTA
                  </span>
                )}
                {/* Match type badge — sourced from AI headhunter scoring */}
                {match_type === 'Directo' && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                    style={{ background: 'rgba(22,163,74,0.11)', color: '#15803d', border: '1px solid rgba(22,163,74,0.28)' }}
                    aria-label="Match directo: tu perfil se alinea directamente con este rol">
                    ⚡ Match Directo
                  </span>
                )}
                {match_type === 'Adyacente' && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                    style={{ background: 'rgba(59,130,246,0.10)', color: '#1d4ed8', border: '1px solid rgba(59,130,246,0.25)' }}
                    aria-label="Match adyacente: rol en una familia profesional cercana a la tuya">
                    ↗ Match Adyacente
                  </span>
                )}
                {match_type === 'Transferible' && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                    style={{ background: 'rgba(245,158,11,0.10)', color: '#b45309', border: '1px solid rgba(245,158,11,0.28)' }}
                    aria-label="Habilidades transferibles: tus competencias aplican a este rol con adaptación">
                    ↔ Transferible
                  </span>
                )}
                {match_type === 'Exploratorio' && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                    style={{ background: 'rgba(148,163,184,0.10)', color: '#475569', border: '1px solid rgba(148,163,184,0.25)' }}
                    aria-label="Exploratorio: rol fuera de tu área principal, incluido para ampliar horizontes">
                    🔭 Exploratorio
                  </span>
                )}
                {/* AI discovery badge — shown for expansion-layer results */}
                {from_expansion && !ai_fallback && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                    style={{ background: 'rgba(14,165,233,0.09)', color: '#0284c7' }}>
                    ✨ Hallazgo IA
                  </span>
                )}
                {/* Heuristic fallback indicator — AI analysis unavailable for this card */}
                {ai_fallback && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                    style={{ background: 'rgba(148,163,184,0.10)', color: '#64748b', border: '1px solid rgba(148,163,184,0.20)' }}
                    aria-label="Análisis preliminar basado en palabras clave — el análisis IA profundo estará disponible en la próxima búsqueda">
                    🔍 Matcheo inicial · actualizá para análisis IA
                  </span>
                )}
                {/* ATS Verificado — sourced directly from an ATS (greenhouse/lever/ashby/workable) */}
                {job.ats_type && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                    style={{ background: 'rgba(16,185,129,0.10)', color: '#059669', border: '1px solid rgba(16,185,129,0.22)' }}>
                    🏢 ATS Verificado
                  </span>
                )}
                {/* Con salario — salary info is available */}
                {(job.salary_min || job.salary_max) && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                    style={{ background: 'rgba(34,197,94,0.10)', color: '#16a34a', border: '1px solid rgba(34,197,94,0.22)' }}>
                    💰 Con salario
                  </span>
                )}
                {/* Remoto Total — fully remote position */}
                {job.remote === true && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                    style={{ background: 'rgba(99,102,241,0.10)', color: '#4f46e5', border: '1px solid rgba(99,102,241,0.22)' }}>
                    🌍 Remoto Total
                  </span>
                )}
                {/* Reciente — posted less than 7 days ago */}
                {postedDays !== null && postedDays < 7 && postedDays > 0 && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                    style={{ background: 'rgba(239,68,68,0.09)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.20)' }}>
                    🔥 Reciente
                  </span>
                )}
                {/* Alta compatibilidad — match_score >= 8.5 (85+ on 0-10 scale) */}
                {match_score != null && match_score >= 8.5 && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                    style={{ background: 'rgba(217,119,6,0.10)', color: '#92400e', border: '1px solid rgba(217,119,6,0.22)' }}>
                    ⭐ Alta compatibilidad
                  </span>
                )}
              </div>
            )}
            {isStale && (
              <p className="text-[10px] mt-1 px-2 py-0.5 rounded-lg"
                style={{ background: 'rgba(245,158,11,0.08)', color: '#92400e', border: '1px solid rgba(245,158,11,0.2)' }}>
                Publicado hace más de 2 semanas — verificá si sigue activo
              </p>
            )}
          </div>

          {/* Match score ring — shown for all users regardless of score */}
          {scorePct != null && (
            <div className="shrink-0 flex flex-col items-center gap-0.5">
              <MatchScoreRing score={scorePct} size={52} animated={index < 5} />
              <span className="text-[9px] font-semibold text-center leading-tight" style={{ color: c?.text }}>
                {c?.label}
              </span>
            </div>
          )}
        </div>

        {/* ── Row 2: AI Summary ── */}
        {summary && !ai_fallback && (
          <p className="text-xs leading-relaxed" style={{ color: '#475569' }}>
            {summary}
          </p>
        )}
        {ai_fallback && (
          <p className="text-xs italic" style={{ color: '#94a3b8' }}>
            Puntuación estimada · El análisis con IA estará disponible al actualizar.
          </p>
        )}

        {headhunter_note && !ai_fallback && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginTop: 6, padding: '8px 10px', background: 'rgba(194,24,91,0.07)', borderRadius: 6, borderLeft: '3px solid #c2185b' }}>
            <span style={{ fontSize: 14, flexShrink: 0 }}>🎯</span>
            <p style={{ margin: 0, fontSize: 12, color: '#c2185b', fontWeight: 500, lineHeight: 1.5 }}>
              {headhunter_note}
            </p>
          </div>
        )}
        {/* ── Row 3: Strengths (collapsed: 2 max) ── */}
        {!ai_fallback && strengths?.length > 0 && (
          <div className="space-y-1">
            {strengths.slice(0, expanded ? 3 : 2).map((s, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <span className="shrink-0 mt-0.5 text-xs">✅</span>
                <p className="text-xs leading-snug" style={{ color: '#374151' }}>{s}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Row 4: Gaps → reframed as growth opportunities ── */}
        {!ai_fallback && gaps?.length > 0 && (
          <div className="space-y-1">
            {gaps.slice(0, expanded ? 2 : 1).map((g, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <span className="shrink-0 mt-0.5 text-xs">📈</span>
                <p className="text-xs leading-snug" style={{ color: '#475569' }}>{g}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Expanded: salary + industry ── */}
        {expanded && (
          <div className="rounded-xl p-3 space-y-1.5" style={{ background: '#f8fafc', border: '1px solid rgba(0,119,181,0.10)' }}>
            {job.seniority && job.seniority !== 'No especificado' && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold w-20 shrink-0" style={{ color: '#64748b' }}>Seniority</span>
                <span className="text-xs" style={{ color: '#0d2137' }}>{job.seniority}</span>
              </div>
            )}
            {job.industry && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold w-20 shrink-0" style={{ color: '#64748b' }}>Industria</span>
                <span className="text-xs" style={{ color: '#0d2137' }}>{job.industry}</span>
              </div>
            )}
            {(job.salary_min || job.salary_max) && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold w-20 shrink-0" style={{ color: '#64748b' }}>Salario</span>
                <span className="text-xs" style={{ color: '#0d2137' }}>
                  {job.salary_min && job.salary_max
                    ? `${job.currency || 'USD'} ${job.salary_min.toLocaleString()}–${job.salary_max.toLocaleString()}`
                    : job.salary_min
                      ? `Desde ${job.currency || 'USD'} ${job.salary_min.toLocaleString()}`
                      : `Hasta ${job.currency || 'USD'} ${job.salary_max.toLocaleString()}`}
                </span>
              </div>
            )}
            {job.skills_required?.length > 0 && (
              <div className="flex items-start gap-2">
                <span className="text-xs font-semibold w-20 shrink-0 mt-0.5" style={{ color: '#64748b' }}>Skills</span>
                <div className="flex flex-wrap gap-1">
                  {job.skills_required.slice(0, 6).map((sk, i) => (
                    <span key={i} className="px-1.5 py-0.5 rounded-md text-[10px]"
                      style={{ background: 'rgba(0,119,181,0.08)', color: '#0077B5' }}>{sk}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Toggle expand ── */}
        <button
          onClick={() => {
            const nextExpanded = !expanded
            setExpanded(nextExpanded)
            if (nextExpanded) {
              // 4. JOB CARD TAPPED — user opened a job detail view.
              //    position is 1-based (index prop is 0-based).
              trackEvent('radar_laboral_job_card_tapped', {
                match_score: scorePct,
                position:    index + 1,
                source:      job.source || null,
                company:     job.company || null,
                is_remote:   !!job.remote,
              })
            }
            trackEvent('job_card_expanded', { expanded: nextExpanded })
          }}
          className="text-xs w-full text-center py-2.5"
          style={{ color: '#0077B5' }}>
          {expanded ? '▲ Ver menos' : '▼ Ver más detalles'}
        </button>

        {/* ── Actions row — 2 buttons, always visible ── */}
        <div className="flex gap-2 pt-1">
          {/* Guardar en tablero */}
          <button
            onClick={handleSave}
            disabled={saved || saveLoading}
            className="flex-1 py-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all duration-200"
            style={saved
              ? { background: 'rgba(22,163,74,0.12)', color: '#15803d', border: '1px solid rgba(22,163,74,0.30)' }
              : saveError
                ? { background: 'rgba(239,68,68,0.10)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.25)' }
                : { background: LI_GRADIENT, color: 'white' }}>
            {saveLoading
              ? <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
              : null}
            {saved ? '✓ Guardado' : saveError ? '↺ Reintentar' : '🔖 Guardar'}
          </button>

          {/* Aplicar — link to job URL; dimmed when unavailable */}
          {job.url ? (
            <a href={job.url} target="_blank" rel="noopener noreferrer"
              onClick={() => trackEvent('job_recommendation_apply', { rec_id, company: job.company, priority: rec.priority || null, from_reranking: rec.from_reranking || false })}
              className="flex-1 py-3 rounded-xl text-xs font-semibold text-center transition-all"
              style={{ background: 'rgba(99,102,241,0.10)', color: '#6366f1', border: '1px solid rgba(99,102,241,0.25)' }}>
              Aplicar →
            </a>
          ) : (
            <button
              disabled
              className="flex-1 py-3 rounded-xl text-xs font-semibold text-center"
              style={{ background: 'rgba(99,102,241,0.05)', color: '#94a3b8', border: '1px solid rgba(99,102,241,0.10)' }}>
              Sin enlace
            </button>
          )}
        </div>

        {/* Save error feedback */}
        {saveError && !saved && (
          <div
            className="rounded-xl p-3 flex items-center justify-between gap-2"
            style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.18)', animation: 'fadeIn 0.2s ease-out' }}>
            <p className="text-xs font-medium" style={{ color: '#dc2626' }}>❌ No se pudo guardar — tocá Reintentar</p>
          </div>
        )}


        {/* Post-save confirmation */}
        {saved && (
          <div
            className="rounded-xl p-3 space-y-2"
            style={{ background: 'rgba(194,24,91,0.05)', border: '1px solid rgba(194,24,91,0.18)', animation: 'fadeIn 0.25s ease-out' }}>
            <div className="flex items-center gap-2">
              <span className="text-sm">📡</span>
              <p className="text-xs font-semibold" style={{ color: '#0d2137' }}>
                {alreadyExists ? 'Ya estaba en Radar Laboral' : '✓ Guardado en Radar Laboral'}
              </p>
            </div>
            {showSaveConfirm && !alreadyExists && (
              <>
                <p className="text-xs" style={{ color: '#64748b' }}>¿Querés ir al tablero o seguir explorando?</p>
                <div className="flex gap-2">
                  {onGoToKanban && (
                    <button
                      onClick={onGoToKanban}
                      className="flex-1 py-2 rounded-xl text-xs font-semibold"
                      style={{ background: 'rgba(194,24,91,0.12)', color: '#c2185b', border: '1px solid rgba(194,24,91,0.25)' }}>
                      Ir al tablero →
                    </button>
                  )}
                  <button
                    onClick={() => setShowSaveConfirm(false)}
                    className="flex-1 py-2 rounded-xl text-xs font-semibold"
                    style={{ background: 'rgba(13,33,55,0.06)', color: '#64748b', border: '1px solid rgba(13,33,55,0.10)' }}>
                    Seguir explorando
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Dismiss link */}
        <button onClick={handleDismiss}
          className="w-full text-center text-[11px] py-3"
          style={{ color: '#cbd5e1' }}>
          Ya la vi
        </button>
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// JobRecommendationsScreen — main component
// ═════════════════════════════════════════════════════════════════════════════

export default function JobRecommendationsScreen({
  profileText,
  result,
  user,
  authToken,
  cvFinalData,
  trackingColumnas,
  createCard,
  loadTracking,
  addToast,
  setStep,
  setShowPremiumModal,
  setShowJobModal,
  setJobCvForAdapter,
  setJobPosting,
  setJobResult,
  setJobError,
  resetInterview,
  setInterviewJobContext,
  generatePersonalizedInterviewQs,
  onBack,
  // Streak integration — searching for jobs counts as daily activity
  streak = 0,
  // Weekly insight passed in from parent (e.g. "Esta semana exploraste 12 oportunidades")
  weeklyExplored = 0,
}) {
  // ── Loading states ─────────────────────────────────────────────────────────
  const [loadState, setLoadState]         = useState('idle')   // 'idle'|'loading'|'done'|'error'|'no_profile'
  const [loadStage, setLoadStage]         = useState(0)
  const [recommendations, setRecs]        = useState([])
  const [error, setError]                 = useState('')
  const [quotaRemaining, setQuotaRem]     = useState(null)
  const [totalAnalyzed, setTotalAnalyzed] = useState(0)
  const [fromCache, setFromCache]         = useState(false)
  const [cachedToday, setCachedToday]         = useState(false)
  const [cacheTimestamp, setCacheTs]          = useState(null)
  const [servedFromHistory, setFromHistory]   = useState(false)
  const [expansionAvail, setExpansionAvail]   = useState(false)
  const [expansionUsed, setExpansionUsed]     = useState(false)
  const [expansionCount, setExpansionCount]   = useState(0)
  const [candidateLoc, setCandidateLoc]       = useState(null)
  const [pipelineStats, setPipelineStats]     = useState(null)   // { sources_count, total_evaluated }
  const [serperActive, setSerperActive]       = useState(false)  // Google Jobs ran this search
  const [expansionSearched, setExpSearched]  = useState(false)  // deep search ran for this user
  const [debugInfo, setDebugInfo]             = useState(null)   // visible diagnostic when AI fails
  const [showSourceDebug, setShowSourceDebug] = useState(false)  // Jooble/source debug panel toggle
  const [pingResult, setPingResult]           = useState(null)   // Gemini API key diagnostic
  const [pinging, setPinging]                 = useState(false)

  // ── Analytics session refs ─────────────────────────────────────────────────
  // Track how many cards the user has seen and saved in this session
  // so we can report on back-navigation
  const jobsSeenRef           = useRef(0)
  const jobsSavedRef          = useRef(0)
  const savedRecsInSessionRef = useRef(new Set())  // idempotency: prevents duplicate saves
  // Wall-clock stamp for session duration reporting
  const screenOpenedAtRef = useRef(Date.now())

  // ── Filters ────────────────────────────────────────────────────────────────
  const [showFilters, setShowFilters]     = useState(false)
  const [filters, setFilters]             = useState({
    seniority: '',
    remoteOnly: false,
    location:  '',
    minSalary: null,
  })
  const [activeFilters, setActiveFilters] = useState({ ...filters })

  // ── Sort ───────────────────────────────────────────────────────────────────
  const [sortBy, setSortBy]               = useState('score')  // 'score'|'recent'

  // ── Refine search (custom keyword override) ────────────────────────────────
  const [refineQuery, setRefineQuery]     = useState('')
  const [refineInput, setRefineInput]     = useState('')
  const [showRefine, setShowRefine]       = useState(false)

  // ── Refine search input focus ─────────────────────────────────────────────
  const refineInputRef = useRef(null)
  useEffect(() => {
    if (showRefine && refineInputRef.current) {
      // Delayed focus: gives iOS time to position the keyboard without a jump
      const t = setTimeout(() => refineInputRef.current?.focus(), 120)
      return () => clearTimeout(t)
    }
  }, [showRefine])

  const scrollRef = useRef(null)

  // ── Free tier gate: 3 results visible, rest blurred ───────────────────────
  const FREE_VISIBLE = 3
  const isPremium    = !!user?.es_premium

  // ── Build search queries from profile ─────────────────────────────────────
  const buildQueries = useCallback(() => {
    if (!profileText) return []
    const SENIORITY_WORDS = new Set(['senior','junior','semi','ssr','lead','staff','head','principal','intern','trainee','sr','jr'])
    const titleMatch = profileText.match(/TITULAR PROFESIONAL:\s*([^\n]+)/i)
      || profileText.match(/^([^\n]{10,80})/m)
    // Strip LinkedIn formatting characters (pipes, brackets, etc.)
    const raw = (titleMatch?.[1]?.trim() || '').replace(/[|;()\[\]]/g, ' ').replace(/\s+/g, ' ').trim()
    if (!raw) return refineQuery ? [refineQuery] : ['profesional']
    const words = raw.split(/\s+/).filter(w => w.length > 2)
    const coreWords = words.filter(w => !SENIORITY_WORDS.has(w.toLowerCase()))
    const queries = [
      raw.slice(0, 60),                          // full cleaned headline
      coreWords.slice(0, 3).join(' '),            // core role without seniority
      coreWords.slice(0, 2).join(' '),            // shorter core variant
    ].map(q => q.trim()).filter((q, i, arr) => q.length > 2 && arr.indexOf(q) === i)
    return refineQuery ? [refineQuery, ...queries].slice(0, 5) : queries.slice(0, 3)
  }, [profileText, refineQuery])

  // ── Fetch recommendations ──────────────────────────────────────────────────
  const pingGemini = useCallback(async () => {
    setPinging(true)
    setPingResult(null)
    try {
      const r = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { ...WORKER_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ping_gemini' }),
      })
      const data = await r.json()
      setPingResult(data)
    } catch (err) {
      setPingResult({ ok: false, error: 'FETCH_FAILED', detail: err.message })
    } finally {
      setPinging(false)
    }
  }, [])

  const fetchRecommendations = useCallback(async () => {
    if (!profileText || profileText.trim().length < 50) {
      setLoadState('no_profile')
      return
    }

    const queries = buildQueries()
    if (!queries.length) { setLoadState('no_profile'); return }

    // 2. SEARCH INITIATED — fires every time the user triggers a search,
    //    including manual refresh and filter changes.
    trackEvent('radar_laboral_search_started', {
      query_terms_count: queries.length,
      remote_ok:         activeFilters.remoteOnly,
      location_filter:   activeFilters.location || null,
      seniority_filter:  activeFilters.seniority || null,
      min_salary_filter: activeFilters.minSalary || null,
      is_premium:        isPremium,
    })
    const _searchStartMs = Date.now()

    setLoadState('loading')
    setLoadStage(0)
    setError('')
    setRecs([])

    // Advance loading stage every 2 s (visual trust-building)
    const stageTimer = setInterval(() => {
      setLoadStage(s => Math.min(s + 1, LOADING_STAGES.length - 1))
    }, 2000)

    // Ensure minimum 1.5 s display (trust)
    const minDisplayTimer = new Promise(r => setTimeout(r, 1500))

    try {
      const headers = {
        ...WORKER_HEADERS,
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      }

      const [res] = await Promise.all([
        fetch(WORKER_URL, {
          method:  'POST',
          headers,
          body: JSON.stringify({
            action:       'ai_job_recommendations',
            profile_text: profileText.slice(0, 3000),
            queries,
            location:     activeFilters.location || undefined,
            remote_ok:    activeFilters.remoteOnly ? true : undefined,
            count:        15,
            user_id:      user?.id || undefined,
          }),
        }),
        minDisplayTimer,
      ])

      clearInterval(stageTimer)

      if (res.status === 429) {
        const data = await res.json().catch(() => ({}))
        // Normalize error to string — worker can return {message:} objects in some paths
        const rawErr = data?.error
        const errStr = typeof rawErr === 'string' ? rawErr
          : (rawErr?.message ? String(rawErr.message) : 'Error al buscar. Intentá de nuevo.')
        setError(errStr)
        setLoadState('error')
        trackEvent('job_recommendations_rate_limited')
        return
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }

      const data = await res.json()
      setLoadStage(3)

      if (!data.ok || !data.recommendations) {
        throw new Error(data.error || 'Respuesta inválida del servidor')
      }

      setRecs(data.recommendations)
      setQuotaRem(data.quota_remaining ?? null)
      setTotalAnalyzed(data.total_jobs_analyzed || 0)
      setFromCache(data.from_cache || false)
      setCachedToday(data.cached_today || false)
      setCacheTs(data.cache_timestamp || null)
      setFromHistory(data.served_from_history || false)
      setExpansionAvail(data.expansion_available || false)
      setExpansionUsed(data.expansion_used || false)
      setExpansionCount(data.expansion_count || 0)
      setCandidateLoc(data.candidate_location || null)
      setPipelineStats(data.pipeline_stats || null)
      setSerperActive(data.pipeline_stats?.serper_in_sources || false)
      setExpSearched(data.expansion_searched || false)

      const hasFallback = data.fallback || (data.recommendations || []).some(r => r.ai_fallback)
      setDebugInfo(hasFallback || data.pipeline_stats?.ai_error ? {
        ai_error:          data.pipeline_stats?.ai_error || null,
        ai_error_body:     data.pipeline_stats?.ai_error_body || null,
        profession_family: data.pipeline_stats?.profession_family || null,
        profession_source: data.pipeline_stats?.profession_source || null,
        gemini_matched:    data.pipeline_stats?.gemini_matched ?? null,
        worker_version:    data.pipeline_stats?.worker_version || null,
        total_ms:          data.pipeline_stats?.total_ms || null,
        is_fallback:       hasFallback,
      } : null)

      setLoadState('done')

      // 3. SEARCH COMPLETED — rich params enable source-level attribution and
      //    latency percentile analysis in BigQuery / Looker Studio.
      //    source_counts: object keyed by API name → number of jobs returned from it.
      const sourceCounts = (data.recommendations || []).reduce((acc, rec) => {
        const src = rec.job?.source || 'unknown'
        acc[src] = (acc[src] || 0) + 1
        return acc
      }, {})
      const avgScore = data.recommendations.length
        ? Math.round(data.recommendations.reduce((s, r) => s + (r.match_score ?? 0), 0) / data.recommendations.length * 10)
        : null

      trackEvent('radar_laboral_search_completed', {
        total_results:      data.recommendations.length,
        total_analyzed:     data.total_jobs_analyzed || 0,
        time_ms:            Math.round(Date.now() - _searchStartMs),
        from_cache:         data.from_cache || false,
        avg_match_score:    avgScore,
        has_remote_results: data.recommendations.some(r => r.job?.remote),
        is_premium:         isPremium,
        // Flat source_counts — GA4 params must be scalar; send top-4 sources
        source_remoteok:    sourceCounts['remoteok']  || 0,
        source_remotive:    sourceCounts['remotive']  || 0,
        source_jobicy:      sourceCounts['jobicy']    || 0,
        source_jooble:      sourceCounts['jooble']    || 0,
      })
      // Reset per-session seen counter on each new search result batch
      jobsSeenRef.current = 0

    } catch (err) {
      clearInterval(stageTimer)
      setError('Algo salió mal al buscar oportunidades. Intentá de nuevo.')
      setLoadState('error')
      trackError('radar_laboral', err.isRateLimit ? 'rate_limit' : err.name === 'AbortError' ? 'timeout' : 'api_error', { message: err.message })
      trackEvent('job_recommendations_error', { message: err.message })
    }
  }, [profileText, buildQueries, activeFilters, authToken, user?.id, isPremium])

  // ── Auto-fetch on mount if profile available ───────────────────────────────
  useEffect(() => {
    // 1. SCREEN OPENED — fires once on mount regardless of profile state.
    //    has_profile lets us segment "landed with no CV" vs "ready to search".
    trackEvent('radar_laboral_opened', {
      has_profile:  !!(profileText && profileText.length >= 50),
      has_cv:       !!cvFinalData,
      is_premium:   !!user?.es_premium,
    })
    screenOpenedAtRef.current = Date.now()

    if (loadState === 'idle' && profileText?.length >= 50) {
      fetchRecommendations()
    } else if (!profileText || profileText.length < 50) {
      setLoadState('no_profile')
    }

    // Pre-load kanban columns so the fallback save path works without visiting the Kanban first
    if (user && loadTracking && (!trackingColumnas || trackingColumnas.length === 0)) {
      loadTracking().catch(() => {})
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Filter + sort logic (memoized — avoids recalculation on every swipe/hover) ─
  const filteredRecs = useMemo(() => recommendations
    .filter(rec => {
      if (activeFilters.remoteOnly && !rec.job.remote) return false
      if (activeFilters.seniority && rec.job.seniority !== activeFilters.seniority) return false
      if (activeFilters.location && rec.job.location && !rec.job.location.toLowerCase().includes(activeFilters.location.toLowerCase())) return false
      if (activeFilters.minSalary && rec.job.salary_min && rec.job.salary_min < activeFilters.minSalary) return false
      return true
    })
    .sort((a, b) => {
      if (sortBy === 'score') return (b.match_score ?? 0) - (a.match_score ?? 0)
      const da = a.job.posted_at ? new Date(a.job.posted_at).getTime() : 0
      const db = b.job.posted_at ? new Date(b.job.posted_at).getTime() : 0
      return db - da
    }), [recommendations, activeFilters, sortBy])

  // ── Save to Kanban ─────────────────────────────────────────────────────────
  const handleSaveToKanban = async (rec) => {
    const saveKey = rec.rec_id || `${rec.job?.source}:${rec.job?.url}`

    // If rec_id exists, use the worker action for clean data persistence
    if (rec.rec_id && authToken) {
      // Allow re-saves (worker handles dedup server-side and returns already_exists)
      const res = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { ...WORKER_HEADERS, Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ action: 'job_save_to_kanban', rec_id: rec.rec_id }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'No se pudo guardar')
      }
      const data = await res.json().catch(() => ({}))
      const alreadyExists = data.already_exists === true

      if (!alreadyExists) {
        savedRecsInSessionRef.current.add(saveKey)
        jobsSavedRef.current += 1
        trackEvent('radar_laboral_job_saved', {
          match_score: rec.match_score != null ? Math.round(rec.match_score * 10) : null,
          source:      rec.job?.source || null,
          company:     rec.job?.company || null,
          is_remote:   !!rec.job?.remote,
          position:    filteredRecs.findIndex(r => r.rec_id === rec.rec_id) + 1,
          jobs_saved_this_session: jobsSavedRef.current,
        })
      }
      return { alreadyExists }
    }

    // Fallback: direct createCard (for non-persisted recs or anon)
    if (!user) {
      addToast?.('Iniciá sesión para guardar postulaciones', 'error')
      throw new Error('not_authenticated')
    }
    if (saveKey && savedRecsInSessionRef.current.has(saveKey)) {
      return { alreadyExists: true }
    }
    const radarCol = trackingColumnas?.find(c => c.nombre === 'Radar Laboral') || trackingColumnas?.[0]
    if (!radarCol) {
      addToast?.('Tablero no cargado — intentá de nuevo', 'error')
      throw new Error('no_kanban_column')
    }
    await createCard(radarCol.id, {
      empresa:          rec.job.company || '',
      puesto:           rec.job.title   || '',
      link_aviso:       rec.job.url     || null,
      notas:            rec.summary     || null,
      fecha_aplicacion: new Date().toISOString().slice(0, 10),
      seniority:        rec.job.seniority !== 'No especificado' ? rec.job.seniority : null,
    })
    savedRecsInSessionRef.current.add(saveKey)
    jobsSavedRef.current += 1
    trackEvent('radar_laboral_job_saved', {
      match_score: rec.match_score != null ? Math.round(rec.match_score * 10) : null,
      source:      rec.job?.source || null,
      company:     rec.job?.company || null,
      is_remote:   !!rec.job?.remote,
      position:    filteredRecs.findIndex(r => r.rec_id === rec.rec_id) + 1,
      jobs_saved_this_session: jobsSavedRef.current,
    })
    return { alreadyExists: false }
  }

  // ── Dismiss ────────────────────────────────────────────────────────────────
  const handleDismiss = async (rec) => {
    if (rec.rec_id && authToken) {
      // Fire-and-forget status update
      fetch(WORKER_URL, {
        method: 'POST',
        headers: { ...WORKER_HEADERS, Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ action: 'job_update_status', rec_id: rec.rec_id, status: 'dismissed' }),
      }).catch(() => {})
    }
    // 6. JOB DISMISSED — signals negative signal for future ML ranking and
    //    lets us calculate "dismiss rate by match score band" in GA4.
    trackEvent('radar_laboral_job_dismissed', {
      match_score: rec.match_score != null ? Math.round(rec.match_score * 10) : null,
      source:      rec.job?.source || null,
      position:    filteredRecs.findIndex(r => r.rec_id === rec.rec_id) + 1,
      // reason is not captured in UI yet; set to null so the schema is stable
      reason:      null,
    })
  }


  // ── Adapt CV ───────────────────────────────────────────────────────────────
  const handleAdaptCv = (rec) => {
    const cv = cvFinalData || null
    if (!cv) {
      addToast('Primero generá tu CV para poder adaptarlo', 'error')
      return
    }
    setJobCvForAdapter(cv)
    // Full context for the CV adapter — more fields = better adaptation quality
    const posting = [
      `Empresa: ${rec.job.company || ''}`,
      `Puesto: ${rec.job.title || ''}`,
      rec.job.seniority && rec.job.seniority !== 'No especificado' ? `Seniority: ${rec.job.seniority}` : '',
      rec.job.location ? `Ubicación: ${rec.job.remote ? 'Remoto' : rec.job.location}` : rec.job.remote ? 'Modalidad: Remoto' : '',
      rec.job.industry  ? `Industria: ${rec.job.industry}` : '',
      (rec.job.salary_min || rec.job.salary_max)
        ? `Salario: ${rec.job.salary_min ? `${rec.job.currency || 'USD'} ${rec.job.salary_min.toLocaleString()}` : ''}${rec.job.salary_max ? ` – ${rec.job.salary_max.toLocaleString()}` : ''}`.trim()
        : '',
      rec.job.skills_required?.length ? `Skills requeridas: ${rec.job.skills_required.join(', ')}` : '',
      rec.job.description ? `\nDescripción:\n${rec.job.description.slice(0, 1000)}` : '',
      rec.strengths?.length  ? `\nFortalezas detectadas (a destacar en el CV):\n${rec.strengths.join('\n')}` : '',
      rec.gaps?.length       ? `\nBrechas a cubrir (adaptar el lenguaje del CV para abordarlas):\n${rec.gaps.join('\n')}` : '',
      rec.job.url ? `\nAviso original: ${rec.job.url}` : '',
    ].filter(Boolean).join('\n')
    setJobPosting(posting)
    setJobResult(null)
    setJobError('')
    setShowJobModal(true)
    // 9. ADAPT CV TAPPED — premium upsell #2 touchpoint.
    //    Keep legacy event name for continuity; add rich params.
    trackEvent('job_recommendations_adapt_cv', { company: rec.job.company })
    trackEvent('radar_laboral_adapt_cv_tapped', {
      match_score: rec.match_score != null ? Math.round(rec.match_score * 10) : null,
      source:      rec.job?.source || null,
      has_cv:      !!cvFinalData,
    })
  }

  // ── Prep interview ─────────────────────────────────────────────────────────
  const handlePrepInterview = (rec) => {
    resetInterview()
    const ctx = {
      empresa:               rec.job.company,
      puesto:                rec.job.title,
      seniority:             rec.job.seniority !== 'No especificado' ? rec.job.seniority : '',
      ats_keywords:          rec.job.skills_required?.slice(0, 8).join(', ') || '',
      notas:                 rec.summary || '',
      jd_summary:            rec.job.description?.slice(0, 800) || '',   // was 400 — more context = better Qs
      adaptation_notes:      rec.gaps?.join(' | ') || '',
      strengths_to_reinforce: rec.strengths?.slice(0, 3).join(' | ') || '',  // NEW: prep strengths too
      match_score:           rec.match_score ?? null,                    // NEW: AI difficulty calibration
      location:              rec.job.remote ? 'Remoto' : (rec.job.location || ''),
      industry:              rec.job.industry || '',
      link_aviso:            rec.job.url || '',
    }
    setInterviewJobContext(ctx)
    generatePersonalizedInterviewQs(ctx)
    // Navigate to interview intro (already pre-configured)
    import('../../constants').then(({ STEPS }) => setStep(STEPS.INTERVIEW_INTRO))
    // 10. PREP INTERVIEW TAPPED — premium upsell #3 touchpoint.
    //     Keep legacy event name for continuity; add rich params.
    trackEvent('job_recommendations_prep_interview', { company: rec.job.company })
    trackEvent('radar_laboral_prep_interview_tapped', {
      match_score: rec.match_score != null ? Math.round(rec.match_score * 10) : null,
      source:      rec.job?.source || null,
    })
  }


  // ── Active filter count for badge ─────────────────────────────────────────
  const activeFilterCount = [
    activeFilters.seniority,
    activeFilters.remoteOnly,
    activeFilters.location,
    activeFilters.minSalary,
  ].filter(Boolean).length

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="step-transition w-full max-w-4xl mx-auto">

      {/* ══ STICKY HEADER ══ */}
      <div className="sticky top-0 z-30 pt-2 pb-3 px-0"
        style={{ background: 'rgba(248,250,252,0.97)', backdropFilter: 'blur(8px)', borderBottom: '1px solid rgba(0,119,181,0.08)' }}>

        {/* Back + title row */}
        <div className="flex items-center justify-between gap-3 mb-2">
          <button
            onClick={() => {
              trackEvent('radar_laboral_exited', {
                results_seen:       jobsSeenRef.current,
                jobs_saved:         jobsSavedRef.current,
                session_duration_s: Math.round((Date.now() - screenOpenedAtRef.current) / 1000),
                load_state:         loadState,
              })
              onBack()
            }}
            className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-xl"
            style={BTN_BACK_STYLE}>
            ← Volver
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-sm truncate" style={{ color: '#0d2137' }}>
                Radar Laboral
              </h1>
              {/* Día X activo — streak badge shown inline in header */}
              {streak > 0 && (
                <span
                  className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(249,115,22,0.10)', color: '#ea580c', border: '1px solid rgba(249,115,22,0.20)' }}
                >
                  🔥 Día {streak}
                </span>
              )}
            </div>
            {loadState === 'done' && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="text-[10px]" style={{ color: '#94a3b8' }}>
                  {pipelineStats?.sources_count
                    ? `${pipelineStats.sources_count} fuentes`
                    : null}
                  {pipelineStats?.sources_count && (pipelineStats?.total_evaluated || totalAnalyzed > 0) ? ' · ' : null}
                  {pipelineStats?.total_evaluated
                    ? `${pipelineStats.total_evaluated.toLocaleString('es-AR')} avisos evaluados`
                    : totalAnalyzed > 0
                      ? `${totalAnalyzed} avisos evaluados`
                      : null}
                  {fromCache ? ' · Caché de hoy' : ''}
                </p>
                {serperActive && (
                  <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                    style={{ background: 'rgba(66,133,244,0.10)', color: '#4285F4' }}>
                    Google Jobs ✓
                  </span>
                )}
              </div>
            )}
          </div>
          {/* Refresh button */}
          <button
            onClick={() => { setActiveFilters({ ...filters }); fetchRecommendations() }}
            disabled={loadState === 'loading'}
            className="p-2 rounded-xl text-sm"
            style={BTN_GHOST_STYLE}
            title="Buscar de nuevo">
            {loadState === 'loading' ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin block" /> : '↻'}
          </button>
        </div>

        {/* Weekly insight — "Esta semana exploraste X oportunidades" */}
        {/* Shows after first search; anchored to header so always visible */}
        {weeklyExplored > 0 && loadState === 'done' && (
          <div
            className="mb-2 px-3 py-1.5 rounded-xl flex items-center gap-2"
            style={{ background: 'rgba(194,24,91,0.05)', border: '1px solid rgba(194,24,91,0.14)' }}
          >
            <span className="text-xs" style={{ color: '#c2185b' }}>📡</span>
            <p className="text-[11px]" style={{ color: '#94a3b8' }}>
              Esta semana exploraste{' '}
              <span className="font-semibold" style={{ color: '#c2185b' }}>{weeklyExplored} oportunidades</span>
            </p>
          </div>
        )}

        {/* Filter bar (horizontal scroll on mobile) */}
        {loadState === 'done' && filteredRecs.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
            {/* Filter button */}
            <button
              onClick={() => setShowFilters(true)}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium"
              style={activeFilterCount > 0 ? { background: LI_GRADIENT, color: 'white' } : BTN_GHOST_STYLE}>
              ⚡ Filtros{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </button>

            {/* Quick sort */}
            <button
              onClick={() => setSortBy(s => s === 'score' ? 'recent' : 'score')}
              className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium"
              style={BTN_GHOST_STYLE}>
              {sortBy === 'score' ? '↓ Match' : '↓ Reciente'}
            </button>

            {/* Quick filter chips */}
            {['Remoto', 'Argentina', 'Senior'].map(chip => {
              const isActive = (chip === 'Remoto' && activeFilters.remoteOnly)
                || (chip === 'Senior' && activeFilters.seniority === 'Senior')
                || (chip === 'Argentina' && activeFilters.location === 'Argentina')
              return (
                <button key={chip}
                  onClick={() => {
                    const next = { ...activeFilters }
                    if (chip === 'Remoto') next.remoteOnly = !activeFilters.remoteOnly
                    if (chip === 'Senior') next.seniority  = activeFilters.seniority === 'Senior' ? '' : 'Senior'
                    if (chip === 'Argentina') next.location = activeFilters.location === 'Argentina' ? '' : 'Argentina'
                    setActiveFilters(next)
                  }}
                  className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium transition-all"
                  style={isActive ? { background: LI_GRADIENT, color: 'white' } : BTN_GHOST_STYLE}>
                  {chip}
                </button>
              )
            })}

            {/* Afinar búsqueda toggle */}
            <button
              onClick={() => setShowRefine(v => !v)}
              className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium transition-all"
              style={showRefine || refineQuery
                ? { background: LI_GRADIENT, color: 'white' }
                : BTN_GHOST_STYLE}>
              🔍 {refineQuery ? 'Refinando' : 'Afinar'}
            </button>
          </div>
        )}

        {/* "Afinar búsqueda" expandable input */}
        {loadState === 'done' && showRefine && (
          <form
            onSubmit={e => {
              e.preventDefault()
              const q = refineInput.trim()
              setRefineQuery(q)
              setShowRefine(false)
              if (q !== refineQuery) {
                trackEvent('radar_laboral_search_refined', { term: q })
                // Re-fetch with new refine term — buildQueries will pick it up via closure
                setTimeout(fetchRecommendations, 0)
              }
            }}
            className="flex gap-2 pt-1">
            <input
              ref={refineInputRef}
              type="text"
              value={refineInput}
              onChange={e => setRefineInput(e.target.value)}
              placeholder="Ej: React, fintech, remoto LATAM…"
              className="flex-1 px-3 py-2 rounded-xl text-xs outline-none"
              style={{ background: 'white', border: '1.5px solid rgba(0,119,181,0.25)', color: '#0d2137' }}
            />
            <button type="submit"
              className="px-3 py-2 rounded-xl text-xs font-semibold text-white shrink-0"
              style={{ background: LI_GRADIENT }}>
              Buscar
            </button>
            {refineQuery && (
              <button type="button"
                onClick={() => { setRefineQuery(''); setRefineInput(''); setShowRefine(false); setTimeout(fetchRecommendations, 0) }}
                className="px-2 py-2 rounded-xl text-xs shrink-0"
                style={BTN_GHOST_STYLE}>
                ✕
              </button>
            )}
          </form>
        )}
      </div>

      {/* ══ MAIN CONTENT AREA ══ */}
      <div
        ref={scrollRef}
        className="pb-32 pt-2 space-y-4">

        {/* ── NO PROFILE STATE ── */}
        {loadState === 'no_profile' && (
          <div className="text-center py-16 px-6 space-y-4">
            <span className="text-5xl">🔍</span>
            <h3 className="font-bold text-lg" style={{ color: '#0d2137' }}>
              Primero hacé tu diagnóstico
            </h3>
            <p className="text-sm max-w-xs mx-auto leading-relaxed" style={{ color: '#475569' }}>
              Para ver oportunidades compatibles necesitamos analizar tu perfil profesional. Completá el diagnóstico primero.
            </p>
            <button
              onClick={onBack}
              className="px-6 py-3 rounded-2xl text-sm font-semibold text-white"
              style={{ background: LI_GRADIENT }}>
              Ir al diagnóstico
            </button>
          </div>
        )}

        {/* ── LOADING STATE ── */}
        {loadState === 'loading' && (
          <>
            <LoadingStage stage={loadStage} />
            {/* Skeleton cards appear progressively after 2 s */}
            {loadStage >= 1 && [1, 2, 3].map(i => <SkeletonCard key={i} />)}
          </>
        )}

        {/* ── ERROR STATE ── */}
        {loadState === 'error' && (() => {
          const errStr = typeof error === 'string' ? error : String(error?.message || error || '')
          const isQuotaErr = errStr.includes('mes') || errStr.includes('mañana') || errStr.includes('búsqueda')
          return (
            <div className="text-center py-12 px-6 space-y-4">
              <span className="text-4xl">{isQuotaErr ? '⏳' : '⚠️'}</span>
              <h3 className="font-bold text-base" style={{ color: '#0d2137' }}>
                {isQuotaErr ? 'Búsquedas agotadas por hoy' : 'Algo salió mal'}
              </h3>
              <p className="text-sm max-w-xs mx-auto leading-relaxed" style={{ color: '#64748b' }}>
                {errStr || 'Ocurrió un error inesperado. Intentá de nuevo.'}
              </p>
              {!isQuotaErr && (
                <button
                  onClick={fetchRecommendations}
                  className="px-6 py-3 rounded-2xl text-sm font-semibold text-white"
                  style={{ background: LI_GRADIENT }}>
                  Intentar de nuevo
                </button>
              )}
              {isQuotaErr && !isPremium && (
                <p className="text-xs" style={{ color: '#94a3b8' }}>
                  Plan gratuito: 1 búsqueda/mes · Activá Premium para 5 búsquedas diarias
                  <button onClick={() => setShowPremiumModal(true)} className="ml-1 underline" style={{ color: '#0077B5' }}>
                    Activar
                  </button>
                </p>
              )}
            </div>
          )
        })()}

        {/* ── DONE: RESULTS ── */}
        {loadState === 'done' && (
          <>
            {/* Results count + profile summary */}
            {filteredRecs.length > 0 && (
              <div className="rounded-2xl px-4 py-3 space-y-2"
                style={{ background: 'rgba(0,119,181,0.05)', border: '1px solid rgba(0,119,181,0.12)' }}>
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold" style={{ color: '#0d2137' }}>
                      {filteredRecs.length === 1
                        ? '1 oportunidad seleccionada para tu perfil'
                        : `${filteredRecs.length} oportunidades seleccionadas para tu perfil`}
                    </p>
                    {/* Pipeline stats — shown discretely when available from API */}
                    {pipelineStats && (pipelineStats.sources_count || pipelineStats.total_evaluated) ? (
                      <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>
                        {[
                          pipelineStats.sources_count ? `Analizadas ${pipelineStats.sources_count} fuentes` : null,
                          pipelineStats.total_evaluated ? `${pipelineStats.total_evaluated.toLocaleString('es-AR')} avisos evaluados` : null,
                          pipelineStats?.serper_configured
                            ? (pipelineStats?.serper_returned > 0
                              ? `🔍 Google Jobs: ${pipelineStats.serper_returned} avisos`
                              : pipelineStats?.serper_error?.includes('quota')
                                ? '⚠️ Google Jobs: cuota agotada'
                                : pipelineStats?.serper_error
                                  ? `⚠️ Google Jobs: error (${pipelineStats.serper_error})`
                                  : '⚠️ Google Jobs: sin resultados')
                            : null,
                        ].filter(Boolean).join(' · ')}
                      </p>
                    ) : totalAnalyzed > filteredRecs.length ? (
                      <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>
                        Seleccionadas de {totalAnalyzed.toLocaleString('es-AR')} avisos evaluados
                      </p>
                    ) : null}
                    {result?.resumen_diagnostico && (
                      <p className="text-xs mt-0.5 truncate" style={{ color: '#94a3b8' }}>
                        {result.resumen_diagnostico.slice(0, 70)}…
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {candidateLoc && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded"
                        style={{ background: 'rgba(16,185,129,0.08)', color: '#059669' }}>
                        📍 {candidateLoc}
                      </span>
                    )}
                    {quotaRemaining !== null && (
                      <span className="text-[10px] px-2 py-1 rounded-lg"
                        style={{ background: 'rgba(0,119,181,0.10)', color: '#0077B5' }}>
                        {quotaRemaining} restantes hoy
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Debug panel — visible diagnostic when AI matching fails */}
            {debugInfo && (
              <div style={{ background: '#fff8e1', border: '1px solid #ffc107', borderRadius: 10, padding: '10px 14px', fontSize: 12 }}>
                <p style={{ fontWeight: 700, color: '#e65100', margin: '0 0 6px 0', fontSize: 13 }}>
                  ⚠️ {debugInfo.ai_error ? 'Error en análisis de IA' : 'IA corrió pero no encontró matches suficientes'}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, color: '#555' }}>
                  <p style={{ margin: 0 }}>
                    <b>Error:</b> {debugInfo.ai_error || 'Ninguno — Gemini devolvió 0 resultados con score ≥ 4.0'}
                  </p>
                  {debugInfo.ai_error_body && (
                    <p style={{ margin: 0, fontFamily: 'monospace', fontSize: 11, background: '#fff3e0', padding: '4px 6px', borderRadius: 4, wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>
                      <b>Detalle error Gemini:</b> {JSON.stringify(debugInfo.ai_error_body, null, 2).slice(0, 500)}
                    </p>
                  )}
                  <p style={{ margin: 0 }}>
                    <b>Familia profesional detectada:</b> {debugInfo.profession_family || '❌ No detectada (perfil muy corto o genérico)'}
                  </p>
                  <p style={{ margin: 0 }}>
                    <b>Fuente detección:</b> {debugInfo.profession_source || 'ninguna'} &nbsp;|&nbsp;
                    <b>Matches Gemini:</b> {debugInfo.gemini_matched ?? '?'} &nbsp;|&nbsp;
                    <b>Worker:</b> {debugInfo.worker_version || '?'} &nbsp;|&nbsp;
                    <b>Tiempo:</b> {debugInfo.total_ms ? `${Math.round(debugInfo.total_ms / 1000)}s` : '?'}
                  </p>
                  <div style={{ marginTop: 8 }}>
                    <button
                      onClick={pingGemini}
                      disabled={pinging}
                      style={{ background: '#e65100', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12, cursor: pinging ? 'default' : 'pointer', opacity: pinging ? 0.7 : 1 }}
                    >
                      {pinging ? 'Testeando...' : 'Testear API Key de Gemini'}
                    </button>
                    {pingResult && (
                      <div style={{ marginTop: 6, background: pingResult.ok ? '#e8f5e9' : '#ffebee', border: `1px solid ${pingResult.ok ? '#a5d6a7' : '#ef9a9a'}`, borderRadius: 6, padding: '6px 10px', fontSize: 11, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                        {JSON.stringify(pingResult, null, 2)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}


            {/* Source debug panel — Jooble / fuentes */}
            {pipelineStats && (
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', fontSize: 12 }}>
                <button
                  onClick={() => setShowSourceDebug(v => !v)}
                  style={{ width: '100%', background: '#f8fafc', border: 'none', padding: '8px 14px', textAlign: 'left', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#475569', fontWeight: 600, fontSize: 12 }}
                >
                  <span>🔬 Debug fuentes</span>
                  <span style={{ fontSize: 10, color: '#94a3b8' }}>{showSourceDebug ? '▲ cerrar' : '▼ ver'}</span>
                </button>
                {showSourceDebug && (
                  <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 10, background: '#fff' }}>

                    {/* Per-source counts */}
                    <div>
                      <p style={{ margin: '0 0 4px', fontWeight: 700, color: '#334155' }}>Avisos por fuente</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {Object.entries(pipelineStats.source_counts || {}).map(([src, count]) => (
                          <span key={src} style={{ background: count > 0 ? '#dcfce7' : '#fee2e2', color: count > 0 ? '#166534' : '#991b1b', borderRadius: 6, padding: '2px 8px', fontFamily: 'monospace', fontSize: 11 }}>
                            {src}: {count}
                          </span>
                        ))}
                        {!Object.keys(pipelineStats.source_counts || {}).length && (
                          <span style={{ color: '#94a3b8' }}>sin datos (cache hit)</span>
                        )}
                      </div>
                    </div>

                    {/* Jooble detail */}
                    {pipelineStats.jooble_debug ? (
                      <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '8px 12px' }}>
                        <p style={{ margin: '0 0 6px', fontWeight: 700, color: '#0369a1' }}>
                          Jooble — location: <code style={{ fontFamily: 'monospace', background: '#e0f2fe', padding: '1px 5px', borderRadius: 4 }}>{pipelineStats.jooble_debug.location_used}</code>
                          {pipelineStats.jooble_debug.http_status && (
                            <span style={{ marginLeft: 8, fontFamily: 'monospace', fontSize: 11, color: pipelineStats.jooble_debug.http_status === 200 ? '#166534' : '#dc2626' }}>
                              HTTP {pipelineStats.jooble_debug.http_status}
                            </span>
                          )}
                          {pipelineStats.jooble_debug.raw_keys && (
                            <span style={{ marginLeft: 8, fontSize: 10, color: '#64748b' }}>keys: {pipelineStats.jooble_debug.raw_keys}</span>
                          )}
                        </p>
                        {pipelineStats.jooble_debug.error && (
                          <p style={{ margin: '0 0 6px', color: '#dc2626', fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all' }}>
                            Error: {pipelineStats.jooble_debug.error}
                          </p>
                        )}
                        <p style={{ margin: '0 0 8px', color: '#0c4a6e' }}>
                          totalCount API: <b>{pipelineStats.jooble_debug.total_count ?? '?'}</b> &nbsp;|&nbsp;
                          Normalizados: <b>{pipelineStats.jooble_debug.raw_count}</b> &nbsp;→&nbsp;
                          Geo filter (&ge;0.30): <b>{pipelineStats.jooble_debug.filtered_count}</b> &nbsp;
                          <span style={{ color: '#dc2626' }}>({pipelineStats.jooble_debug.dropped_count} descartados)</span>
                        </p>
                        {pipelineStats.jooble_debug.sample_raw?.length > 0 ? (
                          <div>
                            <p style={{ margin: '0 0 4px', fontWeight: 600, color: '#0369a1', fontSize: 11 }}>Primeros 8 resultados RAW (antes del filtro):</p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {pipelineStats.jooble_debug.sample_raw.map((j, i) => (
                                <div key={i} style={{ background: j.geo_score !== null && j.geo_score >= 0.30 ? '#f0fdf4' : '#fff1f2', borderRadius: 6, padding: '5px 8px', borderLeft: `3px solid ${j.geo_score !== null && j.geo_score >= 0.30 ? '#22c55e' : '#ef4444'}` }}>
                                  <span style={{ fontWeight: 600 }}>{j.title}</span>
                                  {j.company && <span style={{ color: '#64748b' }}> — {j.company}</span>}
                                  <br />
                                  <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#475569' }}>
                                    📍 {j.location || '(sin ubicación)'} &nbsp;
                                    {j.remote ? '🌐 remote' : ''} &nbsp;
                                    geo: <b>{j.geo_score ?? '?'}</b> &nbsp;
                                    url: {j.url}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <p style={{ margin: 0, color: '#dc2626', fontWeight: 600 }}>
                            ❌ Jooble devolvió 0 jobs — revisar API key (JOOBLE_KEY) o respuesta de la API
                          </p>
                        )}
                      </div>
                    ) : (
                      <p style={{ margin: 0, color: '#94a3b8' }}>
                        Jooble no fue llamado en esta búsqueda (cache hit o JOOBLE_KEY no configurada)
                      </p>
                    )}

                    {/* Adzuna note */}
                    {(pipelineStats.source_counts?.adzuna !== undefined || pipelineStats.adzuna_country) && (
                      <p style={{ margin: 0, color: (pipelineStats.source_counts?.adzuna || 0) > 0 ? '#166534' : '#dc2626' }}>
                        <b>Adzuna</b>
                        {pipelineStats.adzuna_country && (
                          <span style={{ marginLeft: 6, fontFamily: 'monospace', fontSize: 11,
                            background: pipelineStats.adzuna_country === 'ar' ? '#dcfce7' : '#fef9c3',
                            color: pipelineStats.adzuna_country === 'ar' ? '#166534' : '#713f12',
                            padding: '1px 5px', borderRadius: 4 }}>
                            /{pipelineStats.adzuna_country}
                          </span>
                        )}
                        {': '}{pipelineStats.source_counts?.adzuna ?? 0} avisos (geo &ge;0.30)
                      </p>
                    )}

                    {/* candidateLocation */}
                    <p style={{ margin: 0, color: '#64748b' }}>
                      <b>candidateLocation detectado:</b> {pipelineStats.candidate_location || '(ninguno — perfil sin ubicación)'}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Cached/history banner — neutral UX for both same-day cache and history fallback */}
            {(cachedToday || servedFromHistory) && cacheTimestamp && filteredRecs.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                style={{ background: 'rgba(22,163,74,0.07)', border: '1px solid rgba(22,163,74,0.18)' }}>
                <span className="text-xs shrink-0" style={{ color: '#16a34a' }}>✓</span>
                <p className="text-xs flex-1" style={{ color: '#15803d' }}>
                  {servedFromHistory
                    ? 'Continuando tu radar laboral'
                    : `Radar listo desde las ${new Date(cacheTimestamp).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`
                  }
                </p>
                {!servedFromHistory && (
                  <button
                    onClick={() => { setCachedToday(false); setCacheTs(null); fetchRecommendations() }}
                    className="text-[11px] font-semibold shrink-0 px-2 py-0.5 rounded-lg"
                    style={{ color: '#0077B5', background: 'rgba(0,119,181,0.08)' }}>
                    Actualizar
                  </button>
                )}
              </div>
            )}

            {/* Expansion badge — Premium: tells user they got extra search results */}
            {expansionUsed && expansionCount > 0 && filteredRecs.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                style={{ background: 'rgba(14,165,233,0.07)', border: '1px solid rgba(14,165,233,0.16)' }}>
                <span className="text-xs shrink-0">✨</span>
                <p className="text-xs flex-1" style={{ color: '#0284c7' }}>
                  Radar Activo encontró <span className="font-semibold">{expansionCount} roles adicionales</span> vía búsqueda IA
                </p>
              </div>
            )}

            {/* Deep search ran but found no new jobs — premium users should know the AI searched */}
            {expansionSearched && !expansionUsed && !fromCache && filteredRecs.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.14)' }}>
                <span className="text-xs shrink-0">🔍</span>
                <p className="text-xs" style={{ color: '#059669' }}>
                  Búsqueda IA ampliada — estos son los mejores resultados del mercado para tu perfil
                </p>
              </div>
            )}

            {/* Company strip — "Empresas con roles para vos" */}
            {filteredRecs.length > 0 && (
              <CompanyMatchBar recommendations={filteredRecs} />
            )}

            {/* Swipe hint (shown once per session) */}
            {filteredRecs.length > 0 && (
              <p className="text-[10px] text-center" style={{ color: '#cbd5e1' }}>
                Deslizá ← → para descartar o guardar · Toca para expandir
              </p>
            )}

            {/* Job cards */}
            {filteredRecs.map((rec, i) => {
              if (i >= jobsSeenRef.current) {
                jobsSeenRef.current = i + 1
              }
              return (
                <JobCard
                  key={rec.rec_id || `${rec.job.source}-${rec.job.external_id}`}
                  rec={rec}
                  index={i}
                  isPremium={isPremium}
                  blurred={false}
                  onSave={handleSaveToKanban}
                  onDismiss={handleDismiss}
                  onGoToKanban={() => setStep(STEPS.TRACKING)}
                  onUpgrade={() => setShowPremiumModal(true)}
                  addToast={addToast}
                />
              )
            })}

            {/* Premium conversion banner — frequency pitch, not quality gate */}
            {!isPremium && recommendations.length > 0 && (
              <div className="rounded-2xl p-4 text-center space-y-2"
                style={{ background: 'linear-gradient(135deg,rgba(0,119,181,0.07),rgba(14,165,233,0.10))', border: '1.5px solid rgba(0,119,181,0.18)' }}>
                <p className="text-sm font-bold" style={{ color: '#0d2137' }}>
                  📅 Actualizá tu radar mañana con Premium
                </p>
                <p className="text-xs leading-relaxed" style={{ color: '#475569' }}>
                  Con el plan gratuito tenés 1 búsqueda por mes. Premium te da 5 búsquedas diarias para seguir el mercado de cerca — más historial y pipeline de postulaciones.
                </p>
                <button
                  onClick={() => { trackEvent('radar_laboral_premium_modal_opened', { trigger: 'frequency_banner' }); setShowPremiumModal(true) }}
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white"
                  style={{ background: 'linear-gradient(135deg,#0d2137,#0077B5)' }}>
                  Ver Plan Profesional →
                </button>
              </div>
            )}


            {/* No results after filtering */}
            {filteredRecs.length === 0 && recommendations.length > 0 && (
              <div className="text-center py-12 space-y-3">
                <span className="text-4xl">🔎</span>
                <p className="font-semibold text-sm" style={{ color: '#0d2137' }}>
                  No hay resultados con estos filtros
                </p>
                <p className="text-xs" style={{ color: '#64748b' }}>
                  Probá quitando algunos filtros o buscando de nuevo.
                </p>
                <button
                  onClick={() => setActiveFilters({ seniority: '', remoteOnly: false, location: '', minSalary: null })}
                  className="px-4 py-2 rounded-xl text-sm font-medium"
                  style={BTN_GHOST_STYLE}>
                  Quitar filtros
                </button>
              </div>
            )}

            {/* Empty from API */}
            {recommendations.length === 0 && (
              <div className="text-center py-14 px-6 space-y-4">
                <span className="text-5xl">🧭</span>
                <h3 className="font-bold text-base" style={{ color: '#0d2137' }}>
                  El Radar no encontró resultados para hoy
                </h3>
                <p className="text-sm max-w-xs mx-auto leading-relaxed" style={{ color: '#64748b' }}>
                  Escaneamos las fuentes disponibles pero no encontramos roles con compatibilidad suficiente. Podés ampliar la búsqueda o volver mañana cuando se actualizan los avisos.
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  <button
                    onClick={() => { setFilters(f => ({ ...f, remoteOnly: true })); fetchRecommendations() }}
                    className="px-3 py-1.5 rounded-xl text-xs font-medium"
                    style={{ background: 'rgba(0,119,181,0.08)', color: '#0077B5', border: '1px solid rgba(0,119,181,0.2)' }}>
                    🌐 Ampliar a remoto
                  </button>
                  <button
                    onClick={() => { setFilters(f => ({ ...f, seniority: '' })); fetchRecommendations() }}
                    className="px-3 py-1.5 rounded-xl text-xs font-medium"
                    style={{ background: 'rgba(0,119,181,0.08)', color: '#0077B5', border: '1px solid rgba(0,119,181,0.2)' }}>
                    🔓 Todos los niveles
                  </button>
                  <button
                    onClick={fetchRecommendations}
                    className="px-3 py-1.5 rounded-xl text-xs font-medium"
                    style={{ background: 'rgba(0,119,181,0.08)', color: '#0077B5', border: '1px solid rgba(0,119,181,0.2)' }}>
                    🔄 Buscar de nuevo
                  </button>
                </div>
              </div>
            )}

            {/* Quota usage footer */}
            {quotaRemaining !== null && quotaRemaining > 0 && filteredRecs.length > 0 && (
              <p className="text-xs text-center py-4" style={{ color: '#cbd5e1' }}>
                {isPremium
                  ? `${quotaRemaining} ${quotaRemaining === 1 ? 'búsqueda disponible' : 'búsquedas disponibles'} hoy`
                  : `Esta es tu búsqueda gratuita del mes · `}
                {!isPremium && (
                  <button
                    onClick={() => setShowPremiumModal(true)}
                    className="underline"
                    style={{ color: '#0077B5' }}>
                    Premium: 5 búsquedas diarias
                  </button>
                )}
              </p>
            )}
          </>
        )}
      </div>

      {/* ══ FILTER BOTTOM SHEET ══ */}
      <FilterBottomSheet
        open={showFilters}
        onClose={() => setShowFilters(false)}
        filters={filters}
        onChange={(key, val) => setFilters(prev => ({ ...prev, [key]: val }))}
        onApply={() => { setActiveFilters({ ...filters }); setShowFilters(false) }}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ENTRY POINT CTAs — exported sub-components
// These are imported and embedded in existing screens.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * JobOpportunitiesCTA
 *
 * Reusable CTA banner placed in:
 *   - ResultsScreen (post-diagnosis)
 *   - CvScreen (post-CV generation)
 *   - ModeSelectScreen (persistent nav item)
 *
 * variant: 'results' | 'cv' | 'nav' | 'kanban_empty'
 */
export function JobOpportunitiesCTA({ variant = 'results', onPress, newCount = 0 }) {
  // ── Variant: inline banner in ResultsScreen / CvScreen ────────────────────
  if (variant === 'results' || variant === 'cv') {
    return (
      <button
        onClick={onPress}
        className="w-full rounded-2xl p-4 text-left flex items-center gap-3 transition-all active:scale-[0.98]"
        style={{ background: 'linear-gradient(135deg,rgba(0,119,181,0.08),rgba(14,165,233,0.12))', border: '1.5px solid rgba(0,119,181,0.25)' }}>
        {/* Animated indicator */}
        <div className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center text-xl"
          style={{ background: 'rgba(0,119,181,0.12)' }}>
          🎯
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm" style={{ color: '#0d2137' }}>
            {variant === 'cv'
              ? 'Buscá empleos que le queden bien a tu nuevo CV'
              : 'Ver oportunidades compatibles con tu perfil'}
          </p>
          <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>
            {variant === 'cv'
              ? 'La IA compara tu CV con avisos reales y te muestra el % de match'
              : 'La IA encontró roles que se alinean con tu diagnóstico'}
          </p>
        </div>
        <span className="shrink-0 text-lg" style={{ color: '#0077B5' }}>→</span>
      </button>
    )
  }

  // ── Variant: compact nav button ────────────────────────────────────────────
  if (variant === 'nav') {
    return (
      <button
        onClick={onPress}
        className="relative flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-semibold text-white transition-all active:scale-[0.97]"
        style={{ background: LI_GRADIENT }}>
        🎯 Oportunidades
        {newCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {newCount > 9 ? '9+' : newCount}
          </span>
        )}
      </button>
    )
  }

  // ── Variant: Kanban empty state ────────────────────────────────────────────
  if (variant === 'kanban_empty') {
    return (
      <div className="text-center space-y-4 py-8 px-4">
        <div className="text-4xl">🤔</div>
        <p className="font-semibold text-base" style={{ color: '#0d2137' }}>
          Tu tablero está vacío
        </p>
        <p className="text-sm max-w-xs mx-auto" style={{ color: '#64748b' }}>
          ¿Querés que encontremos oportunidades para vos? La IA puede sugerirte roles compatibles con tu perfil.
        </p>
        <button
          onClick={onPress}
          className="px-6 py-3 rounded-2xl text-sm font-semibold text-white"
          style={{ background: LI_GRADIENT }}>
          Buscar oportunidades con IA
        </button>
      </div>
    )
  }

  return null
}

/**
 * NewJobsNotificationBanner
 *
 * Sticky banner shown when the system has new recommendations for the user.
 * Place at the top of ModeSelectScreen or ResultsScreen.
 *
 * count: number of new recommendations
 * onPress: navigate to JobRecommendationsScreen
 * onDismiss: hide the banner
 */
export function NewJobsNotificationBanner({ count, onPress, onDismiss }) {
  if (!count) return null
  return (
    <div
      className="rounded-2xl px-4 py-3 flex items-center gap-3 animate-pulse-once"
      style={{ background: 'linear-gradient(135deg,#0d2137,#0a3d62)', border: '1px solid rgba(0,119,181,0.30)' }}>
      <span className="text-xl shrink-0">🔔</span>
      <p className="flex-1 text-sm font-medium" style={{ color: 'rgba(226,232,240,0.90)' }}>
        Tenemos <strong className="text-white">{count} {count === 1 ? 'nueva oportunidad' : 'nuevas oportunidades'}</strong> compatibles con tu perfil
      </p>
      <button onClick={onPress}
        className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold"
        style={{ background: 'rgba(255,255,255,0.15)', color: 'white' }}>
        Ver →
      </button>
      <button onClick={onDismiss}
        className="shrink-0 text-xl leading-none opacity-50 hover:opacity-100"
        style={{ color: 'white' }}>×</button>
    </div>
  )
}

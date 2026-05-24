import { useState, useEffect, useRef, useCallback } from 'react'
import { LI_GRADIENT, BTN_BACK_STYLE, BTN_GHOST_STYLE, CARD_STYLE, WORKER_URL, WORKER_HEADERS, trackEvent } from '../../constants'
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
function matchColor(pct) {
  if (pct >= 85) return { stroke: '#22c55e', glow: 'rgba(34,197,94,0.28)', badge: '#dcfce7', text: '#15803d' }
  if (pct >= 65) return { stroke: '#f59e0b', glow: 'rgba(245,158,11,0.28)', badge: '#fef9c3', text: '#92400e' }
  return         { stroke: '#ef4444', glow: 'rgba(239,68,68,0.28)',  badge: '#fee2e2', text: '#991b1b' }
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
// Progressive loading messages. Cycles at 2 s intervals to build trust.
const LOADING_STAGES = [
  { icon: '🔍', msg: 'Interpretando tu perfil...' },
  { icon: '📡', msg: 'Buscando oportunidades compatibles...' },
  { icon: '🤖', msg: 'Calculando compatibilidad con IA...' },
  { icon: '✨', msg: 'Finalizando recomendaciones...' },
]

function LoadingStage({ stage }) {
  const s = LOADING_STAGES[Math.min(stage, LOADING_STAGES.length - 1)]
  return (
    <div className="flex flex-col items-center gap-4 py-12">
      {/* Animated pulse ring */}
      <div className="relative w-16 h-16 flex items-center justify-center">
        <span className="absolute inset-0 rounded-full animate-ping opacity-30"
          style={{ background: 'rgba(0,119,181,0.25)' }} />
        <span className="relative w-16 h-16 rounded-full flex items-center justify-center text-3xl"
          style={{ background: 'rgba(0,119,181,0.10)', border: '1.5px solid rgba(0,119,181,0.25)' }}>
          {s.icon}
        </span>
      </div>
      <p className="text-sm font-medium text-center" style={{ color: '#0d2137' }}>{s.msg}</p>
      <p className="text-xs text-center" style={{ color: '#94a3b8' }}>
        Esto puede tardar unos segundos — la IA analiza decenas de oportunidades
      </p>
      {/* Progress dots */}
      <div className="flex gap-1.5 mt-1">
        {LOADING_STAGES.map((_, i) => (
          <span key={i} className="w-2 h-2 rounded-full transition-all duration-500"
            style={{ background: i <= stage ? '#0077B5' : 'rgba(0,119,181,0.20)' }} />
        ))}
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
  onAdaptCv,
  onPrepInterview,
  onUpgrade,
  addToast,
}) {
  const [expanded, setExpanded]         = useState(false)
  const [saved, setSaved]               = useState(false)
  const [dismissed, setDismissed]       = useState(false)
  const [saveLoading, setSaveLoading]   = useState(false)
  const [swipeDelta, setSwipeDelta]     = useState(0)
  const touchStartRef                   = useRef(null)
  const cardRef                         = useRef(null)

  const { job, match_score, strengths, gaps, summary, rec_id } = rec

  // Convert 0–10 scale from API to 0–100 percentage
  const scorePct = match_score != null ? Math.round(match_score * 10) : null
  const c        = scorePct != null ? matchColor(scorePct) : null

  // ── Days since posted ──────────────────────────────────────────────────────
  const daysAgo = (() => {
    if (!job.posted_at) return null
    const diff = Date.now() - new Date(job.posted_at).getTime()
    const days = Math.floor(diff / 86400000)
    if (days === 0) return 'Hoy'
    if (days === 1) return 'Ayer'
    if (days < 7)  return `Hace ${days} días`
    if (days < 30) return `Hace ${Math.floor(days / 7)} sem.`
    return `Hace ${Math.floor(days / 30)} mes.`
  })()

  // ── Touch swipe handlers ───────────────────────────────────────────────────
  const onTouchStart = (e) => {
    touchStartRef.current = e.touches[0].clientX
  }
  const onTouchMove = (e) => {
    if (touchStartRef.current === null) return
    const delta = e.touches[0].clientX - touchStartRef.current
    // Only horizontal swipe — ignore if likely vertical scroll
    setSwipeDelta(Math.max(-80, Math.min(80, delta)))
  }
  const onTouchEnd = () => {
    if (swipeDelta > 55) {
      handleSave()
    } else if (swipeDelta < -55) {
      handleDismiss()
    }
    setSwipeDelta(0)
    touchStartRef.current = null
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (saved || saveLoading) return
    if (!isPremium && blurred) { onUpgrade?.(); return }
    setSaveLoading(true)
    try {
      await onSave?.(rec)
      setSaved(true)
      trackEvent('job_recommendation_saved', { rec_id, score: scorePct })
    } catch {
      // addToast is called by parent
    } finally {
      setSaveLoading(false)
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
    if (scorePct >= 85 && index < 3) {
      const t = setTimeout(() => setShowCelebration(true), 300 + index * 150)
      const t2 = setTimeout(() => setShowCelebration(false), 2800 + index * 150)
      return () => { clearTimeout(t); clearTimeout(t2) }
    }
  }, [scorePct, index])

  if (dismissed) return null

  // ── Blurred card (freemium gate) ───────────────────────────────────────────
  if (blurred) {
    return (
      <div className="rounded-2xl overflow-hidden relative"
        style={{ ...CARD_STYLE, minHeight: 120 }}>
        {/* Blurred content preview */}
        <div style={{ filter: 'blur(6px)', pointerEvents: 'none', userSelect: 'none' }}
          className="p-4 space-y-2">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-200 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-sm text-slate-800">Posición disponible</p>
              <p className="text-xs text-slate-500">Empresa • Remoto</p>
            </div>
            {/* Score IS visible even when blurred — teases value */}
            {scorePct != null && (
              <MatchScoreRing score={scorePct} size={48} animated={false} />
            )}
          </div>
        </div>
        {/* Premium overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center"
          style={{ background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(2px)' }}>
          <span className="text-lg mb-1">🔒</span>
          <p className="text-xs font-semibold mb-2" style={{ color: '#0d2137' }}>Resultado Premium</p>
          {scorePct != null && (
            <p className="text-xs mb-3" style={{ color: '#475569' }}>
              Esta posición tiene <strong style={{ color: c?.text }}>{scorePct}% de compatibilidad</strong> con tu perfil
            </p>
          )}
          <button onClick={onUpgrade}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-white"
            style={{ background: LI_GRADIENT }}>
            Desbloqueá con Premium →
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
        // Swipe hint colours
        background: swipeDelta > 30
          ? 'rgba(34,197,94,0.05)'
          : swipeDelta < -30
            ? 'rgba(239,68,68,0.05)'
            : 'white',
        outline: showCelebration ? '2px solid #22c55e' : 'none',
        transition: swipeDelta === 0 ? 'all 0.25s' : 'none',
      }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}>

      {/* Swipe direction hints */}
      {swipeDelta > 30 && (
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-green-500 font-bold text-xs z-10">
          ✓ Guardar
        </div>
      )}
      {swipeDelta < -30 && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-red-400 font-bold text-xs z-10">
          × Descartar
        </div>
      )}

      {/* High-match celebration badge */}
      {showCelebration && (
        <div className="absolute top-0 left-0 right-0 flex justify-center pt-1 z-10 pointer-events-none">
          <span className="px-3 py-0.5 rounded-b-xl text-xs font-bold text-white animate-bounce"
            style={{ background: '#22c55e', boxShadow: '0 2px 8px rgba(34,197,94,0.4)' }}>
            Match alto!
          </span>
        </div>
      )}

      <div className="p-4 space-y-3">
        {/* ── Row 1: Logo + Title + Score ── */}
        <div className="flex items-start gap-3">
          {/* Company logo placeholder */}
          <div className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center text-sm font-bold"
            style={{ background: 'linear-gradient(135deg,#e2e8f0,#cbd5e1)', color: '#64748b' }}>
            {(job.company || '?')[0].toUpperCase()}
          </div>

          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm leading-snug truncate" style={{ color: '#0d2137' }}>
              {job.title}
            </p>
            <p className="text-xs mt-0.5 truncate" style={{ color: '#64748b' }}>
              {job.company}
            </p>
            {/* Location + remote badge */}
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {job.remote && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                  style={{ background: 'rgba(34,197,94,0.12)', color: '#15803d' }}>
                  Remoto
                </span>
              )}
              {job.location && !job.remote && (
                <span className="text-[10px]" style={{ color: '#94a3b8' }}>
                  {job.location}
                </span>
              )}
              {daysAgo && (
                <span className="text-[10px]" style={{ color: '#94a3b8' }}>· {daysAgo}</span>
              )}
            </div>
          </div>

          {/* Match score ring */}
          {scorePct != null && (
            <div className="shrink-0 flex flex-col items-center gap-0.5">
              <MatchScoreRing score={scorePct} size={52} animated={index < 5} />
              <span className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: c?.text }}>
                {scorePct >= 85 ? 'Excelente' : scorePct >= 65 ? 'Bueno' : 'Básico'}
              </span>
            </div>
          )}
        </div>

        {/* ── Row 2: AI Summary ── */}
        {summary && (
          <p className="text-xs leading-relaxed" style={{ color: '#475569' }}>
            {summary}
          </p>
        )}

        {/* ── Row 3: Strengths (collapsed: 2 max) ── */}
        {strengths?.length > 0 && (
          <div className="space-y-1">
            {strengths.slice(0, expanded ? 3 : 2).map((s, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <span className="shrink-0 mt-0.5 text-xs">✅</span>
                <p className="text-xs leading-snug" style={{ color: '#374151' }}>{s}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Row 4: Gaps (collapsed: 1 max) ── */}
        {gaps?.length > 0 && (
          <div className="space-y-1">
            {gaps.slice(0, expanded ? 2 : 1).map((g, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <span className="shrink-0 mt-0.5 text-xs">⚠️</span>
                <p className="text-xs leading-snug" style={{ color: '#92400e' }}>{g}</p>
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
          onClick={() => { setExpanded(v => !v); trackEvent('job_card_expanded', { expanded: !expanded }) }}
          className="text-xs w-full text-center py-0.5"
          style={{ color: '#0077B5' }}>
          {expanded ? '▲ Ver menos' : '▼ Ver más detalles'}
        </button>

        {/* ── Quick actions row ── */}
        {/* Touch targets min 44 × 44 px */}
        <div className="flex gap-2 pt-1">
          {/* Guardar */}
          <button
            onClick={handleSave}
            disabled={saved || saveLoading}
            className="flex-1 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all duration-200"
            style={saved
              ? { background: 'rgba(34,197,94,0.12)', color: '#15803d', border: '1px solid rgba(34,197,94,0.3)' }
              : { background: LI_GRADIENT, color: 'white' }}>
            {saveLoading ? <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> : null}
            {saved ? '✓ Guardado' : '🔖 Guardar'}
          </button>

          {/* Adaptar CV */}
          <button
            onClick={() => { onAdaptCv?.(rec); trackEvent('job_recommendation_adapt_cv', { rec_id }) }}
            className="flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all"
            style={BTN_GHOST_STYLE}>
            📄 Adaptar CV
          </button>

          {/* Ver detalles / Aplicar */}
          {expanded && job.url ? (
            <a href={job.url} target="_blank" rel="noopener noreferrer"
              onClick={() => trackEvent('job_recommendation_apply', { rec_id, company: job.company })}
              className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-center transition-all"
              style={{ background: 'rgba(99,102,241,0.10)', color: '#6366f1', border: '1px solid rgba(99,102,241,0.25)' }}>
              Aplicar →
            </a>
          ) : (
            <button
              onClick={() => { onPrepInterview?.(rec); trackEvent('job_recommendation_prep_interview', { rec_id }) }}
              className="flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all"
              style={{ background: 'rgba(99,102,241,0.10)', color: '#6366f1', border: '1px solid rgba(99,102,241,0.25)' }}>
              🎙️ Practicar
            </button>
          )}
        </div>

        {/* Dismiss link */}
        <button onClick={handleDismiss}
          className="w-full text-center text-[11px] py-1"
          style={{ color: '#cbd5e1' }}>
          No me interesa
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
}) {
  // ── Loading states ─────────────────────────────────────────────────────────
  const [loadState, setLoadState]         = useState('idle')   // 'idle'|'loading'|'done'|'error'|'no_profile'
  const [loadStage, setLoadStage]         = useState(0)
  const [recommendations, setRecs]        = useState([])
  const [error, setError]                 = useState('')
  const [quotaRemaining, setQuotaRem]     = useState(null)
  const [totalAnalyzed, setTotalAnalyzed] = useState(0)
  const [fromCache, setFromCache]         = useState(false)

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

  // ── Pull to refresh ────────────────────────────────────────────────────────
  const pullStartRef  = useRef(null)
  const [pullDist, setPullDist] = useState(0)
  const scrollRef     = useRef(null)

  // ── Free tier gate: 3 results visible, rest blurred ───────────────────────
  const FREE_VISIBLE = 3
  const isPremium    = !!user?.es_premium

  // ── Build search queries from profile ─────────────────────────────────────
  const buildQueries = useCallback(() => {
    if (!profileText) return []
    // Extract profession/headline from profile text heuristically
    const match = profileText.match(/TITULAR PROFESIONAL:\s*([^\n]+)/i)
      || profileText.match(/^([^\n]{10,80})/m)
    const headline = match?.[1]?.trim() || ''
    if (!headline) return ['profesional']
    // Generate 1-3 search terms from headline
    const words = headline.split(/\s+/).filter(w => w.length > 3)
    return [headline.slice(0, 60), words.slice(0, 2).join(' ')].filter(Boolean).slice(0, 2)
  }, [profileText])

  // ── Fetch recommendations ──────────────────────────────────────────────────
  const fetchRecommendations = useCallback(async () => {
    if (!profileText || profileText.trim().length < 50) {
      setLoadState('no_profile')
      return
    }

    const queries = buildQueries()
    if (!queries.length) { setLoadState('no_profile'); return }

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
            count:        isPremium ? 15 : 8,
            user_id:      user?.id || undefined,
          }),
        }),
        minDisplayTimer,
      ])

      clearInterval(stageTimer)

      if (res.status === 429) {
        const data = await res.json().catch(() => ({}))
        const isDaily = data?.quota_remaining === 0
        setError(isDaily
          ? 'Usaste todas tus búsquedas de hoy. Volvé mañana para nuevas recomendaciones.'
          : data?.error || 'Límite de búsquedas alcanzado. Intentá en unos minutos.')
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
      setLoadState('done')
      trackEvent('job_recommendations_loaded', {
        count:      data.recommendations.length,
        from_cache: data.from_cache,
        is_premium: isPremium,
      })
    } catch (err) {
      clearInterval(stageTimer)
      setError('Algo salió mal al buscar oportunidades. Intentá de nuevo.')
      setLoadState('error')
      trackEvent('job_recommendations_error', { message: err.message })
    }
  }, [profileText, buildQueries, activeFilters, authToken, user?.id, isPremium])

  // ── Auto-fetch on mount if profile available ───────────────────────────────
  useEffect(() => {
    if (loadState === 'idle' && profileText?.length >= 50) {
      fetchRecommendations()
    } else if (!profileText || profileText.length < 50) {
      setLoadState('no_profile')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Filter + sort logic ────────────────────────────────────────────────────
  const filteredRecs = recommendations
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
    })

  // ── Save to Kanban ─────────────────────────────────────────────────────────
  const handleSaveToKanban = async (rec) => {
    // If rec_id exists, use the worker action for clean data persistence
    if (rec.rec_id && authToken) {
      const res = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { ...WORKER_HEADERS, Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ action: 'job_save_to_kanban', rec_id: rec.rec_id }),
      })
      if (!res.ok) throw new Error('No se pudo guardar')
      addToast('Agregado a tu Kanban ✓', 'success')
      return
    }
    // Fallback: direct createCard (for non-persisted recs or anon)
    if (!user) {
      addToast('Iniciá sesión para guardar postulaciones', 'error')
      return
    }
    const primeraColumna = trackingColumnas?.[0]
    if (!primeraColumna) {
      addToast('Abrí tu tablero primero para guardar', 'error')
      return
    }
    await createCard(primeraColumna.id, {
      empresa:          rec.job.company || '',
      puesto:           rec.job.title   || '',
      link_aviso:       rec.job.url     || null,
      notas:            rec.summary     || null,
      fecha_aplicacion: new Date().toISOString().slice(0, 10),
      seniority:        rec.job.seniority !== 'No especificado' ? rec.job.seniority : null,
    })
    addToast('Agregado a tu Kanban ✓', 'success')
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
  }

  // ── Adapt CV ───────────────────────────────────────────────────────────────
  const handleAdaptCv = (rec) => {
    const cv = cvFinalData || null
    if (!cv) {
      addToast('Primero generá tu CV para poder adaptarlo', 'error')
      return
    }
    setJobCvForAdapter(cv)
    // Pre-fill the job posting textarea with the job description
    const posting = [
      `Empresa: ${rec.job.company}`,
      `Puesto: ${rec.job.title}`,
      rec.job.seniority && rec.job.seniority !== 'No especificado' ? `Seniority: ${rec.job.seniority}` : '',
      rec.job.skills_required?.length ? `Skills requeridas: ${rec.job.skills_required.join(', ')}` : '',
      rec.job.description ? `\nDescripción:\n${rec.job.description.slice(0, 800)}` : '',
    ].filter(Boolean).join('\n')
    setJobPosting(posting)
    setJobResult(null)
    setJobError('')
    setShowJobModal(true)
    trackEvent('job_recommendations_adapt_cv', { company: rec.job.company })
  }

  // ── Prep interview ─────────────────────────────────────────────────────────
  const handlePrepInterview = (rec) => {
    resetInterview()
    const ctx = {
      empresa:          rec.job.company,
      puesto:           rec.job.title,
      seniority:        rec.job.seniority !== 'No especificado' ? rec.job.seniority : '',
      ats_keywords:     rec.job.skills_required?.slice(0, 8).join(', ') || '',
      notas:            rec.summary || '',
      jd_summary:       rec.job.description?.slice(0, 400) || '',
      adaptation_notes: rec.gaps?.join(' | ') || '',
    }
    setInterviewJobContext(ctx)
    generatePersonalizedInterviewQs(ctx)
    // Navigate to interview intro (already pre-configured)
    import('../../constants').then(({ STEPS }) => setStep(STEPS.INTERVIEW_INTRO))
    trackEvent('job_recommendations_prep_interview', { company: rec.job.company })
  }

  // ── Pull to refresh handlers ───────────────────────────────────────────────
  const onScrollTouchStart = (e) => {
    if (scrollRef.current?.scrollTop === 0) {
      pullStartRef.current = e.touches[0].clientY
    }
  }
  const onScrollTouchMove = (e) => {
    if (pullStartRef.current === null) return
    const dist = e.touches[0].clientY - pullStartRef.current
    if (dist > 0) setPullDist(Math.min(dist, 64))
  }
  const onScrollTouchEnd = () => {
    if (pullDist > 48) {
      setActiveFilters({ ...filters })
      fetchRecommendations()
    }
    setPullDist(0)
    pullStartRef.current = null
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
    <div className="step-transition w-full">

      {/* ══ STICKY HEADER ══ */}
      <div className="sticky top-0 z-30 pt-2 pb-3 px-0"
        style={{ background: 'rgba(248,250,252,0.97)', backdropFilter: 'blur(8px)', borderBottom: '1px solid rgba(0,119,181,0.08)' }}>

        {/* Back + title row */}
        <div className="flex items-center justify-between gap-3 mb-3">
          <button onClick={onBack}
            className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-xl"
            style={BTN_BACK_STYLE}>
            ← Volver
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-sm truncate" style={{ color: '#0d2137' }}>
              Oportunidades para vos
            </h1>
            {loadState === 'done' && (
              <p className="text-[10px]" style={{ color: '#94a3b8' }}>
                {totalAnalyzed > 0 ? `Analizamos ${totalAnalyzed} avisos` : ''}
                {fromCache ? ' · Resultado guardado' : ''}
              </p>
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
          </div>
        )}
      </div>

      {/* ══ PULL TO REFRESH INDICATOR ══ */}
      {pullDist > 10 && (
        <div className="flex items-center justify-center py-2 text-xs"
          style={{ color: '#0077B5', opacity: pullDist / 64 }}>
          {pullDist > 48 ? '↑ Soltar para actualizar' : '↓ Arrastrá para actualizar'}
        </div>
      )}

      {/* ══ MAIN CONTENT AREA ══ */}
      <div
        ref={scrollRef}
        className="pb-32 pt-2 space-y-4"
        onTouchStart={onScrollTouchStart}
        onTouchMove={onScrollTouchMove}
        onTouchEnd={onScrollTouchEnd}>

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
        {loadState === 'error' && (
          <div className="text-center py-12 px-6 space-y-4">
            <span className="text-4xl">
              {error.includes('mañana') || error.includes('búsquedas') ? '⏳' : '⚠️'}
            </span>
            <h3 className="font-bold text-base" style={{ color: '#0d2137' }}>
              {error.includes('mañana') ? 'Límite diario alcanzado' : 'Algo salió mal'}
            </h3>
            <p className="text-sm max-w-xs mx-auto leading-relaxed" style={{ color: '#64748b' }}>
              {error}
            </p>
            {!error.includes('mañana') && (
              <button
                onClick={fetchRecommendations}
                className="px-6 py-3 rounded-2xl text-sm font-semibold text-white"
                style={{ background: LI_GRADIENT }}>
                Intentar de nuevo
              </button>
            )}
            {/* Quota info */}
            {quotaRemaining !== null && (
              <p className="text-xs" style={{ color: '#94a3b8' }}>
                {isPremium
                  ? `Límite diario Premium: 30 búsquedas/día`
                  : `Plan gratuito: 5 búsquedas/día · Actualizá a Premium para 30/día`}
              </p>
            )}
          </div>
        )}

        {/* ── DONE: RESULTS ── */}
        {loadState === 'done' && (
          <>
            {/* Results count + profile summary */}
            {filteredRecs.length > 0 && (
              <div className="rounded-2xl px-4 py-3 flex items-center gap-3"
                style={{ background: 'rgba(0,119,181,0.05)', border: '1px solid rgba(0,119,181,0.12)' }}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold" style={{ color: '#0d2137' }}>
                    {filteredRecs.length} oportunidade{filteredRecs.length !== 1 ? 's' : ''} compatibles
                  </p>
                  {result?.resumen_diagnostico && (
                    <p className="text-xs mt-0.5 truncate" style={{ color: '#64748b' }}>
                      {result.resumen_diagnostico.slice(0, 70)}...
                    </p>
                  )}
                </div>
                {quotaRemaining !== null && (
                  <span className="text-[10px] shrink-0 px-2 py-1 rounded-lg"
                    style={{ background: 'rgba(0,119,181,0.10)', color: '#0077B5' }}>
                    {quotaRemaining} restantes hoy
                  </span>
                )}
              </div>
            )}

            {/* Swipe hint (shown once per session) */}
            {filteredRecs.length > 0 && (
              <p className="text-[10px] text-center" style={{ color: '#cbd5e1' }}>
                Deslizá ← → para descartar o guardar · Toca para expandir
              </p>
            )}

            {/* Job cards */}
            {filteredRecs.map((rec, i) => (
              <JobCard
                key={rec.rec_id || `${rec.job.source}-${rec.job.external_id}`}
                rec={rec}
                index={i}
                isPremium={isPremium}
                blurred={!isPremium && i >= FREE_VISIBLE}
                onSave={handleSaveToKanban}
                onDismiss={handleDismiss}
                onAdaptCv={handleAdaptCv}
                onPrepInterview={handlePrepInterview}
                onUpgrade={() => setShowPremiumModal(true)}
                addToast={addToast}
              />
            ))}

            {/* Freemium upgrade banner (appears after free cards) */}
            {!isPremium && recommendations.length > FREE_VISIBLE && (
              <div className="rounded-2xl p-5 text-center space-y-3"
                style={{ background: 'linear-gradient(135deg,#0d2137,#0077B5)', boxShadow: '0 8px 32px rgba(0,119,181,0.28)' }}>
                <p className="text-white font-bold text-sm">
                  {recommendations.length - FREE_VISIBLE} oportunidades más esperan por vos
                </p>
                <p className="text-sm" style={{ color: 'rgba(226,232,240,0.80)' }}>
                  Desbloqueá todas las recomendaciones, filtros avanzados y guardado en Kanban con Plan Profesional.
                </p>
                <button
                  onClick={() => setShowPremiumModal(true)}
                  className="px-6 py-3 rounded-2xl text-sm font-semibold"
                  style={{ background: 'white', color: '#0077B5' }}>
                  Activar Plan Profesional →
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
                  No encontramos coincidencias exactas
                </h3>
                <p className="text-sm max-w-xs mx-auto leading-relaxed" style={{ color: '#64748b' }}>
                  No hay roles que coincidan plenamente hoy. Aquí van algunos pasos para mejorar tus resultados:
                </p>
                <ul className="text-sm text-left max-w-xs mx-auto space-y-2" style={{ color: '#475569' }}>
                  <li className="flex items-start gap-2"><span>→</span> Actualizá tu perfil con más habilidades</li>
                  <li className="flex items-start gap-2"><span>→</span> Activá la opción "Solo remoto" para más opciones</li>
                  <li className="flex items-start gap-2"><span>→</span> Intentá buscar de nuevo mañana</li>
                </ul>
                <button
                  onClick={fetchRecommendations}
                  className="px-6 py-3 rounded-2xl text-sm font-semibold text-white"
                  style={{ background: LI_GRADIENT }}>
                  Buscar de nuevo
                </button>
              </div>
            )}

            {/* Quota usage footer */}
            {quotaRemaining !== null && filteredRecs.length > 0 && (
              <p className="text-xs text-center py-4" style={{ color: '#cbd5e1' }}>
                {isPremium
                  ? `Búsquedas de hoy: ${30 - quotaRemaining}/30`
                  : `Búsquedas gratuitas de hoy: ${5 - quotaRemaining}/5`}
                {!isPremium && (
                  <button
                    onClick={() => setShowPremiumModal(true)}
                    className="ml-2 underline"
                    style={{ color: '#0077B5' }}>
                    Activar Premium
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

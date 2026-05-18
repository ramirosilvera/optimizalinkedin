import { STEPS, trackEvent } from '../../constants'
import { Logo, Spinner } from '../ui'

export default function ModeSelectScreen({
  setStep,
  handleModeSelectJobAdapter,
  jobAdapterCheckLoading,
  jobAdapterNoCv,
  setJobAdapterNoCv,
  resetInterview,
  setStarPhase,
  cvFinalData,
  result,
  cvOptimizeApplied,
  interviewFeedback,
  callGenerateCV,
}) {
  const firstName = result?.nombre_titular?.split(' ')[0] || null

  const done1 = !!result
  const done2 = !!result
  const done3 = !!cvFinalData
  const done4 = !!(cvFinalData && cvOptimizeApplied)
  const done6 = !!interviewFeedback

  const completedCount = [done1, done2, done3, done4, false, done6, false].filter(Boolean).length
  const nextRec = !done1 ? 1 : !done3 ? 3 : !done6 ? 6 : null

  const steps = [
    {
      num: 1,
      icon: '🎯',
      ac: '#0077B5',
      abg: 'rgba(0,119,181,0.08)',
      aborder: 'rgba(0,119,181,0.22)',
      title: 'Diagnóstico LinkedIn',
      tagline: 'Entendé cómo te percibe el mercado laboral',
      description: 'Análisis con ojo de headhunter: score de empleabilidad, keywords, visibilidad, branding y gaps de carrera.',
      resultText: 'Sabés exactamente qué está frenando tu búsqueda.',
      done: done1,
      available: true,
      ctaLabel: done1 ? 'Ver mi diagnóstico →' : 'Empezar diagnóstico →',
      onClick: () => {
        trackEvent('roadmap_step', { step: 1, action: done1 ? 'view' : 'start' })
        setStep(done1 ? STEPS.RESULTS : STEPS.QUESTIONS)
      },
    },
    {
      num: 2,
      icon: '✏️',
      ac: '#0ea5e9',
      abg: 'rgba(14,165,233,0.08)',
      aborder: 'rgba(14,165,233,0.22)',
      title: 'Optimizar perfil LinkedIn',
      tagline: 'Mejorá tu posicionamiento profesional',
      description: 'Sugerencias de headline, resumen, experiencia, skills y keywords ATS. Con estrategia de networking.',
      resultText: 'Tu perfil atrae recruiters en vez de quedar ignorado.',
      done: done2,
      available: done1,
      ctaLabel: 'Ver sugerencias →',
      lockedLabel: 'Disponible después del diagnóstico',
      onClick: () => {
        trackEvent('roadmap_step', { step: 2, action: 'view' })
        setStep(STEPS.RESULTS)
      },
    },
    {
      num: 3,
      icon: '📄',
      ac: '#059669',
      abg: 'rgba(5,150,105,0.08)',
      aborder: 'rgba(5,150,105,0.22)',
      title: 'CV Inteligente',
      tagline: 'Construí tu CV profesional en segundos',
      description: 'CV ATS-compatible de 1 página, con foto y formato profesional. Generado desde tu análisis — sin editor en blanco.',
      resultText: 'Un CV listo para enviar en cualquier postulación.',
      done: done3,
      available: done1,
      ctaLabel: done3 ? 'Ver mi CV →' : done1 ? 'Generar mi CV →' : 'Empezar por el diagnóstico',
      lockedLabel: 'Disponible después del diagnóstico',
      onClick: () => {
        trackEvent('roadmap_step', { step: 3, action: done3 ? 'view' : 'start' })
        if (done3) { setStep(STEPS.CV); return }
        if (done1) { callGenerateCV({}); setStep(STEPS.CV) } else setStep(STEPS.QUESTIONS)
      },
    },
    {
      num: 4,
      icon: '⚡',
      ac: '#7c3aed',
      abg: 'rgba(124,58,237,0.08)',
      aborder: 'rgba(124,58,237,0.18)',
      title: 'Optimizar CV',
      tagline: 'Revisión con criterio de consultor profesional',
      description: 'IA detecta inconsistencias, logros faltantes, verbos débiles y oportunidades de mejora concreta.',
      resultText: 'Un CV que se destaca sobre el 90% de los candidatos.',
      done: done4,
      available: done3,
      ctaLabel: done4 ? 'Ver CV optimizado →' : 'Optimizar mi CV →',
      lockedLabel: 'Disponible cuando tengas tu CV generado',
      onClick: () => {
        trackEvent('roadmap_step', { step: 4, action: done4 ? 'view' : 'start' })
        setStep(STEPS.CV)
      },
    },
    {
      num: 5,
      icon: '📝',
      ac: '#6366f1',
      abg: 'rgba(99,102,241,0.08)',
      aborder: 'rgba(99,102,241,0.18)',
      title: 'Adaptar CV por oferta',
      tagline: 'Personalización instantánea para cada búsqueda',
      description: 'Pegá cualquier aviso de empleo. IA adapta tu CV y genera la carta de presentación en segundos.',
      resultText: 'Cada postulación con el CV exacto que ese puesto necesita.',
      done: false,
      available: done3,
      ctaLabel: 'Adaptar para una oferta →',
      lockedLabel: 'Disponible cuando tengas tu CV generado',
      onClick: () => {
        if (jobAdapterCheckLoading) return
        trackEvent('roadmap_step', { step: 5, action: 'start' })
        setJobAdapterNoCv(false)
        handleModeSelectJobAdapter()
      },
    },
    {
      num: 6,
      icon: '🎙️',
      ac: '#d97706',
      abg: 'rgba(217,119,6,0.08)',
      aborder: 'rgba(217,119,6,0.2)',
      title: 'Simulación de entrevista',
      tagline: 'Practicá antes de la entrevista real',
      description: '5 preguntas de selección con feedback detallado de IA. Puede ser para un puesto específico.',
      resultText: 'Llegás preparado, seguro y sin sorpresas a cualquier proceso.',
      done: done6,
      available: true,
      ctaLabel: done6 ? 'Practicar de nuevo →' : 'Practicar entrevista →',
      onClick: () => {
        trackEvent('roadmap_step', { step: 6, action: done6 ? 'repeat' : 'start' })
        resetInterview()
        setStep(STEPS.INTERVIEW_INTRO)
      },
    },
    {
      num: 7,
      icon: '⭐',
      ac: '#0d9488',
      abg: 'rgba(13,148,136,0.08)',
      aborder: 'rgba(13,148,136,0.18)',
      badge: 'Avanzado',
      title: 'Entrenamiento STAR',
      tagline: 'Dominá las respuestas de alto impacto',
      description: 'Metodología que usan los mejores candidatos. Practicá con feedback IA componente a componente.',
      resultText: 'Cada pregunta conductual se convierte en una oportunidad de brillar.',
      done: false,
      available: true,
      ctaLabel: 'Entrenar con STAR →',
      onClick: () => {
        trackEvent('roadmap_step', { step: 7, action: 'start' })
        setStarPhase('theory')
        setStep(STEPS.STAR_TRAINING)
      },
    },
  ]

  return (
    <div className="step-transition space-y-4">
      <Logo />

      {/* Header */}
      <div className="space-y-1 pb-1">
        <h2 className="text-xl font-bold text-slate-900 leading-tight">
          {firstName ? `Hola, ${firstName} 👋` : 'Centro de Carrera Inteligente'}
        </h2>
        <p className="text-sm text-slate-500 leading-snug">
          {firstName
            ? 'Tu proceso de empleabilidad, paso a paso.'
            : 'Un proceso estratégico y guiado para conseguir trabajo más rápido.'}
        </p>
      </div>

      {/* Progress */}
      {completedCount > 0 && (
        <div className="rounded-2xl px-4 py-3.5 space-y-2"
          style={{ background: 'rgba(0,119,181,0.04)', border: '1px solid rgba(0,119,181,0.12)' }}>
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-600">
              {completedCount === 7 ? '¡Proceso completo! 🎉' : `${completedCount} de 7 pasos completados`}
            </p>
            <span className="text-xs font-bold" style={{ color: '#0077B5' }}>{Math.round(completedCount / 7 * 100)}%</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(0,119,181,0.12)' }}>
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width: `${completedCount / 7 * 100}%`, background: 'linear-gradient(90deg,#0077B5,#0ea5e9)' }} />
          </div>
          {nextRec && (
            <p className="text-[11px] text-slate-500">
              Siguiente: <span className="font-semibold text-slate-700">Paso {nextRec} — {steps[nextRec - 1].title}</span>
            </p>
          )}
        </div>
      )}

      {/* Journey steps */}
      <div className="space-y-2">
        {steps.map(s => {
          const isRec = s.num === nextRec
          const isLocked = !s.available

          return (
            <div key={s.num}>
              <div
                className={`rounded-2xl transition-all duration-200 overflow-hidden ${isRec ? 'shadow-md' : ''}`}
                style={{
                  border: isRec
                    ? `1.5px solid ${s.ac}`
                    : s.done
                      ? '1px solid rgba(5,150,105,0.2)'
                      : isLocked
                        ? '1px solid rgba(0,0,0,0.05)'
                        : '1px solid rgba(0,0,0,0.08)',
                  background: isRec
                    ? 'white'
                    : s.done
                      ? 'rgba(5,150,105,0.025)'
                      : isLocked
                        ? '#fafafa'
                        : 'white',
                  opacity: isLocked ? 0.6 : 1,
                }}
              >
                {/* Recommended label */}
                {isRec && (
                  <div className="px-4 pt-3 pb-0.5 flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full"
                      style={{ background: s.abg, color: s.ac, border: `1px solid ${s.aborder}` }}>
                      ● Siguiente recomendado
                    </span>
                  </div>
                )}

                <div className="p-4">
                  <div className="flex items-start gap-3">
                    {/* Icon + step number */}
                    <div className="shrink-0 text-center w-10">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                        style={{ background: s.done ? 'rgba(5,150,105,0.1)' : isLocked ? '#f1f5f9' : s.abg }}>
                        {s.done ? '✓' : s.icon}
                      </div>
                      <span className="text-[9px] font-semibold mt-0.5 block"
                        style={{ color: s.done ? '#059669' : isLocked ? '#94a3b8' : s.ac }}>
                        Paso {s.num}
                      </span>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-1.5">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className={`font-bold text-sm leading-tight ${s.done && !isRec ? 'text-slate-500' : 'text-slate-900'}`}>
                              {s.title}
                            </p>
                            {s.badge && (
                              <span className="text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0"
                                style={{ background: s.abg, color: s.ac, border: `1px solid ${s.aborder}` }}>
                                {s.badge}
                              </span>
                            )}
                          </div>
                          <p className="text-xs mt-0.5 text-slate-500 leading-snug">{s.tagline}</p>
                        </div>
                        {s.done && !isRec && (
                          <span className="text-xs font-bold shrink-0 mt-0.5" style={{ color: '#059669' }}>✓</span>
                        )}
                      </div>

                      {/* Description: show for recommended and available-not-done */}
                      {!isLocked && (isRec || !s.done) && (
                        <p className="text-xs text-slate-500 mt-2 leading-relaxed">{s.description}</p>
                      )}
                      {isRec && s.resultText && (
                        <p className="text-xs mt-1.5 font-medium leading-snug" style={{ color: s.ac }}>
                          → {s.resultText}
                        </p>
                      )}

                      {/* CTA */}
                      {!isLocked ? (
                        <button
                          onClick={s.onClick}
                          disabled={s.num === 5 && jobAdapterCheckLoading}
                          className={`mt-3 font-semibold text-xs transition-all ${isRec ? 'w-full py-3 rounded-xl text-white' : s.done ? 'py-1.5 px-3 rounded-lg' : 'py-2 px-3.5 rounded-xl'}`}
                          style={isRec
                            ? { background: s.ac, boxShadow: `0 4px 14px ${s.aborder}` }
                            : s.done
                              ? { color: '#059669', background: 'rgba(5,150,105,0.08)', border: '1px solid rgba(5,150,105,0.2)' }
                              : { color: s.ac, background: s.abg, border: `1px solid ${s.aborder}` }
                          }
                        >
                          {s.num === 5 && jobAdapterCheckLoading
                            ? <span className="flex items-center justify-center gap-2"><Spinner size={3} /> Verificando...</span>
                            : s.ctaLabel
                          }
                        </button>
                      ) : (
                        <p className="text-[10px] text-slate-400 mt-2">🔒 {s.lockedLabel}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* No-CV error for step 5 */}
              {s.num === 5 && jobAdapterNoCv && (
                <div className="mt-1.5 rounded-xl px-4 py-3 text-xs leading-relaxed"
                  style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', color: '#6366f1' }}>
                  <strong>Necesitás generar tu CV primero.</strong> Hacé el diagnóstico, generá tu CV, y después podés adaptarlo para cualquier búsqueda.
                  <button
                    onClick={() => { setJobAdapterNoCv(false); trackEvent('roadmap_nocv_cta'); setStep(STEPS.QUESTIONS) }}
                    className="block mt-1.5 font-semibold underline">
                    Empezar el diagnóstico ahora →
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <button
        onClick={() => setStep(STEPS.WELCOME)}
        className="w-full py-3 rounded-2xl text-sm font-medium text-slate-400 hover:text-slate-600 transition-colors"
      >
        ← Inicio
      </button>
    </div>
  )
}

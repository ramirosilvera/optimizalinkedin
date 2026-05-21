import { STEPS, trackEvent, BTN_BACK_STYLE, LI_GRADIENT, RAMIRO_LINKEDIN_URL, COMPANY_LINKEDIN_URL } from '../../constants'
import { Logo, Spinner, LinkedInIcon, ResultCard, ScoreRing } from '../ui'
import RateLimitUI from '../RateLimitUI'

export default function InterviewFeedbackScreen({ interviewLoading, rateLimitEvento, rateLimitSecs, waitlistEmail, setWaitlistEmail, waitlistSent, waitlistLoading, handleWaitlist, interviewError, setInterviewError, callInterviewFeedback, interviewAnswers, interviewFeedback, user, leadSaving, leadSent, setShowLeadModal, setShowPremiumModal, subscriptionLoading, setShowStarModal, result, setStep }) {
  return (
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
            Nueva sesión →
          </button>
        </div>
      ) : !interviewFeedback ? (
        <div className="flex flex-col items-center justify-center min-h-[55vh] gap-5 text-center">
          <p className="text-slate-500 text-sm">No hay datos de entrevista. Completá la sesión de entrenamiento primero.</p>
          <button onClick={() => setStep(STEPS.INTERVIEW_INTRO)}
            className="btn-glow font-semibold px-6 py-3 rounded-2xl text-white text-sm"
            style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
            ← Ir a la entrevista
          </button>
        </div>
      ) : (
        <>
          {/* Score */}
          <ResultCard title="Análisis de tu sesión" accent="#6366f1">
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

          {!user?.es_premium && (
            <div className="rounded-2xl px-4 py-3 flex items-center justify-between gap-3"
              style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.18)' }}>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-700">Tu entrevista quedó lista</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Guardala con Premium — 7 días gratis</p>
              </div>
              <button onClick={() => setShowPremiumModal(true)}
                className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-xl text-white"
                style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
                Guardar →
              </button>
            </div>
          )}

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
                  <p className="text-slate-500 text-xs mt-0.5 leading-relaxed">Guías y contenido sobre proceso de búsqueda.</p>
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
              Entrenar con STAR →
            </button>
          </div>

          <button
            onClick={() => result ? setStep(STEPS.RESULTS) : setStep(STEPS.MODE_SELECT)}
            className="w-full font-semibold py-4 rounded-2xl text-sm"
            style={BTN_BACK_STYLE}
          >
            {result ? '← Mi preparación' : '← Mi preparación'}
          </button>
        </>
      )}
    </div>
  )
}

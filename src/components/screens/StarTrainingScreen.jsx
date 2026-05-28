import { STAR_QUESTIONS } from '../../data'
import { STEPS, trackEvent, BTN_BACK_STYLE, LI_GRADIENT, INPUT_STYLE } from '../../constants'
import { Logo } from '../ui'
import RateLimitUI from '../RateLimitUI'

export default function StarTrainingScreen({ starPhase, setStarPhase, starQuestionIdx, setStarQuestionIdx, starAnswer, setStarAnswer, starFeedback, setStarFeedback, starLoading, starError, setStarError, rateLimitEvento, rateLimitSecs, waitlistEmail, setWaitlistEmail, waitlistSent, waitlistLoading, handleWaitlist, callStarFeedback, resetInterview, interviewFeedback, user, result, setStep, setShowPremiumModal }) {
  return (
    <div className="step-transition space-y-6 max-w-3xl mx-auto">
      <Logo />

      {starPhase === 'theory' && (
        <>
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold text-slate-900">Alto Rendimiento STAR</h2>
            <p className="text-slate-500 text-sm leading-relaxed max-w-sm mx-auto">
              El método que usan los mejores candidatos del mundo para responder cualquier pregunta conductual.
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
            Comenzar entrenamiento →
          </button>
          <button onClick={() => { trackEvent('star_back', { from: 'theory' }); interviewFeedback ? setStep(STEPS.INTERVIEW_FEEDBACK) : setStep(STEPS.MODE_SELECT) }}
            className="w-full py-3 rounded-2xl text-sm font-semibold" style={BTN_BACK_STYLE}>
            {interviewFeedback ? '← Volver al feedback' : '← Mi preparación'}
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
                    {starFeedback.puntaje >= 8 ? 'Respuesta de alto rendimiento.' : starFeedback.puntaje >= 6 ? 'Buena base. Afinar los detalles hace la diferencia.' : 'Más práctica. Cada iteración te acerca al nivel elite.'}
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

          {/* Premium upsell + siguiente paso — solo se muestra cuando hay feedback */}
          {starFeedback && (
            <>
              {!user?.es_premium && (
                <div className="rounded-2xl p-4 space-y-2.5"
                  style={{ background: 'rgba(0,119,181,0.04)', border: '1px solid rgba(0,119,181,0.15)' }}>
                  <p className="text-slate-700 text-sm font-semibold">⭐ Guardá tus prácticas STAR con el Plan Profesional</p>
                  <p className="text-slate-500 text-xs leading-snug">
                    Accedé a tu historial completo de prácticas y seguí tu progreso. 7 días gratis, luego $3.000/mes.
                  </p>
                  <button onClick={() => setShowPremiumModal(true)}
                    className="px-4 py-2 rounded-xl text-white text-xs font-semibold"
                    style={{ background: LI_GRADIENT }}>
                    Activar Plan Profesional
                  </button>
                </div>
              )}
              {/* Siguiente paso: entrevista completa */}
              <div className="rounded-2xl p-4 space-y-2.5"
                style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.22)' }}>
                <p className="text-sm font-semibold text-slate-800">🎙️ Ahora probalo en una entrevista real</p>
                <p className="text-slate-500 text-xs leading-relaxed">
                  Aplicá la técnica STAR en nuestra sesión de entrenamiento completa. 5 preguntas con feedback detallado de IA.
                </p>
                <button
                  onClick={() => { resetInterview(); trackEvent('star_to_interview_cta'); setStep(STEPS.INTERVIEW_INTRO) }}
                  className="w-full py-2.5 rounded-xl text-white text-xs font-semibold"
                  style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
                >
                  Entrenar entrevista →
                </button>
              </div>
            </>
          )}

          <button onClick={() => { trackEvent('star_back', { from: 'practice' }); result ? setStep(STEPS.RESULTS) : setStep(STEPS.MODE_SELECT) }}
            className="w-full py-3 rounded-2xl text-sm font-semibold" style={BTN_BACK_STYLE}>
            {result ? '← Volver a mi análisis' : '← Mi preparación'}
          </button>
        </>
      )}
    </div>
  )
}

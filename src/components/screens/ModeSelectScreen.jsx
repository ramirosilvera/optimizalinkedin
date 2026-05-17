import { STEPS, trackEvent, BTN_BACK_STYLE } from '../../constants'
import { Logo, Spinner } from '../ui'

export default function ModeSelectScreen({ setStep, handleModeSelectJobAdapter, jobAdapterCheckLoading, jobAdapterNoCv, setJobAdapterNoCv, resetInterview, setStarPhase, cvFinalData }) {
  return (
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
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold text-slate-900 text-base">Adaptar CV para un aviso</span>
                  {cvFinalData && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                      style={{ background: 'rgba(99,102,241,0.12)', color: '#6366f1' }}>
                      CV listo ✓
                    </span>
                  )}
                </div>
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
  )
}

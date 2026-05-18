import { STEPS, LI_GRADIENT, trackEvent } from '../../constants'
import { ScoreRing } from '../ui'

export default function OnboardingScreen({ result, setStep }) {
  const firstName = result?.nombre_titular?.split(' ')[0] || ''
  const score = result?.puntaje_general
  const scoreColor = score >= 7 ? '#059669' : score >= 5 ? '#6366f1' : '#d97706'

  return (
    <div className="step-transition flex flex-col items-center text-center space-y-6 pt-4 pb-8">

      {/* Step badge */}
      <span className="text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full"
        style={{ background: 'rgba(0,119,181,0.08)', color: '#0077B5', border: '1px solid rgba(0,119,181,0.18)' }}>
        ✓ Paso 1 completo
      </span>

      {/* Score central */}
      <div className="space-y-3">
        <ScoreRing score={score ?? 0} size={110} />
        {score !== null && score !== undefined && (
          <p className="text-sm font-bold" style={{ color: scoreColor }}>
            {score >= 8 ? 'Perfil muy sólido' : score >= 6 ? 'Buen perfil, con margen de mejora' : 'Hay oportunidades claras para crecer'}
          </p>
        )}
      </div>

      {/* Greeting */}
      <div className="space-y-1.5 max-w-xs">
        <h2 className="text-2xl font-bold text-slate-900" style={{ letterSpacing: '-0.02em' }}>
          {firstName ? `¡Listo, ${firstName}!` : '¡Diagnóstico listo!'}
        </h2>
        <p className="text-slate-500 text-sm leading-relaxed">
          Tu análisis con criterio de headhunter está completo. Esto es lo que podés hacer ahora:
        </p>
      </div>

      {/* Next actions */}
      <div className="w-full max-w-sm space-y-2.5 text-left">
        {[
          { icon: '📄', step: 'Paso 3', title: 'Generá tu CV ATS-compatible', desc: 'Un click — listo en 30 segundos', accent: '#059669' },
          { icon: '✏️', step: 'Paso 2', title: 'Optimizá tu perfil LinkedIn', desc: 'Titular, resumen y keywords sugeridos', accent: '#0ea5e9' },
          { icon: '🎙️', step: 'Paso 6', title: 'Simulá una entrevista con IA', desc: '5 preguntas con feedback personalizado', accent: '#d97706' },
        ].map(item => (
          <div key={item.step} className="flex items-center gap-3 rounded-2xl px-4 py-3"
            style={{ background: 'white', border: '1px solid rgba(0,119,181,0.10)', boxShadow: '0 1px 6px rgba(0,0,0,0.04)' }}>
            <span className="text-xl shrink-0">{item.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full"
                  style={{ background: `${item.accent}18`, color: item.accent }}>{item.step}</span>
              </div>
              <p className="text-xs font-semibold text-slate-800 leading-tight">{item.title}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Primary CTA */}
      <div className="w-full max-w-sm space-y-2">
        <button
          onClick={() => { trackEvent('onboarding_to_results'); setStep(STEPS.RESULTS) }}
          className="btn-glow w-full py-4 rounded-2xl text-white font-semibold text-sm"
          style={{ background: LI_GRADIENT }}
        >
          Ver mi diagnóstico completo →
        </button>
        <button
          onClick={() => { trackEvent('onboarding_to_roadmap'); setStep(STEPS.MODE_SELECT) }}
          className="w-full py-2.5 text-xs font-medium text-slate-400 transition-colors hover:text-slate-600"
        >
          Ver hoja de ruta completa
        </button>
      </div>
    </div>
  )
}

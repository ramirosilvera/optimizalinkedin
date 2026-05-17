import { STEPS, trackEvent, BTN_BACK_STYLE } from '../../constants'
import { Logo } from '../ui'

export default function InterviewIntroScreen({ interviewJobContext, setInterviewJobContext, generatePersonalizedInterviewQs, setStep, result }) {
  return (
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
          {interviewJobContext
            ? `Preguntas adaptadas al puesto de ${interviewJobContext.puesto} en ${interviewJobContext.empresa}.`
            : '5 preguntas típicas de selección. Al final recibís feedback personalizado basado en tu perfil y tus respuestas.'}
        </p>
      </div>

      {/* Job context badge from Kanban */}
      {interviewJobContext && (
        <div className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl mx-auto w-fit"
          style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.22)' }}>
          <span className="text-sm">📍</span>
          <div className="text-left">
            <p className="text-xs font-bold" style={{ color: '#6366f1' }}>{interviewJobContext.empresa}</p>
            <p className="text-xs text-slate-500">{interviewJobContext.puesto}</p>
          </div>
          <button onClick={() => setInterviewJobContext(null)} className="text-slate-300 hover:text-slate-500 ml-1">×</button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { icon: '❓', label: interviewJobContext ? 'Personalizadas' : '5 preguntas', text: interviewJobContext ? `Para ${interviewJobContext.puesto}` : 'Pre-armadas por RRHH', accent: '#6366f1' },
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
          onClick={() => {
            trackEvent('entrevista_iniciada')
            generatePersonalizedInterviewQs()
            setStep(STEPS.INTERVIEW)
          }}
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
    </div>
  )
}

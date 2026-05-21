import { useState } from 'react'
import { STEPS, trackEvent, BTN_BACK_STYLE } from '../../constants'
import { Logo } from '../ui'

export default function InterviewIntroScreen({ interviewJobContext, setInterviewJobContext, generatePersonalizedInterviewQs, setStep, result }) {
  const [customTarget, setCustomTarget] = useState('')

  const handleStart = () => {
    trackEvent('entrevista_iniciada', { has_job_context: !!(interviewJobContext || customTarget.trim()) })
    if (customTarget.trim() && !interviewJobContext) {
      const parts = customTarget.trim().split(/\s+en\s+/i)
      const contextOverride = parts.length >= 2
        ? { puesto: parts[0].trim(), empresa: parts.slice(1).join(' en ').trim() }
        : { puesto: customTarget.trim(), empresa: '' }
      generatePersonalizedInterviewQs(contextOverride)
    } else {
      generatePersonalizedInterviewQs()
    }
    setStep(STEPS.INTERVIEW)
  }

  return (
    <div className="step-transition text-center space-y-8">
      <Logo />
      <div className="space-y-5">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide"
          style={{ border: '1px solid rgba(99,102,241,0.4)', color: '#6366f1', background: 'rgba(99,102,241,0.07)' }}>
          🎙️ &nbsp;Sesión de Entrenamiento
        </div>
        <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 leading-tight" style={{ letterSpacing: '-0.02em' }}>
          Sesión de<br />
          <span style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Entrenamiento
          </span>
        </h2>
        <p className="text-slate-600 text-base max-w-sm mx-auto leading-relaxed">
          {interviewJobContext
            ? `Entrenamiento calibrado para el puesto de ${interviewJobContext.puesto}${interviewJobContext.empresa ? ` en ${interviewJobContext.empresa}` : ''}.`
            : '5 preguntas personalizadas a tu perfil. Al final recibís análisis detallado de cada respuesta con criterio de selección real.'}
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

      {/* Custom job target input — only if no Kanban context */}
      {!interviewJobContext && (
        <div className="w-full max-w-sm mx-auto text-left space-y-1.5">
          <label className="text-xs font-semibold text-slate-500">
            ¿Para qué puesto querés entrenar? <span className="font-normal">(opcional)</span>
          </label>
          <input
            type="text"
            value={customTarget}
            onChange={e => setCustomTarget(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && customTarget.trim() && handleStart()}
            placeholder='Ej: "Product Manager en Banco Ciudad"'
            maxLength={120}
            className="w-full rounded-2xl px-4 py-3 text-sm outline-none transition-all"
            style={{
              background: '#f8fafc',
              border: customTarget.trim() ? '1px solid rgba(99,102,241,0.5)' : '1px solid rgba(0,119,181,0.15)',
              color: '#0d2137',
            }}
          />
          {customTarget.trim() && (
            <p className="text-[10px] text-indigo-500 px-1">
              ✦ Preguntas calibradas para este puesto
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { icon: '❓', label: interviewJobContext || customTarget.trim() ? 'Personalizadas' : '5 preguntas', text: interviewJobContext ? `Para ${interviewJobContext.puesto}` : customTarget.trim() ? 'Para el puesto ingresado' : 'Pre-armadas por RRHH', accent: '#6366f1' },
          { icon: '🧠', label: 'Feedback IA', text: 'Análisis técnico de cada respuesta', accent: '#8b5cf6' },
          { icon: '🎯', label: 'Estándar real', text: 'Criterio de headhunter', accent: '#a855f7' },
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
          onClick={handleStart}
          className="btn-glow w-full text-white font-semibold py-4 rounded-2xl text-base"
          style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
        >
          Comenzar sesión →
        </button>
        <button
          onClick={() => setStep(STEPS.MODE_SELECT)}
          className="w-full font-medium py-3 rounded-2xl text-sm transition-all"
          style={BTN_BACK_STYLE}
        >
          ← Mi preparación
        </button>
      </div>
    </div>
  )
}

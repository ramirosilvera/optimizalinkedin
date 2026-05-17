import { STEPS, trackEvent } from '../../constants'

export default function StarModal({ setShowStarModal, setStarPhase, setStarFeedback, setStarAnswer, setStep }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 overflow-y-auto"
      style={{ background: 'rgba(0,0,0,0.70)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) setShowStarModal(false) }}
    >
      <div className="w-full max-w-sm rounded-2xl overflow-hidden step-transition"
        style={{ background: '#1e293b', border: '1px solid #334155', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        <div className="p-6 pb-4 space-y-2">
          <h3 className="text-lg font-bold text-white">🎯 Entrenador STAR</h3>
          <p className="text-xs leading-relaxed" style={{ color: '#64748b' }}>
            El método que usan los mejores candidatos para estructurar respuestas que impactan.
          </p>
          <ul className="text-xs space-y-1 pt-1" style={{ color: '#64748b' }}>
            <li>✓ Teoría explicada paso a paso (S · T · A · R)</li>
            <li>✓ Ejemplo completo de una respuesta bien estructurada</li>
            <li>✓ Práctica real con preguntas de RRHH</li>
            <li>✓ Feedback de IA por cada componente STAR</li>
          </ul>
        </div>
        <div className="px-6 pb-6 pt-4 space-y-3" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <button
            onClick={() => {
              trackEvent('star_training_start', { via: 'free' })
              setShowStarModal(false)
              setStarPhase('theory')
              setStarFeedback(null)
              setStarAnswer('')
              setStep(STEPS.STAR_TRAINING)
            }}
            className="w-full py-3.5 rounded-xl text-sm font-semibold"
            style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: 'white' }}
          >
            Empezar gratis →
          </button>
          <button
            onClick={() => setShowStarModal(false)}
            className="w-full py-2 text-xs transition-colors"
            style={{ color: '#475569' }}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

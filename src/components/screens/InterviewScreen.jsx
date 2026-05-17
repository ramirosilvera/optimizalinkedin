import { INTERVIEW_QUESTIONS } from '../../data'
import { Logo, Spinner } from '../ui'

export default function InterviewScreen({ interviewQsLoading, dynamicInterviewQs, interviewIdx, interviewAnswer, setInterviewAnswer, handleInterviewNext, handleInterviewBack }) {
  return (
    <div className="step-transition space-y-7">
      <Logo />

      {/* Personalized questions loading badge */}
      {interviewQsLoading && (
        <div className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-full w-fit"
          style={{ background: 'rgba(99,102,241,0.08)', color: '#6366f1' }}>
          <Spinner size={3} /> Personalizando preguntas para tu perfil...
        </div>
      )}
      {dynamicInterviewQs && !interviewQsLoading && (
        <div className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full w-fit"
          style={{ background: 'rgba(99,102,241,0.08)', color: '#6366f1' }}>
          ✦ Preguntas adaptadas a tu perfil
        </div>
      )}

      {/* Progress */}
      {(() => {
        const activeQs = dynamicInterviewQs || INTERVIEW_QUESTIONS
        return (
          <>
            <div className="flex items-center gap-1.5">
              {activeQs.map((_, i) => (
                <div key={i} className="h-1.5 rounded-full transition-all duration-500 flex-1"
                  style={{
                    background: i < interviewIdx
                      ? 'linear-gradient(90deg,#6366f1,#8b5cf6)'
                      : i === interviewIdx
                        ? 'rgba(99,102,241,0.5)'
                        : 'rgba(0,119,181,0.12)',
                  }} />
              ))}
            </div>
            <p className="text-xs text-slate-500 -mt-4">
              Pregunta {interviewIdx + 1} de {activeQs.length}
            </p>

            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 leading-snug" style={{ letterSpacing: '-0.01em' }}>
                {activeQs[interviewIdx].pregunta}
              </h2>
              <p className="text-slate-500 text-sm mt-2 leading-relaxed">
                {activeQs[interviewIdx].hint}
              </p>
            </div>
          </>
        )
      })()}

      <div className="space-y-3">
        <div className="relative">
          <textarea
            value={interviewAnswer}
            onChange={e => setInterviewAnswer(e.target.value)}
            placeholder="Escribí tu respuesta acá... (mínimo 20 caracteres)"
            rows={6}
            maxLength={800}
            className="w-full rounded-2xl px-4 py-3 text-sm resize-none outline-none transition-all duration-200"
            style={{
              background: '#f8fafc',
              border: interviewAnswer.trim().length >= 20 ? '1px solid rgba(99,102,241,0.5)' : '1px solid rgba(0,119,181,0.15)',
              color: '#0d2137',
            }}
          />
          <span className="absolute bottom-2.5 right-3 text-xs pointer-events-none"
            style={{ color: interviewAnswer.length > 720 ? '#f59e0b' : '#94a3b8' }}>
            {interviewAnswer.length}/800
          </span>
        </div>
        {interviewAnswer.trim().length > 0 && interviewAnswer.trim().length < 20 && (
          <p className="text-xs text-amber-600">Escribí al menos {20 - interviewAnswer.trim().length} caracteres más para continuar.</p>
        )}
        <button
          disabled={interviewAnswer.trim().length < 20}
          onClick={() => handleInterviewNext(interviewAnswer.trim())}
          className={`btn-glow w-full font-semibold py-4 rounded-2xl text-white text-sm ${interviewAnswer.trim().length < 20 ? 'opacity-40 cursor-not-allowed' : ''}`}
          style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
        >
          {interviewIdx < INTERVIEW_QUESTIONS.length - 1 ? 'Siguiente →' : 'Ver mi feedback →'}
        </button>
      </div>

      <button onClick={handleInterviewBack} className="text-slate-600 text-sm hover:text-slate-400 transition-colors py-3 px-3 min-h-[44px]">
        ← {interviewIdx === 0 ? 'Volver al inicio' : 'Pregunta anterior'}
      </button>
    </div>
  )
}

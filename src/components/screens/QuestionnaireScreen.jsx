import { STATIC_QUESTIONS, LOADING_MESSAGES_BY_SITUACION, LOADING_MESSAGES_DEFAULT } from '../../data'
import { LI_GRADIENT } from '../../constants'
import { Logo, OptionButton } from '../ui'

export default function QuestionnaireScreen({ qaHistory, currentQ, selectedOption, setSelectedOption, textAnswer, setTextAnswer, handleAnswer, handleBack }) {
  return (
    <div className="step-transition space-y-7">
      <Logo />

      {/* Stepper de puntos */}
      <div className="flex items-center gap-1.5">
        {STATIC_QUESTIONS.map((_, i) => {
          const done = i < qaHistory.length
          const active = i === qaHistory.length
          return (
            <div key={i} className="h-1.5 rounded-full transition-all duration-500 flex-1"
              style={{
                background: done
                  ? 'linear-gradient(90deg,#0077B5,#0ea5e9)'
                  : active
                    ? 'rgba(0,119,181,0.5)'
                    : 'rgba(0,119,181,0.12)',
              }} />
          )
        })}
      </div>
      <p className="text-xs text-slate-500 -mt-4">
        Paso {qaHistory.length + 1} de {STATIC_QUESTIONS.length}
        {currentQ.id && <span className="ml-2 opacity-60">· {currentQ.id.replace(/_/g,' ')}</span>}
      </p>

      {/* Question */}
      <div>
        <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 leading-snug" style={{ letterSpacing: '-0.01em' }}>
          {currentQ.question}
        </h2>
        {currentQ.type === 'text' && currentQ.hint && (
          <p className="text-slate-500 text-sm mt-2 leading-relaxed">{currentQ.hint}</p>
        )}
      </div>

      {/* Multiple choice */}
      {currentQ.type !== 'text' && (
        <div className="space-y-2.5">
          {currentQ.options.map(opt => (
            <OptionButton
              key={opt}
              label={opt}
              selected={selectedOption === opt}
              onClick={() => { setSelectedOption(opt); handleAnswer(opt) }}
            />
          ))}
        </div>
      )}

      {/* Texto libre — opcional */}
      {currentQ.type === 'text' && (
        <div className="space-y-3">
          <div className="relative">
            <textarea
              value={textAnswer}
              onChange={e => setTextAnswer(e.target.value)}
              placeholder={currentQ.placeholder}
              rows={4}
              maxLength={600}
              className="w-full rounded-2xl px-4 py-3 text-sm resize-none outline-none transition-all duration-200"
              style={{
                background: '#f8fafc',
                border: textAnswer.trim() ? '1px solid rgba(0,119,181,0.5)' : '1px solid rgba(0,119,181,0.15)',
                color: '#0d2137',
              }}
            />
            <span className="absolute bottom-2.5 right-3 text-xs pointer-events-none"
              style={{ color: textAnswer.length > 550 ? '#f59e0b' : '#334155' }}>
              {textAnswer.length}/600
            </span>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => handleAnswer('')}
              className="flex-1 font-medium py-3 rounded-2xl text-sm transition-colors"
              style={{ border: '1px solid rgba(0,119,181,0.15)', color: '#475569', background: '#f8fafc' }}
            >
              Omitir
            </button>
            <button
              onClick={() => handleAnswer(textAnswer.trim())}
              className="btn-glow flex-[2] font-semibold py-3 rounded-2xl text-white text-sm"
              style={{ background: LI_GRADIENT }}
            >
              Continuar →
            </button>
          </div>
        </div>
      )}

      {/* Back */}
      <button onClick={handleBack} className="text-slate-600 text-sm hover:text-slate-400 transition-colors py-3 px-3 min-h-[44px]">
        ← {qaHistory.length === 0 ? 'Volver al inicio' : 'Anterior'}
      </button>
    </div>
  )
}

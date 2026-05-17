import { STEPS } from '../../constants'
import { LinkedInIcon } from '../ui'

export default function LoadingScreen({ loadingMsgs, loadingMsgIdx, analysisAbortRef, setAnalyzing, setStep }) {
  return (
    <div className="step-transition flex flex-col items-center justify-center min-h-[60vh] space-y-8 text-center">
      <div className="relative w-28 h-28">
        {/* outer glow halo */}
        <div className="absolute inset-0 rounded-full"
          style={{ boxShadow: '0 0 50px rgba(0,119,181,0.25), 0 0 80px rgba(14,165,233,0.1)' }} />
        {/* track */}
        <div className="absolute inset-3 rounded-full"
          style={{ border: '2px solid rgba(0,119,181,0.08)' }} />
        {/* spinner */}
        <div className="absolute inset-3 rounded-full border-2 animate-spin"
          style={{ borderColor: 'rgba(0,119,181,0.25)', borderTopColor: '#0ea5e9' }} />
        {/* inner icon */}
        <div className="absolute inset-0 flex items-center justify-center"
          style={{ color: '#0077B5', filter: 'drop-shadow(0 0 6px rgba(0,119,181,0.4))' }}>
          <LinkedInIcon className="w-9 h-9" />
        </div>
      </div>
      <div className="space-y-3 max-w-xs">
        <h2 className="text-2xl font-bold text-slate-900" style={{ letterSpacing: '-0.02em' }}>Analizando tu perfil...</h2>
        <p className="text-slate-500 text-sm leading-relaxed transition-all duration-700">
          {loadingMsgs[loadingMsgIdx % loadingMsgs.length]}
        </p>
      </div>
      <div className="flex gap-2">
        {[0, 1, 2].map(i => (
          <div key={i} className="w-1.5 h-1.5 rounded-full animate-bounce"
            style={{ backgroundColor: '#0ea5e9', animationDelay: `${i * 0.15}s` }} />
        ))}
      </div>
      <button
        onClick={() => { analysisAbortRef.current?.abort(); setAnalyzing(false); setStep(STEPS.PROFILE_INPUT) }}
        className="text-slate-500 text-xs hover:text-slate-700 transition-colors py-2 px-4 rounded-xl"
        style={{ border: '1px solid rgba(0,119,181,0.12)', background: '#f8fafc' }}
      >
        Cancelar análisis
      </button>
    </div>
  )
}

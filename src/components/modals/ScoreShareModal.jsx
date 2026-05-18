import { trackEvent } from '../../constants'

const APP_URL = 'https://ramirosilvera.github.io/optimizalinkedin/'

export default function ScoreShareModal({ result, setShowScoreShare }) {
  const score = result?.puntaje_general
  const name = result?.nombre_titular || ''
  const scoreColor = score >= 7 ? '#059669' : score >= 5 ? '#6366f1' : '#d97706'
  const scoreLabel = score >= 8 ? 'Perfil muy sólido ✦' : score >= 6 ? 'Buen perfil — con margen de mejora' : 'Diagnóstico completo · Mejoras identificadas'

  const shareText = score !== null && score !== undefined
    ? `Hice un diagnóstico de mi perfil LinkedIn con criterio de headhunter y obtuve ${score}/10.\n\n${scoreLabel}\n\nAnalizá tu perfil gratis: ${APP_URL}`
    : `Hice un diagnóstico de mi perfil LinkedIn con criterio de headhunter.\n\nAnalizá el tuyo gratis: ${APP_URL}`

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareText)
      trackEvent('score_share_copy')
    } catch {
      /* fallback: select text */
    }
  }

  const handleLinkedin = () => {
    const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(APP_URL)}&summary=${encodeURIComponent(shareText)}`
    window.open(url, '_blank', 'noopener,noreferrer,width=600,height=600')
    trackEvent('score_share_linkedin', { score })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) setShowScoreShare(false) }}>
      <div className="w-full max-w-sm rounded-3xl overflow-hidden"
        style={{ background: 'white', boxShadow: '0 25px 60px rgba(0,0,0,0.2)' }}>

        {/* Card preview */}
        <div className="px-6 py-7 flex flex-col items-center gap-4 text-center"
          style={{ background: 'linear-gradient(135deg,#0d2137 0%,#0a3d62 60%,#0077B5 100%)' }}>
          <p className="text-[10px] font-bold uppercase tracking-widest"
            style={{ color: 'rgba(255,255,255,0.55)' }}>Diagnóstico LinkedIn · Optimiza LK</p>
          {score !== null && score !== undefined ? (
            <div className="flex flex-col items-center gap-1">
              <span className="text-6xl font-black leading-none" style={{ color: 'white' }}>{score}</span>
              <span className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.6)' }}>/10</span>
            </div>
          ) : (
            <span className="text-4xl">💡</span>
          )}
          <div className="space-y-0.5">
            {name && <p className="text-sm font-bold text-white">{name}</p>}
            <p className="text-xs font-medium" style={{ color: scoreColor === '#059669' ? '#4ade80' : scoreColor === '#6366f1' ? '#a5b4fc' : '#fcd34d' }}>
              {scoreLabel}
            </p>
          </div>
          <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>ramirosilvera.github.io/optimizalinkedin</p>
        </div>

        {/* Actions */}
        <div className="p-5 space-y-3">
          <button
            onClick={handleLinkedin}
            className="btn-glow w-full py-3 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2"
            style={{ background: '#0077B5' }}>
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
            Compartir en LinkedIn
          </button>
          <button
            onClick={handleCopy}
            className="w-full py-3 rounded-xl text-sm font-semibold transition-all"
            style={{ background: 'rgba(0,119,181,0.07)', border: '1px solid rgba(0,119,181,0.20)', color: '#0077B5' }}>
            📋 Copiar texto
          </button>
          <button
            onClick={() => setShowScoreShare(false)}
            className="w-full py-2 text-xs text-slate-400 hover:text-slate-600 transition-colors">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

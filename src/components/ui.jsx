import { useState, useEffect } from 'react'
import { LI_GRADIENT } from '../constants'

export const LinkedInIcon = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
  </svg>
)

export function Logo() {
  return (
    <div className="mb-8 sm:mb-10">
      <img
        src="/logo.PNG"
        alt="Optimiza LK"
        style={{ height: '80px', width: 'auto', display: 'block', mixBlendMode: 'multiply' }}
      />
    </div>
  )
}

export function Spinner({ size = 4 }) {
  const px = size * 4
  return (
    <div
      className="rounded-full border-2 animate-spin shrink-0"
      style={{ width: px, height: px, borderColor: 'rgba(0,119,181,0.25)', borderTopColor: '#0077B5' }}
    />
  )
}

export function OptionButton({ label, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-5 py-3.5 rounded-2xl border transition-all duration-200 text-sm sm:text-base flex items-center justify-between gap-3 ${selected ? 'option-glow' : ''}`}
      style={selected
        ? { borderColor: 'rgba(0,119,181,0.6)', background: 'rgba(0,119,181,0.10)', color: '#0d2137', fontWeight: 500 }
        : { borderColor: 'rgba(0,119,181,0.15)', background: '#f8fafc', color: '#374151' }
      }
    >
      <span>{label}</span>
      {selected && (
        <span className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
          style={{ background: LI_GRADIENT, color: '#fff' }}>✓</span>
      )}
    </button>
  )
}

export function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(t)
  }, [copied])
  return (
    <button
      onClick={() => navigator.clipboard.writeText(text).then(() => setCopied(true))}
      className={`text-xs px-3 py-1.5 rounded-lg border transition-all duration-200 shrink-0 whitespace-nowrap ${copied ? 'copy-btn-success' : ''}`}
      style={copied
        ? { borderColor: '#22c55e', color: '#16a34a', background: 'rgba(34,197,94,0.08)' }
        : { borderColor: 'rgba(0,119,181,0.2)', color: '#3d5a73', background: '#f8fafc' }
      }
    >
      {copied ? '✓ Copiado' : 'Copiar'}
    </button>
  )
}

export function TagInput({ placeholder, onAdd }) {
  const [val, setVal] = useState('')
  return (
    <input
      className="w-full px-3 py-1.5 rounded-lg text-xs border focus:outline-none focus:ring-1"
      style={{ borderColor: 'rgba(0,0,0,0.12)' }}
      placeholder={placeholder}
      value={val}
      onChange={e => setVal(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter' && val.trim()) {
          e.preventDefault()
          onAdd(val.trim())
          setVal('')
        }
      }}
    />
  )
}

export function ScoreRing({ score }) {
  const s = Math.min(Math.max(Number(score) || 0, 0), 10)
  const r = 52, circ = 2 * Math.PI * r
  const color = s >= 8 ? '#22c55e' : s >= 5 ? '#0ea5e9' : '#f59e0b'
  const glowColor = s >= 8 ? 'rgba(34,197,94,0.3)' : s >= 5 ? 'rgba(14,165,233,0.3)' : 'rgba(245,158,11,0.3)'
  return (
    <div className="flex flex-col items-center shrink-0">
      <svg width="140" height="140" viewBox="0 0 140 140" style={{ filter: `drop-shadow(0 0 8px ${glowColor})` }}>
        <circle cx="70" cy="70" r={r} stroke="rgba(0,119,181,0.12)" strokeWidth="10" fill="none" />
        <circle cx="70" cy="70" r={r} stroke={color} strokeWidth="10" fill="none"
          strokeDasharray={circ} strokeDashoffset={circ - (circ * s) / 10}
          strokeLinecap="round"
          style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', transition: 'stroke-dashoffset 1.3s cubic-bezier(0.16,1,0.3,1)' }}
        />
        <text x="70" y="65" textAnchor="middle" fill="#0d2137" fontSize="34" fontWeight="700" dy="0.35em">{s}</text>
        <text x="70" y="93" textAnchor="middle" fill="#64748b" fontSize="11">/ 10</text>
      </svg>
      <p className="text-slate-500 text-xs mt-1 tracking-wide uppercase">Puntaje general</p>
    </div>
  )
}

export function ResultCard({ title, children, accent = '#0077B5' }) {
  return (
    <div className="rounded-2xl p-4 sm:p-6 relative overflow-hidden card-accent-line"
      style={{ background: 'white', border: `1px solid rgba(0,119,181,0.12)`, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
      <div className="absolute top-0 left-0 right-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent 0%, ${accent}50 50%, transparent 100%)` }} />
      <h3 className="font-semibold text-xs mb-4 uppercase tracking-widest" style={{ color: accent }}>{title}</h3>
      {children}
    </div>
  )
}

export function ToastContainer({ toasts, dismissToast }) {
  if (!toasts.length) return null
  return (
    <div className="fixed bottom-0 left-0 right-0 flex flex-col items-center gap-2 z-[9999] pointer-events-none"
      style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
      {toasts.map(t => (
        <div key={t.id}
          className="animate-toast-in pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-2xl text-sm font-semibold"
          style={{
            maxWidth: '24rem',
            width: 'calc(100% - 2rem)',
            background: t.type === 'error' ? '#fff1f2' : t.type === 'loading' ? 'white' : '#065f46',
            color: t.type === 'error' ? '#dc2626' : t.type === 'loading' ? '#0077B5' : 'white',
            border: t.type === 'success' ? 'none' : `1px solid ${t.type === 'error' ? 'rgba(220,38,38,0.25)' : 'rgba(0,119,181,0.20)'}`,
            boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
          }}>
          {t.type === 'loading' && (
            <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin shrink-0" />
          )}
          <span className="flex-1">{t.msg}</span>
          <button onClick={() => dismissToast(t.id)}
            className="shrink-0 opacity-50 hover:opacity-100 transition-opacity text-xl leading-none ml-1">
            ×
          </button>
        </div>
      ))}
    </div>
  )
}

export function BeforeAfter({ label, before, after }) {
  return (
    <div className="space-y-2">
      <div className="rounded-xl p-4" style={{ background: '#f8fafc', border: '1px solid rgba(0,119,181,0.10)' }}>
        <span className="text-xs text-slate-500 uppercase tracking-widest block mb-2">Actual</span>
        <p className="text-slate-600 text-sm leading-relaxed">{before || `No tiene ${label.toLowerCase()}`}</p>
      </div>
      <div className="rounded-xl p-4 relative overflow-hidden"
        style={{ background: 'rgba(0,119,181,0.06)', border: '1px solid rgba(0,119,181,0.22)' }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs uppercase tracking-widest font-semibold" style={{ color: '#0077B5' }}>Propuesto</span>
          <CopyButton text={after || ''} />
        </div>
        <p className="text-slate-900 text-sm leading-relaxed">{after || '—'}</p>
      </div>
    </div>
  )
}

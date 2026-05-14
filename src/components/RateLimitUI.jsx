import { useState, useEffect } from 'react'

export default function RateLimitUI({ secs, evento, email, onEmailChange, sent, loading, onSubmit }) {
  const amber = { background: 'rgba(251,191,36,0.10)', border: '1px solid rgba(251,191,36,0.35)', color: '#fbbf24' }
  if (secs > 0) return (
    <div role="alert" className="rounded-xl p-4 text-sm flex items-center gap-3" style={amber}>
      <span style={{ fontSize: '1.1em' }}>⏱</span>
      <span>Estamos experimentando alta demanda. Volvé a intentar en <strong>{secs}s</strong></span>
    </div>
  )
  if (!evento) return null
  if (sent) return (
    <div role="alert" className="rounded-xl p-4 text-sm text-center font-medium"
      style={{ background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.35)', color: '#22c55e' }}>
      ✓ ¡Anotado! Te avisamos cuando vuelva a estar disponible.
    </div>
  )
  return (
    <div role="alert" className="rounded-xl p-4 text-sm space-y-3" style={amber}>
      <p>⏱ Los tokens de IA se agotaron por hoy. Dejá tu email y te avisamos mañana cuando se reinicien.</p>
      <div className="flex gap-2">
        <input type="email" value={email} onChange={e => onEmailChange(e.target.value)}
          placeholder="tu@email.com" onKeyDown={e => e.key === 'Enter' && email.includes('@') && onSubmit(email)}
          className="flex-1 rounded-lg px-3 py-2 text-sm outline-none"
          style={{ background: 'rgba(15,23,42,0.85)', border: '1px solid rgba(251,191,36,0.3)', color: 'white' }} />
        <button onClick={() => onSubmit(email)} disabled={loading || !email.includes('@')}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-900"
          style={{ background: '#fbbf24', opacity: loading || !email.includes('@') ? 0.45 : 1, cursor: loading || !email.includes('@') ? 'not-allowed' : 'pointer' }}>
          {loading ? '...' : 'Avisame'}
        </button>
      </div>
    </div>
  )
}

import { LI_GRADIENT, INPUT_STYLE } from '../../constants'
import { LinkedInIcon } from '../ui'

export default function PremiumModal({ user, setShowPremiumModal, subscriptionLoading, premiumEmail, setPremiumEmail, startSubscription, couponCode, setCouponCode, couponEmail, setCouponEmail, couponLoading, applyCoupon, couponError, setCouponError, couponSuccess, setCouponSuccess, showCouponField, setShowCouponField, handleLinkedinAuthViaSupabase }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-3 sm:p-6 backdrop-enter overflow-y-auto"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) { setShowPremiumModal(false); setShowCouponField(false); setCouponCode(''); setCouponError(''); setCouponSuccess(false) } }}>
      <div className="w-full max-w-sm sm:max-w-md lg:max-w-lg rounded-3xl overflow-hidden modal-enter my-auto"
        style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.25)' }}>

        {/* ── Header — price + plan name ── */}
        <div className="p-6 sm:p-8 text-white" style={{ background: 'linear-gradient(135deg, #0d1f2d 0%, #1a3a5c 60%, #0d3055 100%)' }}>
          <p className="text-xs font-semibold opacity-60 mb-1 tracking-widest">PLAN PROFESIONAL</p>
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Plan Profesional ✦</h2>
              <p className="text-xs opacity-60 mt-1">Menos que un café por semana</p>
              <p className="text-sm opacity-75 mt-0.5">Cancelás antes del día 7 y no te cobramos nada</p>
            </div>
            <div className="flex items-baseline gap-2 shrink-0">
              <p className="text-4xl font-bold">$3.000<span className="text-lg font-normal opacity-80">/mes</span></p>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.22)', color: 'white' }}>7 DÍAS GRATIS</span>
            </div>
          </div>
        </div>

        <div className="p-5 sm:p-8 space-y-4 bg-white">
          {/* RI Teaser */}
          <div style={{
            background: 'linear-gradient(135deg, #0d2137 0%, #0c3a5e 100%)',
            borderRadius: 16,
            padding: '14px 16px',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>
                Índice de Preparación
              </p>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                Evolución de tu competitividad
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
              <span style={{ fontSize: 36, fontWeight: 800, color: 'white', letterSpacing: '-0.03em' }}>—</span>
              <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>/10</span>
            </div>
          </div>

          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest text-center">
            Lo que incluye el Plan Profesional
          </p>

          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              ['🏆', 'Entrenamiento continuo', 'Historial ilimitado de sesiones de entrevista, STAR y análisis — mejorás de forma medible.'],
              ['📄', 'CV re-descargable', 'Generá versiones y descargalas en cualquier momento, sin rehacer el proceso.'],
              ['📍', 'Centro de operaciones', 'Kanban para trackear todas tus búsquedas activas y vincular el CV adaptado a cada una.'],
              ['🎯', 'Índice de Preparación', 'Seguí la evolución de tu competitividad con cada sesión de entrenamiento.'],
            ].map(([icon, title, desc]) => (
              <li key={title} className="flex gap-3 card-depth" style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 12px' }}>
                <span className="text-xl shrink-0">{icon}</span>
                <div>
                  <p className="text-slate-800 font-semibold text-sm">{title}</p>
                  <p className="text-slate-500 text-xs leading-snug">{desc}</p>
                </div>
              </li>
            ))}
          </ul>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 0', borderTop: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9', marginBottom: 12 }}>
            <span style={{ fontSize: 13 }}>🔒</span>
            <p style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center' }}>
              Cancelás antes del día 7, no se realiza ningún cobro
            </p>
          </div>

          {!user && (
            <>
              <button onClick={() => { setShowPremiumModal(false); handleLinkedinAuthViaSupabase() }}
                className="w-full py-3 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold transition-opacity hover:opacity-90"
                style={{ background: '#0077B5', color: 'white' }}>
                <LinkedInIcon className="w-4 h-4" style={{ fill: 'white' }} />
                Continuar con LinkedIn
              </button>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px" style={{ background: '#e2e8f0' }} />
                <span className="text-xs text-slate-400">o con email</span>
                <div className="flex-1 h-px" style={{ background: '#e2e8f0' }} />
              </div>
              <input type="email" placeholder="Tu email para crear la cuenta"
                value={premiumEmail} onChange={e => setPremiumEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-sm outline-none" style={INPUT_STYLE} />
            </>
          )}

          <button onClick={() => startSubscription()} disabled={subscriptionLoading || (!user && !premiumEmail.includes('@'))}
            className="btn-glow w-full py-3.5 rounded-xl text-white font-bold text-sm"
            style={{ background: LI_GRADIENT, opacity: (subscriptionLoading || (!user && !premiumEmail.includes('@'))) ? 0.6 : 1 }}>
            {subscriptionLoading ? 'Procesando...' : 'Activar Plan Profesional → 7 días gratis'}
          </button>
          <p className="text-center text-xs text-slate-400 -mt-1">
            La versión gratuita es completa. El Plan Profesional agrega historial y entrenamiento continuo.
          </p>
          <button onClick={() => setShowPremiumModal(false)}
            className="w-full py-2 text-sm text-slate-400 text-center">
            Ahora no, continuar sin guardar progreso
          </button>

          {!showCouponField ? (
            <button
              onClick={() => { setShowCouponField(true); setCouponError(''); setCouponSuccess(false) }}
              className="w-full py-1 text-xs text-slate-400 text-center hover:text-slate-600 transition-colors">
              ¿Tenés un código de acceso?
            </button>
          ) : couponSuccess ? (
            <p className="text-center text-sm font-semibold py-2" style={{ color: '#16a34a' }}>
              ✓ ¡Plan Profesional activado!
            </p>
          ) : (
            <div className="space-y-2 pt-1 border-t" style={{ borderColor: 'rgba(0,119,181,0.1)' }}>
              <p className="text-xs text-slate-500 text-center pt-2">Ingresá tu código de acceso</p>
              {!user && (
                <input type="email" placeholder="Tu email"
                  value={couponEmail} onChange={e => setCouponEmail(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none" style={INPUT_STYLE} />
              )}
              <div className="flex gap-2">
                <input type="text" placeholder="Código"
                  value={couponCode} onChange={e => { setCouponCode(e.target.value); setCouponError('') }}
                  onKeyDown={e => e.key === 'Enter' && applyCoupon()}
                  className="flex-1 px-3 py-2.5 rounded-xl text-sm outline-none" style={INPUT_STYLE} />
                <button onClick={applyCoupon}
                  disabled={couponLoading || !couponCode.trim() || (!user && !couponEmail.includes('@'))}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white shrink-0"
                  style={{ background: LI_GRADIENT, opacity: (couponLoading || !couponCode.trim() || (!user && !couponEmail.includes('@'))) ? 0.5 : 1 }}>
                  {couponLoading ? '...' : 'Aplicar'}
                </button>
              </div>
              {couponError && <p className="text-xs text-center" style={{ color: '#ef4444' }}>{couponError}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

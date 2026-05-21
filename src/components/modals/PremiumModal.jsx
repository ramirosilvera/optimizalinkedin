import { LI_GRADIENT, INPUT_STYLE } from '../../constants'
import { LinkedInIcon } from '../ui'

export default function PremiumModal({ user, setShowPremiumModal, subscriptionLoading, premiumEmail, setPremiumEmail, startSubscription, couponCode, setCouponCode, couponEmail, setCouponEmail, couponLoading, applyCoupon, couponError, setCouponError, couponSuccess, setCouponSuccess, showCouponField, setShowCouponField, handleLinkedinAuthViaSupabase }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) { setShowPremiumModal(false); setShowCouponField(false); setCouponCode(''); setCouponError(''); setCouponSuccess(false) } }}>
      <div className="w-full max-w-sm rounded-3xl overflow-hidden"
        style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.2)' }}>
        <div className="p-6 text-white" style={{ background: LI_GRADIENT }}>
          <p className="text-xs font-semibold opacity-80 mb-1">PLAN PROFESIONAL</p>
          <h2 className="text-2xl font-bold">Premium</h2>
          <div className="flex items-baseline gap-2 mt-2">
            <p className="text-4xl font-bold">$3.000<span className="text-lg font-normal opacity-80">/mes</span></p>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.22)', color: 'white' }}>7 DÍAS GRATIS</span>
          </div>
          <p className="text-sm opacity-75 mt-1">Cancelás antes del día 7, no te cobramos nada.</p>
        </div>
        <div className="p-6 space-y-5 bg-white">
          <ul className="space-y-3">
            {[
              ['🏆', 'Entrenamiento continuo', 'Historial ilimitado de sesiones de entrevista, STAR y análisis para medir tu progreso real.'],
              ['📄', 'CV siempre disponible', 'Descargá cualquier versión de tu CV cuando lo necesites, sin límites.'],
              ['📍', 'Centro de operaciones', 'Kanban para trackear todas tus búsquedas activas y vincular el CV adaptado a cada una.'],
              ['🎯', 'Índice de Preparación', 'Seguí la evolución de tu nivel de competitividad con cada sesión de entrenamiento.'],
            ].map(([icon, title, desc]) => (
              <li key={title} className="flex gap-3">
                <span className="text-xl shrink-0">{icon}</span>
                <div>
                  <p className="text-slate-800 font-semibold text-sm">{title}</p>
                  <p className="text-slate-500 text-xs leading-snug">{desc}</p>
                </div>
              </li>
            ))}
          </ul>

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
            {subscriptionLoading ? 'Procesando...' : 'Probar 7 días gratis → Mercado Pago'}
          </button>
          <p className="text-center text-xs text-slate-400 -mt-1">
            La app seguirá siendo 100% gratuita. Premium es tu entrenamiento continuo.
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
              ✓ ¡Premium activado correctamente!
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

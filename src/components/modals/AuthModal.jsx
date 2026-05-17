import { LI_GRADIENT, INPUT_STYLE } from '../../constants'
import { LinkedInIcon } from '../ui'

export default function AuthModal({ user, authSuccess, setAuthSuccess, setShowAuthModal, setShowPremiumModal, authError, setAuthError, authEmail, setAuthEmail, authPassword, setAuthPassword, authLoading, authLogin, authLogout, handleLinkedinAuthViaSupabase }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) { setShowAuthModal(false); setAuthError(''); setAuthSuccess(null) } }}>
      <div className="w-full max-w-sm rounded-3xl p-6 space-y-4"
        style={{ background: 'white', boxShadow: '0 25px 60px rgba(0,0,0,0.2)' }}>

        {authSuccess ? (
          <div className="text-center space-y-5 py-2">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto text-3xl"
              style={{ background: 'rgba(0,119,181,0.08)' }}>✓</div>
            <div className="space-y-1">
              <p className="font-bold text-slate-900 text-xl">
                {authSuccess === 'linkedin_needs_premium'
                  ? `Hola, ${user?.nombre}!`
                  : authSuccess === 'register' ? '¡Cuenta creada!' : `¡Bienvenido/a, ${user?.nombre}!`}
              </p>
              <p className="text-slate-500 text-sm leading-relaxed">
                {authSuccess === 'linkedin_needs_premium'
                  ? 'Conectaste con LinkedIn. La app es gratuita — si querés guardar tu historial, podés probar Premium 7 días gratis.'
                  : authSuccess === 'register'
                    ? 'Cuenta creada. La app funciona completa sin Premium. Si querés guardar tu historial, podés probarlo 7 días gratis.'
                    : 'Ya podés usar la app con tu historial guardado.'}
              </p>
            </div>
            {authSuccess === 'linkedin_needs_premium' ? (
              <div className="space-y-2 pt-1">
                <button onClick={() => { setShowAuthModal(false); setAuthSuccess(null); setShowPremiumModal(true) }}
                  className="btn-glow w-full py-3 rounded-xl text-white font-semibold text-sm"
                  style={{ background: LI_GRADIENT }}>
                  Probar Premium 7 días gratis →
                </button>
                <button onClick={() => { authLogout(); setShowAuthModal(false); setAuthSuccess(null) }}
                  className="w-full py-2.5 text-sm font-medium rounded-xl"
                  style={{ color: '#64748b' }}>
                  Seguir usando gratis sin guardar
                </button>
              </div>
            ) : authSuccess === 'register' ? (
              <div className="space-y-2 pt-1">
                <button onClick={() => { setShowAuthModal(false); setAuthSuccess(null); setShowPremiumModal(true) }}
                  className="btn-glow w-full py-3 rounded-xl text-white font-semibold text-sm"
                  style={{ background: LI_GRADIENT }}>
                  Probar Premium 7 días gratis →
                </button>
                <button onClick={() => { setShowAuthModal(false); setAuthSuccess(null) }}
                  className="w-full py-2.5 text-sm font-medium rounded-xl"
                  style={{ color: '#64748b' }}>
                  Ahora no, seguir usando gratis
                </button>
              </div>
            ) : (
              <button onClick={() => { setShowAuthModal(false); setAuthSuccess(null) }}
                className="btn-glow w-full py-3 rounded-xl text-white font-semibold text-sm"
                style={{ background: LI_GRADIENT }}>
                Continuar →
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-slate-900 font-bold text-lg">Ingresá a tu cuenta</h2>
              <button onClick={() => { setShowAuthModal(false); setAuthError('') }}
                className="text-slate-400 hover:text-slate-600 text-2xl leading-none w-8 h-8 flex items-center justify-center">×</button>
            </div>

            <button onClick={handleLinkedinAuthViaSupabase}
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

            <div className="space-y-3">
              <input type="email" placeholder="Email" value={authEmail}
                onChange={e => setAuthEmail(e.target.value)} autoComplete="email"
                className="w-full px-4 py-3 rounded-xl text-sm outline-none" style={INPUT_STYLE} />
              <input type="password" placeholder="Contraseña" value={authPassword}
                onChange={e => setAuthPassword(e.target.value)} autoComplete="current-password"
                onKeyDown={e => e.key === 'Enter' && authEmail.includes('@') && authPassword.length >= 6 && authLogin(authEmail, authPassword)}
                className="w-full px-4 py-3 rounded-xl text-sm outline-none" style={INPUT_STYLE} />
            </div>

            {authError && <p className="text-sm text-center font-medium" style={{ color: '#ef4444' }}>{authError}</p>}

            <button
              onClick={() => authLogin(authEmail, authPassword)}
              disabled={authLoading || !authEmail.includes('@') || authPassword.length < 6}
              className="btn-glow w-full py-3 rounded-xl text-white font-semibold text-sm"
              style={{ background: LI_GRADIENT, opacity: (authLoading || !authEmail.includes('@') || authPassword.length < 6) ? 0.5 : 1 }}>
              {authLoading ? 'Procesando...' : 'Ingresar'}
            </button>

            <p className="text-xs text-center text-slate-400 leading-relaxed">
              ¿Todavía no tenés cuenta? <button onClick={() => { setShowAuthModal(false); setShowPremiumModal(true) }} className="underline" style={{ color: '#0077B5' }}>Probá Premium gratis 7 días</button> para crear una y guardar tu historial.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

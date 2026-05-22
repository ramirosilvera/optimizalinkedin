import { useState } from 'react'
import { LI_GRADIENT, INPUT_STYLE } from '../../constants'
import { LinkedInIcon } from '../ui'

export default function AuthModal({ user, authSuccess, setAuthSuccess, setShowAuthModal, setShowPremiumModal, authError, setAuthError, authEmail, setAuthEmail, authPassword, setAuthPassword, authLoading, authLogin, authRegister, authLogout, handleLinkedinAuthViaSupabase, initialTab }) {
  const [tab, setTab] = useState(initialTab || 'login')

  const canSubmit = authEmail.includes('@') && authPassword.length >= 6
  const close = () => { setShowAuthModal(false); setAuthError(''); setAuthSuccess(null) }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) close() }}>
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
                  ? 'Conectaste con LinkedIn. La app es gratuita — si querés guardar tu historial, podés activar el Plan Profesional 7 días gratis.'
                  : authSuccess === 'register'
                    ? 'Cuenta creada. La app funciona completa sin Plan Profesional. Si querés guardar tu historial, probalo 7 días gratis.'
                    : 'Ya podés usar la app con tu historial guardado.'}
              </p>
            </div>
            {(authSuccess === 'linkedin_needs_premium' || authSuccess === 'register') ? (
              <div className="space-y-2 pt-1">
                <button onClick={() => { close(); setShowPremiumModal(true) }}
                  className="btn-glow w-full py-3 rounded-xl text-white font-semibold text-sm"
                  style={{ background: LI_GRADIENT }}>
                  Activar Plan Profesional — 7 días →
                </button>
                <button onClick={() => { if (authSuccess === 'linkedin_needs_premium') authLogout(); close() }}
                  className="w-full py-2.5 text-sm font-medium rounded-xl"
                  style={{ color: '#64748b' }}>
                  Seguir usando gratis sin guardar
                </button>
              </div>
            ) : (
              <button onClick={close}
                className="btn-glow w-full py-3 rounded-xl text-white font-semibold text-sm"
                style={{ background: LI_GRADIENT }}>
                Continuar →
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-slate-900 font-bold text-lg">
                {tab === 'login' ? 'Ingresá a tu cuenta' : 'Crear cuenta'}
              </h2>
              <button onClick={close}
                className="text-slate-400 hover:text-slate-600 text-2xl leading-none w-8 h-8 flex items-center justify-center">×</button>
            </div>

            {/* Tab switcher */}
            <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: 'rgba(0,119,181,0.18)' }}>
              {['login', 'register'].map(t => (
                <button key={t}
                  onClick={() => { setTab(t); setAuthError('') }}
                  className="flex-1 py-2 text-xs font-semibold transition-all"
                  style={{
                    background: tab === t ? '#0077B5' : 'transparent',
                    color: tab === t ? 'white' : '#64748b',
                  }}>
                  {t === 'login' ? 'Ingresar' : 'Crear cuenta'}
                </button>
              ))}
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
              <input type="password"
                placeholder={tab === 'register' ? 'Contraseña (mín. 6 caracteres)' : 'Contraseña'}
                value={authPassword}
                onChange={e => setAuthPassword(e.target.value)}
                autoComplete={tab === 'register' ? 'new-password' : 'current-password'}
                onKeyDown={e => e.key === 'Enter' && canSubmit && (tab === 'login' ? authLogin(authEmail, authPassword) : authRegister(authEmail, authPassword))}
                className="w-full px-4 py-3 rounded-xl text-sm outline-none" style={INPUT_STYLE} />
            </div>

            {authError && <p className="text-sm text-center font-medium" style={{ color: '#ef4444' }}>{authError}</p>}

            <button
              onClick={() => tab === 'login' ? authLogin(authEmail, authPassword) : authRegister(authEmail, authPassword)}
              disabled={authLoading || !canSubmit}
              className="btn-glow w-full py-3 rounded-xl text-white font-semibold text-sm"
              style={{ background: LI_GRADIENT, opacity: (authLoading || !canSubmit) ? 0.5 : 1 }}>
              {authLoading ? 'Procesando...' : tab === 'login' ? 'Ingresar' : 'Crear cuenta gratis'}
            </button>

            {tab === 'login' && (
              <p className="text-xs text-center text-slate-400 leading-relaxed">
                ¿No tenés cuenta?{' '}
                <button onClick={() => setTab('register')} className="underline font-medium" style={{ color: '#0077B5' }}>
                  Creá una gratis
                </button>
              </p>
            )}
            {tab === 'register' && (
              <p className="text-xs text-center text-slate-400 leading-relaxed">
                Con cuenta podés acceder al Plan Profesional — 7 días gratis, luego $3.000/mes.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

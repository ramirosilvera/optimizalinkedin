import { LI_GRADIENT, INPUT_STYLE } from '../../constants'

export default function PostPaymentModal({ postPaymentEmail, postPaymentPassword, setPostPaymentPassword, postPaymentLoading, postPaymentError, createAccountPostPayment }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-sm rounded-3xl p-6 space-y-4"
        style={{ background: 'white', boxShadow: '0 25px 60px rgba(0,0,0,0.2)' }}>
        <div className="text-center space-y-1">
          <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto text-2xl mb-3"
            style={{ background: 'rgba(0,119,181,0.08)' }}>✦</div>
          <h2 className="text-slate-900 font-bold text-xl">¡Suscripción activada!</h2>
          <p className="text-slate-500 text-sm leading-relaxed">Creá tu contraseña para acceder a tu historial desde cualquier dispositivo.</p>
        </div>
        <div className="space-y-3">
          <input type="email" value={postPaymentEmail} readOnly
            className="w-full px-4 py-3 rounded-xl text-sm outline-none"
            style={{ ...INPUT_STYLE, background: '#f8fafc', color: '#64748b' }} />
          <input type="password" placeholder="Elegí una contraseña (mínimo 6 caracteres)"
            value={postPaymentPassword} onChange={e => setPostPaymentPassword(e.target.value)}
            autoComplete="new-password"
            onKeyDown={e => e.key === 'Enter' && postPaymentPassword.length >= 6 && createAccountPostPayment()}
            className="w-full px-4 py-3 rounded-xl text-sm outline-none" style={INPUT_STYLE} />
        </div>
        {postPaymentError && <p className="text-sm text-center font-medium" style={{ color: '#ef4444' }}>{postPaymentError}</p>}
        <button onClick={createAccountPostPayment}
          disabled={postPaymentLoading || postPaymentPassword.length < 6}
          className="btn-glow w-full py-3 rounded-xl text-white font-semibold text-sm"
          style={{ background: LI_GRADIENT, opacity: (postPaymentLoading || postPaymentPassword.length < 6) ? 0.5 : 1 }}>
          {postPaymentLoading ? 'Creando cuenta...' : 'Crear mi cuenta →'}
        </button>
      </div>
    </div>
  )
}

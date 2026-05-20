import { LI_GRADIENT } from '../../constants'

const SOURCE_LABELS = {
  mercadopago: 'Mercado Pago',
  promo_code:  'Código promocional',
  admin_grant: 'Acceso otorgado',
  internal:    'Acceso interno',
  legacy:      'Acceso especial',
}

function formatDate(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function ManageSubscriptionModal({ user, setShowManageModal, cancelConfirm, setCancelConfirm, cancelDone, setCancelDone, cancelLoading, cancelSubscription }) {
  const isMpSubscription = user?.premium_source === 'mercadopago'
  const sourceLabel = SOURCE_LABELS[user?.premium_source] || 'Acceso especial'
  const hastaFormatted = formatDate(user?.premium_hasta)

  const handleClose = () => { setShowManageModal(false); setCancelConfirm(false); setCancelDone(false) }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) handleClose() }}>
      <div className="w-full max-w-sm rounded-3xl overflow-hidden"
        style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.2)' }}>

        {/* Header */}
        <div className="p-6 text-white" style={{ background: LI_GRADIENT }}>
          <p className="text-xs font-semibold opacity-80 mb-1">
            {isMpSubscription ? 'TU SUSCRIPCIÓN' : 'TU ACCESO PREMIUM'}
          </p>
          <h2 className="text-xl font-bold">Cuenta Premium</h2>
          {hastaFormatted && (
            <p className="text-sm opacity-80 mt-1">
              {isMpSubscription ? 'Próxima renovación' : 'Activo hasta'}: {hastaFormatted}
            </p>
          )}
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 bg-white">
          {cancelDone ? (
            /* ── Cancelación confirmada (solo MP) ── */
            <div className="text-center space-y-3 py-2">
              <p className="text-2xl">✓</p>
              <p className="font-semibold text-slate-800">Cancelación procesada</p>
              <p className="text-sm text-slate-500">
                No se realizarán cobros futuros. Tu acceso Premium continúa activo
                {hastaFormatted ? ` hasta el ${hastaFormatted}.` : ' hasta el vencimiento del período actual.'}
              </p>
              <button onClick={handleClose}
                className="w-full py-3 rounded-xl text-sm font-semibold text-white"
                style={{ background: LI_GRADIENT }}>
                Entendido
              </button>
            </div>

          ) : cancelConfirm ? (
            /* ── Confirmar cancelación (solo MP) ── */
            <div className="space-y-3">
              <p className="text-sm text-slate-700 text-center font-medium">¿Confirmar cancelación?</p>
              <p className="text-xs text-slate-500 text-center">No se realizarán cargos futuros. Tu acceso Premium continúa hasta que venza el período actual.</p>
              <button onClick={cancelSubscription} disabled={cancelLoading}
                className="w-full py-3 rounded-xl text-sm font-semibold text-white"
                style={{ background: '#ef4444', opacity: cancelLoading ? 0.7 : 1 }}>
                {cancelLoading ? 'Cancelando...' : 'Sí, cancelar suscripción'}
              </button>
              <button onClick={() => setCancelConfirm(false)} disabled={cancelLoading}
                className="w-full py-2 text-sm text-slate-500 text-center">
                Volver
              </button>
            </div>

          ) : isMpSubscription ? (
            /* ── Vista principal: suscripción MP activa ── */
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Tu suscripción se renueva automáticamente cada mes a través de <strong>Mercado Pago</strong>.
              </p>
              <p className="text-xs text-slate-400">
                Podés cancelar desde aquí o directamente desde tu cuenta de Mercado Pago en <em>Suscripciones activas</em>.
              </p>
              <button onClick={() => setCancelConfirm(true)}
                className="w-full py-3 rounded-xl text-sm font-medium border"
                style={{ borderColor: '#ef4444', color: '#ef4444', background: 'transparent' }}>
                Cancelar suscripción
              </button>
              <button onClick={handleClose}
                className="w-full py-2 text-sm text-slate-400 text-center">
                Cerrar
              </button>
            </div>

          ) : (
            /* ── Vista principal: acceso por código / admin / legacy ── */
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">🎁</span>
                <p className="text-sm font-semibold text-slate-700">{sourceLabel}</p>
              </div>
              <p className="text-sm text-slate-600">
                Tu acceso Premium fue activado mediante {sourceLabel.toLowerCase()}.
                {hastaFormatted
                  ? ` Está activo hasta el ${hastaFormatted}.`
                  : ' No tiene fecha de vencimiento configurada.'}
              </p>
              <p className="text-xs text-slate-400">
                Este acceso no genera cobros automáticos ni está vinculado a Mercado Pago.
              </p>
              <button onClick={handleClose}
                className="w-full py-3 rounded-xl text-sm font-semibold text-white"
                style={{ background: LI_GRADIENT }}>
                Cerrar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

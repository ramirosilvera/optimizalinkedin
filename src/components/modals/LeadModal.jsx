import { LI_GRADIENT } from '../../constants'
import { LinkedInIcon } from '../ui'

export default function LeadModal({ setShowLeadModal, leadNombre, setLeadNombre, leadApellido, setLeadApellido, saveAndConnectRamiro }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 overflow-y-auto"
      style={{ background: 'rgba(0,0,0,0.40)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) setShowLeadModal(false) }}
    >
      <div className="w-full max-w-sm rounded-2xl step-transition overflow-hidden"
        style={{ background: 'white', boxShadow: '0 20px 60px rgba(0,0,0,0.20)', border: '1px solid rgba(0,119,181,0.15)' }}>

        <div className="p-6 space-y-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Conectate con Ramiro</h3>
            <p className="text-slate-500 text-sm mt-1 leading-relaxed">
              Ingresá tu nombre para que Ramiro pueda revisar tu análisis antes del primer mensaje.
            </p>
          </div>
          <div className="space-y-2.5">
            <input
              type="text"
              placeholder="Nombre"
              value={leadNombre}
              onChange={e => setLeadNombre(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && leadNombre.trim() && leadApellido.trim()) saveAndConnectRamiro(leadNombre, leadApellido) }}
              maxLength={60}
              className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-all duration-200"
              style={{
                background: '#f8fafc',
                border: leadNombre.trim() ? '1px solid rgba(0,119,181,0.5)' : '1px solid rgba(0,119,181,0.15)',
                color: '#0d2137',
              }}
            />
            <input
              type="text"
              placeholder="Apellido"
              value={leadApellido}
              onChange={e => setLeadApellido(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && leadNombre.trim() && leadApellido.trim()) saveAndConnectRamiro(leadNombre, leadApellido) }}
              maxLength={60}
              className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-all duration-200"
              style={{
                background: '#f8fafc',
                border: leadApellido.trim() ? '1px solid rgba(0,119,181,0.5)' : '1px solid rgba(0,119,181,0.15)',
                color: '#0d2137',
              }}
            />
          </div>
          <p className="text-slate-400 text-xs leading-relaxed">
            Tu nombre y análisis serán compartidos con Ramiro para que pueda orientarte desde el inicio.
          </p>
          <p className="text-slate-400 text-xs">
            La consultoría personalizada tiene costo — se cotiza en el momento.
          </p>
        </div>

        <div className="px-6 pb-6 pt-1 space-y-3"
          style={{ borderTop: '1px solid rgba(0,119,181,0.10)' }}>
          <button
            onClick={() => saveAndConnectRamiro(leadNombre, leadApellido)}
            disabled={!leadNombre.trim() || !leadApellido.trim()}
            className={`w-full py-3 rounded-xl text-white text-sm font-semibold btn-glow transition-all ${leadNombre.trim() && leadApellido.trim() ? '' : 'opacity-40 cursor-not-allowed'}`}
            style={{ background: leadNombre.trim() && leadApellido.trim() ? LI_GRADIENT : 'rgba(0,119,181,0.3)' }}
          >
            <LinkedInIcon className="w-4 h-4 inline mr-1.5" /> Conectar con Ramiro →
          </button>
          <button
            onClick={() => setShowLeadModal(false)}
            className="w-full py-2 text-slate-400 text-xs hover:text-slate-600 transition-colors"
          >
            Cancelar
          </button>
          <p className="text-center text-slate-400 text-xs">
            🔒 Tu nombre y análisis se almacenan de forma segura y solo Ramiro puede acceder a ellos.
          </p>
        </div>
      </div>
    </div>
  )
}

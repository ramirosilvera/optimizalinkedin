import { Spinner } from '../ui'

export default function HistorialDrawer({ historial, historialLoading, setShowHistorial, deletingHistorialId, setDeletingHistorialId, deleteHistorialLoading, deleteHistorialItem, restoreFromHistorial, user }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 backdrop-enter"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-lg rounded-2xl p-4 sm:p-6 space-y-3 max-h-[85dvh] overflow-y-auto modal-enter"
        style={{ background: 'white', boxShadow: '0 25px 60px rgba(0,0,0,0.2)' }}>

        {/* Header */}
        <div className="flex items-center justify-between pb-1">
          <h2 className="text-slate-900 font-bold text-lg">Historial de preparación</h2>
          <button
            onClick={() => { setShowHistorial(false); setDeletingHistorialId(null) }}
            className="text-slate-400 hover:text-slate-600 text-2xl leading-none w-9 h-9 flex items-center justify-center rounded-xl transition-colors"
            style={{ background: 'transparent' }}>
            ×
          </button>
        </div>

        {historialLoading ? (
          <div className="flex justify-center py-10"><Spinner size={8} /></div>
        ) : historial.length === 0 ? (
          <p className="text-center text-slate-500 text-sm py-10 leading-relaxed">
            Sin sesiones registradas<br />
            Completá tu primer módulo de preparación para ver tu historial acá.
          </p>
        ) : (
          <div className="space-y-2">
            {historial.map(item => {
              const icons  = { analisis: '🎯', cv: '📄', entrevista: '🎙️', star: '⭐' }
              const labels = { analisis: 'Diagnóstico', cv: 'CV Profesional', entrevista: 'Entrenamiento', star: 'STAR' }
              const iconBg = {
                analisis:   { background: '#dbeafe', color: '#1d4ed8' },
                cv:         { background: '#dcfce7', color: '#15803d' },
                entrevista: { background: '#f3e8ff', color: '#7c3aed' },
                star:       { background: '#fef3c7', color: '#b45309' },
              }
              const isRestorable = item.tipo === 'analisis' || item.tipo === 'cv' || item.tipo === 'entrevista'
              const isPremium    = user?.es_premium || false
              const isConfirming = deletingHistorialId === item.id
              const dateStr      = new Date(item.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: '2-digit' })
              const typeColor    = iconBg[item.tipo] || iconBg.analisis

              // ── Delete confirmation state ──
              if (isConfirming) {
                return (
                  <div key={item.id}
                    className="rounded-xl p-3.5 flex items-center justify-between gap-3"
                    style={{ border: '1px solid rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.04)' }}>
                    <p className="text-sm text-slate-700 font-medium">¿Eliminar este registro?</p>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setDeletingHistorialId(null)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                        style={{ background: 'rgba(100,116,139,0.10)', color: '#475569' }}>
                        Cancelar
                      </button>
                      <button
                        onClick={() => deleteHistorialItem(item.id)}
                        disabled={deleteHistorialLoading}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all"
                        style={{ background: '#ef4444', opacity: deleteHistorialLoading ? 0.6 : 1 }}>
                        {deleteHistorialLoading ? '...' : 'Sí, eliminar'}
                      </button>
                    </div>
                  </div>
                )
              }

              // ── Normal row: icon + 2-line text + actions ──
              return (
                <div key={item.id}
                  onClick={isRestorable ? () => restoreFromHistorial(item) : undefined}
                  className={`rounded-xl p-3 flex items-center gap-3 transition-all duration-150 ${isRestorable ? 'cursor-pointer active:scale-[0.98]' : ''}`}
                  style={{ border: '1px solid rgba(0,119,181,0.10)', background: isRestorable ? 'white' : '#f8fafc' }}>

                  {/* Type icon — fixed 40×40, never overflows */}
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-lg"
                    style={typeColor}>
                    {icons[item.tipo]}
                  </div>

                  {/* Text: title on line 1, type+date on line 2 — flex-1 ensures this fills available space */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 leading-snug"
                      style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.titulo || labels[item.tipo]}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5 leading-none"
                      style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {labels[item.tipo]} · {dateStr}
                    </p>
                  </div>

                  {/* Actions — shrink-0, minimal width (~40px max) */}
                  <div className="flex items-center gap-1 shrink-0">
                    {isPremium && (
                      <button
                        onClick={e => { e.stopPropagation(); setDeletingHistorialId(item.id) }}
                        className="w-8 h-8 rounded-lg flex items-center justify-center transition-all opacity-30 hover:opacity-80"
                        style={{ background: 'transparent' }}
                        aria-label="Eliminar">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-slate-400">
                          <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193v-.443A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                        </svg>
                      </button>
                    )}
                    {isRestorable && (
                      <span className="text-slate-300 text-lg leading-none select-none">›</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

import { Spinner } from '../ui'

export default function HistorialDrawer({ historial, historialLoading, setShowHistorial, deletingHistorialId, setDeletingHistorialId, deleteHistorialLoading, deleteHistorialItem, restoreFromHistorial }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-lg rounded-3xl p-6 space-y-4 max-h-[85dvh] overflow-y-auto"
        style={{ background: 'white', boxShadow: '0 25px 60px rgba(0,0,0,0.2)' }}>
        <div className="flex items-center justify-between">
          <h2 className="text-slate-900 font-bold text-lg">Mis resultados</h2>
          <button onClick={() => { setShowHistorial(false); setDeletingHistorialId(null) }}
            className="text-slate-400 hover:text-slate-600 text-2xl leading-none w-8 h-8 flex items-center justify-center">×</button>
        </div>
        {historialLoading ? (
          <div className="flex justify-center py-10"><Spinner size={8} /></div>
        ) : historial.length === 0 ? (
          <p className="text-center text-slate-500 text-sm py-10 leading-relaxed">
            Todavía no hay items guardados.<br />
            Los análisis, CVs y entrevistas se guardan automáticamente.
          </p>
        ) : (
          <div className="space-y-2">
            {historial.map(item => {
              const icons = { analisis: '🎯', cv: '📄', entrevista: '🎙️', star: '⭐' }
              const labels = { analisis: 'Diagnóstico', cv: 'CV Profesional', entrevista: 'Sesión de Entrenamiento', star: 'STAR' }
              const colors = {
                analisis: { background: '#dbeafe', color: '#1d4ed8' },
                cv:       { background: '#dcfce7', color: '#15803d' },
                entrevista: { background: '#f3e8ff', color: '#7c3aed' },
                star:     { background: '#fef3c7', color: '#b45309' },
              }
              const isRestorable = item.tipo === 'analisis' || item.tipo === 'cv' || item.tipo === 'entrevista'
              const isPremium = localStorage.getItem('ol_premium') === '1'
              const isConfirming = deletingHistorialId === item.id

              if (isConfirming) {
                return (
                  <div key={item.id} className="rounded-2xl p-4 flex items-center justify-between gap-3"
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

              return (
                <div key={item.id}
                  onClick={isRestorable ? () => restoreFromHistorial(item) : undefined}
                  className={`rounded-2xl p-4 flex items-center justify-between gap-3 transition-all duration-150 ${isRestorable ? 'cursor-pointer hover:shadow-md active:scale-[0.99]' : ''}`}
                  style={{ border: '1px solid rgba(0,119,181,0.12)', background: isRestorable ? 'white' : '#f8fafc' }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full shrink-0"
                      style={colors[item.tipo] || colors.analisis}>
                      {icons[item.tipo]} {labels[item.tipo]}
                    </span>
                    <span className="text-slate-700 text-sm font-medium truncate">{item.titulo || '—'}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-slate-400">
                      {new Date(item.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: '2-digit' })}
                    </span>
                    {isPremium && (
                      <button
                        onClick={e => { e.stopPropagation(); setDeletingHistorialId(item.id) }}
                        className="w-7 h-7 rounded-lg flex items-center justify-center transition-all opacity-40 hover:opacity-100"
                        style={{ background: 'transparent' }}
                        title="Eliminar">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-slate-400 hover:text-red-500">
                          <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193v-.443A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                        </svg>
                      </button>
                    )}
                    {isRestorable && <span className="text-slate-300 text-base">›</span>}
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

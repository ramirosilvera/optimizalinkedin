import { useEffect } from 'react'
import { STEPS, LI_GRADIENT, BTN_BACK_STYLE, BTN_GHOST_STYLE, INPUT_STYLE, INPUT_ALT_STYLE, trackEvent } from '../../constants'
import { Spinner } from '../ui'

export default function TrackingScreen({ user, setShowPremiumModal, setStep, kanbanListMode, setKanbanListMode, trackingColumnas, trackingCards, trackingLoading, trackingError, showAddCard, setShowAddCard, newCardForm, setNewCardForm, editCard, setEditCard, showAddColumna, setShowAddColumna, newColumnaName, setNewColumnaName, newColumnaColor, setNewColumnaColor, renameColumna, setRenameColumna, createCard, updateCard, deleteCard, createColumna, updateColumna, deleteColumna, moveCard, setInterviewJobContext, resetInterview, cvFinalData, loadTracking }) {
  useEffect(() => {
    if (user?.es_premium && typeof loadTracking === 'function') {
      loadTracking()
    }
  }, [])

  return (
    <>
      <div className="step-transition w-full" style={{ minHeight: '70vh' }}>
        {!user?.es_premium ? (
          /* Non-premium teaser */
          <div className="text-center space-y-5 py-12 px-4">
            <div className="text-5xl">📍</div>
            <h2 className="text-xl font-bold" style={{ color: '#0d2137' }}>Seguimiento de Postulaciones</h2>
            <p className="text-sm max-w-xs mx-auto" style={{ color: '#475569' }}>
              Organizá todas tus postulaciones en un tablero kanban. Vinculá el CV adaptado a cada oferta y nunca más pierdas el hilo de tu proceso de búsqueda.
            </p>
            <button onClick={() => setShowPremiumModal(true)}
              className="px-6 py-3 rounded-xl text-sm font-semibold text-white"
              style={{ background: LI_GRADIENT }}>
              Activar Plan Profesional →
            </button>
            <button onClick={() => setStep(STEPS.MODE_SELECT)}
              className="block mx-auto text-xs mt-2" style={{ color: '#94a3b8' }}>
              Mi preparación
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-lg font-bold" style={{ color: '#0d2137' }}>📍 Mis Postulaciones</h2>
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => setKanbanListMode(v => !v)}
                  className="text-xs px-3 py-1.5 rounded-lg font-medium"
                  style={kanbanListMode ? { background: LI_GRADIENT, color: 'white' } : BTN_GHOST_STYLE}>
                  {kanbanListMode ? '⊞ Tablero' : '☰ Lista'}
                </button>
                <button onClick={() => setShowAddColumna(true)}
                  className="text-xs px-3 py-1.5 rounded-lg font-medium"
                  style={BTN_GHOST_STYLE}>
                  + Columna
                </button>
                <button onClick={() => setStep(STEPS.MODE_SELECT)}
                  className="text-xs px-3 py-1.5 rounded-lg font-medium"
                  style={BTN_BACK_STYLE}>
                  ← Mi preparación
                </button>
              </div>
            </div>

            {trackingError && (
              <p className="text-xs text-red-500 text-center">{trackingError}</p>
            )}

            {trackingLoading ? (
              <div className="text-center py-10">
                <div className="inline-block w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs mt-2" style={{ color: '#64748b' }}>Cargando tablero...</p>
              </div>
            ) : kanbanListMode ? (
              /* ── Lista view (mobile-friendly) ── */
              <div className="space-y-2">
                {trackingCards.length === 0 ? (
                  <p className="text-center text-sm py-10" style={{ color: '#94a3b8' }}>No hay postulaciones cargadas aún.</p>
                ) : (
                  trackingCards.map(card => {
                    const col = trackingColumnas.find(c => c.id === card.columna_id)
                    return (
                      <div key={card.id} className="rounded-xl p-3 flex items-start gap-3"
                        style={{ background: 'white', border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                        {col && <div className="w-2 h-full rounded-full shrink-0 mt-1" style={{ background: col.color, minHeight: 36 }} />}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-bold truncate" style={{ color: '#0d2137' }}>{card.empresa}</p>
                              <p className="text-xs truncate" style={{ color: '#0077B5' }}>{card.puesto}</p>
                            </div>
                            <div className="flex gap-1.5 shrink-0">
                              {card.cv_data && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(0,119,181,0.08)', color: '#0077B5' }}>📄</span>}
                              {col && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: col.color + '18', color: col.color }}>{col.nombre}</span>}
                            </div>
                          </div>
                          {card.fecha_aplicacion && <p className="text-[10px] mt-0.5" style={{ color: '#94a3b8' }}>{card.fecha_aplicacion}</p>}
                          <div className="flex gap-2 mt-2">
                            <button onClick={() => setEditCard(card)}
                              className="text-xs px-2.5 py-1 rounded-lg font-medium"
                              style={BTN_GHOST_STYLE}>
                              Editar
                            </button>
                            <button
                              onClick={() => {
                                setInterviewJobContext({ empresa: card.empresa, puesto: card.puesto })
                                resetInterview()
                                trackEvent('kanban_to_interview', { empresa: card.empresa, puesto: card.puesto })
                                setStep(STEPS.INTERVIEW_INTRO)
                              }}
                              className="text-xs px-2.5 py-1 rounded-lg font-medium text-white"
                              style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
                              🎙️ Preparar entrevista
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            ) : (
              /* ── Kanban board — horizontal scroll ── */
              <div className="overflow-x-auto pb-4">
                <div className="flex gap-4" style={{ minWidth: `${Math.max(trackingColumnas.length, 1) * 260}px` }}>
                  {trackingColumnas.map(col => {
                    const cards = trackingCards.filter(c => c.columna_id === col.id)
                    return (
                      <div key={col.id} className="flex-shrink-0 rounded-xl flex flex-col" style={{ width: 248, background: '#f8fafc', border: '1px solid rgba(0,0,0,0.07)' }}>
                        {/* Column header */}
                        <div className="flex items-center justify-between px-3 py-2.5 rounded-t-xl"
                          style={{ background: col.color + '18', borderBottom: `2px solid ${col.color}` }}>
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: col.color }} />
                            <span className="text-xs font-bold truncate" style={{ color: '#0d2137' }}>{col.nombre}</span>
                            <span className="text-xs shrink-0" style={{ color: '#94a3b8' }}>({cards.length})</span>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <button onClick={() => setRenameColumna({ id: col.id, nombre: col.nombre, color: col.color })}
                              className="text-xs px-1.5 py-0.5 rounded hover:bg-black/10 transition-colors"
                              title="Renombrar">✏️</button>
                            <button onClick={async () => {
                              if (confirm(`¿Eliminar la columna "${col.nombre}"? Las postulaciones sin columna quedarán sin asignar.`))
                                await deleteColumna(col.id)
                            }}
                              className="text-xs px-1.5 py-0.5 rounded hover:bg-red-100 transition-colors"
                              title="Eliminar">🗑</button>
                          </div>
                        </div>
                        {/* Cards */}
                        <div className="flex flex-col gap-2 p-2 flex-1 overflow-y-auto" style={{ maxHeight: 480 }}>
                          {cards.map(card => (
                            <div key={card.id} className="rounded-lg p-3 space-y-1"
                              style={{ background: 'white', border: '1px solid rgba(0,0,0,0.08)' }}>
                              <div className="cursor-pointer" onClick={() => setEditCard(card)}>
                                <p className="text-xs font-bold truncate" style={{ color: '#0d2137' }}>{card.empresa}</p>
                                <p className="text-xs truncate" style={{ color: '#0077B5' }}>{card.puesto}</p>
                                <p className="text-xs" style={{ color: '#94a3b8' }}>{card.fecha_aplicacion}</p>
                                {card.cv_data && (
                                  <span className="inline-block text-xs px-1.5 py-0.5 rounded"
                                    style={{ background: 'rgba(0,119,181,0.08)', color: '#0077B5' }}>📄 CV</span>
                                )}
                                {card.notas && (
                                  <p className="text-xs line-clamp-2 italic" style={{ color: '#64748b' }}>{card.notas}</p>
                                )}
                              </div>
                              <button
                                onClick={() => {
                                  setInterviewJobContext({ empresa: card.empresa, puesto: card.puesto })
                                  resetInterview()
                                  trackEvent('kanban_to_interview', { empresa: card.empresa, puesto: card.puesto })
                                  setStep(STEPS.INTERVIEW_INTRO)
                                }}
                                className="w-full text-[10px] py-1 rounded-md font-medium text-white mt-1"
                                style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
                                🎙️ Preparar entrevista
                              </button>
                            </div>
                          ))}
                          <button onClick={() => { setNewCardForm({ empresa: '', puesto: '', link_aviso: '', fecha_aplicacion: new Date().toISOString().slice(0, 10), notas: '' }); setShowAddCard(col.id) }}
                            className="w-full py-2 rounded-lg text-xs font-medium text-center transition-colors hover:bg-slate-100"
                            style={{ border: '1px dashed rgba(0,0,0,0.15)', color: '#94a3b8' }}>
                            + Agregar postulación
                          </button>
                        </div>
                      </div>
                    )
                  })}

                  {trackingColumnas.length === 0 && (
                    <div className="flex-1 text-center py-10">
                      <p className="text-sm" style={{ color: '#94a3b8' }}>No hay columnas. Hacé clic en "+ Columna" para empezar.</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Modal: Agregar columna ── */}
      {showAddColumna && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowAddColumna(false) }}>
          <div className="w-full max-w-xs rounded-2xl p-6 space-y-4"
            style={{ background: 'white', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h3 className="text-base font-bold" style={{ color: '#0d2137' }}>Nueva columna</h3>
            <div className="space-y-3">
              <input
                autoFocus
                placeholder="Nombre de la columna"
                value={newColumnaName}
                onChange={e => setNewColumnaName(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                style={INPUT_STYLE}
                maxLength={50}
                onKeyDown={e => e.key === 'Enter' && newColumnaName.trim() && createColumna(newColumnaName.trim(), newColumnaColor).then(() => { setShowAddColumna(false); setNewColumnaName(''); setNewColumnaColor('#64748b') }).catch(() => {})}
              />
              <div className="flex items-center gap-3">
                <label className="text-xs font-medium" style={{ color: '#475569' }}>Color:</label>
                <input type="color" value={newColumnaColor} onChange={e => setNewColumnaColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0" />
                <div className="flex gap-1.5 flex-wrap">
                  {['#64748b','#0077B5','#16a34a','#dc2626','#d97706','#7c3aed'].map(c => (
                    <button key={c} onClick={() => setNewColumnaColor(c)}
                      className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110"
                      style={{ background: c, borderColor: newColumnaColor === c ? '#0d2137' : 'transparent' }} />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowAddColumna(false)}
                className="flex-1 py-2 rounded-xl text-sm" style={BTN_BACK_STYLE}>Cancelar</button>
              <button
                disabled={!newColumnaName.trim()}
                onClick={() => createColumna(newColumnaName.trim(), newColumnaColor).then(() => { setShowAddColumna(false); setNewColumnaName(''); setNewColumnaColor('#64748b') }).catch(() => {})}
                className="flex-1 py-2 rounded-xl text-sm font-semibold text-white"
                style={{ background: newColumnaName.trim() ? LI_GRADIENT : 'rgba(0,0,0,0.2)' }}>
                Crear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Renombrar columna ── */}
      {renameColumna && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) setRenameColumna(null) }}>
          <div className="w-full max-w-xs rounded-2xl p-6 space-y-4"
            style={{ background: 'white', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h3 className="text-base font-bold" style={{ color: '#0d2137' }}>Editar columna</h3>
            <div className="space-y-3">
              <input
                autoFocus
                value={renameColumna.nombre}
                onChange={e => setRenameColumna(prev => ({ ...prev, nombre: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                style={INPUT_STYLE}
                maxLength={50}
              />
              <div className="flex items-center gap-3">
                <label className="text-xs font-medium" style={{ color: '#475569' }}>Color:</label>
                <input type="color" value={renameColumna.color} onChange={e => setRenameColumna(prev => ({ ...prev, color: e.target.value }))} className="w-8 h-8 rounded cursor-pointer border-0" />
                <div className="flex gap-1.5 flex-wrap">
                  {['#64748b','#0077B5','#16a34a','#dc2626','#d97706','#7c3aed'].map(c => (
                    <button key={c} onClick={() => setRenameColumna(prev => ({ ...prev, color: c }))}
                      className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110"
                      style={{ background: c, borderColor: renameColumna.color === c ? '#0d2137' : 'transparent' }} />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setRenameColumna(null)}
                className="flex-1 py-2 rounded-xl text-sm" style={BTN_BACK_STYLE}>Cancelar</button>
              <button
                disabled={!renameColumna.nombre.trim()}
                onClick={() => updateColumna(renameColumna.id, { nombre: renameColumna.nombre.trim(), color: renameColumna.color }).then(() => setRenameColumna(null)).catch(() => {})}
                className="flex-1 py-2 rounded-xl text-sm font-semibold text-white"
                style={{ background: renameColumna.nombre.trim() ? LI_GRADIENT : 'rgba(0,0,0,0.2)' }}>
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Agregar postulación ── */}
      {showAddCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 overflow-y-auto"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowAddCard(null) }}>
          <div className="w-full max-w-sm rounded-2xl p-6 space-y-4"
            style={{ background: 'white', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h3 className="text-base font-bold" style={{ color: '#0d2137' }}>Nueva postulación</h3>
            <div className="space-y-3">
              {[
                { label: 'Empresa *', key: 'empresa', type: 'text', placeholder: 'Ej: Mercado Libre', max: 100 },
                { label: 'Puesto *', key: 'puesto', type: 'text', placeholder: 'Ej: Product Manager', max: 100 },
                { label: 'Link del aviso', key: 'link_aviso', type: 'url', placeholder: 'https://...' },
                { label: 'Fecha de aplicación', key: 'fecha_aplicacion', type: 'date' },
              ].map(({ label, key, type, placeholder, max }) => (
                <div key={key}>
                  <label className="text-xs font-medium block mb-1" style={{ color: '#475569' }}>{label}</label>
                  <input
                    type={type}
                    value={newCardForm[key]}
                    onChange={e => setNewCardForm(prev => ({ ...prev, [key]: e.target.value }))}
                    placeholder={placeholder}
                    maxLength={max}
                    className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                    style={INPUT_STYLE}
                  />
                </div>
              ))}
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: '#475569' }}>Notas</label>
                <textarea
                  value={newCardForm.notas}
                  onChange={e => setNewCardForm(prev => ({ ...prev, notas: e.target.value }))}
                  placeholder="Requisitos, contacto, estado..."
                  rows={3}
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none resize-none"
                  style={INPUT_STYLE}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowAddCard(null)}
                className="flex-1 py-2 rounded-xl text-sm" style={BTN_BACK_STYLE}>Cancelar</button>
              <button
                disabled={!newCardForm.empresa.trim() || !newCardForm.puesto.trim()}
                onClick={() => {
                  if (!newCardForm.empresa.trim() || !newCardForm.puesto.trim()) return
                  createCard(showAddCard, newCardForm).then(() => setShowAddCard(null)).catch(() => {})
                }}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white"
                style={{ background: newCardForm.empresa.trim() && newCardForm.puesto.trim() ? LI_GRADIENT : 'rgba(0,0,0,0.2)' }}>
                Agregar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Editar postulación ── */}
      {editCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 overflow-y-auto"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) setEditCard(null) }}>
          <div className="w-full max-w-sm rounded-2xl p-6 space-y-4"
            style={{ background: 'white', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold" style={{ color: '#0d2137' }}>Editar postulación</h3>
              <button onClick={async () => {
                if (confirm(`¿Eliminar "${editCard.empresa} — ${editCard.puesto}"?`)) {
                  await deleteCard(editCard.id)
                  setEditCard(null)
                }
              }} className="text-xs px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
                style={{ color: '#dc2626', border: '1px solid rgba(220,38,38,0.2)' }}>
                🗑 Eliminar
              </button>
            </div>
            <div className="space-y-3">
              {[
                { label: 'Empresa *', key: 'empresa', type: 'text', max: 100 },
                { label: 'Puesto *', key: 'puesto', type: 'text', max: 100 },
                { label: 'Link del aviso', key: 'link_aviso', type: 'url' },
                { label: 'Fecha de aplicación', key: 'fecha_aplicacion', type: 'date' },
              ].map(({ label, key, type, max }) => (
                <div key={key}>
                  <label className="text-xs font-medium block mb-1" style={{ color: '#475569' }}>{label}</label>
                  <input
                    type={type}
                    value={editCard[key] || ''}
                    onChange={e => setEditCard(prev => ({ ...prev, [key]: e.target.value }))}
                    maxLength={max}
                    className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                    style={INPUT_STYLE}
                  />
                </div>
              ))}
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: '#475569' }}>Columna</label>
                <select
                  value={editCard.columna_id || ''}
                  onChange={e => setEditCard(prev => ({ ...prev, columna_id: e.target.value || null }))}
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                  style={INPUT_STYLE}>
                  <option value="">Sin columna</option>
                  {trackingColumnas.map(col => (
                    <option key={col.id} value={col.id}>{col.nombre}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: '#475569' }}>Notas</label>
                <textarea
                  value={editCard.notas || ''}
                  onChange={e => setEditCard(prev => ({ ...prev, notas: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none resize-none"
                  style={INPUT_STYLE}
                />
              </div>
              {/* CV link section */}
              <div className="rounded-xl p-3 space-y-2"
                style={{ background: 'rgba(0,119,181,0.05)', border: '1px solid rgba(0,119,181,0.12)' }}>
                <p className="text-xs font-semibold" style={{ color: '#0077B5' }}>📄 CV vinculado</p>
                {editCard.cv_data ? (
                  <div className="space-y-2">
                    <p className="text-xs" style={{ color: '#475569' }}>
                      CV de <strong>{editCard.cv_data.nombreCompleto || 'candidato'}</strong> vinculado
                    </p>
                    <button onClick={() => setEditCard(prev => ({ ...prev, cv_data: null }))}
                      className="text-xs px-2 py-1 rounded-lg"
                      style={{ color: '#dc2626', border: '1px solid rgba(220,38,38,0.2)' }}>
                      Desvincular CV
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="text-xs" style={{ color: '#94a3b8' }}>No hay CV vinculado a esta postulación.</p>
                    {cvFinalData && (
                      <button onClick={() => setEditCard(prev => ({ ...prev, cv_data: cvFinalData }))}
                        className="text-xs px-2 py-1 rounded-lg font-medium"
                        style={{ background: 'rgba(0,119,181,0.08)', color: '#0077B5', border: '1px solid rgba(0,119,181,0.2)' }}>
                        Vincular CV actual ({cvFinalData.nombreCompleto || 'sin nombre'})
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditCard(null)}
                className="flex-1 py-2 rounded-xl text-sm" style={BTN_BACK_STYLE}>Cancelar</button>
              <button
                disabled={!editCard.empresa?.trim() || !editCard.puesto?.trim()}
                onClick={async () => {
                  if (!editCard.empresa?.trim() || !editCard.puesto?.trim()) return
                  const { id, user_id, created_at, updated_at, ...patch } = editCard
                  await updateCard(id, patch).catch(() => {})
                  setEditCard(null)
                }}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white"
                style={{ background: editCard.empresa?.trim() && editCard.puesto?.trim() ? LI_GRADIENT : 'rgba(0,0,0,0.2)' }}>
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

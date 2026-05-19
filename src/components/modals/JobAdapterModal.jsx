import { useState } from 'react'
import { LI_GRADIENT, trackEvent } from '../../constants'
import { Spinner, CopyButton } from '../ui'

export default function JobAdapterModal({
  setShowJobModal, jobPosting, setJobPosting, callAdaptCvForJob,
  jobLoading, jobResult, setJobResult, jobError, setJobError,
  profilePhotoPreview, setProfilePhotoPreview, profilePhoto, setProfilePhoto,
  profilePhotoMime, setProfilePhotoMime, handleCvPhotoUpload, cvTemplate,
  user, jobSaveLoading, jobSaved, setJobSaved, jobSaveError, setJobSaveError,
  saveAdaptedCvAsPostulacion, openAdaptedCvPreview, onGoToTracking,
}) {
  const [saveEmpresa, setSaveEmpresa] = useState('')
  const [savePuesto, setSavePuesto] = useState('')
  const [saveFormOpen, setSaveFormOpen] = useState(false)

  const handleClose = () => {
    setShowJobModal(false)
    setJobResult(null)
    setJobError('')
    setJobSaved(false)
    setJobSaveError('')
  }

  const handleBackToForm = () => {
    setJobResult(null)
    setJobPosting('')
    setJobError('')
    setJobSaved(false)
    setJobSaveError('')
    setSaveEmpresa('')
    setSavePuesto('')
    setSaveFormOpen(false)
  }

  const handleOpenSaveForm = () => {
    setSaveEmpresa(jobResult?.empresa_detectada || '')
    setSavePuesto(jobResult?.cargo_detectado || '')
    setSaveFormOpen(true)
  }

  const handleSave = () => {
    saveAdaptedCvAsPostulacion(saveEmpresa.trim(), savePuesto.trim())
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.60)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) handleClose() }}>
      <div className="w-full max-w-lg rounded-3xl overflow-hidden flex flex-col max-h-[90dvh]"
        style={{ background: 'white', boxShadow: '0 25px 60px rgba(0,0,0,0.25)' }}>

        <div className="flex items-center justify-between p-5 border-b shrink-0" style={{ borderColor: 'rgba(0,119,181,0.12)' }}>
          <div>
            <h2 className="text-slate-900 font-bold text-base">Adaptar CV para un aviso</h2>
            <p className="text-slate-500 text-xs mt-0.5">Gemini ajusta tu CV y genera la carta de presentación</p>
          </div>
          <button onClick={handleClose}
            className="text-slate-400 hover:text-slate-600 text-2xl leading-none w-8 h-8 flex items-center justify-center shrink-0">×</button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {!jobResult ? (
            <>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Pegá el aviso de empleo</label>
                <textarea
                  value={jobPosting}
                  onChange={e => { setJobPosting(e.target.value); setJobError('') }}
                  placeholder="Pegá acá el texto completo del aviso: título del puesto, responsabilidades, requisitos, empresa, etc."
                  rows={9}
                  className="w-full rounded-2xl px-4 py-3 text-sm resize-none outline-none"
                  style={{ background: '#f8fafc', border: '1px solid rgba(0,119,181,0.18)', color: '#0d2137' }}
                />
                <p className="text-xs text-slate-400 text-right">{jobPosting.length} caracteres</p>
              </div>
              {jobError && <p className="text-xs text-center" style={{ color: '#ef4444' }}>{jobError}</p>}
              <button
                onClick={callAdaptCvForJob}
                disabled={jobLoading || jobPosting.trim().length < 50}
                className="btn-glow w-full py-3.5 rounded-xl text-white font-bold text-sm"
                style={{ background: LI_GRADIENT, opacity: (jobLoading || jobPosting.trim().length < 50) ? 0.5 : 1 }}>
                {jobLoading ? (
                  <span className="flex items-center justify-center gap-2"><Spinner size={4} /><span>Generando CV adaptado y carta...</span></span>
                ) : 'Generar CV adaptado + Carta →'}
              </button>
            </>
          ) : (
            <div className="space-y-5">
              {/* Metadata chips */}
              {(jobResult.empresa_detectada || jobResult.cargo_detectado || jobResult.seniority_detectado) && (
                <div className="flex flex-wrap gap-2">
                  {jobResult.empresa_detectada && (
                    <span className="text-xs px-2.5 py-1 rounded-full font-medium"
                      style={{ background: 'rgba(0,119,181,0.08)', border: '1px solid rgba(0,119,181,0.2)', color: '#0077B5' }}>
                      🏢 {jobResult.empresa_detectada}
                    </span>
                  )}
                  {jobResult.cargo_detectado && (
                    <span className="text-xs px-2.5 py-1 rounded-full font-medium"
                      style={{ background: 'rgba(0,119,181,0.08)', border: '1px solid rgba(0,119,181,0.2)', color: '#0077B5' }}>
                      💼 {jobResult.cargo_detectado}
                    </span>
                  )}
                  {jobResult.seniority_detectado && jobResult.seniority_detectado !== 'No especificado' && (
                    <span className="text-xs px-2.5 py-1 rounded-full font-medium"
                      style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', color: '#6366f1' }}>
                      {jobResult.seniority_detectado}
                    </span>
                  )}
                </div>
              )}

              {jobResult.ajustes_principales?.length > 0 && (
                <div className="rounded-2xl p-4 space-y-2"
                  style={{ background: 'rgba(0,119,181,0.04)', border: '1px solid rgba(0,119,181,0.15)' }}>
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#0077B5' }}>Ajustes realizados al CV</p>
                  {jobResult.ajustes_principales.map((a, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-blue-400 shrink-0 text-xs mt-0.5">✓</span>
                      <p className="text-slate-600 text-xs leading-snug">{a}</p>
                    </div>
                  ))}
                </div>
              )}

              {jobResult.palabras_clave_incorporadas?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Keywords incorporadas</p>
                  <div className="flex flex-wrap gap-1.5">
                    {jobResult.palabras_clave_incorporadas.map((kw, i) => (
                      <span key={i} className="text-xs px-2.5 py-1 rounded-full font-medium"
                        style={{ background: 'rgba(0,119,181,0.08)', border: '1px solid rgba(0,119,181,0.2)', color: '#0077B5' }}>
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {jobResult.cv_adaptado && (
                <>
                  <div className="rounded-2xl p-4 space-y-3"
                    style={{ background: profilePhotoPreview ? 'rgba(5,150,105,0.05)' : 'rgba(0,119,181,0.05)', border: `1px solid ${profilePhotoPreview ? 'rgba(5,150,105,0.2)' : 'rgba(0,119,181,0.18)'}` }}>
                    <p className="text-xs font-semibold text-slate-700">
                      {profilePhotoPreview ? '📸 Foto de perfil cargada' : '📸 ¿Querés incluir tu foto de perfil?'}
                    </p>
                    {!profilePhotoPreview && (
                      <p className="text-xs text-slate-500">Las fotos no se guardan en el historial. Podés cargarla ahora o descargar sin ella.</p>
                    )}
                    <div className="flex items-center gap-3">
                      {profilePhotoPreview && (
                        <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 relative"
                          style={{ border: '2px solid rgba(5,150,105,0.4)' }}>
                          <img src={profilePhotoPreview} alt="Foto" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                      )}
                      <label htmlFor="job-modal-photo" className="cursor-pointer px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                        style={{ background: 'rgba(0,119,181,0.12)', color: '#0077B5', border: '1px solid rgba(0,119,181,0.25)' }}>
                        {profilePhotoPreview ? 'Cambiar foto' : 'Cargar foto'}
                      </label>
                      <input id="job-modal-photo" type="file" accept="image/*" className="hidden" onChange={handleCvPhotoUpload} />
                      {profilePhotoPreview && (
                        <button onClick={() => { setProfilePhotoPreview(null); setProfilePhoto(null); setProfilePhotoMime('image/jpeg') }}
                          className="text-xs transition-colors" style={{ color: '#94a3b8' }}>
                          ✕ Quitar
                        </button>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => openAdaptedCvPreview(
                      jobResult.cv_adaptado,
                      jobResult.empresa_detectada,
                      jobResult.cargo_detectado
                    )}
                    className="w-full py-3.5 rounded-xl text-sm font-semibold text-white"
                    style={{ background: LI_GRADIENT, boxShadow: '0 4px 12px rgba(0,119,181,0.25)' }}>
                    👁 Ver CV adaptado →
                  </button>
                </>
              )}

              {jobResult.carta_de_presentacion && (
                <div className="rounded-2xl overflow-hidden"
                  style={{ border: '1px solid rgba(99,102,241,0.25)' }}>
                  <div className="flex items-center justify-between px-4 py-3"
                    style={{ background: 'rgba(99,102,241,0.06)' }}>
                    <p className="text-sm font-semibold text-slate-800">✉ Carta de presentación</p>
                    <CopyButton text={jobResult.carta_de_presentacion} />
                  </div>
                  <div className="px-4 py-4 bg-white">
                    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{jobResult.carta_de_presentacion}</p>
                  </div>
                </div>
              )}

              {/* ── Guardar en tablero ── */}
              {jobSaved ? (
                <div className="rounded-2xl p-4 text-center space-y-3"
                  style={{ background: 'rgba(5,150,105,0.06)', border: '1px solid rgba(5,150,105,0.25)' }}>
                  <p className="text-sm font-semibold text-emerald-700">✓ Guardada en tu tablero de postulaciones</p>
                  <button
                    onClick={onGoToTracking}
                    className="text-xs font-semibold px-4 py-2 rounded-lg transition-all"
                    style={{ background: 'rgba(5,150,105,0.12)', color: '#059669', border: '1px solid rgba(5,150,105,0.25)' }}>
                    Ver tablero →
                  </button>
                </div>
              ) : !saveFormOpen ? (
                <button
                  onClick={user ? handleOpenSaveForm : () => { setShowJobModal(false) }}
                  className="w-full py-3 rounded-xl text-sm font-semibold transition-all"
                  style={{ background: 'rgba(0,119,181,0.07)', color: '#0077B5', border: '1px solid rgba(0,119,181,0.2)' }}>
                  📌 Guardar como postulación en tablero
                </button>
              ) : (
                <div className="rounded-2xl p-4 space-y-3"
                  style={{ background: 'rgba(0,119,181,0.04)', border: '1px solid rgba(0,119,181,0.18)' }}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Guardar en tablero</p>
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={saveEmpresa}
                      onChange={e => setSaveEmpresa(e.target.value)}
                      placeholder="Empresa"
                      className="w-full rounded-xl px-3 py-2 text-sm outline-none"
                      style={{ background: '#f8fafc', border: '1px solid rgba(0,119,181,0.18)', color: '#0d2137' }}
                    />
                    <input
                      type="text"
                      value={savePuesto}
                      onChange={e => setSavePuesto(e.target.value)}
                      placeholder="Puesto"
                      className="w-full rounded-xl px-3 py-2 text-sm outline-none"
                      style={{ background: '#f8fafc', border: '1px solid rgba(0,119,181,0.18)', color: '#0d2137' }}
                    />
                  </div>
                  {jobSaveError && <p className="text-xs text-center" style={{ color: '#ef4444' }}>{jobSaveError}</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setSaveFormOpen(false); setJobSaveError('') }}
                      className="flex-1 py-2 rounded-xl text-xs text-slate-400 hover:text-slate-600 transition-colors">
                      Cancelar
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={jobSaveLoading || !savePuesto.trim()}
                      className="flex-1 py-2 rounded-xl text-sm font-semibold text-white transition-all"
                      style={{ background: LI_GRADIENT, opacity: (jobSaveLoading || !savePuesto.trim()) ? 0.5 : 1 }}>
                      {jobSaveLoading ? (
                        <span className="flex items-center justify-center gap-2"><Spinner size={4} /><span>Guardando...</span></span>
                      ) : 'Guardar postulación →'}
                    </button>
                  </div>
                </div>
              )}

              <button
                onClick={handleBackToForm}
                className="w-full py-2.5 rounded-xl text-sm text-slate-400 hover:text-slate-600 transition-colors">
                ← Adaptar para otro aviso
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

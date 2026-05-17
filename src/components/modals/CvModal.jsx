export default function CvModal({ setShowCvModal, contactEmail, setContactEmail, contactTelefono, setContactTelefono, contactLinkedin, setContactLinkedin, profilePhotoPreview, setProfilePhotoPreview, setProfilePhoto, setProfilePhotoMime, handleCvPhotoUpload, callGenerateCV }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 overflow-y-auto"
      style={{ background: 'rgba(0,0,0,0.70)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) setShowCvModal(false) }}
    >
      <div className="w-full max-w-sm rounded-2xl overflow-hidden"
        style={{ background: '#1e293b', border: '1px solid #334155', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        <div className="p-6 pb-4 space-y-2">
          <h3 className="text-lg font-bold text-white">📄 Tu CV de 1 página</h3>
          <ul className="text-xs space-y-1 pt-1" style={{ color: '#64748b' }}>
            <li>✓ Solo datos reales — sin métricas inventadas</li>
            <li>✓ Titular y resumen optimizados de tu análisis</li>
            <li>✓ Foto de perfil incluida si la subiste</li>
            <li>✓ Evaluación de calidad automática con preguntas de mejora</li>
            <li>✓ ATS-compatible · un clic para imprimir como PDF</li>
          </ul>
        </div>
        <div className="px-6 pb-6 pt-4 space-y-3" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <p className="text-xs font-semibold" style={{ color: '#cbd5e1' }}>Datos de contacto para el CV</p>
          <div>
            <label className="text-xs block mb-1" style={{ color: '#64748b' }}>
              Email <span style={{ color: '#f87171' }}>*</span>
            </label>
            <input
              type="email"
              value={contactEmail}
              onChange={e => setContactEmail(e.target.value)}
              placeholder="tu@email.com"
              className="w-full rounded-xl px-4 py-2.5 text-sm text-white outline-none"
              style={{ background: 'rgba(15,23,42,0.8)', border: `1px solid ${contactEmail.trim() ? 'rgba(0,119,181,0.5)' : '#334155'}` }}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs block mb-1" style={{ color: '#64748b' }}>Teléfono</label>
              <input
                type="tel"
                value={contactTelefono}
                onChange={e => setContactTelefono(e.target.value)}
                placeholder="+54 11 1234-5678"
                className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none"
                style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid #334155' }}
              />
            </div>
            <div>
              <label className="text-xs block mb-1" style={{ color: '#64748b' }}>URL LinkedIn</label>
              <input
                type="url"
                value={contactLinkedin}
                onChange={e => setContactLinkedin(e.target.value)}
                placeholder="linkedin.com/in/..."
                className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none"
                style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid #334155' }}
              />
            </div>
          </div>
          <div>
            <label className="text-xs block mb-2" style={{ color: '#cbd5e1' }}>
              Foto de perfil <span style={{ color: '#64748b', fontWeight: 400 }}>(opcional — aparece en el CV)</span>
            </label>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full overflow-hidden shrink-0 relative flex-shrink-0"
                style={{ border: '2px solid rgba(0,119,181,0.4)', background: '#0d2137' }}>
                {profilePhotoPreview
                  ? <img src={profilePhotoPreview} alt="Foto" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span className="text-xl absolute inset-0 flex items-center justify-center">👤</span>
                }
              </div>
              <label htmlFor="cv-modal-photo" className="cursor-pointer px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{ background: 'rgba(0,119,181,0.15)', color: '#60a5fa', border: '1px solid rgba(0,119,181,0.3)' }}>
                {profilePhotoPreview ? 'Cambiar foto' : 'Subir foto'}
              </label>
              <input id="cv-modal-photo" type="file" accept="image/*" className="hidden" onChange={handleCvPhotoUpload} />
              {profilePhotoPreview && (
                <button onClick={() => { setProfilePhotoPreview(null); setProfilePhoto(null); setProfilePhotoMime('image/jpeg') }}
                  className="text-xs transition-colors" style={{ color: '#64748b' }}>
                  ✕ Quitar
                </button>
              )}
            </div>
            {!profilePhotoPreview && (
              <p className="text-xs mt-1.5" style={{ color: '#475569' }}>
                Sin foto el CV se genera igualmente, pero con foto tiene más impacto.
              </p>
            )}
          </div>

          <p className="text-xs leading-relaxed pt-1" style={{ color: '#475569' }}>
            🔒 Tus datos se usan solo para confeccionar el CV y no se comparten con terceros.
          </p>
          <button
            onClick={() => {
              if (!contactEmail.trim()) return
              const contacto = { email: contactEmail.trim(), telefono: contactTelefono.trim(), linkedinUrl: contactLinkedin.trim() }
              setShowCvModal(false)
              callGenerateCV(contacto)
            }}
            disabled={!contactEmail.trim()}
            className="w-full py-3.5 rounded-xl text-sm font-semibold transition-opacity"
            style={{
              background: contactEmail.trim() ? '#0077B5' : '#334155',
              color: 'white',
              opacity: contactEmail.trim() ? 1 : 0.5,
              cursor: contactEmail.trim() ? 'pointer' : 'not-allowed',
            }}
          >
            Crear mi CV →
          </button>
          <button
            onClick={() => setShowCvModal(false)}
            className="w-full py-2 text-xs transition-colors"
            style={{ color: '#475569' }}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

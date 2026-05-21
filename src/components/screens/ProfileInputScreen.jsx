import { STEPS, LI_GRADIENT, CARD_STYLE, INPUT_STYLE, INPUT_ALT_STYLE, BTN_BACK_STYLE, BTN_GHOST_STYLE, MAX_PDF_SIZE, trackEvent } from '../../constants'
import { STATIC_QUESTIONS } from '../../data'
import { Logo, Spinner } from '../ui'
import RateLimitUI from '../RateLimitUI'

export default function ProfileInputScreen({
  rateLimitEvento, rateLimitSecs, waitlistEmail, setWaitlistEmail, waitlistSent, waitlistLoading, handleWaitlist,
  inputMode, handleInputModeSwitch,
  instrTab, setInstrTab,
  pdfLoading, pdfFileName, setPdfFileName, setPdfLoading, pdfError, setPdfError,
  mobileSlide, setMobileSlide, touchStartX,
  profilePhotoPreview, setProfilePhotoPreview, profilePhoto, setProfilePhoto, profilePhotoMime, setProfilePhotoMime,
  formConfirmed, setFormConfirmed,
  formTitular, setFormTitular,
  formResumen, setFormResumen,
  formExperiencias, setFormExperiencias,
  formEducacion, setFormEducacion,
  formHabilidades, setFormHabilidades,
  handleFormConfirm,
  handlePhotoUpload,
  liAutofillDone, liAutofillLoading, handleLinkedinAutofill, liAutofillError,
  sinPerfilMode, setSinPerfilMode,
  profileText, setProfileText,
  isDragging, handlePdfUpload, handleDragOver, handleDragLeave, handleDrop,
  qaHistory, analysisError, callGemini, analyzing,
  handleBack, setStep,
}) {
  return (
    <div className="step-transition space-y-5">
      <Logo />
      <div>
        <p className="text-slate-500 text-sm mb-1">Último paso</p>
        <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">Cargá tu perfil profesional</h2>
      </div>

      {/* Rate limit banner */}
      {(rateLimitEvento === 'analisis') && (
        <RateLimitUI secs={rateLimitSecs} evento={rateLimitEvento}
          email={waitlistEmail} onEmailChange={setWaitlistEmail}
          sent={waitlistSent} loading={waitlistLoading} onSubmit={handleWaitlist} />
      )}

      {/* ── Tabs de carga de perfil ── */}
      <>

          <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid rgba(0,119,181,0.15)' }}>
            {[
              { id: 'pdf',       label: '📄  PDF' },
              { id: 'form',      label: '✏️  Manual' },
              { id: 'sinperfil', label: '💡  Sin PDF' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => handleInputModeSwitch(tab.id)}
                className="flex-1 py-3 text-xs font-semibold transition-all duration-200"
                style={inputMode === tab.id
                  ? { background: LI_GRADIENT, color: '#fff' }
                  : { color: '#475569', background: 'transparent' }
                }
              >
                {tab.label}
              </button>
            ))}
          </div>


          {/* ── MODO PDF ── */}
          {inputMode === 'pdf' && (
            <div className="space-y-4">
              <div className="rounded-xl p-4 text-sm"
                style={{ backgroundColor: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.25)' }}>
                <p className="text-amber-500 font-semibold text-xs uppercase tracking-wide mb-1">¿Por qué PDF?</p>
                <p className="text-slate-600 text-xs leading-relaxed">Es la forma más completa de compartir tu perfil. LinkedIn lo genera en segundos con toda tu información.</p>
              </div>
              <div className="rounded-2xl overflow-hidden"
                style={CARD_STYLE}>
                <div className="flex border-b" style={{ borderColor: 'rgba(0,119,181,0.12)' }}>
                  {[
                    { id: 'desktop', label: '🖥️  Computadora' },
                    { id: 'mobile', label: '📱  Celular' },
                  ].map(tab => (
                    <button key={tab.id} onClick={() => { setInstrTab(tab.id); trackEvent('tutorial_tab_switch', { tab: tab.id }) }}
                      className="flex-1 py-3 text-xs font-semibold transition-all duration-200"
                      style={instrTab === tab.id
                        ? { background: LI_GRADIENT, color: '#fff' }
                        : { color: '#475569', background: 'transparent' }
                      }>{tab.label}</button>
                  ))}
                </div>
                <div className="p-5 space-y-4">
                  {instrTab === 'desktop' ? (
                    <>
                      <div className="flex flex-col items-center gap-2">
                        <p className="text-xs text-slate-500 font-medium self-start">📹 Tutorial rápido</p>
                        <div style={{ width: 220, margin: '0 auto', borderRadius: 12, overflow: 'hidden', flexShrink: 0 }}>
                          <div className="relative" style={{ paddingTop: '177.78%' }}>
                            <iframe
                              className="absolute inset-0 w-full h-full"
                              src="https://www.youtube.com/embed/wUR9COhVWyI?rel=0&modestbranding=1&enablejsapi=1&origin=https://optimizalinkedin.com"
                              title="Cómo descargar tu PDF de LinkedIn desde computadora"
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                              allowFullScreen
                            />
                          </div>
                        </div>
                      </div>
                      <p className="font-semibold text-slate-900 text-sm">📄 Descargar desde computadora</p>
                      <ol className="space-y-2.5">
                        {[
                          'Abrí linkedin.com en tu navegador e iniciá sesión',
                          'Hacé clic en tu foto de perfil (arriba a la derecha) → "Ver perfil"',
                          'Hacé clic en "Más" (debajo de tu foto y nombre)',
                          'Seleccioná "Guardar como PDF"',
                          'El PDF se descarga automáticamente — buscalo en Descargas',
                          'Volvé acá y subilo ↓',
                        ].map((s, i) => (
                          <li key={i} className="flex items-start gap-3 text-sm text-slate-600">
                            <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5"
                              style={{ backgroundColor: 'rgba(0,119,181,0.2)', color: '#0077B5', minWidth: '1.25rem' }}>
                              {i + 1}
                            </span>
                            <span className="leading-relaxed">{s}</span>
                          </li>
                        ))}
                      </ol>
                    </>
                  ) : (
                    <>
                      <p className="font-semibold text-slate-900 text-sm">📄 Descargar desde celular (Chrome)</p>
                      <div className="relative rounded-xl overflow-hidden select-none"
                        style={{ background: '#f1f5f9', border: '1px solid rgba(0,119,181,0.1)' }}
                        onTouchStart={e => { touchStartX.current = e.touches[0].clientX }}
                        onTouchEnd={e => {
                          const dx = e.changedTouches[0].clientX - (touchStartX.current ?? 0)
                          if (dx < -40 && mobileSlide < 1) setMobileSlide(1)
                          if (dx > 40 && mobileSlide > 0) setMobileSlide(0)
                        }}
                      >
                        <img
                          src={mobileSlide === 0 ? '/Captura linkedin celular.png' : '/Captura linkedin celular 2.png'}
                          alt={mobileSlide === 0 ? 'Botón Compartir resaltado en LinkedIn' : 'Pantalla de impresión con botón Compartir'}
                          className="w-full object-contain"
                          style={{ maxHeight: 340, display: 'block', margin: '0 auto' }}
                          onError={e => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling && (e.currentTarget.nextSibling.style.display = 'flex') }}
                        />
                        <div style={{ display: 'none', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 120, color: '#94a3b8', fontSize: 13 }}>
                          <span style={{ fontSize: 32 }}>📵</span>
                          <span>Imagen no disponible</span>
                        </div>
                        {mobileSlide > 0 && (
                          <button
                            onClick={() => setMobileSlide(0)}
                            className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-md"
                            style={{ background: 'rgba(0,0,0,0.45)' }}
                          >‹</button>
                        )}
                        {mobileSlide < 1 && (
                          <button
                            onClick={() => setMobileSlide(1)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-md"
                            style={{ background: 'rgba(0,0,0,0.45)' }}
                          >›</button>
                        )}
                        <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5">
                          {[0, 1].map(i => (
                            <button key={i} onClick={() => setMobileSlide(i)}
                              className="rounded-full transition-all duration-200"
                              style={{ width: mobileSlide === i ? 16 : 6, height: 6,
                                background: mobileSlide === i ? '#0077B5' : 'rgba(255,255,255,0.7)' }}
                            />
                          ))}
                        </div>
                      </div>
                      <p className="text-xs text-slate-500 text-center -mt-1">
                        {mobileSlide === 0
                          ? 'Imagen 1 — Tocá el botón Compartir (resaltado en amarillo)'
                          : 'Imagen 2 — En la pantalla de impresión, tocá Compartir → Guardar archivo'}
                      </p>
                      <ol className="space-y-2.5">
                        {[
                          'Abrí linkedin.com en Chrome (navegador, no en la app)',
                          'Iniciá sesión y andá a tu perfil',
                          'Tocá el botón Compartir resaltado en amarillo (ver imagen 1)',
                          'Seleccioná Imprimir en el menú que aparece',
                          'En la pantalla de impresión (imagen 2), tocá Compartir nuevamente',
                          'Seleccioná Guardar en Archivos (o "Guardar como PDF")',
                          'Volvé acá y subí el archivo ↓',
                        ].map((s, i) => (
                          <li key={i} className="flex items-start gap-3 text-sm text-slate-600">
                            <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5"
                              style={{ backgroundColor: 'rgba(0,119,181,0.2)', color: '#0077B5', minWidth: '1.25rem' }}>
                              {i + 1}
                            </span>
                            <span className="leading-relaxed">{s}</span>
                          </li>
                        ))}
                      </ol>
                    </>
                  )}
                </div>
              </div>
              <div>
                <input type="file" accept="application/pdf" id="pdf-upload" className="hidden" onChange={handlePdfUpload} />
                <label htmlFor="pdf-upload"
                  onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                  className="flex flex-col items-center justify-center gap-3 w-full py-10 px-6 rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-300"
                  style={{
                    borderColor: profileText ? 'rgba(34,197,94,0.6)' : isDragging ? '#0a91d4' : pdfLoading ? '#0077B5' : 'rgba(0,119,181,0.20)',
                    background: profileText ? 'rgba(34,197,94,0.05)' : isDragging ? 'rgba(0,119,181,0.08)' : '#f8fafc',
                  }}>
                  {pdfLoading ? (
                    <><div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: '#0077B5', borderTopColor: 'transparent' }} />
                      <p className="text-slate-500 text-sm">Extrayendo contenido del PDF...</p></>
                  ) : profileText ? (
                    <><span className="text-3xl">✅</span>
                      <div className="text-center">
                        <p className="text-green-600 font-semibold text-sm">{pdfFileName}</p>
                        <p className="text-slate-500 text-xs mt-1">Perfil extraído · Hacé clic para cambiar</p>
                      </div></>
                  ) : (
                    <><span className="text-3xl">{isDragging ? '📂' : '📄'}</span>
                      <div className="text-center">
                        <p className="text-slate-900 font-semibold text-sm">{isDragging ? 'Soltá tu PDF de LinkedIn acá' : 'Subir PDF de LinkedIn'}</p>
                        <p className="text-slate-500 text-xs mt-1">Arrastrá o hacé clic · Máx. 15 MB</p>
                      </div></>
                  )}
                </label>
              </div>
              {pdfError && (
                <div role="alert" className="rounded-xl p-4 text-sm flex items-start gap-3"
                  style={{ backgroundColor: 'rgba(254,226,226,0.8)', border: '1px solid #fca5a5', color: '#b91c1c' }}>
                  <span className="shrink-0 mt-0.5">⚠️</span><span>{pdfError}</span>
                </div>
              )}
            </div>
          )}

          {/* ── MODO FORMULARIO ── */}
          {inputMode === 'form' && (
            <div className="space-y-4">
              <p className="text-slate-500 text-sm leading-relaxed">
                Completá la información manualmente para tu evaluación inicial. Podés agregar el PDF más adelante para el análisis completo.
              </p>

              {/* Banner AutoFill */}
              <div className="rounded-xl p-3 flex items-center gap-3"
                style={{ background: 'rgba(0,119,181,0.05)', border: '1px solid rgba(0,119,181,0.18)' }}>
                <span className="text-lg shrink-0">⚡</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-700">Completar desde LinkedIn</p>
                  <p className="text-xs text-slate-500">Completá los campos con un clic</p>
                </div>
                {liAutofillDone
                  ? <span className="text-emerald-500 text-xs font-semibold shrink-0">✓ Listo</span>
                  : (
                    <button
                      onClick={handleLinkedinAutofill}
                      disabled={liAutofillLoading}
                      className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
                      style={{ background: '#0077B5', color: 'white', opacity: liAutofillLoading ? 0.6 : 1 }}
                    >
                      {liAutofillLoading ? '...' : 'Autocompletar'}
                    </button>
                  )
                }
              </div>
              {liAutofillError && (
                <p className="text-xs text-amber-600">Plugin pendiente de aprobación por LinkedIn. Completá manualmente.</p>
              )}

              {/* Foto de perfil */}
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide block mb-2">
                  Foto de perfil{' '}
                  <span className="text-slate-400 font-normal normal-case tracking-normal">(opcional — se analiza calidad)</span>
                </label>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full overflow-hidden shrink-0 relative"
                    style={{ border: '2px solid rgba(0,119,181,0.3)', background: '#dce8f0' }}>
                    {profilePhotoPreview
                      ? <img src={profilePhotoPreview} alt="preview" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span className="text-2xl absolute inset-0 flex items-center justify-center">👤</span>
                    }
                  </div>
                  <label htmlFor="photo-upload"
                    className="cursor-pointer px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200"
                    style={{ background: 'rgba(0,119,181,0.08)', color: '#0077B5', border: '1px solid rgba(0,119,181,0.2)' }}>
                    {profilePhotoPreview ? 'Cambiar foto' : 'Subir foto'}
                  </label>
                  <input id="photo-upload" type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                  {profilePhotoPreview && (
                    <button onClick={() => { setProfilePhotoPreview(null); setProfilePhoto(null); setProfilePhotoMime('image/jpeg'); setFormConfirmed(false); setProfileText('') }}
                      className="text-xs text-slate-400 hover:text-red-400 transition-colors">✕ Quitar</button>
                  )}
                </div>
              </div>

              {/* Titular */}
              <div>
                <label htmlFor="form-titular" className="text-xs font-semibold text-slate-600 uppercase tracking-wide block mb-1.5">
                  Titular profesional <span style={{ color: '#0077B5' }}>*</span>
                </label>
                <input id="form-titular" type="text" value={formTitular}
                  onChange={e => { setFormTitular(e.target.value); setFormConfirmed(false); setProfileText('') }}
                  placeholder="Ej: Desarrollador Frontend Senior | React & TypeScript | 10 años"
                  maxLength={220}
                  className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                  style={INPUT_STYLE} />
                <p className="text-slate-400 text-xs mt-1">El texto que aparece debajo de tu nombre en LinkedIn</p>
              </div>

              {/* Resumen */}
              <div>
                <label htmlFor="form-resumen" className="text-xs font-semibold text-slate-600 uppercase tracking-wide block mb-1.5">
                  Resumen / About{' '}
                  <span className="text-slate-400 font-normal normal-case tracking-normal">(recomendado)</span>
                </label>
                <textarea id="form-resumen" value={formResumen}
                  onChange={e => { setFormResumen(e.target.value); setFormConfirmed(false); setProfileText('') }}
                  placeholder={'Pegá el texto de tu sección "Acerca de" en LinkedIn...'}
                  rows={4} maxLength={2600}
                  className="w-full rounded-xl px-4 py-3 text-sm outline-none resize-none"
                  style={INPUT_STYLE} />
              </div>

              {/* Experiencias */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Experiencia profesional</label>
                  <button
                    onClick={() => { setFormExperiencias(p => [...p, { cargo: '', empresa: '', periodo: '', descripcion: '' }]); setFormConfirmed(false); setProfileText('') }}
                    className="text-xs px-3 py-1 rounded-lg transition-all duration-200"
                    style={BTN_GHOST_STYLE}>
                    + Agregar
                  </button>
                </div>
                {formExperiencias.map((exp, i) => (
                  <div key={i} className="rounded-xl p-4 space-y-2 mb-3"
                    style={{ background: 'white', border: '1px solid rgba(0,119,181,0.12)' }}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500 font-semibold">Experiencia {i + 1}</span>
                      {formExperiencias.length > 1 && (
                        <button onClick={() => { setFormExperiencias(p => p.filter((_, j) => j !== i)); setFormConfirmed(false); setProfileText('') }}
                          className="text-xs text-slate-400 hover:text-red-400 transition-colors">✕ Eliminar</button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input value={exp.cargo}
                        onChange={e => { setFormExperiencias(p => p.map((x, j) => j === i ? { ...x, cargo: e.target.value } : x)); setFormConfirmed(false); setProfileText('') }}
                        placeholder="Cargo" maxLength={120}
                        className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                        style={INPUT_ALT_STYLE} />
                      <input value={exp.empresa}
                        onChange={e => { setFormExperiencias(p => p.map((x, j) => j === i ? { ...x, empresa: e.target.value } : x)); setFormConfirmed(false); setProfileText('') }}
                        placeholder="Empresa" maxLength={120}
                        className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                        style={INPUT_ALT_STYLE} />
                    </div>
                    <input value={exp.periodo}
                      onChange={e => { setFormExperiencias(p => p.map((x, j) => j === i ? { ...x, periodo: e.target.value } : x)); setFormConfirmed(false); setProfileText('') }}
                      placeholder="Período (Ej: Mar 2021 – Presente)" maxLength={60}
                      className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                      style={INPUT_ALT_STYLE} />
                    <textarea value={exp.descripcion}
                      onChange={e => { setFormExperiencias(p => p.map((x, j) => j === i ? { ...x, descripcion: e.target.value } : x)); setFormConfirmed(false); setProfileText('') }}
                      placeholder="Descripción de responsabilidades y logros (opcional)"
                      rows={2} maxLength={500}
                      className="w-full rounded-xl px-3 py-2.5 text-sm outline-none resize-none"
                      style={INPUT_ALT_STYLE} />
                  </div>
                ))}
              </div>

              {/* Educación */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Educación</label>
                  <button
                    onClick={() => { setFormEducacion(p => [...p, { institucion: '', titulo: '', periodo: '' }]); setFormConfirmed(false); setProfileText('') }}
                    className="text-xs px-3 py-1 rounded-lg transition-all duration-200"
                    style={BTN_GHOST_STYLE}>
                    + Agregar
                  </button>
                </div>
                {formEducacion.map((edu, i) => (
                  <div key={i} className="rounded-xl p-4 space-y-2 mb-3"
                    style={{ background: 'white', border: '1px solid rgba(0,119,181,0.12)' }}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500 font-semibold">Educación {i + 1}</span>
                      {formEducacion.length > 1 && (
                        <button onClick={() => { setFormEducacion(p => p.filter((_, j) => j !== i)); setFormConfirmed(false); setProfileText('') }}
                          className="text-xs text-slate-400 hover:text-red-400 transition-colors">✕ Eliminar</button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input value={edu.institucion}
                        onChange={e => { setFormEducacion(p => p.map((x, j) => j === i ? { ...x, institucion: e.target.value } : x)); setFormConfirmed(false); setProfileText('') }}
                        placeholder="Institución" maxLength={120}
                        className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                        style={INPUT_ALT_STYLE} />
                      <input value={edu.titulo}
                        onChange={e => { setFormEducacion(p => p.map((x, j) => j === i ? { ...x, titulo: e.target.value } : x)); setFormConfirmed(false); setProfileText('') }}
                        placeholder="Título / Carrera / Curso" maxLength={120}
                        className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                        style={INPUT_ALT_STYLE} />
                    </div>
                    <input value={edu.periodo}
                      onChange={e => { setFormEducacion(p => p.map((x, j) => j === i ? { ...x, periodo: e.target.value } : x)); setFormConfirmed(false); setProfileText('') }}
                      placeholder="Período (Ej: 2015 – 2019)" maxLength={60}
                      className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                      style={INPUT_ALT_STYLE} />
                  </div>
                ))}
              </div>

              {/* Habilidades */}
              <div>
                <label htmlFor="form-habilidades" className="text-xs font-semibold text-slate-600 uppercase tracking-wide block mb-1.5">
                  Habilidades principales{' '}
                  <span className="text-slate-400 font-normal normal-case tracking-normal">(opcional)</span>
                </label>
                <input id="form-habilidades" type="text" value={formHabilidades}
                  onChange={e => { setFormHabilidades(e.target.value); setFormConfirmed(false); setProfileText('') }}
                  placeholder="Ej: React, Gestión de equipos, Análisis de datos, Inglés avanzado"
                  maxLength={400}
                  className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                  style={INPUT_STYLE} />
              </div>

              {/* Botón confirmar */}
              <button
                onClick={handleFormConfirm}
                disabled={!formTitular.trim() || formConfirmed}
                className="w-full py-3 rounded-xl font-semibold text-sm transition-all duration-200"
                style={formConfirmed
                  ? { background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.35)', color: '#16a34a', cursor: 'default' }
                  : formTitular.trim()
                    ? { background: LI_GRADIENT, color: '#fff', cursor: 'pointer' }
                    : { background: 'rgba(0,119,181,0.06)', border: '1px solid rgba(0,119,181,0.12)', color: '#94a3b8', cursor: 'not-allowed' }
                }
              >
                {formConfirmed ? '✅ Datos listos — podés analizar tu perfil' : 'Usar estos datos →'}
              </button>
            </div>
          )}

          {/* ── MODO SIN PERFIL ── */}
          {inputMode === 'sinperfil' && (
            <div className="space-y-4">
              <div className="rounded-2xl p-5 space-y-3"
                style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.18)' }}>
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#6366f1' }}>
                  ¿No tenés el PDF a mano?
                </p>
                <p className="text-slate-600 text-sm leading-relaxed">
                  Realizá la evaluación inicial con las respuestas del cuestionario. El diagnóstico completo requiere el PDF.
                </p>
                <ul className="space-y-1.5">
                  {['Titular propuesto con keywords de tu sector', 'Resumen con propuesta de valor clara', 'Palabras clave para aparecer en búsquedas'].map(t => (
                    <li key={t} className="flex items-start gap-2 text-xs text-slate-600">
                      <span className="text-indigo-500 shrink-0 mt-0.5">✓</span>{t}
                    </li>
                  ))}
                </ul>
              </div>
              <button
                onClick={() => { setSinPerfilMode(true); setProfileText('SIN_PERFIL') }}
                className="w-full py-3.5 rounded-2xl font-semibold text-white btn-glow"
                style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
              >
                Generar mi diagnóstico base →
              </button>
              {sinPerfilMode && (
                <p className="text-xs text-center text-emerald-600 font-medium">
                  ✓ Listo — podés analizar tu perfil sin subir nada
                </p>
              )}
            </div>
          )}
      </>

      {/* Resumen de respuestas */}
      <div className="rounded-xl p-4"
        style={{ backgroundColor: 'rgba(0,119,181,0.06)', border: '1px solid rgba(0,119,181,0.2)' }}>
        <p className="text-xs uppercase tracking-wide mb-3" style={{ color: '#0077B5' }}>Tu contexto recopilado</p>
        <div className="space-y-0">
          {qaHistory.map((h, i) => (
            <div key={i} className="py-2 border-b last:border-0" style={{ borderColor: 'rgba(0,119,181,0.10)' }}>
              <p className="text-slate-500 text-xs leading-snug">
                {STATIC_QUESTIONS[i]?.id ?? `Pregunta ${i + 1}`}
              </p>
              <p className="text-slate-900 text-xs font-medium mt-0.5 pl-3 leading-relaxed">→ {h.answer}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Analysis error */}
      {analysisError && (
        <div role="alert" className="rounded-xl p-4 text-sm space-y-2"
          style={{ backgroundColor: 'rgba(254,226,226,0.8)', border: '1px solid #fca5a5', color: '#b91c1c' }}>
          <p>⚠️ {analysisError}</p>
          <button
            onClick={callGemini}
            disabled={(!profileText && !sinPerfilMode) || analyzing}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all duration-200"
            style={{
              background: 'rgba(185,28,28,0.1)',
              border: '1px solid rgba(185,28,28,0.3)',
              color: '#b91c1c',
              opacity: profileText && !analyzing ? 1 : 0.5,
              cursor: profileText && !analyzing ? 'pointer' : 'not-allowed',
            }}
          >
            ↺ Reintentar análisis
          </button>
        </div>
      )}

      <div className="flex gap-3 pt-1">
        <button
          onClick={() => { handleBack(); setStep(STEPS.QUESTIONS) }}
          className="flex-1 font-semibold py-3.5 rounded-2xl transition-all duration-200"
          style={BTN_BACK_STYLE}
        >
          ← Atrás
        </button>
        <button
          disabled={!profileText || analyzing}
          onClick={callGemini}
          className={`flex-[2] font-semibold py-3.5 rounded-2xl transition-all duration-200 text-white ${profileText && !analyzing ? 'btn-glow' : ''}`}
          style={{
            background: profileText && !analyzing ? LI_GRADIENT : 'rgba(0,119,181,0.08)',
            opacity: profileText && !analyzing ? 1 : 0.5,
            cursor: profileText && !analyzing ? 'pointer' : 'not-allowed',
            border: profileText && !analyzing ? 'none' : '1px solid rgba(0,119,181,0.12)',
            color: profileText && !analyzing ? '#fff' : '#64748b',
          }}
        >
          {analyzing ? 'Analizando...' : 'Analizar mi perfil ✦'}
        </button>
      </div>
    </div>
  )
}

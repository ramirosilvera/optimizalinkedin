import { useEffect } from 'react'
import { buildCvHtml } from '../../cv/templates'
import { STEPS, LI_GRADIENT, BTN_BACK_STYLE, BTN_GHOST_STYLE, trackEvent } from '../../constants'
import { Logo, Spinner, TagInput } from '../ui'
import RateLimitUI from '../RateLimitUI'

export default function CvScreen({
  result,
  cvStage,
  setCvStage,
  cvFinalData,
  setCvFinalData,
  cvQuality,
  cvDraft,
  setCvDraft,
  setCvQuality,
  cvPreviewHtml,
  setCvPreviewHtml,
  showCvPreview,
  setShowCvPreview,
  callGenerateCV,
  callRegenerateCV,
  cvLoading,
  cvError,
  cvGapAnswers,
  setCvGapAnswers,
  cvTemplate,
  setCvTemplate,
  profilePhoto,
  setProfilePhoto,
  profilePhotoMime,
  setProfilePhotoMime,
  profilePhotoPreview,
  setProfilePhotoPreview,
  handleCvPhotoUpload,
  openCvPreview,
  exportCvPdf,
  cvExportState,
  cvEditing,
  setCvEditing,
  updateCv,
  cvSuccess,
  cvOptimizePhase,
  setCvOptimizePhase,
  showCvOptimizePanel,
  setShowCvOptimizePanel,
  cvOptimizing,
  startCvConsultation,
  cvOptimizeQuestions,
  setCvOptimizeQuestions,
  cvOptimizeAnswers,
  setCvOptimizeAnswers,
  callOptimizeCv,
  cvOptimizeError,
  cvOptimizeSuggestion,
  setCvOptimizeSuggestion,
  cvOptimizeApplied,
  setCvOptimizeApplied,
  cvBeforeOptimize,
  setCvBeforeOptimize,
  setJobCvForAdapter,
  setJobPosting,
  setJobResult,
  setJobError,
  setShowJobModal,
  rateLimitEvento,
  rateLimitSecs,
  waitlistEmail,
  setWaitlistEmail,
  waitlistSent,
  waitlistLoading,
  handleWaitlist,
  user,
  setShowPremiumModal,
  setStep,
}) {
  return (
    <div className="step-transition space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => setStep(STEPS.RESULTS)}
          className="text-sm font-medium transition-all shrink-0"
          style={BTN_BACK_STYLE}
        >
          ← Diagnóstico
        </button>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(5,150,105,0.1)', color: '#059669' }}>Paso 3</span>
          {cvStage === 'done' && (
            <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(124,58,237,0.08)', color: '#7c3aed' }}>→ Paso 4</span>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">CV Inteligente</h1>
          <p className="text-xs text-slate-500 mt-0.5">Paso 3 del proceso · Construido desde tu análisis</p>
        </div>
        {cvQuality && (
          <div className="shrink-0 flex flex-col items-center justify-center w-12 h-12 rounded-full font-black"
            style={{ background: 'rgba(5,150,105,0.12)', border: '1.5px solid rgba(5,150,105,0.30)', color: '#059669' }}>
            <span className="text-base leading-none">{cvQuality.score}</span>
            <span className="text-[9px] text-slate-500 font-normal">/10</span>
          </div>
        )}
      </div>

      {/* ══ CV inteligente pipeline ══ */}
      <div className="space-y-3">
        {/* Botón manual — solo si el pipeline está idle Y no hay auto-generación en curso */}
        {cvStage === 'idle' && !cvLoading && (
          <div className="space-y-1.5">
            <button
              onClick={() => callGenerateCV({})}
              disabled={cvLoading}
              className="w-full font-semibold py-4 rounded-xl transition-all duration-200 text-white text-sm"
              style={{ background: 'linear-gradient(135deg,#059669,#10b981)' }}
            >
              📄 Generá tu CV moderno de 1 página
            </button>
            <p className="text-center text-xs text-slate-500">
              Gratis · ATS-compatible · Con foto · Listo para imprimir
            </p>
          </div>
        )}

        {/* Loading states — pipeline progress bar */}
        {(cvStage === 'drafting' || cvStage === 'regenerating') && (() => {
          const cvPipeline = [
            { label: 'Generando', stage: 'drafting', sub: 'Creando y revisando tu CV con criterio de headhunter' },
            { label: 'Mejorando', stage: 'regenerating', sub: 'Integrando la información que nos diste' },
          ]
          const activeIdx = cvPipeline.findIndex(s => s.stage === cvStage)
          const active = cvPipeline[activeIdx]
          return (
            <div className="rounded-2xl p-5 space-y-4"
              style={{ background: 'rgba(0,119,181,0.04)', border: '1px solid rgba(0,119,181,0.12)' }}>
              {/* Step bar */}
              <div className="flex items-center gap-1">
                {cvPipeline.map((s, i) => (
                  <div key={s.stage} className="flex items-center gap-1 flex-1 min-w-0">
                    <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
                      <div className={`w-full h-1.5 rounded-full transition-all duration-700 ${i < activeIdx ? 'opacity-100' : i === activeIdx ? 'opacity-100' : 'opacity-30'}`}
                        style={{ background: i <= activeIdx ? 'linear-gradient(90deg,#0077B5,#0ea5e9)' : 'rgba(0,119,181,0.18)' }} />
                      <span className="text-[10px] font-medium truncate w-full text-center"
                        style={{ color: i === activeIdx ? '#0077B5' : i < activeIdx ? '#64748b' : '#cbd5e1' }}>
                        {s.label}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              {/* Spinner + message */}
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 shrink-0 border-2 rounded-full animate-spin" style={{ borderColor: 'rgba(0,119,181,0.2)', borderTopColor: '#0077B5' }} />
                <div>
                  <p className="text-sm font-medium text-slate-700">{active?.label}...</p>
                  <p className="text-xs text-slate-400">{active?.sub}</p>
                </div>
              </div>
            </div>
          )
        })()}

        {/* Gap Form — calidad insuficiente, pedir más info */}
        {cvStage === 'gap_form' && cvQuality && (
          <div className="rounded-2xl overflow-hidden"
            style={{ border: '1px solid rgba(245,158,11,0.30)', boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}>
            {/* Header con score y nota consultor */}
            <div className="px-5 py-4 space-y-3"
              style={{ background: 'linear-gradient(135deg,rgba(245,158,11,0.08),rgba(234,88,12,0.05))' }}>
              <div className="flex items-center gap-4">
                <div className="shrink-0 w-12 h-12 rounded-full flex flex-col items-center justify-center font-black"
                  style={{ background: 'rgba(245,158,11,0.12)', border: '1.5px solid rgba(245,158,11,0.30)', color: '#d97706' }}>
                  <span className="text-lg leading-none">{cvQuality.score}</span>
                  <span className="text-[9px] text-slate-500 font-normal">/10</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">Puntaje {cvQuality.score}/10 — podemos mejorarlo</p>
                  <p className="text-xs text-slate-500 mt-0.5">{cvQuality.nota_consultor || 'Respondé estas preguntas para agregar datos reales que potencien tu CV'}</p>
                </div>
              </div>
              {cvQuality.fortalezas?.length > 0 && (
                <div className="space-y-1 border-t pt-3" style={{ borderColor: 'rgba(245,158,11,0.15)' }}>
                  <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: '#d97706' }}>Lo que ya está bien</p>
                  {cvQuality.fortalezas.map((f, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <span className="text-emerald-500 shrink-0 text-xs">✓</span>
                      <p className="text-xs text-slate-600 leading-snug">{f}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* Preguntas de gaps */}
            <div className="px-5 py-4 space-y-5" style={{ background: 'white' }}>
              {(cvQuality.gaps || []).map((gap) => (
                <div key={gap.id} className="space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 mt-0.5"
                      style={{ background: gap.impacto === 'Alto' ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)', color: gap.impacto === 'Alto' ? '#dc2626' : '#d97706', border: `1px solid ${gap.impacto === 'Alto' ? 'rgba(239,68,68,0.20)' : 'rgba(245,158,11,0.20)'}` }}>
                      {gap.impacto}
                    </span>
                    <p className="text-sm font-medium text-slate-800 leading-snug">{gap.pregunta}</p>
                  </div>
                  <p className="text-xs text-slate-400 pl-px">{gap.campo}</p>
                  <input
                    type="text"
                    value={cvGapAnswers[gap.id] || ''}
                    onChange={e => setCvGapAnswers(prev => ({ ...prev, [gap.id]: e.target.value }))}
                    placeholder={gap.placeholder || 'Tu respuesta...'}
                    className="w-full rounded-xl px-4 py-2.5 text-sm text-slate-800 outline-none transition-all"
                    style={{ background: '#f8fafc', border: `1px solid ${cvGapAnswers[gap.id]?.trim() ? 'rgba(0,119,181,0.40)' : 'rgba(0,119,181,0.15)'}` }}
                  />
                </div>
              ))}
              {rateLimitEvento === 'cv' && <RateLimitUI secs={rateLimitSecs} evento={rateLimitEvento} email={waitlistEmail} onEmailChange={setWaitlistEmail} sent={waitlistSent} loading={waitlistLoading} onSubmit={handleWaitlist} />}
              {cvError && !rateLimitEvento && <p className="text-xs text-red-500">{cvError}</p>}
              <div className="flex flex-col gap-2 pt-1">
                <button
                  onClick={() => callRegenerateCV(cvGapAnswers)}
                  disabled={cvLoading || !(cvQuality.gaps || []).filter(g => g.impacto === 'Alto').every(g => cvGapAnswers[g.id]?.trim())}
                  className="w-full py-3.5 rounded-xl text-sm font-semibold text-white transition-all"
                  style={{
                    background: (cvQuality.gaps || []).filter(g => g.impacto === 'Alto').every(g => cvGapAnswers[g.id]?.trim()) ? 'linear-gradient(135deg,#0077B5,#0ea5e9)' : '#94a3b8',
                    opacity: cvLoading ? 0.7 : 1,
                  }}
                >
                  Incorporar estos datos al CV →
                </button>
                <button
                  onClick={() => { setCvFinalData(cvDraft); setCvStage('done'); setCvPreviewHtml(buildCvHtml(cvDraft, profilePhoto, profilePhotoMime, cvTemplate)); setShowCvPreview(true); trackEvent('cv_gap_skipped') }}
                  className="w-full py-2.5 rounded-xl text-xs text-slate-400 transition-all hover:text-slate-600"
                  style={{ background: 'transparent' }}
                >
                  Ver el borrador actual
                </button>
              </div>
            </div>
          </div>
        )}

        {/* CV listo — score + revisión consultor + botón imprimir */}
        {cvStage === 'done' && cvFinalData && (
          <div className="space-y-3">
            {/* Template picker */}
            <div className="rounded-2xl p-3 space-y-2"
              style={{ background: 'rgba(0,119,181,0.04)', border: '1px solid rgba(0,119,181,0.14)' }}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-slate-700">Diseño del CV</p>
                {cvTemplate && (
                  <span className="text-[10px] text-slate-400">
                    {{
                      clasico:   'Corporativo · ATS',
                      minimal:   'ATS puro · Limpio',
                      ejecutivo: 'Liderazgo · Senior',
                      tech:      'IT · Startups',
                      creativo:  'Diseño · Marketing',
                    }[cvTemplate]}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {[
                  { id: 'clasico',   label: 'Clásico',   color: '#0d2137', sub: 'Corporativo' },
                  { id: 'minimal',   label: 'Minimal',   color: '#374151', sub: 'ATS puro' },
                  { id: 'ejecutivo', label: 'Ejecutivo', color: '#1e293b', sub: 'Liderazgo' },
                  { id: 'tech',      label: 'Tech',      color: '#134e4a', sub: 'IT / Dev' },
                  { id: 'creativo',  label: 'Creativo',  color: '#7c3aed', sub: 'Diseño' },
                ].map(t => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setCvTemplate(t.id)
                      if (cvFinalData && showCvPreview) setCvPreviewHtml(buildCvHtml(cvFinalData, profilePhoto, profilePhotoMime, t.id))
                    }}
                    className="flex flex-col items-center gap-1 py-2 px-1 rounded-xl border transition-all text-center"
                    style={{
                      background: cvTemplate === t.id ? 'rgba(0,119,181,0.12)' : '#f8fafc',
                      borderColor: cvTemplate === t.id ? 'rgba(0,119,181,0.5)' : 'rgba(0,0,0,0.08)',
                    }}
                  >
                    <div className="w-full h-5 rounded-sm" style={{ background: t.color }} />
                    <span className="text-[9px] text-slate-600 font-medium leading-tight">{t.label}</span>
                  </button>
                ))}
              </div>
            </div>
            {/* Cuando el CV se restauró desde historial sin análisis asociado */}
            {!result && (
              <div className="flex gap-2">
                <button
                  onClick={() => setStep(STEPS.MODE_SELECT)}
                  className="flex-1 py-3 rounded-xl text-sm font-medium"
                  style={BTN_BACK_STYLE}>
                  ← Menú
                </button>
                <button
                  onClick={() => { setCvStage('idle'); setCvFinalData(null); setCvPreviewHtml(''); setShowCvPreview(false); setStep(STEPS.MODE_SELECT) }}
                  className="flex-[2] py-3 rounded-xl text-sm font-medium"
                  style={BTN_BACK_STYLE}>
                  ↺ Hacer nuevo análisis
                </button>
              </div>
            )}
            {cvQuality && (
              <div className="rounded-2xl overflow-hidden"
                style={{ border: `1px solid ${cvQuality.score >= 8 ? 'rgba(34,197,94,0.25)' : 'rgba(0,119,181,0.18)'}` }}>
                {/* Score header */}
                <div className="flex items-center gap-3 px-4 py-3"
                  style={{ background: cvQuality.score >= 8 ? 'rgba(34,197,94,0.06)' : 'rgba(0,119,181,0.05)' }}>
                  <div className="shrink-0 w-12 h-12 rounded-full flex flex-col items-center justify-center font-black"
                    style={{ background: cvQuality.score >= 8 ? 'rgba(34,197,94,0.12)' : 'rgba(0,119,181,0.10)', color: cvQuality.score >= 8 ? '#16a34a' : '#0077B5', border: `1.5px solid ${cvQuality.score >= 8 ? 'rgba(34,197,94,0.30)' : 'rgba(0,119,181,0.25)'}` }}>
                    <span className="text-lg leading-none">{cvQuality.score}</span>
                    <span className="text-[9px] text-slate-500 font-normal">/10</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-slate-800">CV {cvQuality.nivel}</p>
                      {cvQuality.riesgo_ats && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
                          style={{
                            background: cvQuality.riesgo_ats === 'Bajo' ? 'rgba(34,197,94,0.10)' : cvQuality.riesgo_ats === 'Alto' ? 'rgba(239,68,68,0.10)' : 'rgba(245,158,11,0.10)',
                            color: cvQuality.riesgo_ats === 'Bajo' ? '#16a34a' : cvQuality.riesgo_ats === 'Alto' ? '#dc2626' : '#d97706',
                          }}>
                          ATS {cvQuality.riesgo_ats}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 leading-snug">{cvQuality.nota_consultor || (cvQuality.score >= 8 ? 'Listo para enviar a reclutadores' : 'Generado con tu información real')}</p>
                  </div>
                </div>
                {/* Fortalezas del consultor */}
                {cvQuality.fortalezas?.length > 0 && (
                  <div className="px-4 py-3 space-y-1.5 border-t" style={{ borderColor: 'rgba(0,0,0,0.06)', background: 'white' }}>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Fortalezas del CV</p>
                    {cvQuality.fortalezas.map((f, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="text-emerald-500 shrink-0 mt-0.5 text-xs">✓</span>
                        <p className="text-xs text-slate-600 leading-snug">{f}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {/* Foto de perfil — prompt cuando se restaura desde historial */}
            <div className="rounded-2xl p-4 space-y-3"
              style={{ background: profilePhotoPreview ? 'rgba(5,150,105,0.05)' : 'rgba(0,119,181,0.05)', border: `1px solid ${profilePhotoPreview ? 'rgba(5,150,105,0.2)' : 'rgba(0,119,181,0.18)'}` }}>
              <p className="text-xs font-semibold text-slate-700">
                {profilePhotoPreview ? '📸 Foto de perfil cargada' : '📸 ¿Querés agregar tu foto de perfil al CV?'}
              </p>
              {!profilePhotoPreview && (
                <p className="text-xs text-slate-500">Las fotos no se guardan en el historial. Podés cargarla ahora o continuar sin ella.</p>
              )}
              <div className="flex items-center gap-3">
                {profilePhotoPreview && (
                  <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 relative"
                    style={{ border: '2px solid rgba(5,150,105,0.4)' }}>
                    <img src={profilePhotoPreview} alt="Foto" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                )}
                <label htmlFor="cv-done-photo" className="cursor-pointer px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={{ background: 'rgba(0,119,181,0.12)', color: '#0077B5', border: '1px solid rgba(0,119,181,0.25)' }}>
                  {profilePhotoPreview ? 'Cambiar foto' : 'Cargar foto'}
                </label>
                <input id="cv-done-photo" type="file" accept="image/*" className="hidden" onChange={handleCvPhotoUpload} />
                {profilePhotoPreview && (
                  <button onClick={() => { setProfilePhotoPreview(null); setProfilePhoto(null); setProfilePhotoMime('image/jpeg'); if (cvFinalData && showCvPreview) setCvPreviewHtml(buildCvHtml(cvFinalData, null, 'image/jpeg', cvTemplate)) }}
                    className="text-xs transition-colors" style={{ color: '#94a3b8' }}>
                    ✕ Quitar
                  </button>
                )}
              </div>
            </div>

            {/* ── CV Editor ── */}
            <div>
              <button
                onClick={() => setCvEditing(prev => !prev)}
                className="w-full py-3 rounded-xl text-sm font-semibold transition-all"
                style={{
                  background: cvEditing ? 'rgba(245,158,11,0.10)' : 'rgba(0,119,181,0.07)',
                  border: `1px solid ${cvEditing ? 'rgba(245,158,11,0.35)' : 'rgba(0,119,181,0.20)'}`,
                  color: cvEditing ? '#d97706' : '#0077B5',
                }}
              >
                {cvEditing ? '✓ Cerrar editor' : '✏️ Editar CV'}
              </button>

              {cvEditing && cvFinalData && (
                <div className="mt-3 rounded-2xl p-4 space-y-5"
                  style={{ background: 'rgba(254,252,232,0.6)', border: '1px solid rgba(245,158,11,0.25)' }}>

                  {/* Datos personales */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#d97706' }}>Datos personales</p>
                    <input className="w-full px-3 py-2 rounded-lg text-sm border bg-white focus:outline-none"
                      style={{ borderColor: 'rgba(0,0,0,0.12)' }}
                      placeholder="Nombre completo"
                      value={cvFinalData.nombre || ''}
                      onChange={e => updateCv({ ...cvFinalData, nombre: e.target.value })}
                    />
                    <textarea className="w-full px-3 py-2 rounded-lg text-sm border bg-white resize-none focus:outline-none"
                      style={{ borderColor: 'rgba(0,0,0,0.12)' }}
                      placeholder="Titular / Rol profesional"
                      rows={2}
                      value={cvFinalData.titular || ''}
                      onChange={e => updateCv({ ...cvFinalData, titular: e.target.value })}
                    />
                    <textarea className="w-full px-3 py-2 rounded-lg text-sm border bg-white resize-none focus:outline-none"
                      style={{ borderColor: 'rgba(0,0,0,0.12)' }}
                      placeholder="Resumen profesional (2 oraciones máx.)"
                      rows={3}
                      value={cvFinalData.resumen || ''}
                      onChange={e => updateCv({ ...cvFinalData, resumen: e.target.value })}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { field: 'email',    ph: 'Email' },
                        { field: 'telefono', ph: 'Teléfono' },
                        { field: 'linkedin', ph: 'URL LinkedIn' },
                        { field: 'ubicacion',ph: 'Ciudad / País' },
                      ].map(({ field, ph }) => (
                        <input key={field}
                          className="px-2 py-1.5 rounded-lg text-xs border bg-white focus:outline-none"
                          style={{ borderColor: 'rgba(0,0,0,0.12)' }}
                          placeholder={ph}
                          value={cvFinalData[field] || ''}
                          onChange={e => updateCv({ ...cvFinalData, [field]: e.target.value || null })}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Experiencias */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#d97706' }}>Experiencia</p>
                      <button
                        onClick={() => updateCv({ ...cvFinalData, experiencias: [...(cvFinalData.experiencias || []), { cargo: '', empresa: '', periodo: '', logros: [''] }] })}
                        className="text-xs px-2 py-1 rounded-lg font-semibold"
                        style={{ background: 'rgba(245,158,11,0.12)', color: '#d97706', border: '1px solid rgba(245,158,11,0.3)' }}
                      >+ Agregar</button>
                    </div>
                    {(cvFinalData.experiencias || []).map((exp, i) => (
                      <div key={i} className="rounded-xl p-3 space-y-2 relative bg-white"
                        style={{ border: '1px solid rgba(0,0,0,0.08)' }}>
                        <button
                          onClick={() => updateCv({ ...cvFinalData, experiencias: cvFinalData.experiencias.filter((_, idx) => idx !== i) })}
                          className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center text-[10px]"
                          style={{ background: 'rgba(239,68,68,0.10)', color: '#ef4444' }}
                        >✕</button>
                        <div className="grid grid-cols-2 gap-2 pr-6">
                          <input className="px-2 py-1.5 rounded-lg text-xs border focus:outline-none"
                            style={{ borderColor: 'rgba(0,0,0,0.12)' }}
                            placeholder="Cargo"
                            value={exp.cargo || ''}
                            onChange={e => { const xs = cvFinalData.experiencias.map((x, xi) => xi === i ? { ...x, cargo: e.target.value } : x); updateCv({ ...cvFinalData, experiencias: xs }) }}
                          />
                          <input className="px-2 py-1.5 rounded-lg text-xs border focus:outline-none"
                            style={{ borderColor: 'rgba(0,0,0,0.12)' }}
                            placeholder="Empresa"
                            value={exp.empresa || ''}
                            onChange={e => { const xs = cvFinalData.experiencias.map((x, xi) => xi === i ? { ...x, empresa: e.target.value } : x); updateCv({ ...cvFinalData, experiencias: xs }) }}
                          />
                        </div>
                        <input className="w-full px-2 py-1.5 rounded-lg text-xs border focus:outline-none"
                          style={{ borderColor: 'rgba(0,0,0,0.12)' }}
                          placeholder="Período (ej: mar 2020 – dic 2023)"
                          value={exp.periodo || ''}
                          onChange={e => { const xs = cvFinalData.experiencias.map((x, xi) => xi === i ? { ...x, periodo: e.target.value } : x); updateCv({ ...cvFinalData, experiencias: xs }) }}
                        />
                        <div className="space-y-1.5">
                          <p className="text-[10px] text-slate-400 font-medium">Logros</p>
                          {(exp.logros || []).map((logro, j) => (
                            <div key={j} className="flex gap-1.5 items-start">
                              <textarea
                                className="flex-1 px-2 py-1.5 rounded-lg text-xs border resize-none focus:outline-none"
                                style={{ borderColor: 'rgba(0,0,0,0.12)' }}
                                rows={2}
                                placeholder="Describí un logro concreto..."
                                value={logro}
                                onChange={e => {
                                  const xs = cvFinalData.experiencias.map((x, xi) => {
                                    if (xi !== i) return x
                                    return { ...x, logros: x.logros.map((l, li) => li === j ? e.target.value : l) }
                                  })
                                  updateCv({ ...cvFinalData, experiencias: xs })
                                }}
                              />
                              {(exp.logros || []).length > 1 && (
                                <button
                                  onClick={() => {
                                    const xs = cvFinalData.experiencias.map((x, xi) => xi !== i ? x : { ...x, logros: x.logros.filter((_, li) => li !== j) })
                                    updateCv({ ...cvFinalData, experiencias: xs })
                                  }}
                                  className="mt-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0"
                                  style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444' }}
                                >✕</button>
                              )}
                            </div>
                          ))}
                          <button
                            onClick={() => {
                              const xs = cvFinalData.experiencias.map((x, xi) => xi === i ? { ...x, logros: [...(x.logros || []), ''] } : x)
                              updateCv({ ...cvFinalData, experiencias: xs })
                            }}
                            className="text-[10px] px-2 py-1 rounded font-semibold"
                            style={{ background: 'rgba(0,119,181,0.08)', color: '#0077B5' }}
                          >+ logro</button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Educación */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#d97706' }}>Educación</p>
                      <button
                        onClick={() => updateCv({ ...cvFinalData, educacion: [...(cvFinalData.educacion || []), { titulo: '', institucion: '', periodo: '' }] })}
                        className="text-xs px-2 py-1 rounded-lg font-semibold"
                        style={{ background: 'rgba(245,158,11,0.12)', color: '#d97706', border: '1px solid rgba(245,158,11,0.3)' }}
                      >+ Agregar</button>
                    </div>
                    {(cvFinalData.educacion || []).map((ed, i) => (
                      <div key={i} className="rounded-xl p-3 space-y-2 relative bg-white"
                        style={{ border: '1px solid rgba(0,0,0,0.08)' }}>
                        <button
                          onClick={() => updateCv({ ...cvFinalData, educacion: cvFinalData.educacion.filter((_, idx) => idx !== i) })}
                          className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center text-[10px]"
                          style={{ background: 'rgba(239,68,68,0.10)', color: '#ef4444' }}
                        >✕</button>
                        <input className="w-full px-2 py-1.5 rounded-lg text-xs border focus:outline-none pr-6"
                          style={{ borderColor: 'rgba(0,0,0,0.12)' }}
                          placeholder="Título / Carrera"
                          value={ed.titulo || ''}
                          onChange={e => { const xs = cvFinalData.educacion.map((x, xi) => xi === i ? { ...x, titulo: e.target.value } : x); updateCv({ ...cvFinalData, educacion: xs }) }}
                        />
                        <input className="w-full px-2 py-1.5 rounded-lg text-xs border focus:outline-none"
                          style={{ borderColor: 'rgba(0,0,0,0.12)' }}
                          placeholder="Institución"
                          value={ed.institucion || ''}
                          onChange={e => { const xs = cvFinalData.educacion.map((x, xi) => xi === i ? { ...x, institucion: e.target.value } : x); updateCv({ ...cvFinalData, educacion: xs }) }}
                        />
                        <input className="w-full px-2 py-1.5 rounded-lg text-xs border focus:outline-none"
                          style={{ borderColor: 'rgba(0,0,0,0.12)' }}
                          placeholder="Período (ej: 2014 – 2019)"
                          value={ed.periodo || ''}
                          onChange={e => { const xs = cvFinalData.educacion.map((x, xi) => xi === i ? { ...x, periodo: e.target.value } : x); updateCv({ ...cvFinalData, educacion: xs }) }}
                        />
                      </div>
                    ))}
                  </div>

                  {/* Habilidades */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#d97706' }}>Habilidades</p>
                    <div className="flex flex-wrap gap-1.5 mb-1.5">
                      {(cvFinalData.habilidades || []).map((h, i) => (
                        <span key={i} className="flex items-center gap-1 text-xs px-2 py-1 rounded-full"
                          style={{ background: 'rgba(0,119,181,0.10)', color: '#0077B5', border: '1px solid rgba(0,119,181,0.25)' }}>
                          {h}
                          <button onClick={() => updateCv({ ...cvFinalData, habilidades: cvFinalData.habilidades.filter((_, idx) => idx !== i) })}
                            style={{ color: '#94a3b8', fontSize: '9px', marginLeft: '2px', lineHeight: 1 }}>✕</button>
                        </span>
                      ))}
                    </div>
                    <TagInput placeholder="Nueva habilidad → Enter" onAdd={tag => updateCv({ ...cvFinalData, habilidades: [...(cvFinalData.habilidades || []), tag] })} />
                  </div>

                  {/* Idiomas */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#d97706' }}>Idiomas</p>
                    <div className="flex flex-wrap gap-1.5 mb-1.5">
                      {(cvFinalData.idiomas || []).map((id, i) => (
                        <span key={i} className="flex items-center gap-1 text-xs px-2 py-1 rounded-full"
                          style={{ background: 'rgba(99,102,241,0.08)', color: '#6366f1', border: '1px solid rgba(99,102,241,0.25)' }}>
                          {id}
                          <button onClick={() => updateCv({ ...cvFinalData, idiomas: cvFinalData.idiomas.filter((_, idx) => idx !== i) })}
                            style={{ color: '#94a3b8', fontSize: '9px', marginLeft: '2px', lineHeight: 1 }}>✕</button>
                        </span>
                      ))}
                    </div>
                    <TagInput placeholder="Nuevo idioma → Enter" onAdd={tag => updateCv({ ...cvFinalData, idiomas: [...(cvFinalData.idiomas || []), tag] })} />
                  </div>

                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex gap-2">
                <button
                  onClick={openCvPreview}
                  className="flex-1 py-3 rounded-xl text-sm font-semibold transition-all"
                  style={{ background: 'rgba(0,119,181,0.08)', border: '1px solid rgba(0,119,181,0.25)', color: '#0077B5' }}>
                  👁 Vista previa
                </button>
                <button
                  onClick={exportCvPdf}
                  disabled={cvExportState === 'loading'}
                  className="flex-1 py-3 rounded-xl text-sm font-semibold text-white transition-all flex items-center justify-center gap-2"
                  style={{ background: cvExportState === 'loading' ? 'rgba(5,150,105,0.45)' : 'linear-gradient(135deg,#059669,#10b981)' }}>
                  {cvExportState === 'loading'
                    ? <><span className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" /><span>Preparando…</span></>
                    : '📥 Exportar CV'}
                </button>
              </div>
              {cvSuccess && <p className="text-xs text-center" style={{ color: '#059669' }}>✓ {cvSuccess}</p>}
            </div>
            {/* ── Optimizar CV con IA — 2 fases ── */}
            {cvOptimizePhase === 'idle' && !showCvOptimizePanel && (
              <button
                onClick={startCvConsultation}
                disabled={cvOptimizing}
                className="w-full py-3.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2"
                style={{
                  background: 'rgba(245,158,11,0.10)',
                  border: '1px solid rgba(245,158,11,0.35)',
                  color: '#d97706',
                }}
              >
                ✨ Optimizar con IA
              </button>
            )}

            {/* Fase 1: cargando preguntas */}
            {cvOptimizePhase === 'loading_q' && (
              <div className="rounded-xl px-4 py-4 text-center space-y-2"
                style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.25)' }}>
                <div className="flex justify-center">
                  <span className="w-5 h-5 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
                </div>
                <p className="text-xs font-medium" style={{ color: '#b45309' }}>Consultora de empleabilidad analizando tu CV...</p>
              </div>
            )}

            {/* Fase 2: preguntas de consultoría */}
            {cvOptimizePhase === 'questions' && cvOptimizeQuestions.length > 0 && (
              <div className="rounded-2xl overflow-hidden"
                style={{ border: '1.5px solid rgba(245,158,11,0.30)', background: 'rgba(254,252,232,0.6)' }}>
                <div className="px-4 py-3 flex items-start gap-3"
                  style={{ background: 'rgba(245,158,11,0.12)', borderBottom: '1px solid rgba(245,158,11,0.18)' }}>
                  <span className="text-lg shrink-0 mt-0.5">✦</span>
                  <div>
                    <p className="text-sm font-bold" style={{ color: '#92400e' }}>
                      Consultora de empleabilidad
                    </p>
                    <p className="text-xs mt-0.5 leading-relaxed" style={{ color: '#b45309' }}>
                      Respondé {cvOptimizeQuestions.length} pregunta{cvOptimizeQuestions.length > 1 ? 's' : ''} para que la IA incorpore datos reales en tu CV
                    </p>
                  </div>
                </div>
                <div className="px-4 py-4 space-y-4 bg-white">
                  {cvOptimizeQuestions.map((q, i) => (
                    <div key={q.id} className="space-y-2">
                      <div className="flex items-start gap-2.5">
                        <span className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0 mt-0.5"
                          style={{ background: 'linear-gradient(135deg,#d97706,#f59e0b)' }}>{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          {q.contexto && (
                            <p className="text-[10px] font-semibold uppercase tracking-wide mb-0.5 text-slate-500">{q.contexto}</p>
                          )}
                          <p className="text-sm font-medium text-slate-800 leading-snug">{q.pregunta}</p>
                        </div>
                      </div>
                      <input
                        type="text"
                        value={cvOptimizeAnswers[q.id] || ''}
                        onChange={e => setCvOptimizeAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                        placeholder={q.placeholder || 'Tu respuesta...'}
                        className="w-full rounded-xl px-4 py-2.5 text-sm text-slate-800 outline-none transition-all"
                        style={{ background: '#f8fafc', border: `1px solid ${cvOptimizeAnswers[q.id]?.trim() ? 'rgba(245,158,11,0.50)' : 'rgba(245,158,11,0.20)'}` }}
                      />
                    </div>
                  ))}
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => { setCvOptimizePhase('idle'); setCvOptimizeQuestions([]); setCvOptimizeAnswers({}) }}
                      className="flex-1 py-2.5 rounded-xl text-xs font-medium"
                      style={BTN_BACK_STYLE}>
                      Cancelar
                    </button>
                    <button
                      onClick={() => callOptimizeCv(cvOptimizeAnswers)}
                      disabled={cvOptimizing}
                      className="flex-[2] py-2.5 rounded-xl text-xs font-semibold text-white transition-all"
                      style={{ background: 'linear-gradient(135deg,#d97706,#f59e0b)' }}>
                      Optimizar con mis respuestas →
                    </button>
                  </div>
                  <button
                    onClick={() => callOptimizeCv({})}
                    className="w-full text-xs text-slate-400 hover:text-slate-600 transition-colors py-1"
                  >
                    Optimizar sin responder
                  </button>
                </div>
              </div>
            )}

            {/* Fase 3: optimizando */}
            {cvOptimizePhase === 'optimizing' && (
              <div className="rounded-xl px-4 py-4 text-center space-y-2"
                style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.25)' }}>
                <div className="flex justify-center">
                  <span className="w-5 h-5 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
                </div>
                <p className="text-xs font-medium" style={{ color: '#b45309' }}>Optimizando tu CV con los datos provistos...</p>
              </div>
            )}

            {cvOptimizeError && (
              <p className="text-xs text-red-500 text-center">{cvOptimizeError}</p>
            )}

            {/* ── Panel de comparación ── */}
            {showCvOptimizePanel && cvOptimizeSuggestion && (() => {
              const titularChanged = cvOptimizeSuggestion.titular !== cvFinalData?.titular
              const resumenChanged = cvOptimizeSuggestion.resumen !== cvFinalData?.resumen
              const bulletsChangedN = (cvOptimizeSuggestion.experiencias || []).filter((exp, i) => {
                const orig = (cvFinalData?.experiencias || [])[i]
                return orig && JSON.stringify(exp.logros) !== JSON.stringify(orig.logros)
              }).length
              const habilidadesChanged = JSON.stringify(cvOptimizeSuggestion.habilidades) !== JSON.stringify(cvFinalData?.habilidades)
              const totalChanges = (titularChanged ? 1 : 0) + (resumenChanged ? 1 : 0) + bulletsChangedN + (habilidadesChanged ? 1 : 0)
              return (
                <div className="rounded-2xl overflow-hidden"
                  style={{ border: '1.5px solid rgba(245,158,11,0.30)', background: 'rgba(254,252,232,0.5)' }}>
                  <div className="px-4 py-3 flex items-center justify-between"
                    style={{ background: 'rgba(245,158,11,0.10)', borderBottom: '1px solid rgba(245,158,11,0.18)' }}>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: '#92400e' }}>✨ CV optimizado — revisá los cambios</p>
                      <p className="text-xs mt-0.5" style={{ color: '#b45309' }}>Solo redacción — no se inventa información</p>
                    </div>
                    <button onClick={() => setShowCvOptimizePanel(false)}
                      className="text-amber-400 hover:text-amber-600 text-lg leading-none transition-colors">✕</button>
                  </div>
                  <div className="p-4 space-y-3">
                    {/* Titular antes/después */}
                    {titularChanged && (
                      <div className="space-y-1">
                        <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: '#d97706' }}>Titular</p>
                        <div className="rounded-lg p-2.5 text-xs text-slate-400 leading-snug line-through"
                          style={{ background: '#fef9f0', border: '1px solid rgba(245,158,11,0.12)' }}>
                          {cvFinalData?.titular}
                        </div>
                        <div className="rounded-lg p-2.5 text-xs text-slate-800 leading-snug font-medium"
                          style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.35)' }}>
                          ✓ {cvOptimizeSuggestion.titular}
                        </div>
                      </div>
                    )}
                    {/* Resumen antes/después */}
                    {resumenChanged && (
                      <div className="space-y-1">
                        <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: '#d97706' }}>Resumen profesional</p>
                        <div className="rounded-lg p-2.5 text-xs text-slate-400 leading-relaxed line-through"
                          style={{ background: '#fef9f0', border: '1px solid rgba(245,158,11,0.12)' }}>
                          {cvFinalData?.resumen}
                        </div>
                        <div className="rounded-lg p-2.5 text-xs text-slate-800 leading-relaxed"
                          style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.35)' }}>
                          ✓ {cvOptimizeSuggestion.resumen}
                        </div>
                      </div>
                    )}
                    {/* Bullets mejorados */}
                    {bulletsChangedN > 0 && (
                      <p className="text-xs py-2 px-3 rounded-lg font-medium" style={{ background: 'rgba(245,158,11,0.10)', color: '#92400e' }}>
                        ✓ {bulletsChangedN} experiencia{bulletsChangedN > 1 ? 's' : ''} con bullets mejorados — verbos de acción + impacto
                      </p>
                    )}
                    {/* Habilidades */}
                    {habilidadesChanged && (
                      <p className="text-xs py-2 px-3 rounded-lg font-medium" style={{ background: 'rgba(245,158,11,0.10)', color: '#92400e' }}>
                        ✓ Habilidades reordenadas por relevancia ATS
                      </p>
                    )}
                    {/* Fallback: si hubo cambios menores de redacción no visibles en el diff */}
                    {totalChanges === 0 && (
                      <p className="text-xs py-2 px-3 rounded-lg font-medium text-center" style={{ background: 'rgba(245,158,11,0.10)', color: '#92400e' }}>
                        ✓ Mejoras de redacción aplicadas — verbos, clichés y estructura
                      </p>
                    )}
                    {/* Acciones */}
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => { setShowCvOptimizePanel(false); setCvOptimizeSuggestion(null) }}
                        className="flex-1 py-2.5 rounded-xl text-xs font-medium"
                        style={BTN_BACK_STYLE}>
                        Descartar
                      </button>
                      <button
                        onClick={() => {
                          setCvBeforeOptimize({ ...cvFinalData })
                          updateCv(cvOptimizeSuggestion, 'optimizado')
                          setShowCvOptimizePanel(false)
                          setCvOptimizeSuggestion(null)
                          setCvOptimizeApplied(true)
                          trackEvent('cv_optimize_applied', { changes: totalChanges })
                        }}
                        className="flex-[2] py-2.5 rounded-xl text-xs font-semibold text-white"
                        style={{ background: 'linear-gradient(135deg,#d97706,#f59e0b)' }}>
                        ✓ Aplicar mejoras al CV
                      </button>
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* ── Confirmación post-apply + Deshacer ── */}
            {cvOptimizeApplied && cvBeforeOptimize && !showCvOptimizePanel && (
              <div className="rounded-xl px-4 py-3 flex items-center justify-between gap-3"
                style={{ background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.25)' }}>
                <p className="text-xs font-medium" style={{ color: '#16a34a' }}>✓ Mejoras aplicadas al CV</p>
                <button
                  onClick={() => { updateCv(cvBeforeOptimize); setCvBeforeOptimize(null); setCvOptimizeApplied(false) }}
                  className="text-xs px-3 py-1.5 rounded-lg shrink-0 font-medium transition-all"
                  style={{ background: 'rgba(239,68,68,0.08)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.25)' }}>
                  ↩ Deshacer
                </button>
              </div>
            )}

            {/* Job Adapter CTA — appears when cvFinalData exists */}
            {cvFinalData && (
              <button
                onClick={() => { setJobCvForAdapter(cvFinalData); setJobPosting(''); setJobResult(null); setJobError(''); setShowJobModal(true); trackEvent('job_adapter_opened') }}
                className="btn-glow w-full py-3.5 rounded-xl text-sm font-semibold transition-all text-white flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
              >
                📝 Adaptar este CV para una oferta →
              </button>
            )}
            <button
              onClick={() => { setCvStage('idle'); setCvDraft(null); setCvFinalData(null); setCvQuality(null); setCvPreviewHtml(''); setShowCvPreview(false) }}
              className="w-full py-2 rounded-xl text-xs text-slate-400 hover:text-slate-600 transition-all"
              style={{ background: 'transparent' }}
            >
              Generar nuevo CV
            </button>
          </div>
        )}

        {rateLimitEvento === 'cv' && <RateLimitUI secs={rateLimitSecs} evento={rateLimitEvento} email={waitlistEmail} onEmailChange={setWaitlistEmail} sent={waitlistSent} loading={waitlistLoading} onSubmit={handleWaitlist} />}
        {cvError && cvStage === 'idle' && !rateLimitEvento && <p className="text-xs text-red-500 text-center">{cvError}</p>}
      </div>

      {/* ── Post-CV save prompt (free users) ── */}
      {cvStage === 'done' && cvFinalData && !user && !localStorage.getItem('ol_at') && (
        <div className="rounded-2xl px-4 py-3 flex items-center justify-between gap-3"
          style={{ background: 'rgba(5,150,105,0.05)', border: '1px solid rgba(5,150,105,0.20)' }}>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-700">Tu CV está listo</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Guardalo antes de cerrar el browser — 7 días gratis</p>
          </div>
          <button
            onClick={() => setShowPremiumModal(true)}
            className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-xl text-white"
            style={{ background: 'linear-gradient(135deg,#059669,#10b981)' }}>
            Guardar →
          </button>
        </div>
      )}

      {/* Footer nav */}
      <div className="flex gap-2 pt-2">
        {result && (
          <button
            onClick={() => setStep(STEPS.RESULTS)}
            className="flex-1 font-medium py-3.5 rounded-2xl text-sm transition-all"
            style={BTN_BACK_STYLE}
          >
            ← Diagnóstico
          </button>
        )}
        <button
          onClick={() => { trackEvent('cv_go_to_roadmap'); setStep(STEPS.MODE_SELECT) }}
          className="flex-1 font-medium py-3.5 rounded-2xl text-sm transition-all"
          style={BTN_BACK_STYLE}
        >
          Mi hoja de ruta
        </button>
      </div>
    </div>
  )
}

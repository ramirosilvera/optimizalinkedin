import { STEPS, LI_GRADIENT, BTN_BACK_STYLE, RAMIRO_LINKEDIN_URL, COMPANY_LINKEDIN_URL, trackEvent } from '../../constants'
import { Logo, Spinner, LinkedInIcon, ScoreRing, ResultCard, BeforeAfter, CopyButton } from '../ui'

export default function ResultsScreen({
  result,
  cvStage,
  cvFinalData,
  callGenerateCV,
  setShowLeadModal,
  user,
  setShowPremiumModal,
  subscriptionLoading,
  setStep,
  resetInterview,
  setJobCvForAdapter,
  setJobPosting,
  setJobResult,
  setJobError,
  setShowJobModal,
  showGrowthSection,
  setShowGrowthSection,
  linkedinGrowth,
  setLinkedinGrowth,
  seguidores,
  setSeguidores,
  callLinkedinGrowth,
  growthLoading,
  growthError,
  setGrowthError,
  reset,
}) {
  return (
    <div className="step-transition space-y-5">
      <Logo />

      {/* ══ BLOQUE 1 — Score Hero ══ */}
      {result && (
        <div className="rounded-2xl overflow-hidden"
          style={{ background: 'linear-gradient(135deg,#0d2137 0%,#0a3d62 60%,#0077B5 100%)', boxShadow: '0 8px 32px rgba(0,119,181,0.30)' }}>
          <div className="px-4 pt-3 pb-0 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full"
              style={{ background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.75)' }}>
              ✓ Paso 1 — Diagnóstico
            </span>
            <button
              onClick={() => { trackEvent('results_go_to_roadmap'); setStep(STEPS.MODE_SELECT) }}
              className="text-[10px] font-semibold transition-opacity hover:opacity-80"
              style={{ color: 'rgba(255,255,255,0.55)' }}>
              Hoja de ruta →
            </button>
          </div>
          <div className="px-6 pt-6 pb-5 flex flex-col items-center gap-4 text-center">
            {/* Score ring — grande y central */}
            <div className="relative">
              <ScoreRing score={result.puntaje_general ?? 0} size={100} />
              {result.puntaje_general === null && (
                <div className="absolute inset-0 flex items-center justify-center w-24 h-24 rounded-full text-3xl"
                  style={{ background: 'rgba(255,255,255,0.08)' }}>💡</div>
              )}
            </div>
            {/* Nivel SEO badge */}
            {result.nivel_seo && (
              <span className="text-xs font-bold px-3 py-1 rounded-full"
                style={{
                  background: result.nivel_seo === 'Alto' ? 'rgba(74,222,128,0.20)' : result.nivel_seo === 'Medio' ? 'rgba(255,255,255,0.12)' : 'rgba(251,191,36,0.20)',
                  color: result.nivel_seo === 'Alto' ? '#4ade80' : result.nivel_seo === 'Medio' ? '#e2e8f0' : '#fbbf24',
                  border: `1px solid ${result.nivel_seo === 'Alto' ? 'rgba(74,222,128,0.35)' : result.nivel_seo === 'Medio' ? 'rgba(255,255,255,0.20)' : 'rgba(251,191,36,0.35)'}`,
                }}>
                SEO {result.nivel_seo}
              </span>
            )}
            {/* Diagnóstico breve */}
            <p className="text-sm leading-relaxed max-w-xs" style={{ color: 'rgba(226,232,240,0.90)' }}>
              {result.resumen_diagnostico || 'Análisis completado.'}
            </p>
            {result.puntaje_general === null && (
              <p className="text-[11px] leading-relaxed max-w-xs"
                style={{ color: 'rgba(226,232,240,0.55)', border: '1px solid rgba(99,102,241,0.30)', borderRadius: '10px', padding: '8px 12px', background: 'rgba(99,102,241,0.08)' }}>
                💡 Diagnóstico base con tus respuestas · Subí tu PDF de LinkedIn para el puntaje real
              </p>
            )}
          </div>
        </div>
      )}

      {/* ══ BLOQUE 2 — Diagnóstico estratégico ══ */}
      {result && (result.fortalezas?.length > 0 || result.areas_de_mejora?.length > 0) && (
        <div className="rounded-2xl overflow-hidden"
          style={{ border: '1px solid rgba(0,119,181,0.14)', background: 'white' }}>
          <div className="px-5 pt-4 pb-1 border-b" style={{ borderColor: 'rgba(0,119,181,0.08)' }}>
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#0077B5' }}>Diagnóstico estratégico</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-0 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
            <div className="px-5 py-4 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wide mb-2" style={{ color: '#16a34a' }}>✅ Fortalezas</p>
              {(result.fortalezas || []).map((f, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="mt-1 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#16a34a' }} />
                  <p className="text-slate-700 text-sm leading-snug">{f}</p>
                </div>
              ))}
            </div>
            <div className="px-5 py-4 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wide mb-2" style={{ color: '#d97706' }}>⚠️ Áreas de mejora</p>
              {(result.areas_de_mejora || []).map((a, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="mt-1 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#d97706' }} />
                  <p className="text-slate-700 text-sm leading-snug">{a}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══ BLOQUE 3 — Siguientes pasos del journey ══ */}
      {result && (
        <div className="space-y-2.5">
          {/* Journey context */}
          <div className="flex items-center justify-between px-1">
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#475569' }}>Tu proceso de carrera</p>
            <button
              onClick={() => { trackEvent('results_go_to_roadmap'); setStep(STEPS.MODE_SELECT) }}
              className="text-[10px] font-semibold transition-colors"
              style={{ color: '#0077B5' }}>
              Ver hoja de ruta →
            </button>
          </div>

          {/* Paso 3: CV — acción principal */}
          <button
            onClick={() => { trackEvent('cv_start_from_results', { cv_stage: cvStage }); if (cvStage === 'idle') callGenerateCV({}); setStep(STEPS.CV) }}
            className="btn-glow w-full rounded-2xl p-5 text-left transition-all hover:shadow-lg active:scale-[0.99]"
            style={{ background: 'linear-gradient(135deg,#059669,#10b981)', boxShadow: '0 4px 16px rgba(5,150,105,0.25)' }}
          >
            <div className="flex items-start gap-4">
              <span className="text-3xl shrink-0 mt-0.5">📄</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-white/20 text-white/90">Paso 3</span>
                  {cvFinalData && <span className="text-[10px] font-bold text-white/70">✓ Generado</span>}
                </div>
                <p className="text-base font-bold text-white leading-tight">
                  {cvStage === 'done' ? 'Ver mi CV generado →' : cvStage === 'idle' ? 'Generar mi CV →' : 'Ver CV generándose →'}
                </p>
                <p className="text-[11px] text-white/75 mt-0.5">ATS-compatible · 1 página · listo para enviar</p>
              </div>
            </div>
          </button>

          {/* Paso 2: Optimizar LinkedIn */}
          <button
            onClick={() => { trackEvent('results_scroll_optimize'); document.getElementById('mejorar-perfil')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}
            className="w-full rounded-2xl p-4 text-left transition-all hover:shadow-md active:scale-[0.99] flex items-center gap-3"
            style={{ background: 'rgba(14,165,233,0.05)', border: '1px solid rgba(14,165,233,0.22)' }}
          >
            <span className="text-xl shrink-0">✏️</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(14,165,233,0.1)', color: '#0ea5e9' }}>Paso 2</span>
              </div>
              <p className="text-xs font-bold text-slate-800 mt-0.5">Optimizar perfil LinkedIn</p>
              <p className="text-[10px] text-slate-500">Titular · Resumen · Keywords ATS · ↓ más abajo</p>
            </div>
          </button>

          {/* Acciones adicionales: entrevista + job adapter */}
          <div className={`grid gap-2 ${cvFinalData ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <button
              onClick={() => { resetInterview(); setStep(STEPS.INTERVIEW_INTRO); trackEvent('modo_entrevista_desde_resultados') }}
              className="rounded-2xl p-3.5 text-left transition-all hover:shadow-md active:scale-[0.98]"
              style={{ background: 'rgba(217,119,6,0.06)', border: '1px solid rgba(217,119,6,0.22)' }}
            >
              <p className="text-base mb-1">🎙️</p>
              <p className="text-xs font-bold text-slate-800 leading-tight">Simular entrevista</p>
              <p className="text-[10px] text-slate-500 mt-0.5">5 preguntas con IA · Paso 6</p>
            </button>
            {cvFinalData && (
              <button
                onClick={() => { setJobCvForAdapter(cvFinalData); setJobPosting(''); setJobResult(null); setJobError(''); setShowJobModal(true); trackEvent('job_adapter_from_results') }}
                className="rounded-2xl p-3.5 text-left transition-all hover:shadow-md active:scale-[0.98]"
                style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)' }}
              >
                <p className="text-base mb-1">📝</p>
                <p className="text-xs font-bold text-slate-800 leading-tight">Adaptar por oferta</p>
                <p className="text-[10px] text-slate-500 mt-0.5">CV + carta · Paso 5</p>
              </button>
            )}
          </div>
        </div>
      )}

      {/* CV builder moved to CvScreen */}

      {/* ══ BLOQUE 5 — Mejorá tu perfil ══ */}
      {result && (
        <div id="mejorar-perfil" className="rounded-2xl overflow-hidden"
          style={{ border: '1px solid rgba(0,119,181,0.18)', background: 'white' }}>
          <div className="px-5 py-4 border-b flex items-center gap-2"
            style={{ borderColor: 'rgba(0,119,181,0.10)', background: 'rgba(0,119,181,0.03)' }}>
            <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0"
              style={{ background: 'rgba(14,165,233,0.12)', color: '#0ea5e9' }}>Paso 2</span>
            <p className="text-sm font-bold text-slate-800">Optimizar perfil LinkedIn</p>
          </div>
          <div className="px-5 py-4 space-y-5">

            {/* Acción prioritaria */}
            {result.accion_prioritaria && (
              <div className="rounded-xl p-4"
                style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.30)' }}>
                <p className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#d97706' }}>⚡ Hacé esto hoy</p>
                <p className="text-slate-800 text-sm leading-relaxed">{result.accion_prioritaria}</p>
              </div>
            )}

            {/* Titular antes/después */}
            <div>
              <p className="text-xs font-bold uppercase tracking-wide mb-2 text-slate-500">Titular propuesto</p>
              <BeforeAfter label="Titular" before={result.titular_actual} after={result.titular_propuesto} />
            </div>

            {/* Resumen antes/después */}
            <div>
              <p className="text-xs font-bold uppercase tracking-wide mb-2 text-slate-500">Resumen / About</p>
              <BeforeAfter label="Resumen" before={result.resumen_actual} after={result.resumen_propuesto} />
            </div>

            {/* SEO keywords */}
            {result.palabras_clave_sugeridas?.length > 0 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wide mb-2 text-slate-500">Palabras clave SEO</p>
                <div className="flex flex-wrap gap-2">
                  {result.palabras_clave_sugeridas.map((kw, i) => (
                    <span key={i} className="text-xs px-3 py-1 rounded-full font-medium"
                      style={{ background: 'rgba(0,119,181,0.07)', border: '1px solid rgba(0,119,181,0.22)', color: '#0077B5' }}>
                      {kw}
                    </span>
                  ))}
                </div>
                <p className="text-slate-400 text-[11px] mt-2">Incluílas en tu titular, resumen y experiencias.</p>
              </div>
            )}

            {/* Foto de perfil */}
            {result.analisis_foto && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wide mb-1.5 text-slate-500">📸 Foto de perfil</p>
                <p className="text-slate-600 text-sm leading-relaxed">{result.analisis_foto}</p>
              </div>
            )}

            {/* Recomendaciones */}
            {(result.recomendaciones || []).length > 0 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wide mb-3 text-slate-500">Recomendaciones</p>
                <div className="space-y-3">
                  {(result.recomendaciones || []).map((rec, i) => (
                    <div key={i} className="rounded-xl p-3.5 flex gap-3 items-start"
                      style={{ background: '#f8fafc', border: '1px solid rgba(0,119,181,0.10)' }}>
                      <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5"
                        style={{ background: LI_GRADIENT, color: '#fff' }}>{i + 1}</span>
                      <div>
                        <p className="text-slate-900 font-semibold text-sm mb-0.5">{rec.titulo}</p>
                        <p className="text-slate-600 text-sm leading-relaxed">{rec.descripcion}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Estrategia de contenido */}
            {result.estrategia_contenido && (
              <div className="rounded-xl p-4"
                style={{ background: 'rgba(0,119,181,0.05)', border: '1px solid rgba(0,119,181,0.18)' }}>
                <p className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#0077B5' }}>📣 Estrategia de contenido</p>
                <p className="text-slate-700 text-sm leading-relaxed">{result.estrategia_contenido}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ BLOQUE 6 — Crecer en LinkedIn — eliminado ══ */}
      {false && <div id="crecimiento-removed" className="rounded-2xl overflow-hidden"
        style={{ border: '1px solid rgba(99,102,241,0.20)', background: 'white' }}>
        <button
          className="w-full flex items-center justify-between px-5 py-4 text-left transition-all"
          style={{ background: showGrowthSection ? 'rgba(99,102,241,0.06)' : 'rgba(99,102,241,0.03)' }}
          onClick={() => setShowGrowthSection(v => !v)}
        >
          <div>
            <p className="text-sm font-bold text-slate-800">🚀 Crecer en LinkedIn</p>
            <p className="text-xs text-slate-500 mt-0.5">Ideas de banner + plan de networking 90 días</p>
          </div>
          <span className="text-slate-400 text-sm ml-3">{showGrowthSection ? '▲' : '▼'}</span>
        </button>

        {showGrowthSection && (
          <div className="px-5 pb-5 pt-3 space-y-4">
            {!linkedinGrowth && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <input
                    className="flex-1 px-3 py-2 rounded-xl text-sm border focus:outline-none"
                    style={{ borderColor: 'rgba(99,102,241,0.25)' }}
                    placeholder="¿Cuántos seguidores tenés? (opcional)"
                    value={seguidores}
                    onChange={e => setSeguidores(e.target.value)}
                    type="number" min="0"
                  />
                  <button
                    onClick={callLinkedinGrowth}
                    disabled={growthLoading}
                    className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all"
                    style={{ background: growthLoading ? '#94a3b8' : 'linear-gradient(135deg,#6366f1,#8b5cf6)', minWidth: '90px' }}
                  >
                    {growthLoading ? <span className="flex items-center gap-1.5"><Spinner size={3} />Generando…</span> : 'Generar →'}
                  </button>
                </div>
                {growthError && <p className="text-xs text-red-500">{growthError}</p>}
                <p className="text-xs text-slate-400">La IA genera 3 ideas de banner personalizadas + un plan de acción semanal para los próximos 90 días.</p>
              </div>
            )}

            {linkedinGrowth && (
              <div className="space-y-5">
                {(linkedinGrowth.banner_ideas || []).length > 0 && (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#6366f1' }}>🖼 Ideas de banner</p>
                    {(linkedinGrowth.banner_ideas || []).map((idea, i) => (
                      <div key={i} className="rounded-xl p-4 space-y-2.5" style={{ border: '1px solid rgba(0,0,0,0.08)', background: '#fafafa' }}>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-bold text-slate-800">{idea.titulo}</p>
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0"
                            style={{ background: 'rgba(99,102,241,0.10)', color: '#6366f1' }}>{idea.estilo}</span>
                        </div>
                        {(idea.paleta || []).length > 0 && (
                          <div className="flex gap-1.5 items-center">
                            {idea.paleta.map((color, ci) => (
                              <div key={ci} className="w-6 h-6 rounded-full border-2 border-white shadow-sm" style={{ background: color }} title={color} />
                            ))}
                            <span className="text-[10px] text-slate-400 ml-1">{idea.paleta.join(' · ')}</span>
                          </div>
                        )}
                        <div className="rounded-lg p-3 space-y-1" style={{ background: (idea.paleta || [])[0] || '#0d2137', minHeight: '52px' }}>
                          <p className="font-bold leading-tight" style={{ color: (idea.paleta || [])[2] || 'white', fontSize: '13px' }}>{idea.copy_principal}</p>
                          {idea.copy_secundario && <p style={{ color: (idea.paleta || [])[2] ? (idea.paleta[2] + 'cc') : 'rgba(255,255,255,0.7)', fontSize: '10px' }}>{idea.copy_secundario}</p>}
                        </div>
                        <p className="text-xs text-slate-500 leading-snug">{idea.concepto}</p>
                      </div>
                    ))}
                  </div>
                )}

                {linkedinGrowth.plan_networking && (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#6366f1' }}>📅 Plan de networking (90 días)</p>
                    {linkedinGrowth.plan_networking.objetivo_resumido && (
                      <p className="text-sm text-slate-700 leading-relaxed italic">"{linkedinGrowth.plan_networking.objetivo_resumido}"</p>
                    )}
                    {(linkedinGrowth.plan_networking.acciones_semanales || []).length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Acciones concretas</p>
                        {linkedinGrowth.plan_networking.acciones_semanales.map((a, i) => (
                          <div key={i} className="rounded-xl p-3 space-y-1" style={{ background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.12)' }}>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: 'rgba(99,102,241,0.12)', color: '#6366f1' }}>{a.frecuencia}</span>
                              <p className="text-xs font-semibold text-slate-700">{a.accion}</p>
                            </div>
                            {a.ejemplo && <p className="text-[11px] text-slate-500 pl-1 leading-snug">↳ {a.ejemplo}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                    {(linkedinGrowth.plan_networking.contenido_sugerido || []).length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Contenido a publicar</p>
                        {linkedinGrowth.plan_networking.contenido_sugerido.map((c, i) => (
                          <div key={i} className="flex items-start gap-2.5 py-1.5">
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold shrink-0" style={{ background: 'rgba(99,102,241,0.10)', color: '#6366f1' }}>{c.formato}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-slate-700">{c.tema}</p>
                              <p className="text-[10px] text-slate-400">{c.frecuencia}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {linkedinGrowth.plan_networking.metrica_90dias && (
                      <div className="rounded-xl p-3" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)' }}>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600 mb-1">🎯 Meta a 90 días</p>
                        <p className="text-sm text-slate-700">{linkedinGrowth.plan_networking.metrica_90dias}</p>
                      </div>
                    )}
                  </div>
                )}

                <button
                  onClick={() => { setLinkedinGrowth(null); setGrowthError('') }}
                  className="text-xs text-slate-400 underline underline-offset-2"
                >Regenerar</button>
              </div>
            )}
          </div>
        )}
      </div>}

      {/* ══ BLOQUE 7 — Social + Premium ══ */}
      {/* Premium upsell */}
      {!user?.es_premium && (
        <div className="rounded-2xl p-4 space-y-2.5"
          style={{ background: 'linear-gradient(135deg,rgba(0,119,181,0.06),rgba(14,165,233,0.04))', border: '1px solid rgba(0,119,181,0.18)' }}>
          <p className="text-slate-800 text-sm font-semibold">💾 Guardá tu historial con Premium</p>
          <p className="text-slate-500 text-xs leading-snug">
            Todos tus análisis, CVs y simulaciones guardados. Incluye <strong>7 días gratis</strong>, luego $3.000/mes.
          </p>
          <button onClick={() => setShowPremiumModal(true)}
            disabled={subscriptionLoading}
            className="px-4 py-2 rounded-xl text-white text-xs font-semibold"
            style={{ background: LI_GRADIENT, opacity: subscriptionLoading ? 0.7 : 1 }}>
            {subscriptionLoading ? '...' : 'Probar 7 días gratis'}
          </button>
        </div>
      )}

      {/* Consulta personalizada */}
      <div className="rounded-2xl p-5"
        style={{ background: 'rgba(0,119,181,0.04)', border: '1px solid rgba(0,119,181,0.15)' }}>
        <p className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: '#0077B5' }}>🎯 ¿Querés implementar estos cambios?</p>
        <p className="text-slate-600 text-sm leading-relaxed mb-3">
          Ramiro puede guiarte paso a paso: revisar tu perfil en vivo, reescribir tu titular y resumen, y armar tu estrategia de búsqueda.
        </p>
        <button
          onClick={() => setShowLeadModal(true)}
          className="btn-glow inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold"
          style={{ background: LI_GRADIENT }}
        >
          <LinkedInIcon className="w-4 h-4" /> Hablar con Ramiro →
        </button>
      </div>

      {/* Follow CTAs */}
      <div className="rounded-2xl overflow-hidden"
        style={{ border: '1px solid rgba(0,119,181,0.14)' }}>
        <div className="px-5 pt-4 pb-3 text-center border-b"
          style={{ background: 'rgba(0,119,181,0.03)', borderColor: 'rgba(0,119,181,0.08)' }}>
          <p className="text-slate-700 font-semibold text-sm">Si este análisis te sirvió, seguinos</p>
          <p className="text-slate-400 text-xs mt-0.5">Contenido gratuito, como esto.</p>
        </div>
        <div className="grid grid-cols-2 divide-x divide-slate-100">
          <div className="p-4 flex flex-col gap-3 items-center text-center">
            <p className="text-slate-800 text-xs font-semibold">Perfil de Ramiro</p>
            <a href={RAMIRO_LINKEDIN_URL} target="_blank" rel="noopener noreferrer"
              onClick={() => trackEvent('click_externo', { destino: 'linkedin_ramiro', ubicacion: 'results' })}
              className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-xl text-white text-xs font-semibold"
              style={{ background: LI_GRADIENT }}>
              <LinkedInIcon className="w-3.5 h-3.5" /> Seguir
            </a>
          </div>
          <div className="p-4 flex flex-col gap-3 items-center text-center">
            <p className="text-slate-800 text-xs font-semibold">Página OptimizaLK</p>
            <a href={COMPANY_LINKEDIN_URL} target="_blank" rel="noopener noreferrer"
              onClick={() => trackEvent('click_externo', { destino: 'linkedin_pagina', ubicacion: 'results' })}
              className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-xl text-white text-xs font-semibold"
              style={{ background: LI_GRADIENT }}>
              <LinkedInIcon className="w-3.5 h-3.5" /> Seguir
            </a>
          </div>
        </div>
      </div>

      {/* Nav */}
      <div className="flex gap-2">
        <button
          onClick={() => setStep(STEPS.MODE_SELECT)}
          className="flex-1 font-medium py-3.5 rounded-2xl text-sm transition-all"
          style={BTN_BACK_STYLE}
        >
          ← Menú
        </button>
        <button
          onClick={() => { trackEvent('click_analizar_otro', { location: 'post_analisis' }); reset() }}
          className="flex-[2] font-semibold py-3.5 rounded-2xl text-sm transition-all"
          style={BTN_BACK_STYLE}
        >
          ↺ Analizar otro perfil
        </button>
      </div>
    </div>
  )
}

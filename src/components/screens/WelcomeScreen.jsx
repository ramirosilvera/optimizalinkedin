import { STEPS, LI_GRADIENT, RAMIRO_LINKEDIN_URL, trackEvent } from '../../constants'
import { Logo, LinkedInIcon } from '../ui'
import CommentsSection from '../CommentsSection'

export default function WelcomeScreen({ setStep, result, latestAnalisis, historialLoading, hasCV, hasInterview, onResumePreparation, restoreFromHistorial, sessionChecked }) {
  // Synchronous localStorage hints — available before any async resolves
  const isPremiumHint = localStorage.getItem('ol_premium') === '1'

  // Unified session data: in-session result takes priority over restored historial item
  const sessionData = result || latestAnalisis?.datos || null
  const hasActiveSession = !!sessionData

  // Show skeleton while auth + historial are resolving for a known PRO user.
  // sessionChecked starts false (has tokens) and becomes true only after the full
  // auth+historial bootstrap completes — eliminating the flash of wrong CTA.
  const showSkeleton = isPremiumHint && !hasActiveSession && !sessionChecked

  // Progress items — derived from what's been done
  const progressItems = sessionData ? [
    { done: true, label: 'Diagnóstico' },
    { done: !!result || hasCV, label: 'CV generado' },
    { done: !!result || hasInterview, label: 'Entrevista' },
  ] : []

  const sessionName = sessionData?.nombre_titular || null
  const sessionScore = sessionData?.puntaje_general ?? null

  return (
    <div className="step-transition text-center space-y-8">
      <Logo />

      {/* Hero */}
      <div className="space-y-5">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide badge-shimmer"
          style={{ border: '1px solid rgba(0,119,181,0.4)', color: '#0077B5' }}>
          ✦ &nbsp;Centro de Preparación Profesional
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold leading-tight tracking-tight" style={{ letterSpacing: '-0.02em' }}>
          <span className="text-slate-900">Tu preparación profesional,</span><br />
          <span className="gradient-text-pro">con criterio de headhunter.</span>
        </h1>
        <p className="text-slate-600 text-base max-w-sm mx-auto leading-relaxed">
          Diagnóstico, CV, entrenamiento y seguimiento — sistema guiado, sin registro, sin costo.
        </p>
      </div>

      {/* ── Continuation card (skeleton) ── */}
      {showSkeleton && (
        <div className="w-full max-w-sm mx-auto rounded-2xl overflow-hidden flex"
          style={{ border: '1px solid rgba(0,119,181,0.12)', background: 'white', height: 88 }}>
          <div className="w-1 shrink-0 animate-pulse" style={{ background: 'rgba(0,119,181,0.3)' }} />
          <div className="flex-1 px-4 py-3 flex flex-col justify-center gap-2">
            <div className="h-2 rounded-full animate-pulse" style={{ background: '#e2e8f0', width: '40%' }} />
            <div className="h-3 rounded-full animate-pulse" style={{ background: '#e2e8f0', width: '70%' }} />
            <p className="text-[10px] font-medium" style={{ color: '#94a3b8' }}>Cargando tu preparación…</p>
          </div>
        </div>
      )}

      {/* ── Continuation card (active) ── */}
      {hasActiveSession && (
        <div className="w-full max-w-sm mx-auto rounded-2xl overflow-hidden flex"
          style={{
            border: '1px solid rgba(0,119,181,0.15)',
            background: 'white',
            boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
            animation: 'fadeSlideUp 0.3s cubic-bezier(0.16,1,0.3,1) 120ms both',
          }}>
          {/* Left accent bar */}
          <div className="w-1 shrink-0" style={{ background: 'linear-gradient(180deg,#0d2137,#0077B5)' }} />
          <div className="flex-1 px-4 py-3 text-left">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: '#94a3b8' }}>
                  Sesión activa
                </p>
                {sessionName && (
                  <p className="text-sm font-bold truncate" style={{ color: '#0d2137' }}>{sessionName}</p>
                )}
              </div>
              {sessionScore !== null && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full shrink-0"
                  style={{ background: 'rgba(16,185,129,0.10)', color: '#059669', border: '1px solid rgba(16,185,129,0.2)' }}>
                  {sessionScore}/10
                </span>
              )}
            </div>
            {/* Progress pills */}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {progressItems.map(item => (
                <span key={item.label} className="flex items-center gap-1 text-[10px] font-medium"
                  style={{ color: item.done ? '#059669' : '#f59e0b' }}>
                  {item.done ? '✔' : '⏳'} {item.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Primary CTA zone ── */}
      <div className="space-y-3">
        {hasActiveSession ? (
          <>
            <button
              onClick={() => {
                trackEvent('click_seguir_preparacion', { location: 'hero', has_session: !!result })
                if (!result && latestAnalisis && onResumePreparation) {
                  onResumePreparation()
                } else {
                  setStep(STEPS.MODE_SELECT)
                }
              }}
              className="btn-glow spring-tap w-full text-white font-semibold py-4 px-8 rounded-2xl text-base"
              style={{ background: 'linear-gradient(135deg, #0d2137 0%, #0077B5 100%)' }}
            >
              Seguir con tu preparación →
            </button>
            <p className="text-xs" style={{ color: '#94a3b8' }}>
              <button
                onClick={() => {
                  trackEvent('click_ver_diagnostico', { location: 'hero' })
                  if (result) {
                    setStep(STEPS.RESULTS)
                  } else if (latestAnalisis && restoreFromHistorial) {
                    restoreFromHistorial(latestAnalisis)
                  }
                }}
                className="underline hover:text-slate-500 transition-colors"
              >
                {result ? `Ver diagnóstico (${result.puntaje_general ?? '—'}/10)` : 'Ver diagnóstico anterior'}
              </button>
              {' · '}
              <button
                onClick={() => { trackEvent('click_nuevo_diagnostico', { location: 'hero' }); setStep(STEPS.QUESTIONS) }}
                className="underline hover:text-slate-500 transition-colors"
              >
                Nuevo diagnóstico
              </button>
            </p>
          </>
        ) : showSkeleton ? (
          <div className="w-full rounded-2xl animate-pulse"
            style={{ background: '#e2e8f0', height: 56 }} />
        ) : (
          <button
            onClick={() => { trackEvent('click_empezar_analisis', { location: 'hero' }); setStep(STEPS.QUESTIONS) }}
            className="btn-glow spring-tap w-full text-white font-semibold py-4 px-8 rounded-2xl text-base"
            style={{ background: 'linear-gradient(135deg, #0077B5 0%, #0ea5e9 100%)' }}
          >
            Iniciar diagnóstico →
          </button>
        )}
        <p className="text-slate-500 text-xs">Sin registro · Resultado en minutos · Gratuito</p>
      </div>

      <div className="accent-line" style={{ maxWidth: 380, margin: '0 auto' }} />

      {/* Module strip — system context, below fold */}
      <div style={{ width: '100%', maxWidth: 380, margin: '0 auto' }}>
        <p style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
          Sistema de preparación · 7 módulos
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
          {[
            { icon: '🎯', label: 'Diagnóstico' },
            { icon: '✏️', label: 'Posicionamiento' },
            { icon: '📄', label: 'CV Profesional' },
            { icon: '🎙️', label: 'Entrenamiento' },
            { icon: '⭐', label: 'STAR' },
            { icon: '📍', label: 'Postulaciones' },
            { icon: '📊', label: 'Informe' },
          ].map(m => (
            <span key={m.label} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 11, fontWeight: 500, color: '#475569',
              background: '#f8fafc', border: '1px solid #e2e8f0',
              borderRadius: 99, padding: '4px 10px',
            }}>
              <span style={{ fontSize: 12 }}>{m.icon}</span>
              {m.label}
            </span>
          ))}
        </div>
      </div>

      <CommentsSection />

      {/* ── Secciones SEO ── */}
      <div className="text-left space-y-12 pt-6">

        {/* Cómo funciona — moved first: validates the journey before feature list */}
        <section>
          <h2 className="text-xl font-bold text-slate-900 mb-4">Cómo funciona</h2>
          <div className="space-y-3">
            {[
              {
                num: '1', color: '#0077B5',
                title: 'Diagnóstico inicial',
                desc: 'Respondés 7 preguntas y pegás tu perfil de LinkedIn. En 60 segundos recibís tu score de empleabilidad, brechas críticas y las acciones más impactantes que podés tomar hoy.',
              },
              {
                num: '2', color: '#059669',
                title: 'Construís tu perfil y CV',
                desc: 'Aplicás las mejoras al LinkedIn, generás tu CV ATS-compatible de 1 página y definís tu estrategia de contenido para aparecer en búsquedas de reclutadores.',
              },
              {
                num: '3', color: '#6366f1',
                title: 'Entrenás y postulás con ventaja',
                desc: 'Simulás entrevistas reales con IA, dominás la metodología STAR y adaptás tu CV y carta de presentación para cada oferta específica.',
              },
            ].map(stepItem => (
              <div key={stepItem.num} className="flex items-start gap-4 rounded-2xl p-4"
                style={{ background: 'white', border: '1px solid rgba(0,119,181,0.10)' }}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                  style={{ background: stepItem.color }}>{stepItem.num}</div>
                <div>
                  <p className="text-slate-800 text-sm font-semibold">{stepItem.title}</p>
                  <p className="text-slate-500 text-xs mt-0.5 leading-relaxed">{stepItem.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ¿Qué incluye el sistema? — consolidated from 9 → 5 items */}
        <section>
          <h2 className="text-xl font-bold text-slate-900 mb-4">¿Qué incluye el sistema?</h2>
          <div className="space-y-3">
            {[
              {
                icon: '🎯',
                title: 'Diagnóstico con criterio de headhunter',
                desc: 'Score de empleabilidad, análisis de brechas críticas y recomendaciones concretas basadas en criterio real de selección profesional.',
              },
              {
                icon: '✏️',
                title: 'LinkedIn y CV de 1 página',
                desc: 'Titular y resumen reescritos con propuesta de valor, palabras clave SEO y CV ATS-compatible generado con tu perfil optimizado.',
              },
              {
                icon: '🎙️',
                title: 'Simulador de entrevista + metodología STAR',
                desc: 'Practicá 5 preguntas reales con IA y recibí feedback de RRHH. Dominá el framework que usan los mejores candidatos para respuestas de alto impacto.',
              },
              {
                icon: '📝',
                title: 'CV adaptado por oferta + carta de presentación',
                desc: 'Pegás el aviso y recibís tu CV personalizado para esa posición más una carta de presentación lista para enviar.',
              },
              {
                icon: '📍',
                title: 'Seguimiento de postulaciones',
                desc: 'Tablero kanban para organizar tus aplicaciones, estado y próximos pasos — todo integrado en un sistema de preparación continuo.',
              },
            ].map(item => (
              <div key={item.title} className="flex items-start gap-3 rounded-2xl p-4"
                style={{ background: 'white', border: '1px solid rgba(0,119,181,0.10)' }}>
                <span className="text-xl shrink-0">{item.icon}</span>
                <div>
                  <p className="text-slate-800 text-sm font-semibold">{item.title}</p>
                  <p className="text-slate-500 text-xs mt-0.5 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Gratuito vs. Profesional — new section, communicates model clearly */}
        <section>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold mb-3"
            style={{ background: 'rgba(0,119,181,0.07)', color: '#0077B5', border: '1px solid rgba(0,119,181,0.2)' }}>
            Modelo de acceso
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Gratuito y sin registro</h2>
          <p className="text-slate-500 text-sm mb-5 leading-relaxed">
            El sistema completo es gratuito. Activás Profesional si querés historial y continuidad entre sesiones.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl p-4 space-y-3"
              style={{ background: 'white', border: '1px solid rgba(0,119,181,0.12)' }}>
              <div>
                <p className="text-slate-900 font-bold text-sm">Gratuito</p>
                <p className="text-slate-400 text-xs">Sin registro</p>
              </div>
              <ul className="space-y-1.5">
                {[
                  '7 módulos completos',
                  'Diagnóstico, CV, entrevista',
                  'STAR y Postulaciones',
                  'Sin límite de usos',
                ].map(f => (
                  <li key={f} className="flex items-start gap-1.5 text-xs text-slate-600">
                    <span className="text-emerald-500 font-bold shrink-0 mt-0.5">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl p-4 space-y-3"
              style={{ background: 'linear-gradient(135deg, #0d2137 0%, #0077B5 100%)' }}>
              <div>
                <p className="text-white font-bold text-sm">Profesional</p>
                <p className="text-blue-200 text-xs">$3.000 ARS/mes</p>
              </div>
              <ul className="space-y-1.5">
                {[
                  'Todo lo gratuito, más:',
                  'Historial persistente',
                  'Continuidad de sesiones',
                  'Seguimiento de evolución',
                ].map(f => (
                  <li key={f} className="flex items-start gap-1.5 text-xs text-blue-100">
                    <span className="text-blue-200 font-bold shrink-0 mt-0.5">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Comparativa vs alternativas */}
        <section>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold mb-3"
            style={{ background: 'rgba(99,102,241,0.08)', color: '#6366f1', border: '1px solid rgba(99,102,241,0.2)' }}>
            Por qué esta app
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Comparativa con alternativas</h2>
          <p className="text-slate-500 text-sm mb-5 leading-relaxed">
            Lo mismo que te costaría entre <strong className="text-slate-700">$30.000 y $125.000</strong> con un asesor, o <strong className="text-slate-700">~$56.000/mes</strong> con LinkedIn Premium — acá lo obtenés sin costo.
          </p>
          <div className="overflow-x-auto -mx-0 rounded-2xl border border-slate-100 shadow-sm">
            <table className="w-full min-w-[500px] text-xs border-collapse">
              <thead>
                <tr>
                  <th className="text-left py-3 pl-4 pr-2 text-slate-400 font-normal" style={{ width: 160 }}></th>
                  <th className="py-3 px-2 text-center font-bold text-white" style={{ background: 'linear-gradient(135deg,#6366f1,#0ea5e9)', minWidth: 86 }}>
                    <div className="text-[10px] font-normal opacity-80 mb-0.5">Optimiza LK</div>
                    <div className="text-emerald-200">Gratuito</div>
                  </th>
                  <th className="py-3 px-2 text-center text-slate-500 font-medium bg-slate-50" style={{ minWidth: 86 }}>
                    <div className="text-[10px] text-slate-400 mb-0.5">LinkedIn Premium</div>
                    <div className="text-slate-600 text-[11px]">~$56.000<span className="text-slate-400">/mes</span></div>
                  </th>
                  <th className="py-3 px-2 text-center text-slate-500 font-medium bg-slate-50" style={{ minWidth: 86 }}>
                    <div className="text-[10px] text-slate-400 mb-0.5">IA genérica</div>
                    <div className="text-slate-600 text-[11px]">Gratis*</div>
                  </th>
                  <th className="py-3 px-2 text-center text-slate-500 font-medium bg-slate-50" style={{ minWidth: 86 }}>
                    <div className="text-[10px] text-slate-400 mb-0.5">Asesor profesional</div>
                    <div className="text-slate-600 text-[11px]">$30k–$125k</div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {[
                  { feat: 'Criterio de headhunter real',         app: 1, premium: 0, ia: 0, asesor: 1 },
                  { feat: 'Diagnóstico completo del perfil',      app: 1, premium: 2, ia: 2, asesor: 1 },
                  { feat: 'Titular y resumen optimizados',        app: 1, premium: 2, ia: 2, asesor: 1 },
                  { feat: 'SEO para búsquedas de reclutadores',   app: 1, premium: 1, ia: 0, asesor: 1 },
                  { feat: 'Simulador de entrevista con IA',       app: 1, premium: 0, ia: 0, asesor: 2 },
                  { feat: 'Entrenamiento metodología STAR',       app: 1, premium: 0, ia: 0, asesor: 2 },
                  { feat: 'CV de 1 página ATS-compatible',        app: 1, premium: 0, ia: 0, asesor: 2 },
                  { feat: 'Sin registro · resultado en 60 seg',   app: 1, premium: 0, ia: 1, asesor: 0 },
                ].map((row, i) => {
                  const cell = v => v === 1
                    ? <span className="text-emerald-500 font-bold text-sm">✓</span>
                    : v === 0
                    ? <span className="text-red-300 text-sm">✗</span>
                    : <span className="text-amber-500 text-[10px] font-semibold">varía</span>
                  return (
                    <tr key={row.feat} style={{ background: i % 2 === 0 ? 'white' : 'rgba(248,250,252,0.8)' }}>
                      <td className="py-2.5 pl-4 pr-2 text-slate-600 font-medium text-[11px] leading-snug">{row.feat}</td>
                      <td className="py-2.5 px-2 text-center" style={{ background: i % 2 === 0 ? 'rgba(99,102,241,0.06)' : 'rgba(99,102,241,0.09)' }}>{cell(row.app)}</td>
                      <td className="py-2.5 px-2 text-center">{cell(row.premium)}</td>
                      <td className="py-2.5 px-2 text-center">{cell(row.ia)}</td>
                      <td className="py-2.5 px-2 text-center">{cell(row.asesor)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="text-slate-400 text-[10px] mt-2 leading-relaxed">
            * La IA genérica no cuenta con prompts especializados en RRHH ni con la validación de un profesional. Precios en ARS, referencia USD 1 ≈ ARS 1.400.
          </p>
        </section>

        {/* Quién está detrás */}
        <section>
          <h2 className="text-xl font-bold text-slate-900 mb-4">Quién está detrás</h2>
          <div className="rounded-2xl p-5 flex items-start gap-4"
            style={{ background: 'white', border: '1px solid rgba(0,119,181,0.12)' }}>
            <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
              style={{ background: LI_GRADIENT }}>RS</div>
            <div>
              <p className="text-slate-900 font-semibold text-sm">Ramiro Silvera</p>
              <p className="text-slate-500 text-xs mt-0.5">Gerente de RRHH · Headhunter · +10 años de experiencia</p>
              <p className="text-slate-600 text-sm mt-2 leading-relaxed">
                Con más de 10 años seleccionando profesionales en Argentina y la región, creé <strong className="text-slate-700">Optimiza LK</strong> para que cualquier persona pueda acceder al mismo análisis que haría un headhunter real — sin costo.
              </p>
              <a href={RAMIRO_LINKEDIN_URL} target="_blank" rel="noopener noreferrer"
                onClick={() => trackEvent('click_externo', { destino: 'linkedin_ramiro', ubicacion: 'seccion_quien' })}
                className="inline-flex items-center gap-1.5 mt-3 text-xs font-semibold"
                style={{ color: '#0077B5' }}>
                <LinkedInIcon className="w-3.5 h-3.5" /> Ver perfil de LinkedIn →
              </a>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section>
          <h2 className="text-xl font-bold text-slate-900 mb-4">Preguntas frecuentes</h2>
          <div className="space-y-3">
            {[
              { q: '¿Qué es Optimiza LK?', a: 'Optimiza LK es el Centro de Preparación Profesional creado por Ramiro Silvera (Gerente de RRHH y Headhunter con +10 años de experiencia). Diagnosticá tu competitividad laboral, construí tu CV, entrenás entrevistas con IA y adaptás tu candidatura para cada oferta — todo sin costo y sin registro.' },
              { q: '¿Es realmente gratis?', a: 'Sí, 100% gratis y sin registro. No necesitás crear una cuenta ni dejar tu email para recibir el análisis completo.' },
              { q: '¿Qué pasa con mi CV o perfil?', a: 'Tu información se usa para generar el análisis. Solo se guarda si vos lo autorizás — por ejemplo, al activar el plan Profesional para mantener tu historial entre sesiones. En ningún caso se comparte con terceros.' },
              { q: '¿Cuánto tarda el análisis?', a: 'Menos de 60 segundos una vez que subís tu perfil. El cuestionario inicial tarda 3-5 minutos dependiendo del detalle que ingreses.' },
              { q: '¿Sirve si vivo fuera de Argentina?', a: 'Sí. El análisis se adapta a tu mercado y objetivo declarado en el cuestionario.' },
              { q: '¿Qué es el simulador de entrevista?', a: 'Una entrevista inicial simulada con IA donde respondés 5 preguntas reales de RRHH y recibís feedback detallado sobre cada respuesta.' },
              { q: '¿Necesito tener el PDF de LinkedIn?', a: 'No es obligatorio. Podés subir el PDF, pegar la URL de tu perfil o completar un formulario directamente en la app.' },
            ].map(({ q, a }) => (
              <div key={q} className="rounded-2xl p-4"
                style={{ background: 'white', border: '1px solid rgba(0,119,181,0.10)' }}>
                <p className="text-slate-800 text-sm font-semibold mb-1">{q}</p>
                <p className="text-slate-500 text-xs leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Footer de marca */}
        <div className="pt-4 pb-2 text-center border-t" style={{ borderColor: 'rgba(0,119,181,0.1)' }}>
          <p className="text-xs text-slate-400 leading-relaxed">
            <strong className="text-slate-500">Optimiza LK</strong> · Creado por Ramiro Silvera · Argentina<br />
            <span>Centro de Preparación Profesional · Diagnóstico, CV, Entrevista y Seguimiento</span>
          </p>
        </div>

      </div>
    </div>
  )
}

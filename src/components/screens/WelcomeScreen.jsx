import { STEPS, LI_GRADIENT, RAMIRO_LINKEDIN_URL, trackEvent, BTN_GHOST_STYLE } from '../../constants'
import { Logo, LinkedInIcon } from '../ui'
import CommentsSection from '../CommentsSection'

export default function WelcomeScreen({ setStep, handleModeSelectJobAdapter, jobAdapterCheckLoading, jobAdapterNoCv, setJobAdapterNoCv, result, onStartFastTrack }) {
  return (
    <div className="step-transition text-center space-y-8">
      <Logo />
      <div className="space-y-5">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide badge-shimmer"
          style={{ border: '1px solid rgba(0,119,181,0.4)', color: '#0077B5' }}>
          ✦ &nbsp;Sistema de Preparación Profesional · 100% gratis
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold leading-tight tracking-tight" style={{ letterSpacing: '-0.02em' }}>
          <span className="text-slate-900">Preparate para competir</span><br />
          <span style={{ background: 'linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            en el mercado laboral.
          </span>
        </h1>
        <p className="text-slate-600 text-base max-w-sm mx-auto leading-relaxed">
          Diagnóstico de competitividad, CV profesional, entrenamiento de entrevistas y seguimiento activo — todo calibrado a tu perfil. Sin registro. Sin costo.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          { icon: '🎯', label: 'Diagnóstico', step: 'Paso 1', text: 'Score de empleabilidad, keywords y gaps con ojo de headhunter', accent: '#0077B5' },
          { icon: '📄', label: 'CV de Combate', step: 'Módulo 3', text: 'ATS-compatible, con foto, calibrado a tu perfil profesional', accent: '#059669' },
          { icon: '📝', label: 'Adaptación Táctica', step: 'Módulo 4', text: 'IA calibra tu CV + genera la carta para cada oferta específica', accent: '#6366f1' },
          { icon: '🎙️', label: 'Sesión de Entrenamiento', step: 'Módulo 5', text: '5 preguntas reales con feedback IA personalizado a tu industria', accent: '#d97706' },
        ].map(item => (
          <div key={item.label} className="rounded-2xl p-4 text-left relative overflow-hidden"
            style={{ background: 'white', border: '1px solid rgba(0,119,181,0.15)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <div className="text-xl mb-1.5">{item.icon}</div>
            <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full"
              style={{ background: `rgba(0,0,0,0.05)`, color: '#64748b' }}>{item.step}</span>
            <p className="text-xs font-semibold mt-1 mb-0.5" style={{ color: item.accent }}>{item.label}</p>
            <p className="text-slate-500 text-[10px] leading-snug">{item.text}</p>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {result ? (
          <>
            <button
              onClick={() => { trackEvent('click_retomar_preparacion', { location: 'hero' }); setStep(STEPS.MODE_SELECT) }}
              className="btn-glow w-full text-white font-semibold py-4 px-8 rounded-2xl text-base"
              style={{ background: 'linear-gradient(135deg, #0d2137 0%, #0077B5 100%)' }}
            >
              Retomar mi preparación →
            </button>
            <button
              onClick={() => { trackEvent('click_ver_diagnostico', { location: 'hero' }); setStep(STEPS.RESULTS) }}
              className="w-full font-semibold py-3 px-8 rounded-2xl text-sm transition-all"
              style={{ border: '1.5px solid rgba(0,119,181,0.3)', color: '#0077B5', background: 'rgba(0,119,181,0.05)' }}
            >
              Ver diagnóstico ({result.puntaje_general ?? '—'}/10) →
            </button>
          </>
        ) : (
          <button
            onClick={() => { trackEvent('click_empezar_analisis', { location: 'hero' }); setStep(STEPS.QUESTIONS) }}
            className="btn-glow w-full text-white font-semibold py-4 px-8 rounded-2xl text-base"
            style={{ background: 'linear-gradient(135deg, #0077B5 0%, #0ea5e9 100%)' }}
          >
            Iniciar diagnóstico →
          </button>
        )}
        <button
          onClick={() => { trackEvent('click_job_adapter', { location: 'hero' }); handleModeSelectJobAdapter() }}
          disabled={jobAdapterCheckLoading}
          className="w-full font-semibold py-3.5 px-8 rounded-2xl text-sm transition-all"
          style={{ border: '1.5px solid rgba(99,102,241,0.35)', color: '#6366f1', background: 'rgba(99,102,241,0.06)' }}
        >
          {jobAdapterCheckLoading ? '...' : '📝 Adaptar mi CV para un aviso →'}
        </button>
        {jobAdapterNoCv && (
          <p className="text-xs text-center leading-relaxed" style={{ color: '#6366f1' }}>
            Primero necesitás generar tu CV con el diagnóstico →{' '}
            <button onClick={() => { setJobAdapterNoCv(false); setStep(STEPS.QUESTIONS) }} className="underline font-semibold">
              Empezar ahora
            </button>
          </p>
        )}
        {!result && onStartFastTrack && (
          <button
            onClick={onStartFastTrack}
            className="w-full font-medium py-2.5 px-8 rounded-2xl text-xs transition-all"
            style={{ border: '1px solid rgba(0,119,181,0.18)', color: '#64748b', background: 'rgba(0,119,181,0.03)' }}
          >
            ⚡ Diagnóstico express — 3 preguntas (inicio rápido)
          </button>
        )}
        <p className="text-slate-500 text-xs">Sin registro · Resultado en minutos · 100% gratis</p>
      </div>

      {/* Training Pillars */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 28, width: '100%', maxWidth: 380, margin: '0 auto' }}>
        {[
          { icon: '🎯', title: 'Diagnóstico', desc: 'Posición competitiva real en tu mercado' },
          { icon: '⚡', title: 'Entrenamiento', desc: 'Sesiones de práctica con feedback IA' },
          { icon: '📍', title: 'Ejecución', desc: 'Seguimiento activo de cada proceso' },
        ].map(p => (
          <div key={p.title} style={{
            background: 'white',
            borderRadius: 14,
            padding: '14px 10px',
            textAlign: 'center',
            border: '1px solid rgba(0,0,0,0.07)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
          }}>
            <div style={{ fontSize: 22, marginBottom: 6 }}>{p.icon}</div>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#0d2137', marginBottom: 3 }}>{p.title}</p>
            <p style={{ fontSize: 10, color: '#64748b', lineHeight: 1.4 }}>{p.desc}</p>
          </div>
        ))}
      </div>

      {/* Module strip */}
      <div style={{ width: '100%', maxWidth: 380, margin: '0 auto' }}>
        <p style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
          Sistema de 6 módulos de preparación
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
          {[
            { icon: '🎯', label: 'Diagnóstico' },
            { icon: '✏️', label: 'Posicionamiento' },
            { icon: '📄', label: 'CV de Combate' },
            { icon: '🎙️', label: 'Entrenamiento' },
            { icon: '⭐', label: 'STAR' },
            { icon: '📍', label: 'Postulaciones' },
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

        {/* ¿Qué incluye? */}
        <section>
          <h2 className="text-xl font-bold text-slate-900 mb-4">¿Qué incluye tu análisis?</h2>
          <div className="space-y-3">
            {[
              { icon: '🎯', title: 'Diagnóstico con criterio de headhunter', desc: 'Puntaje general del perfil y evaluación estratégica del primer impacto en reclutadores.' },
              { icon: '🔍', title: 'SEO de LinkedIn', desc: 'Palabras clave sugeridas para aparecer en búsquedas reales de reclutadores y clientes.' },
              { icon: '✏️', title: 'Titular y resumen reescritos', desc: 'Versión mejorada del titular y del About con propuesta de valor clara y llamada a la acción.' },
              { icon: '📋', title: 'Recomendaciones accionables', desc: 'Lista priorizada de cambios concretos que podés implementar hoy.' },
              { icon: '📄', title: 'CV de 1 página listo para enviar', desc: 'Lo que los reclutadores piden hoy: un CV moderno, ATS-compatible y de una sola página generado con tu perfil optimizado.' },
              { icon: '📣', title: 'Estrategia de contenido', desc: 'Qué publicar en LinkedIn según tu objetivo profesional para aumentar tu visibilidad.' },
              { icon: '🎙️', title: 'Simulador de entrevista con IA', desc: 'Practicá una entrevista inicial y recibí feedback detallado con criterio de RRHH.' },
              { icon: '⭐', title: 'Entrenamiento metodología STAR', desc: 'Aprendé el framework que usan los mejores candidatos y practicá con feedback instantáneo de IA para estructurar respuestas de alto impacto.' },
              { icon: '📝', title: 'CV adaptado por aviso + carta de presentación', desc: 'Pegás el aviso de empleo y la IA ajusta tu CV para esa posición específica e incluye una carta de presentación personalizada lista para enviar.' },
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

        {/* Comparativa vs alternativas */}
        <section>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold mb-3"
            style={{ background: 'rgba(99,102,241,0.08)', color: '#6366f1', border: '1px solid rgba(99,102,241,0.2)' }}>
            Por qué esta app
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Gratis vs. las alternativas</h2>
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
                    <div className="text-emerald-200">GRATIS 🎉</div>
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

        {/* Cómo funciona */}
        <section>
          <h2 className="text-xl font-bold text-slate-900 mb-4">Cómo funciona</h2>
          <div className="space-y-3">
            {[
              { num: '1', title: 'Diagnóstico LinkedIn', desc: 'Respondés 7 preguntas (o 3 en modo express) y subís tu perfil. En 60 segundos tenés tu score de empleabilidad, gaps y sugerencias.', color: '#0077B5' },
              { num: '2', title: 'Optimizás y generás tu CV', desc: 'Aplicás las mejoras al perfil y generás un CV ATS-compatible de 1 página con tu información optimizada.', color: '#059669' },
              { num: '3', title: 'Practicás y adaptás para cada oferta', desc: 'Simulás entrevistas con IA, adaptás tu CV por aviso y usás el método STAR para respuestas de impacto.', color: '#6366f1' },
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

        {/* Quién está detrás */}
        <section>
          <h2 className="text-xl font-bold text-slate-900 mb-4">Quién está detrás</h2>
          <div className="rounded-2xl p-5 flex items-start gap-4"
            style={{ background: 'white', border: '1px solid rgba(0,119,181,0.12)' }}>
            <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
              style={{ background: LI_GRADIENT }}>RS</div>
            <div>
              <p className="text-slate-900 font-semibold text-sm">Ramiro Silvera</p>
              <p className="text-slate-500 text-xs mt-0.5">Gerente de RRHH · Headhunter</p>
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
              { q: '¿Qué es Optimiza LK?', a: 'Optimiza LK es un sistema gratuito de preparación profesional creado por Ramiro Silvera (Gerente de RRHH y Headhunter) que diagnostica tu competitividad en el mercado laboral. También construís tu CV, entrenás entrevistas con IA y adaptás tu CV a cada oferta — todo sin costo y sin registro.' },
              { q: '¿Es realmente gratis?', a: 'Sí, 100% gratis y sin registro. No necesitás crear una cuenta ni dejar tu email para recibir el análisis.' },
              { q: '¿Qué pasa con mi CV o perfil?', a: 'Tu información se usa para generar el análisis. Solo se guarda si vos lo autorizás — por ejemplo, al solicitar contacto con Ramiro o generar tu CV, para poder brindarte un servicio más personalizado. En ningún caso se comparte con terceros.' },
              { q: '¿Cuánto tarda el análisis?', a: 'Menos de 60 segundos una vez que subís tu perfil. El cuestionario previo tarda 1-3 minutos (podés usar el modo express de 3 preguntas para empezar más rápido).' },
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
            <span>Análisis de perfiles LinkedIn con IA · Generador de CV · Simulador de entrevista</span>
          </p>
        </div>

      </div>

    </div>
  )
}

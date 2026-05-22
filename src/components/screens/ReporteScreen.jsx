import { STEPS, trackEvent } from '../../constants'
import { Logo, ScoreRing } from '../ui'

const SCORE_COLOR = s => s >= 8 ? '#059669' : s >= 6 ? '#d97706' : '#ef4444'
const SCORE_LABEL = s => s >= 8 ? 'Alto rendimiento' : s >= 6 ? 'En desarrollo' : 'Requiere atención'

function ScoreCard({ icon, title, score, label, note, onClick, ctaLabel, acColor }) {
  if (score == null) return (
    <div
      onClick={onClick}
      className={`rounded-2xl p-4 flex items-center gap-3 ${onClick ? 'cursor-pointer transition-all hover:shadow-sm active:scale-[0.99]' : ''}`}
      style={{ background: '#f8fafc', border: '1px solid rgba(0,0,0,0.07)' }}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
        style={{ background: 'rgba(0,0,0,0.04)' }}>{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-500">{title}</p>
        {ctaLabel
          ? <p className="text-xs mt-0.5 font-medium" style={{ color: acColor || '#0077B5' }}>{ctaLabel} →</p>
          : <p className="text-xs text-slate-400">Módulo no completado</p>
        }
      </div>
      <span className="text-lg font-bold text-slate-300 shrink-0">—</span>
    </div>
  )
  const color = SCORE_COLOR(score)
  return (
    <div className="rounded-2xl p-4 flex items-center gap-3"
      style={{ background: 'white', border: `1px solid ${color}22` }}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
        style={{ background: `${color}11` }}>{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        <p className="text-xs mt-0.5" style={{ color }}>{label || SCORE_LABEL(score)}</p>
        {note && <p className="text-xs text-slate-400 mt-0.5 leading-snug">{note}</p>}
      </div>
      <div className="text-right shrink-0">
        <span className="text-2xl font-bold" style={{ color }}>{score}</span>
        <span className="text-xs text-slate-400">/10</span>
      </div>
    </div>
  )
}

function buildReportHtml({ readinessIndex, result, cvQuality, interviewFeedback, starFeedback, userName }) {
  const ri = readinessIndex
  const liScore = result?.puntaje_general
  const cvScore = cvQuality?.score
  const interviewScore = interviewFeedback?.puntaje_entrevista
  const starScore = starFeedback?.puntaje
  const riColor = ri == null ? '#64748b' : ri >= 8 ? '#059669' : ri >= 6 ? '#d97706' : '#ef4444'
  const now = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })

  const scoreRow = (label, score) => score != null
    ? `<tr><td style="padding:6px 0;font-size:13px;color:#475569;">${label}</td><td style="padding:6px 0;font-size:13px;font-weight:700;color:${SCORE_COLOR(score)};text-align:right;">${score}/10</td></tr>`
    : `<tr><td style="padding:6px 0;font-size:13px;color:#94a3b8;">${label}</td><td style="padding:6px 0;font-size:13px;color:#cbd5e1;text-align:right;">—</td></tr>`

  const listItems = (arr) => (arr || []).slice(0, 4).map(item => `<li style="margin-bottom:4px;font-size:13px;color:#475569;">${item}</li>`).join('')

  const recs = (result?.recomendaciones || []).slice(0, 3).map(r =>
    `<div style="margin-bottom:10px;padding:10px 14px;background:#f8fafc;border-radius:10px;border-left:3px solid #0077B5;">
      <p style="margin:0 0 3px;font-size:13px;font-weight:600;color:#0d2137;">${r.titulo || ''}</p>
      <p style="margin:0;font-size:12px;color:#64748b;line-height:1.5;">${r.descripcion || ''}</p>
    </div>`
  ).join('')

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Informe de Preparación — Optimiza LK</title>
<style>
  body{font-family:'Helvetica Neue',Arial,sans-serif;margin:0;padding:0;background:#f0f4f8;color:#0d2137;}
  .page{max-width:680px;margin:0 auto;background:white;padding:48px 40px 56px;}
  h1{font-size:26px;font-weight:800;color:#0d2137;margin:0 0 4px;}
  h2{font-size:15px;font-weight:700;color:#0d2137;margin:24px 0 10px;}
  @media print{body{background:white;}.page{padding:24px 20px;}}
</style>
</head>
<body>
<div class="page">
  <!-- Header -->
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:32px;padding-bottom:20px;border-bottom:2px solid #e2e8f0;">
    <div>
      <p style="font-size:11px;font-weight:700;color:#0077B5;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 4px;">Optimiza LK · Sistema de Preparación Profesional</p>
      <h1>${userName ? userName : 'Informe de Preparación'}</h1>
      <p style="font-size:13px;color:#64748b;margin:4px 0 0;">Generado el ${now}</p>
    </div>
    ${ri != null ? `<div style="text-align:center;background:linear-gradient(135deg,#0d2137,#0077B5);padding:16px 20px;border-radius:14px;color:white;">
      <p style="margin:0 0 2px;font-size:10px;opacity:0.7;text-transform:uppercase;letter-spacing:0.05em;">Índice de Preparación</p>
      <p style="margin:0;font-size:36px;font-weight:800;line-height:1;">${ri.toFixed(1)}</p>
      <p style="margin:2px 0 0;font-size:10px;opacity:0.65;">/10</p>
    </div>` : ''}
  </div>

  <!-- Scores -->
  <h2>Desglose de módulos</h2>
  <table style="width:100%;border-collapse:collapse;">
    ${scoreRow('🎯 Diagnóstico de Competitividad', liScore)}
    ${scoreRow('📄 CV Profesional', cvScore)}
    ${scoreRow('🎙️ Sesión de Entrenamiento', interviewScore)}
    ${scoreRow('⭐ Alto Rendimiento STAR', starScore)}
  </table>

  ${result?.resumen_diagnostico ? `
  <h2>Diagnóstico</h2>
  <p style="font-size:13px;color:#475569;line-height:1.6;margin:0;">${result.resumen_diagnostico}</p>
  ` : ''}

  ${(result?.fortalezas || []).length > 0 ? `
  <h2>Ventajas competitivas</h2>
  <ul style="margin:0;padding-left:18px;">${listItems(result.fortalezas)}</ul>
  ` : ''}

  ${(result?.areas_de_mejora || []).length > 0 ? `
  <h2>Áreas de mejora prioritarias</h2>
  <ul style="margin:0;padding-left:18px;">${listItems(result.areas_de_mejora)}</ul>
  ` : ''}

  ${recs ? `<h2>Recomendaciones clave</h2>${recs}` : ''}

  ${result?.accion_prioritaria ? `
  <div style="margin-top:24px;padding:14px 18px;background:#eff6ff;border-radius:12px;border-left:4px solid #0077B5;">
    <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#0077B5;text-transform:uppercase;letter-spacing:0.06em;">Acción prioritaria para hoy</p>
    <p style="margin:0;font-size:13px;color:#1e3a5f;line-height:1.5;">${result.accion_prioritaria}</p>
  </div>
  ` : ''}

  <!-- Footer -->
  <div style="margin-top:40px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;">
    <p style="font-size:11px;color:#94a3b8;">optimizalinkedin.com · Sistema de Preparación Profesional · Ramiro Silvera</p>
  </div>
</div>
</body>
</html>`
}

export default function ReporteScreen({ setStep, readinessIndex, result, cvQuality, interviewFeedback, starFeedback, user }) {
  const userName = result?.nombre_titular || user?.nombre || null
  const riLabel = readinessIndex != null ? SCORE_LABEL(readinessIndex) : null

  // Compute which module to recommend next
  const nextModule = (() => {
    if (!result) return { icon: '🎯', label: 'Diagnóstico de Competitividad', step: STEPS.QUESTIONS, color: '#0077B5', desc: 'Punto de partida del sistema' }
    if (!cvQuality) return { icon: '📄', label: 'CV Profesional', step: STEPS.CV, color: '#059669', desc: 'Construí tu CV desde el diagnóstico' }
    if (!interviewFeedback) return { icon: '🎙️', label: 'Sesión de Entrenamiento', step: STEPS.INTERVIEW_INTRO, color: '#d97706', desc: '5 preguntas con feedback de IA' }
    if (!starFeedback) return { icon: '⭐', label: 'Alto Rendimiento STAR', step: STEPS.STAR_TRAINING, color: '#0d9488', desc: 'Metodología para respuestas de impacto' }
    return null
  })()

  const handleDownload = () => {
    trackEvent('reporte_download')
    const html = buildReportHtml({ readinessIndex, result, cvQuality, interviewFeedback, starFeedback, userName })
    const printHtml = html.replace('</body>', `<script>window.onload=function(){setTimeout(function(){window.print()},350)}<\/script></body>`)
    const win = window.open('', '_blank', 'width=900,height=750')
    if (win) {
      win.document.open(); win.document.write(printHtml); win.document.close()
    } else {
      const blob = new Blob([html], { type: 'text/html; charset=utf-8' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = 'Informe-Preparacion-OptimizaLK.html'
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(a.href), 2000)
    }
  }

  return (
    <div className="step-transition space-y-4">
      <Logo />

      {/* Header */}
      <div>
        <span className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full inline-block mb-2"
          style={{ background: 'rgba(0,119,181,0.08)', color: '#0077B5', border: '1px solid rgba(0,119,181,0.2)' }}>
          Informe de preparación
        </span>
        <h2 className="text-2xl font-bold text-slate-900 leading-tight">
          {userName ? `${userName.split(' ')[0]}, así está tu preparación` : 'Tu estado de preparación'}
        </h2>
        <p className="text-sm text-slate-500 mt-1 leading-snug">
          Índice consolidado de todos tus módulos · Exportable como PDF.
        </p>
      </div>

      {/* ── Readiness Index Hero — dato único, no existe en ninguna otra pantalla ── */}
      {readinessIndex != null ? (
        <div className="rounded-2xl overflow-hidden"
          style={{ background: 'linear-gradient(135deg,#0d2137 0%,#0077B5 100%)', boxShadow: '0 8px 24px rgba(0,119,181,0.25)' }}>
          <div className="px-5 py-5 flex items-center gap-5">
            <div className="shrink-0">
              <ScoreRing score={readinessIndex * 10} size={80} />
            </div>
            <div className="flex-1 text-white">
              <p className="text-[10px] font-bold uppercase tracking-widest opacity-70">Índice de Preparación</p>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-4xl font-bold leading-none">{readinessIndex.toFixed(1)}</span>
                <span className="text-base opacity-60">/10</span>
              </div>
              <p className="text-xs mt-1 opacity-80 leading-snug">{riLabel}</p>
            </div>
          </div>
          <div className="px-5 pb-4">
            <div className="rounded-xl px-3 py-2 text-[10px] leading-relaxed"
              style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.75)' }}>
              Diagnóstico 25% · CV 25% · Entrevista 30% · STAR 20%
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl p-5 text-center"
          style={{ background: 'rgba(0,119,181,0.04)', border: '1px dashed rgba(0,119,181,0.2)' }}>
          <p className="text-sm font-semibold text-slate-500">Completá al menos un módulo para ver tu Índice de Preparación.</p>
        </div>
      )}

      {/* ── Desglose por módulo — 4 scores consolidados, único en la app ── */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2.5">Desglose por módulo</p>
        <div className="space-y-2">
          <ScoreCard
            icon="🎯" title="Diagnóstico de Competitividad"
            score={result?.puntaje_general}
            ctaLabel={!result ? 'Iniciar diagnóstico' : null}
            acColor="#0077B5"
            onClick={!result ? () => { trackEvent('reporte_start_diagnostico'); setStep(STEPS.QUESTIONS) } : undefined}
          />
          <ScoreCard
            icon="📄" title="CV Profesional"
            score={cvQuality?.score} label={cvQuality?.nivel}
            ctaLabel={!cvQuality ? 'Construir CV' : null}
            acColor="#059669"
            onClick={!cvQuality ? () => { trackEvent('reporte_start_cv'); setStep(STEPS.CV) } : undefined}
          />
          <ScoreCard
            icon="🎙️" title="Sesión de Entrenamiento"
            score={interviewFeedback?.puntaje_entrevista}
            ctaLabel={!interviewFeedback ? 'Entrenar' : null}
            acColor="#d97706"
            onClick={!interviewFeedback ? () => { trackEvent('reporte_start_entrevista'); setStep(STEPS.INTERVIEW_INTRO) } : undefined}
          />
          <ScoreCard
            icon="⭐" title="Alto Rendimiento STAR"
            score={starFeedback?.puntaje}
            ctaLabel={!starFeedback ? 'Practicar STAR' : null}
            acColor="#0d9488"
            onClick={!starFeedback ? () => { trackEvent('reporte_start_star'); setStep(STEPS.STAR_TRAINING) } : undefined}
          />
        </div>
      </div>

      {/* ── Próxima sesión recomendada — insight único ── */}
      {nextModule && (
        <button
          onClick={() => { trackEvent('reporte_next_module', { step: nextModule.label }); setStep(nextModule.step) }}
          className="w-full rounded-2xl p-4 text-left transition-all hover:shadow-md active:scale-[0.99] spring-tap"
          style={{ background: `${nextModule.color}09`, border: `1.5px solid ${nextModule.color}33` }}
        >
          <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5"
            style={{ color: nextModule.color }}>↑ Próxima sesión recomendada</p>
          <div className="flex items-center gap-3">
            <span className="text-2xl">{nextModule.icon}</span>
            <div>
              <p className="text-sm font-bold text-slate-800 leading-tight">{nextModule.label}</p>
              <p className="text-xs text-slate-500 mt-0.5">{nextModule.desc}</p>
            </div>
          </div>
        </button>
      )}

      {nextModule === null && result && (
        <div className="rounded-2xl p-4 text-center"
          style={{ background: 'rgba(5,150,105,0.06)', border: '1px solid rgba(5,150,105,0.2)' }}>
          <p className="text-sm font-bold text-slate-800">✦ Preparación completa</p>
          <p className="text-xs text-slate-500 mt-1">Completaste todos los módulos del sistema.</p>
        </div>
      )}

      {/* ── Descarga PDF — artefacto de valor tangible ── */}
      <button
        onClick={handleDownload}
        className="btn-glow w-full font-semibold py-4 rounded-2xl text-white text-sm"
        style={{ background: 'linear-gradient(135deg,#0d2137,#0077B5)' }}
      >
        📥 Descargar informe completo como PDF
      </button>

      <button
        onClick={() => { trackEvent('reporte_back_to_roadmap'); setStep(STEPS.MODE_SELECT) }}
        className="w-full text-slate-400 text-sm hover:text-slate-600 transition-colors py-3 min-h-[44px]"
      >
        ← Mi preparación
      </button>
    </div>
  )
}

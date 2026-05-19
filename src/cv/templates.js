export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Deduplicate CV experiences: removes from experiencias_anteriores any entry
// already present in experiencias (matched by normalized cargo+empresa).
// Also hard-caps experiencias at 3. Safe to call on any CV object.
export function sanitizeCv(cv) {
  if (!cv) return cv
  const normKey = s => (s || '').toLowerCase().trim().replace(/\s+/g, ' ')
  const featured = (cv.experiencias || []).slice(0, 3)
  const featuredKeys = new Set(featured.map(e => `${normKey(e.cargo)}|${normKey(e.empresa)}`))
  const anteriores = (cv.experiencias_anteriores || []).filter(
    e => e.cargo && e.empresa && !featuredKeys.has(`${normKey(e.cargo)}|${normKey(e.empresa)}`)
  )
  // Deduplicate skills too (case-insensitive)
  const seenSkills = new Set()
  const habilidades = (cv.habilidades || []).filter(h => {
    const k = normKey(h)
    if (!k || seenSkills.has(k)) return false
    seenSkills.add(k)
    return true
  })
  return { ...cv, experiencias: featured, experiencias_anteriores: anteriores, habilidades }
}

// ── CV autofit script (shared across all templates) ─────────────────────────
export const CV_AUTOFIT_SCRIPT = `<script>
(function () {
  var A4W = Math.round(210 * 3.7795);
  var A4H = Math.round(297 * 3.7795);
  function autofit() {
    if (window.matchMedia('print').matches) return;
    var wrap = document.getElementById('cv-wrap');
    if (!wrap) return;
    var vw = window.innerWidth || document.documentElement.clientWidth || A4W;
    if (vw > 0 && vw < A4W) {
      wrap.style.zoom = (vw / A4W).toFixed(4);
      document.body.style.width = vw + 'px';
      document.body.style.minHeight = Math.round(A4H * (vw / A4W)) + 'px';
      document.documentElement.style.overflowX = 'hidden';
      document.body.style.overflowX = 'hidden';
      return;
    }
    var h = wrap.scrollHeight;
    if (h > 0 && h < A4H * 0.84) {
      wrap.style.zoom = Math.min((A4H * 0.93) / h, 1.35).toFixed(4);
    }
  }
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', autofit); } else { autofit(); }
  window.addEventListener('resize', autofit);
  function clearZoomForPrint() {
    var wrap = document.getElementById('cv-wrap');
    if (wrap) wrap.style.zoom = '';
    document.documentElement.style.overflowX = '';
    document.body.style.overflowX = '';
  }
  window.addEventListener('beforeprint', clearZoomForPrint);
  var mq = window.matchMedia('print');
  if (mq.addListener) { mq.addListener(function(e){ if(e.matches) clearZoomForPrint(); }); }
  else if (mq.addEventListener) { mq.addEventListener('change', function(e){ if(e.matches) clearZoomForPrint(); }); }
})();
<\/script>`

// ── CV template: Minimal ─────────────────────────────────────────────────────
export function buildCvHtmlMinimal(cv, photoBase64 = null, photoMime = 'image/jpeg', opts = {}) {
  const { forExport = false } = opts
  cv = sanitizeCv(cv)
  const e = escapeHtml
  const nameParts = (cv.nombre || '').trim().split(/\s+/)
  const apellido = nameParts.length > 1 ? nameParts[nameParts.length - 1] : nameParts[0] || ''
  const primerNombre = nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : ''
  const hoy = new Date()
  const fechaStr = `${String(hoy.getDate()).padStart(2, '0')}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${hoy.getFullYear()}`
  const pdfTitle = `${apellido}${primerNombre ? ' ' + primerNombre : ''} - ${fechaStr} - CV Optimiza LK`

  const photoHtml = photoBase64
    ? `<img class="cv-photo-min" src="data:${photoMime};base64,${photoBase64}" alt="Foto de perfil" />`
    : ''

  const contactItems = [
    cv.email    && `<span>✉ ${e(cv.email)}</span>`,
    cv.telefono && `<span>✆ ${e(cv.telefono)}</span>`,
    cv.linkedin && `<span>in ${e(cv.linkedin)}</span>`,
    cv.ubicacion&& `<span>⌖ ${e(cv.ubicacion)}</span>`,
  ].filter(Boolean).join('')

  const expHtml = (cv.experiencias || []).map(ex => `
    <div class="exp-item">
      <div class="exp-row">
        <span class="exp-role">${e(ex.cargo)}</span>
        <span class="exp-period">${e(ex.periodo || '')}</span>
      </div>
      <div class="exp-company">${e(ex.empresa)}</div>
      <ul class="exp-bullets">${(ex.logros || []).map(l => `<li>${e(l)}</li>`).join('')}</ul>
    </div>`).join('')

  const prevJobsHtml = (cv.experiencias_anteriores || []).length > 0
    ? `<div class="prev-jobs">${(cv.experiencias_anteriores || []).map(p =>
        `<span class="prev-job">${e(p.cargo)} · ${e(p.empresa)}</span>`
      ).join('')}</div>`
    : ''

  const skillsText = (cv.habilidades || []).join(' · ')

  const eduHtml = (cv.educacion || []).map(ed => `
    <div class="edu-item">
      <div class="edu-row">
        <span class="edu-title">${e(ed.titulo)}</span>
        <span class="edu-period">${e(ed.periodo || '')}</span>
      </div>
      <div class="edu-inst">${e(ed.institucion)}</div>
    </div>`).join('')

  const idiomasText = (cv.idiomas || []).join(' · ')

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(pdfTitle)}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 9.5pt; color: #111827; line-height: 1.5; width: 210mm; min-height: 297mm; background: white; }
  .cv-wrap { width: 100%; min-height: 100%; padding: 16mm 14mm 14mm; }
  .cv-header { display: flex; align-items: flex-start; justify-content: space-between; padding-bottom: 11px; border-bottom: 2px solid #111827; margin-bottom: 11px; gap: 14px; }
  .header-left { flex: 1; min-width: 0; }
  .cv-name { font-size: 20pt; font-weight: 800; letter-spacing: -0.5px; line-height: 1.1; word-break: break-word; overflow-wrap: break-word; }
  .cv-title { font-size: 9.5pt; color: #6B7280; margin-top: 5px; line-height: 1.45; overflow-wrap: break-word; }
  .cv-photo-min { width: 68px; height: 68px; border-radius: 50%; object-fit: cover; border: 2px solid #e5e7eb; flex-shrink: 0; }
  .contact-bar { display: flex; flex-wrap: wrap; gap: 3px 16px; font-size: 8pt; color: #6B7280; margin-bottom: 16px; overflow-wrap: break-word; }
  .section { margin-bottom: 14px; }
  .section-title { font-size: 7.5pt; font-weight: 700; letter-spacing: 1.8px; text-transform: uppercase; color: #374151; padding-bottom: 5px; margin-bottom: 9px; border-bottom: 1px solid #E5E7EB; }
  .resumen-text { font-size: 9pt; color: #374151; line-height: 1.62; overflow-wrap: break-word; }
  .exp-item { margin-bottom: 12px; }
  .exp-item:last-child { margin-bottom: 0; }
  .exp-row { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
  .exp-role { font-size: 9.5pt; font-weight: 700; color: #111827; flex: 1; min-width: 0; overflow-wrap: break-word; }
  .exp-period { font-size: 7.5pt; color: #9CA3AF; white-space: nowrap; flex-shrink: 0; }
  .exp-company { font-size: 8.5pt; color: #6B7280; font-style: italic; margin: 2px 0 5px; overflow-wrap: break-word; }
  .exp-bullets { margin: 0 0 0 13px; padding: 0; }
  .exp-bullets li { font-size: 8.5pt; color: #374151; margin-bottom: 3px; line-height: 1.48; overflow-wrap: break-word; }
  .prev-jobs { margin-top: 9px; padding-top: 7px; border-top: 0.5px solid #E5E7EB; display: flex; flex-wrap: wrap; gap: 2px 10px; }
  .prev-job { font-size: 7.5pt; color: #9CA3AF; overflow-wrap: break-word; }
  .edu-item { margin-bottom: 8px; }
  .edu-row { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
  .edu-title { font-size: 9pt; font-weight: 600; color: #111827; flex: 1; min-width: 0; overflow-wrap: break-word; }
  .edu-period { font-size: 7.5pt; color: #9CA3AF; white-space: nowrap; flex-shrink: 0; }
  .edu-inst { font-size: 8.5pt; color: #6B7280; margin-top: 2px; overflow-wrap: break-word; }
  .skills-text { font-size: 8.5pt; color: #374151; line-height: 1.7; overflow-wrap: break-word; }
  @media print {
    @page { size: A4 portrait; margin: 0; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    html, body { margin: 0 !important; padding: 0 !important; width: 210mm !important; }
    .cv-wrap { zoom: 1 !important; transform: none !important; }
  }
</style>
</head>
<body>
<div class="cv-wrap" id="cv-wrap">
  <div class="cv-header">
    <div class="header-left">
      <div class="cv-name">${e(cv.nombre)}</div>
      <div class="cv-title">${e(cv.titular)}</div>
    </div>
    ${photoHtml}
  </div>
  ${contactItems ? `<div class="contact-bar">${contactItems}</div>` : ''}
  ${cv.resumen ? `<div class="section"><div class="section-title">Perfil</div><p class="resumen-text">${e(cv.resumen)}</p></div>` : ''}
  ${expHtml ? `<div class="section"><div class="section-title">Experiencia</div>${expHtml}${prevJobsHtml}</div>` : ''}
  ${skillsText ? `<div class="section"><div class="section-title">Habilidades</div><p class="skills-text">${e(skillsText)}</p></div>` : ''}
  ${eduHtml ? `<div class="section"><div class="section-title">Educación</div>${eduHtml}</div>` : ''}
  ${idiomasText ? `<div class="section"><div class="section-title">Idiomas</div><p class="skills-text">${e(idiomasText)}</p></div>` : ''}
</div>
${forExport ? '' : CV_AUTOFIT_SCRIPT}
</body></html>`
}

// ── CV template: Ejecutivo ───────────────────────────────────────────────────
export function buildCvHtmlEjecutivo(cv, photoBase64 = null, photoMime = 'image/jpeg', opts = {}) {
  const { forExport = false } = opts
  cv = sanitizeCv(cv)
  const e = escapeHtml
  const nameParts = (cv.nombre || '').trim().split(/\s+/)
  const apellido = nameParts.length > 1 ? nameParts[nameParts.length - 1] : nameParts[0] || ''
  const primerNombre = nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : ''
  const hoy = new Date()
  const fechaStr = `${String(hoy.getDate()).padStart(2, '0')}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${hoy.getFullYear()}`
  const pdfTitle = `${apellido}${primerNombre ? ' ' + primerNombre : ''} - ${fechaStr} - CV Optimiza LK`

  const contactItems = [
    cv.email    && `<div class="cl-item">✉ ${e(cv.email)}</div>`,
    cv.telefono && `<div class="cl-item">✆ ${e(cv.telefono)}</div>`,
    cv.linkedin && `<div class="cl-item">in ${e(cv.linkedin)}</div>`,
    cv.ubicacion&& `<div class="cl-item">⌖ ${e(cv.ubicacion)}</div>`,
  ].filter(Boolean).join('')

  const skillsHtml = (cv.habilidades || []).map(s => `<div class="cl-skill">${e(s)}</div>`).join('')

  const eduHtml = (cv.educacion || []).map(ed => `
    <div class="cl-edu">
      <div class="cl-edu-title">${e(ed.titulo)}</div>
      <div class="cl-edu-inst">${e(ed.institucion)}</div>
      ${ed.periodo ? `<div class="cl-edu-period">${e(ed.periodo)}</div>` : ''}
    </div>`).join('')

  const idiomasHtml = (cv.idiomas || []).map(i => `<div class="cl-idioma">${e(i)}</div>`).join('')

  const expHtml = (cv.experiencias || []).map(ex => `
    <div class="exp-item">
      <div class="exp-header">
        <span class="exp-role">${e(ex.cargo)}</span>
        <span class="exp-period">${e(ex.periodo || '')}</span>
      </div>
      <div class="exp-company">${e(ex.empresa)}</div>
      <ul class="exp-bullets">${(ex.logros || []).map(l => `<li>${e(l)}</li>`).join('')}</ul>
    </div>`).join('')

  const prevJobsHtml = (cv.experiencias_anteriores || []).length > 0
    ? `<div class="prev-wrap">${(cv.experiencias_anteriores || []).map(p =>
        `<div class="prev-item"><span class="prev-role">${e(p.cargo)}</span> · <span class="prev-co">${e(p.empresa)}</span></div>`
      ).join('')}</div>`
    : ''

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=210mm, initial-scale=1">
<title>${e(pdfTitle)}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 9.5pt; color: #1e293b; line-height: 1.48; width: 210mm; min-height: 297mm; background: white; }
  .cv-wrap { display: flex; flex-direction: column; width: 210mm; min-height: 297mm; }
  .cv-header { background: #1e293b; color: white; padding: 20px 26px; display: flex; align-items: center; gap: 16px; }
  .header-text { flex: 1; }
  .cv-name { font-size: 20pt; font-weight: 800; color: white; letter-spacing: -0.3px; line-height: 1.1; }
  .cv-title { font-size: 9pt; color: rgba(255,255,255,0.60); margin-top: 4px; line-height: 1.4; }
  .cv-photo-exec { width: 64px; height: 64px; border-radius: 50%; object-fit: cover; border: 2px solid rgba(255,255,255,0.25); flex-shrink: 0; }
  .cv-body { display: flex; flex: 1; }
  .col-left { width: 58mm; background: #f8fafc; border-right: 1px solid #e2e8f0; padding: 16px 14px; flex-shrink: 0; }
  .col-right { flex: 1; padding: 16px 20px; background: white; min-width: 0; }
  .cl-section { margin-bottom: 14px; }
  .cl-section-title { font-size: 6pt; font-weight: 700; letter-spacing: 1.3px; text-transform: uppercase; color: #b45309; padding-bottom: 4px; margin-bottom: 7px; border-bottom: 1px solid #fde68a; }
  .cl-item { font-size: 7.5pt; color: #475569; margin-bottom: 4px; word-break: break-all; line-height: 1.35; }
  .cl-skill { font-size: 8pt; color: #334155; padding: 2.5px 0; border-bottom: 0.5px solid #e2e8f0; line-height: 1.35; }
  .cl-skill:last-child { border-bottom: none; }
  .cl-edu { margin-bottom: 8px; }
  .cl-edu-title { font-size: 8pt; font-weight: 600; color: #1e293b; line-height: 1.3; }
  .cl-edu-inst { font-size: 7.5pt; color: #64748b; font-style: italic; margin-top: 1px; }
  .cl-edu-period { font-size: 7pt; color: #94a3b8; margin-top: 1.5px; }
  .cl-idioma { font-size: 8pt; color: #475569; margin-bottom: 3px; }
  .cr-section { margin-bottom: 14px; }
  .cr-section-title { font-size: 6.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.9px; color: #1e293b; padding-bottom: 4px; margin-bottom: 10px; border-bottom: 1.5px solid #cbd5e1; }
  .resumen-text { font-size: 9pt; color: #374151; line-height: 1.62; }
  .exp-item { margin-bottom: 12px; }
  .exp-item:last-child { margin-bottom: 0; }
  .exp-header { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
  .exp-role { font-size: 10pt; font-weight: 700; color: #0f172a; flex: 1; line-height: 1.25; }
  .exp-period { font-size: 7.5pt; color: #94a3b8; white-space: nowrap; flex-shrink: 0; }
  .exp-company { font-size: 8.5pt; color: #b45309; font-weight: 600; margin: 2px 0 4px; }
  .exp-bullets { margin: 0 0 0 13px; padding: 0; }
  .exp-bullets li { font-size: 8.5pt; color: #374151; margin-bottom: 2.5px; line-height: 1.48; }
  .prev-wrap { margin-top: 9px; padding-top: 7px; border-top: 0.5px solid #e2e8f0; }
  .prev-item { font-size: 8pt; color: #64748b; margin-bottom: 3px; }
  .prev-role { font-weight: 600; color: #475569; }
  .prev-co { font-style: italic; }
  @media print {
    @page { size: A4 portrait; margin: 0; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    html, body { margin: 0 !important; padding: 0 !important; width: 210mm !important; }
    .cv-wrap { zoom: 1 !important; transform: none !important; break-inside: avoid; }
  }
</style>
</head>
<body>
<div class="cv-wrap" id="cv-wrap">
  <div class="cv-header">
    ${photoBase64 ? `<img class="cv-photo-exec" src="data:${photoMime};base64,${photoBase64}" alt="Foto de perfil" />` : ''}
    <div class="header-text">
      <div class="cv-name">${e(cv.nombre)}</div>
      <div class="cv-title">${e(cv.titular)}</div>
    </div>
  </div>
  <div class="cv-body">
    <div class="col-left">
      ${contactItems ? `<div class="cl-section"><div class="cl-section-title">Contacto</div>${contactItems}</div>` : ''}
      ${skillsHtml ? `<div class="cl-section"><div class="cl-section-title">Habilidades</div>${skillsHtml}</div>` : ''}
      ${eduHtml ? `<div class="cl-section"><div class="cl-section-title">Educación</div>${eduHtml}</div>` : ''}
      ${idiomasHtml ? `<div class="cl-section"><div class="cl-section-title">Idiomas</div>${idiomasHtml}</div>` : ''}
    </div>
    <div class="col-right">
      ${cv.resumen ? `<div class="cr-section"><div class="cr-section-title">Resumen Profesional</div><p class="resumen-text">${e(cv.resumen)}</p></div>` : ''}
      ${expHtml ? `<div class="cr-section"><div class="cr-section-title">Experiencia</div>${expHtml}${prevJobsHtml}</div>` : ''}
    </div>
  </div>
</div>
${forExport ? '' : CV_AUTOFIT_SCRIPT}
</body></html>`
}

export function buildCvHtml(cv, photoBase64 = null, photoMime = 'image/jpeg', template = 'clasico', opts = {}) {
  const { forExport = false } = opts
  cv = sanitizeCv(cv)
  const e = escapeHtml
  if (template === 'minimal')   return buildCvHtmlMinimal(cv, photoBase64, photoMime, opts)
  if (template === 'ejecutivo') return buildCvHtmlEjecutivo(cv, photoBase64, photoMime, opts)

  // Template-specific color scheme
  const sidebarBg    = template === 'tech' ? '#134e4a' : template === 'creativo' ? 'linear-gradient(160deg,#7c3aed,#4338ca)' : '#0d2137'
  const accentColor  = template === 'tech' ? '#34d399' : template === 'creativo' ? '#c4b5fd' : '#38bdf8'
  const mainAccent   = template === 'tech' ? '#0f766e' : template === 'creativo' ? '#7c3aed' : '#0077B5'
  const borderAccent = template === 'tech' ? '#99f6e4' : template === 'creativo' ? '#ddd6fe' : '#BFDBFE'
  const companyColor = template === 'tech' ? '#0f766e' : template === 'creativo' ? '#7c3aed' : '#0077B5'

  // ── PDF filename: "Apellido Nombre - DD-MM-YYYY - CV Optimiza LK" ──
  const nameParts = (cv.nombre || '').trim().split(/\s+/)
  const apellido = nameParts.length > 1 ? nameParts[nameParts.length - 1] : nameParts[0] || ''
  const primerNombre = nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : ''
  const hoy = new Date()
  const fechaStr = `${String(hoy.getDate()).padStart(2, '0')}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${hoy.getFullYear()}`
  const pdfTitle = `${apellido}${primerNombre ? ' ' + primerNombre : ''} - ${fechaStr} - CV Optimiza LK`

  // ── Sidebar: photo ──
  const photoHtml = photoBase64
    ? `<img class="cv-photo" src="data:${photoMime};base64,${photoBase64}" alt="Foto de perfil" />`
    : `<div class="cv-photo-placeholder"></div>`

  // ── Sidebar: contact ──
  const contactItems = [
    cv.email    && `<div class="sb-contact-item">✉ ${e(cv.email)}</div>`,
    cv.telefono && `<div class="sb-contact-item">✆ ${e(cv.telefono)}</div>`,
    cv.linkedin && `<div class="sb-contact-item">in ${e(cv.linkedin)}</div>`,
    cv.ubicacion&& `<div class="sb-contact-item">⌖ ${e(cv.ubicacion)}</div>`,
  ].filter(Boolean).join('')

  // ── Sidebar: skills ──
  const skillsHtml = (cv.habilidades || [])
    .map(s => `<div class="sb-skill">${e(s)}</div>`).join('')

  // ── Sidebar: education ──
  const eduHtml = (cv.educacion || []).map(ed => `
    <div class="sb-edu-item">
      <div class="sb-edu-title">${e(ed.titulo)}</div>
      <div class="sb-edu-inst">${e(ed.institucion)}</div>
      ${ed.periodo ? `<div class="sb-edu-period">${e(ed.periodo)}</div>` : ''}
    </div>`).join('')

  // ── Sidebar: languages ──
  const idiomasHtml = (cv.idiomas || [])
    .map(i => `<div class="sb-idioma">${e(i)}</div>`).join('')

  // ── Main: experience (3 recent with bullets) ──
  const expHtml = (cv.experiencias || []).map(ex => `
    <div class="exp-item">
      <div class="exp-header">
        <span class="exp-role">${e(ex.cargo)}</span>
        <span class="exp-period">${e(ex.periodo || '')}</span>
      </div>
      <div class="exp-company">${e(ex.empresa)}</div>
      <ul class="exp-bullets">${(ex.logros || []).map(l => `<li>${e(l)}</li>`).join('')}</ul>
    </div>`).join('')

  // ── Main: previous jobs (compact, no bullets) ──
  const prevJobsHtml = (cv.experiencias_anteriores || []).length > 0
    ? `<div class="exp-prev-wrap">
        ${(cv.experiencias_anteriores || []).map(p =>
          `<div class="exp-prev-item"><span class="exp-prev-role">${e(p.cargo)}</span><span class="exp-prev-sep"> · </span><span class="exp-prev-co">${e(p.empresa)}</span></div>`
        ).join('')}
      </div>`
    : ''

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=210mm, initial-scale=1">
<title>${e(pdfTitle)}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Helvetica Neue', Arial, sans-serif;
    font-size: 9.5pt;
    color: #1a2332;
    line-height: 1.48;
    width: 210mm;
    min-height: 297mm;
    background: white;
  }

  /* ── Layout ── */
  .cv-wrap {
    display: flex;
    width: 210mm;
    min-height: 297mm;
  }

  /* ── SIDEBAR ── */
  .sidebar {
    width: 65mm;
    background: ${sidebarBg};
    color: white;
    padding: 26px 17px 24px;
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
  }

  .photo-wrap {
    display: flex;
    justify-content: center;
    margin-bottom: 15px;
  }

  .cv-photo {
    width: 76px; height: 76px;
    border-radius: 50%;
    object-fit: cover;
    border: 2.5px solid rgba(255,255,255,0.30);
  }

  .cv-photo-placeholder {
    width: 76px; height: 76px;
    border-radius: 50%;
    background: rgba(255,255,255,0.10);
    border: 2px solid rgba(255,255,255,0.18);
  }

  .sb-name {
    font-size: 14pt;
    font-weight: 700;
    color: #ffffff;
    line-height: 1.2;
    margin-bottom: 5px;
    word-break: break-word;
    hyphens: auto;
  }

  .sb-title {
    font-size: 8pt;
    color: rgba(255,255,255,0.65);
    line-height: 1.40;
    margin-bottom: 20px;
  }

  .sb-section { margin-bottom: 18px; }

  .sb-section-title {
    font-size: 6.5pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1.3px;
    color: ${accentColor};
    padding-bottom: 5px;
    margin-bottom: 8px;
    border-bottom: 0.5px solid rgba(255,255,255,0.12);
  }

  .sb-contact-item {
    font-size: 7.5pt;
    color: rgba(255,255,255,0.78);
    margin-bottom: 5px;
    word-break: break-all;
    line-height: 1.38;
  }

  .sb-skill {
    font-size: 8pt;
    color: rgba(255,255,255,0.82);
    padding: 3.5px 0;
    border-bottom: 0.5px solid rgba(255,255,255,0.07);
    line-height: 1.32;
  }
  .sb-skill:last-child { border-bottom: none; }

  .sb-edu-item { margin-bottom: 10px; }
  .sb-edu-title  { font-size: 8pt; font-weight: 600; color: white; line-height: 1.3; }
  .sb-edu-inst   { font-size: 7.5pt; color: rgba(255,255,255,0.60); font-style: italic; margin-top: 1.5px; }
  .sb-edu-period { font-size: 7pt; color: rgba(255,255,255,0.44); margin-top: 2px; }

  .sb-idioma {
    font-size: 8pt;
    color: rgba(255,255,255,0.80);
    margin-bottom: 4px;
    line-height: 1.32;
  }

  /* ── Tech: skill tags ── */
  ${template === 'tech' ? `.sb-skill { display: inline-block; background: rgba(52,211,153,0.15); border: 1px solid rgba(52,211,153,0.25); border-radius: 3px; padding: 2px 6px; font-size: 7pt; color: rgba(255,255,255,0.88); margin: 2px 1px; }
  .sb-skill:last-child { border-bottom: none; }` : ''}

  /* ── MAIN COLUMN ── */
  .main {
    flex: 1;
    padding: 30px 24px 26px 26px;
    background: white;
    min-width: 0;
  }

  .main-section { margin-bottom: 18px; }

  .main-section-title {
    font-size: 8pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.9px;
    color: ${mainAccent};
    padding-bottom: 4px;
    margin-bottom: 11px;
    border-bottom: 1.5px solid ${borderAccent};
  }

  .resumen-text {
    font-size: 9pt;
    color: #374151;
    line-height: 1.62;
  }

  .exp-item { margin-bottom: 13px; }
  .exp-item:last-child { margin-bottom: 0; }

  .exp-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
  }

  .exp-role {
    font-size: 10pt;
    font-weight: 700;
    color: #0f172a;
    flex: 1;
    min-width: 0;
    line-height: 1.25;
  }

  .exp-period {
    font-size: 8pt;
    color: #6B7280;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .exp-company {
    font-size: 8.5pt;
    color: ${companyColor};
    font-weight: 600;
    margin: 2.5px 0 5px;
  }

  .exp-bullets { margin: 0 0 0 13px; padding: 0; }
  .exp-bullets li {
    font-size: 8.5pt;
    color: #374151;
    margin-bottom: 3px;
    line-height: 1.50;
  }

  /* ── Experiencia anterior (compact) ── */
  .exp-prev-wrap {
    margin-top: 11px;
    padding-top: 9px;
    border-top: 0.5px solid #e2e8f0;
  }
  .exp-prev-item {
    font-size: 8pt;
    color: #64748b;
    margin-bottom: 3.5px;
    line-height: 1.35;
  }
  .exp-prev-role { font-weight: 600; color: #475569; }
  .exp-prev-sep  { color: #cbd5e1; margin: 0 2px; }
  .exp-prev-co   { font-style: italic; }

  @media print {
    @page { size: A4 portrait; margin: 0; }
    /* Forzar colores reales en todos los elementos (sidebar, fondos, etc.) */
    * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    /* SIN overflow:hidden ni height fijos — en iOS Safari clipa todo → página en blanco */
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      width: 210mm !important;
    }
    .cv-wrap {
      width: 210mm !important;
      min-height: 297mm !important;
      zoom: 1 !important;
      transform: none !important;
      break-inside: avoid;
      page-break-inside: avoid;
    }
  }
</style>
</head>
<body>
<div class="cv-wrap" id="cv-wrap">

  <!-- SIDEBAR -->
  <div class="sidebar">
    <div class="photo-wrap">${photoHtml}</div>
    <div class="sb-name">${e(cv.nombre)}</div>
    <div class="sb-title">${e(cv.titular)}</div>

    ${contactItems ? `
    <div class="sb-section">
      <div class="sb-section-title">Contacto</div>
      ${contactItems}
    </div>` : ''}

    ${skillsHtml ? `
    <div class="sb-section">
      <div class="sb-section-title">Habilidades</div>
      ${skillsHtml}
    </div>` : ''}

    ${eduHtml ? `
    <div class="sb-section">
      <div class="sb-section-title">Educación</div>
      ${eduHtml}
    </div>` : ''}

    ${idiomasHtml ? `
    <div class="sb-section">
      <div class="sb-section-title">Idiomas</div>
      ${idiomasHtml}
    </div>` : ''}
  </div>

  <!-- MAIN -->
  <div class="main">
    ${cv.resumen ? `
    <div class="main-section">
      <div class="main-section-title">Resumen Profesional</div>
      <p class="resumen-text">${e(cv.resumen)}</p>
    </div>` : ''}

    ${expHtml ? `
    <div class="main-section">
      <div class="main-section-title">Experiencia</div>
      ${expHtml}
      ${prevJobsHtml}
    </div>` : ''}
  </div>

</div>
${forExport ? '' : CV_AUTOFIT_SCRIPT}
</body></html>`
}

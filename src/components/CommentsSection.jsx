import { useState, useEffect } from 'react'
import { SUPABASE_URL, SUPABASE_KEY, LI_GRADIENT, BTN_BACK_STYLE } from '../constants'
import { LinkedInIcon, Spinner } from './ui'

const AVATAR_GRADS = [
  LI_GRADIENT,
  'linear-gradient(135deg,#6366f1,#8b5cf6)',
  'linear-gradient(135deg,#0d9488,#14b8a6)',
  'linear-gradient(135deg,#f59e0b,#ea580c)',
]

export default function CommentsSection() {
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [form, setForm] = useState({ nombre: '', titulo: '', linkedin_url: '', comentario: '', rating: 0 })
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [fetchError, setFetchError] = useState(false)

  useEffect(() => {
    if (!SUPABASE_URL) { setLoading(false); return }
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)
    fetch(
      `${SUPABASE_URL}/rest/v1/comments?status=eq.approved&order=created_at.desc&limit=6`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }, signal: controller.signal }
    )
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => setComments(Array.isArray(data) ? data : []))
      .catch(err => { if (err.name !== 'AbortError') setFetchError(true) })
      .finally(() => { clearTimeout(timeoutId); setLoading(false) })
    return () => { clearTimeout(timeoutId); controller.abort() }
  }, [])

  const initials = (name) => {
    const p = name.trim().split(/\s+/)
    return (p.length >= 2 ? p[0][0] + p[1][0] : name.slice(0, 2)).toUpperCase()
  }
  const avatarGrad = (name) => AVATAR_GRADS[name.charCodeAt(0) % AVATAR_GRADS.length]
  const isValidLinkedIn = (url) =>
    /^https?:\/\/(www\.)?linkedin\.com\/in\/[\w%-]+/i.test(url.trim())

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (submitting) return
    if (!isValidLinkedIn(form.linkedin_url)) {
      setFormError('La URL debe tener el formato: https://linkedin.com/in/tu-usuario')
      return
    }
    setSubmitting(true)
    setFormError('')
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/comments`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ ...form, rating: form.rating || null, status: 'pending' }),
      })
      if (!res.ok) throw new Error()
      setSubmitted(true)
      setShowForm(false)
      setForm({ nombre: '', titulo: '', linkedin_url: '', comentario: '', rating: 0 })
    } catch {
      setFormError('Error al enviar. Intentá de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!SUPABASE_URL) return null

  return (
    <div className="pt-10 text-left">
      <div className="flex items-center gap-3 mb-7">
        <div className="flex-1 h-px" style={{ background: 'rgba(0,119,181,0.15)' }} />
        <p className="text-xs font-medium tracking-widest uppercase" style={{ color: '#3d5a73' }}>
          Experiencias reales
        </p>
        <div className="flex-1 h-px" style={{ background: 'rgba(0,119,181,0.15)' }} />
      </div>

      {loading ? (
        <div className="flex justify-center py-6"><Spinner size={5} /></div>
      ) : fetchError ? (
        <p className="text-center text-slate-600 text-sm py-4">
          No se pudieron cargar los comentarios.
        </p>
      ) : comments.length === 0 ? (
        <p className="text-center text-slate-600 text-sm py-4">
          Aún no hay comentarios. ¡Sé el primero!
        </p>
      ) : (
        <div className="space-y-3">
          {comments.map(c => {
            const displayNombre    = c.edited_nombre     || c.nombre
            const displayComentario = c.edited_comentario || c.comentario
            return (
              <div key={c.id} className="rounded-2xl p-4"
                style={{ background: 'white', border: c.featured ? '1px solid rgba(0,119,181,0.3)' : '1px solid rgba(0,119,181,0.12)', boxShadow: c.featured ? '0 2px 12px rgba(0,119,181,0.1)' : '0 1px 6px rgba(0,0,0,0.05)' }}>
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                    style={{ background: avatarGrad(displayNombre) }}>
                    {initials(displayNombre)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-slate-900 text-sm font-semibold leading-tight">{displayNombre}</p>
                          {c.featured && <span style={{ fontSize:10, color:'#d97706' }}>⭐</span>}
                        </div>
                        <p className="text-slate-500 text-xs mt-0.5">{c.titulo}</p>
                        {c.rating && (
                          <p style={{ color:'#f59e0b', fontSize:13, letterSpacing:1, marginTop:2 }}>
                            {'★'.repeat(c.rating)}{'☆'.repeat(5 - c.rating)}
                          </p>
                        )}
                      </div>
                      {isValidLinkedIn(c.linkedin_url) && (
                        <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer"
                          className="shrink-0 mt-0.5 transition-opacity hover:opacity-70"
                          style={{ color: '#0077B5' }} title="Ver perfil de LinkedIn">
                          <LinkedInIcon className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                    <p className="text-slate-600 text-sm mt-2 leading-relaxed">"{displayComentario}"</p>
                    {c.admin_reply && (
                      <div className="mt-2 rounded-xl px-3 py-2" style={{ background:'rgba(0,119,181,0.06)', borderLeft:'3px solid #0077B5' }}>
                        <p className="text-xs font-semibold" style={{ color:'#0077B5' }}>OptimizaLK responde:</p>
                        <p className="text-xs mt-0.5" style={{ color:'#374151' }}>{c.admin_reply}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {submitted ? (
        <p className="text-center text-sm mt-5 py-3 rounded-2xl"
          style={{ color: '#4ade80', background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.2)' }}>
          ✓ ¡Gracias! Tu comentario está en revisión y se publicará pronto.
        </p>
      ) : showForm ? (
        <form onSubmit={handleSubmit} className="mt-5 space-y-3 rounded-2xl p-5"
          style={{ background: 'white', border: '1px solid rgba(0,119,181,0.15)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <p className="text-slate-900 font-semibold text-sm">Compartí tu experiencia</p>
          {[
            { key: 'nombre',       placeholder: 'Nombre completo',                               max: 80  },
            { key: 'titulo',       placeholder: 'Título profesional · Empresa',                  max: 100 },
            { key: 'linkedin_url', placeholder: 'https://linkedin.com/in/tu-usuario', isUrl: true, max: 200 },
          ].map(({ key, placeholder, isUrl, max }) => (
            <input key={key}
              type={isUrl ? 'url' : 'text'}
              required
              maxLength={max}
              value={form[key]}
              onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
              placeholder={placeholder}
              className="w-full rounded-xl px-4 py-2.5 text-sm outline-none"
              style={{ background: '#f8fafc', border: '1px solid rgba(0,119,181,0.18)', color: '#0d2137' }}
            />
          ))}
          {/* Star rating — optional */}
          <div>
            <p className="text-xs text-slate-500 mb-1.5">Calificación (opcional)</p>
            <div className="flex gap-1">
              {[1,2,3,4,5].map(n => (
                <button key={n} type="button"
                  onClick={() => setForm(f => ({ ...f, rating: f.rating === n ? 0 : n }))}
                  style={{ fontSize:22, color: n <= form.rating ? '#f59e0b' : '#d1d5db', lineHeight:1, background:'none', border:'none', cursor:'pointer', padding:'2px 4px' }}>
                  {n <= form.rating ? '★' : '☆'}
                </button>
              ))}
              {form.rating > 0 && (
                <button type="button" onClick={() => setForm(f => ({ ...f, rating: 0 }))}
                  style={{ fontSize:11, color:'#94a3b8', background:'none', border:'none', cursor:'pointer', marginLeft:4 }}>
                  quitar
                </button>
              )}
            </div>
          </div>

          <div className="relative">
            <textarea required
              value={form.comentario}
              onChange={e => setForm(f => ({ ...f, comentario: e.target.value }))}
              placeholder="Contá cómo te ayudó la app..."
              rows={3} maxLength={300}
              className="w-full rounded-xl px-4 py-2.5 text-sm outline-none resize-none"
              style={{ background: '#f8fafc', border: '1px solid rgba(0,119,181,0.18)', color: '#0d2137' }}
            />
            <span className="absolute bottom-2 right-3 text-xs pointer-events-none"
              style={{ color: form.comentario.length > 260 ? '#f59e0b' : '#94a3b8' }}>
              {form.comentario.length}/300
            </span>
          </div>
          {formError && <p className="text-xs" style={{ color: '#dc2626' }}>{formError}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button"
              onClick={() => { setShowForm(false); setFormError('') }}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium"
              style={BTN_BACK_STYLE}>
              Cancelar
            </button>
            <button type="submit" disabled={submitting}
              className={`flex-[2] py-2.5 rounded-xl text-sm font-semibold text-white ${!submitting ? 'btn-glow' : ''}`}
              style={{ background: submitting ? 'rgba(0,119,181,0.15)' : LI_GRADIENT, color: submitting ? '#64748b' : '#fff' }}>
              {submitting ? 'Enviando...' : 'Enviar comentario'}
            </button>
          </div>
        </form>
      ) : (
        <button onClick={() => setShowForm(true)}
          className="w-full mt-5 py-3 rounded-2xl text-sm font-medium transition-all duration-200"
          style={{ border: '1px solid rgba(0,119,181,0.15)', color: '#3d5a73', background: '#f8fafc' }}>
          ✍️ &nbsp;Compartí tu experiencia
        </button>
      )}
    </div>
  )
}

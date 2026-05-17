import { useState, useEffect, useCallback } from 'react'
import { WORKER_URL, WORKER_HEADERS, LI_GRADIENT } from '../constants.js'

// ── Design tokens ────────────────────────────────────────────────────────────
const C = {
  card:   { background:'white', border:'1px solid #e2e8f0', borderRadius:14, boxShadow:'0 1px 6px rgba(0,0,0,0.05)' },
  pri:    { background:LI_GRADIENT, color:'white', border:'none', borderRadius:9, padding:'8px 16px', fontWeight:600, fontSize:13, cursor:'pointer', whiteSpace:'nowrap', display:'inline-flex', alignItems:'center', gap:6 },
  sec:    { background:'#f1f5f9', color:'#475569', border:'1px solid #e2e8f0', borderRadius:9, padding:'8px 16px', fontWeight:600, fontSize:13, cursor:'pointer', whiteSpace:'nowrap' },
  danger: { background:'#fef2f2', color:'#dc2626', border:'1px solid #fecaca', borderRadius:9, padding:'8px 16px', fontWeight:600, fontSize:13, cursor:'pointer', whiteSpace:'nowrap' },
  input:  { border:'1px solid #e2e8f0', borderRadius:9, padding:'8px 12px', fontSize:13, width:'100%', outline:'none', background:'white', boxSizing:'border-box' },
}

const TABS = [
  { id:'dashboard',    label:'Dashboard',     icon:'📊' },
  { id:'users',        label:'Usuarios',      icon:'👥' },
  { id:'premium',      label:'Premium',       icon:'⭐' },
  { id:'revenue',      label:'Revenue',       icon:'💰' },
  { id:'inteligencia', label:'Inteligencia',  icon:'🧠' },
  { id:'codes',        label:'Códigos',       icon:'🎫' },
  { id:'comentarios',  label:'Comentarios',   icon:'💬' },
  { id:'logs',         label:'Logs',          icon:'📋' },
  { id:'ia',           label:'IA',            icon:'🤖' },
]

// Gemini 2.5 Flash Lite pricing (USD per token)
const COST_INPUT_PER_TOKEN  = 0.075  / 1_000_000
const COST_OUTPUT_PER_TOKEN = 0.30   / 1_000_000
const fmtCost = (inp, out) => {
  const usd = (inp || 0) * COST_INPUT_PER_TOKEN + (out || 0) * COST_OUTPUT_PER_TOKEN
  return usd < 0.01 ? `$${(usd * 100).toFixed(3)}¢` : `$${usd.toFixed(4)}`
}
const fmtK = n => n == null ? '—' : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)

// ── Primitives ────────────────────────────────────────────────────────────────
function Spin() {
  return <span style={{ display:'inline-block', width:16, height:16, border:'2px solid rgba(0,119,181,0.25)', borderTopColor:'#0077B5', borderRadius:'50%', animation:'admspin 0.7s linear infinite', flexShrink:0 }} />
}

function ErrBox({ msg, onRetry }) {
  return (
    <div style={{ padding:'16px 20px', borderRadius:12, background:'#fef2f2', border:'1px solid #fecaca' }}>
      <div style={{ fontWeight:700, fontSize:13, color:'#dc2626', marginBottom:4 }}>Error al cargar</div>
      <div style={{ fontSize:12, color:'#991b1b', marginBottom: onRetry ? 12 : 0 }}>{msg}</div>
      {onRetry && <button onClick={onRetry} style={C.sec}>Reintentar</button>}
    </div>
  )
}

function Empty({ text = 'Sin resultados' }) {
  return <div style={{ textAlign:'center', padding:'36px 20px', color:'#94a3b8', fontSize:13 }}>{text}</div>
}

function Th({ ch }) {
  return <th style={{ padding:'8px 12px', textAlign:'left', fontSize:11, fontWeight:700, color:'#64748b', background:'#f8fafc', whiteSpace:'nowrap' }}>{ch}</th>
}
function Td({ children, s }) {
  return <td style={{ padding:'10px 12px', fontSize:13, borderTop:'1px solid #f1f5f9', verticalAlign:'middle', ...s }}>{children}</td>
}

function Badge({ premium, hasta }) {
  if (!premium) return <span style={{ background:'#f1f5f9', color:'#64748b', borderRadius:99, padding:'2px 9px', fontWeight:600, fontSize:11 }}>Free</span>
  const label = hasta ? `Premium · ${new Date(hasta).toLocaleDateString('es-AR',{day:'numeric',month:'short'})}` : 'Premium'
  return <span style={{ background:LI_GRADIENT, color:'white', borderRadius:99, padding:'2px 9px', fontWeight:700, fontSize:11 }}>{label}</span>
}

// ── adminFetch hook — timeout 15s, catch uniforme ─────────────────────────
function useAdminFetch(authToken) {
  return useCallback(async (action, body = {}) => {
    const ctrl = new AbortController()
    const tid = setTimeout(() => ctrl.abort(), 15000)
    try {
      const res = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { ...WORKER_HEADERS, Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ action, ...body }),
        signal: ctrl.signal,
      })
      const data = await res.json()
      // Si el server devuelve ok:false explícito, respetarlo
      if (data && typeof data === 'object' && data.ok === false) return data
      return data
    } catch (e) {
      if (e.name === 'AbortError') return { ok:false, error:'Tiempo de espera agotado (15 s)' }
      return { ok:false, error: e.message || 'Error de red' }
    } finally {
      clearTimeout(tid)
    }
  }, [authToken])
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, color, sub }) {
  return (
    <div style={{ ...C.card, padding:'18px 14px', textAlign:'center', minWidth:110 }}>
      <div style={{ fontSize:26, fontWeight:800, color:color||'#0077B5', lineHeight:1 }}>{value ?? '—'}</div>
      <div style={{ fontSize:11, fontWeight:700, color:'#64748b', marginTop:4 }}>{label}</div>
      {sub && <div style={{ fontSize:10, color:'#94a3b8', marginTop:2 }}>{sub}</div>}
    </div>
  )
}

function Dashboard({ adminFetch }) {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    const d = await adminFetch('admin_stats')
    if (d?.ok && d.stats) setStats(d.stats)
    else setError(d?.error || 'Error al obtener estadísticas')
    setLoading(false)
  }, [adminFetch])

  useEffect(() => { load() }, [load])

  if (loading) return <div style={{ textAlign:'center', padding:60 }}><Spin /></div>
  if (error)   return <ErrBox msg={error} onRetry={load} />
  if (!stats)  return null

  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))', gap:12 }}>
      <StatCard label="Usuarios"      value={stats.total_users}    color="#0077B5" />
      <StatCard label="Premium"       value={stats.premium_users}  color="#6366f1" sub={`${stats.active_subs} subs MP`} />
      <StatCard label="Análisis"      value={stats.total_analyses} color="#0ea5e9" />
      <StatCard label="CVs"           value={stats.total_cvs}      color="#8b5cf6" />
      <StatCard label="Leads"         value={stats.total_leads}    color="#f59e0b" />
      <StatCard label="Nuevos 7 días" value={stats.new_users_7d}   color="#10b981" />
    </div>
  )
}

// ── User Detail ───────────────────────────────────────────────────────────────
function UserDetail({ user, adminFetch, onBack, onUpdated }) {
  const [detail, setDetail]     = useState(null)
  const [detErr, setDetErr]     = useState('')
  const [loading, setLoading]   = useState(true)
  const [days, setDays]         = useState(30)
  const [busy, setBusy]         = useState(false)
  const [msg, setMsg]           = useState({ text:'', ok:true })
  const [newTag, setNewTag]     = useState('')
  const [newNote, setNewNote]   = useState('')
  const [tagBusy, setTagBusy]   = useState(false)
  const [noteBusy, setNoteBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setDetErr('')
    const d = await adminFetch('admin_user_detail', { user_id:user.id })
    if (d?.ok) setDetail(d)
    else setDetErr(d?.error || 'Error al cargar detalle')
    setLoading(false)
  }, [user.id, adminFetch])

  useEffect(() => { load() }, [load])

  const grant = async () => {
    setBusy(true); setMsg({ text:'', ok:true })
    const d = await adminFetch('admin_grant_premium', { user_id:user.id, days })
    setBusy(false)
    if (d?.ok) { setMsg({ text:`Premium hasta ${new Date(d.premium_hasta).toLocaleDateString('es-AR')}`, ok:true }); onUpdated() }
    else setMsg({ text:d?.error||'Error', ok:false })
  }

  const revoke = async () => {
    if (!confirm(`¿Revocar premium de ${user.nombre||user.email}?`)) return
    setBusy(true); setMsg({ text:'', ok:true })
    const d = await adminFetch('admin_revoke_premium', { user_id:user.id })
    setBusy(false)
    if (d?.ok) { setMsg({ text:'Premium revocado', ok:true }); onUpdated() }
    else setMsg({ text:d?.error||'Error', ok:false })
  }

  return (
    <div style={{ ...C.card, padding:'20px' }}>
      <button onClick={onBack} style={{ ...C.sec, fontSize:12, marginBottom:16 }}>← Volver</button>
      <div style={{ fontWeight:700, fontSize:16, marginBottom:4 }}>{user.nombre || user.email}</div>
      <div style={{ fontSize:12, color:'#64748b', marginBottom:16, display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
        <span>{user.email}</span>
        <Badge premium={user.es_premium} hasta={user.premium_hasta} />
      </div>

      {loading ? <div style={{ textAlign:'center', padding:20 }}><Spin /></div>
        : detErr ? <ErrBox msg={detErr} onRetry={load} />
        : detail ? (
          <>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:16 }}>
              <StatCard label="Análisis"    value={detail.analisis_count}   color="#0077B5" />
              <StatCard label="CVs"         value={detail.cv_count}          color="#6366f1" />
              <StatCard label="Entrevistas" value={detail.entrevista_count}  color="#0d9488" />
            </div>
            {detail.historial?.length > 0 && (
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:12, fontWeight:700, color:'#64748b', marginBottom:8 }}>Últimas actividades</div>
                {detail.historial.slice(0,5).map(h => (
                  <div key={h.id} style={{ fontSize:12, color:'#475569', display:'flex', justifyContent:'space-between', padding:'4px 0', borderBottom:'1px solid #f8fafc' }}>
                    <span>{h.tipo} — {h.titulo||'—'}</span>
                    <span style={{ color:'#94a3b8' }}>{new Date(h.created_at).toLocaleDateString('es-AR')}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : null}

      {/* Tags */}
      <div style={{ borderTop:'1px solid #f1f5f9', paddingTop:14, marginTop:8 }}>
        <div style={{ fontSize:12, fontWeight:700, color:'#64748b', marginBottom:8 }}>Etiquetas internas</div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:8 }}>
          {(detail?.tags || []).map(t => (
            <span key={t.id || t.tag} style={{ background:'#e0f2fe', color:'#0369a1', borderRadius:99, padding:'3px 10px', fontSize:11, fontWeight:600, display:'flex', alignItems:'center', gap:4 }}>
              {t.tag}
              <button onClick={async () => {
                setTagBusy(true)
                const d = await adminFetch('admin_user_remove_tag', { user_id:user.id, tag:t.tag })
                if (d?.ok) setDetail(prev => ({ ...prev, tags: prev.tags.filter(x => x.tag !== t.tag) }))
                setTagBusy(false)
              }} style={{ border:'none', background:'none', cursor:'pointer', color:'#0369a1', fontWeight:700, padding:0, lineHeight:1 }}>×</button>
            </span>
          ))}
          {(detail?.tags || []).length === 0 && <span style={{ fontSize:11, color:'#94a3b8' }}>Sin etiquetas</span>}
        </div>
        <div style={{ display:'flex', gap:6 }}>
          <input value={newTag} onChange={e => setNewTag(e.target.value.toLowerCase())}
            onKeyDown={async e => { if (e.key === 'Enter' && newTag.trim()) {
              setTagBusy(true)
              const d = await adminFetch('admin_user_add_tag', { user_id:user.id, tag:newTag.trim() })
              if (d?.ok) { setDetail(prev => ({ ...prev, tags: [...(prev.tags||[]), { tag:newTag.trim(), id:Date.now() }] })); setNewTag('') }
              setTagBusy(false)
            }}}
            placeholder="Nueva etiqueta + Enter…" style={{ ...C.input, flex:1, fontSize:11 }} maxLength={30} />
          <button disabled={tagBusy || !newTag.trim()} onClick={async () => {
            if (!newTag.trim()) return
            setTagBusy(true)
            const d = await adminFetch('admin_user_add_tag', { user_id:user.id, tag:newTag.trim() })
            if (d?.ok) { setDetail(prev => ({ ...prev, tags: [...(prev.tags||[]), { tag:newTag.trim(), id:Date.now() }] })); setNewTag('') }
            setTagBusy(false)
          }} style={{ ...C.pri, fontSize:11, padding:'5px 10px' }}>+</button>
        </div>
      </div>

      {/* Notes */}
      <div style={{ borderTop:'1px solid #f1f5f9', paddingTop:14, marginTop:4 }}>
        <div style={{ fontSize:12, fontWeight:700, color:'#64748b', marginBottom:8 }}>Notas internas</div>
        <div style={{ display:'flex', gap:6, marginBottom:10 }}>
          <textarea value={newNote} onChange={e => setNewNote(e.target.value)}
            placeholder="Agregar nota interna…" rows={2} maxLength={500}
            style={{ ...C.input, resize:'vertical', flex:1, fontSize:12 }} />
          <button disabled={noteBusy || !newNote.trim()} onClick={async () => {
            if (!newNote.trim()) return
            setNoteBusy(true)
            const d = await adminFetch('admin_user_add_note', { user_id:user.id, nota:newNote.trim() })
            if (d?.ok) { setDetail(prev => ({ ...prev, notes: [{ nota:newNote.trim(), created_at:new Date().toISOString(), id:Date.now() }, ...(prev.notes||[])] })); setNewNote('') }
            setNoteBusy(false)
          }} style={{ ...C.pri, fontSize:11, padding:'5px 10px', alignSelf:'flex-end' }}>Guardar</button>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {(detail?.notes || []).map(n => (
            <div key={n.id} style={{ background:'#fefce8', border:'1px solid #fef08a', borderRadius:8, padding:'8px 12px', fontSize:12 }}>
              <div style={{ color:'#374151', lineHeight:1.5 }}>{n.nota}</div>
              <div style={{ fontSize:10, color:'#94a3b8', marginTop:4 }}>
                {new Date(n.created_at).toLocaleString('es-AR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}
              </div>
            </div>
          ))}
          {(detail?.notes || []).length === 0 && <span style={{ fontSize:11, color:'#94a3b8' }}>Sin notas</span>}
        </div>
      </div>

      {/* Premium access management */}
      <div style={{ borderTop:'1px solid #f1f5f9', paddingTop:16, marginTop:4 }}>
        <div style={{ fontSize:12, fontWeight:700, color:'#64748b', marginBottom:10 }}>Gestión de acceso</div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
          <select value={days} onChange={e => setDays(Number(e.target.value))} style={{ ...C.input, width:100 }}>
            {[7,14,30,60,90,180,365].map(n => <option key={n} value={n}>{n} días</option>)}
          </select>
          <button onClick={grant} disabled={busy} style={{ ...C.pri, opacity:busy?0.6:1 }}>
            {busy ? <Spin /> : '✓ Otorgar premium'}
          </button>
          {user.es_premium && (
            <button onClick={revoke} disabled={busy} style={{ ...C.danger, opacity:busy?0.6:1 }}>Revocar</button>
          )}
        </div>
        {msg.text && <div style={{ marginTop:10, fontSize:12, fontWeight:600, color:msg.ok?'#059669':'#dc2626' }}>{msg.text}</div>}
      </div>
    </div>
  )
}

// ── CRM Users Tab ─────────────────────────────────────────────────────────────
const PREMIUM_STATUS_OPTS = [
  { v:'all',     l:'Todos' },
  { v:'free',    l:'Free' },
  { v:'active',  l:'Premium activo' },
  { v:'expired', l:'Premium vencido' },
]
const FEATURE_OPTS = [
  { v:'',           l:'Cualquier uso' },
  { v:'analisis',   l:'Con análisis' },
  { v:'cv',         l:'Con CV' },
  { v:'entrevista', l:'Con entrevista' },
  { v:'star',       l:'Con STAR' },
]
const SORT_OPTS = [
  { v:'created_at_desc', l:'Más nuevos' },
  { v:'created_at_asc',  l:'Más antiguos' },
  { v:'activity_desc',   l:'Más activos' },
  { v:'tokens_desc',     l:'Mayor consumo IA' },
]
const fmtActivity = u => [
  u.analisis_count   ? `📊${u.analisis_count}`   : null,
  u.cv_count         ? `📄${u.cv_count}`         : null,
  u.entrevista_count ? `🎯${u.entrevista_count}` : null,
  u.star_count       ? `⭐${u.star_count}`       : null,
].filter(Boolean).join(' ') || '—'

function exportToCsv(users, filters) {
  const headers = ['ID','Nombre','Email','Estado','Origen Premium','MP Subscription','Alta','Análisis','CVs','Entrevistas','STAR','Tokens IA','Etiquetas']
  const rows = users.map(u => [
    u.id, u.nombre||'', u.email||'',
    u.premium_status || (u.es_premium ? 'active' : 'free'),
    u.premium_origen || '',
    u.mp_subscription_id || '',
    u.created_at ? new Date(u.created_at).toLocaleDateString('es-AR') : '',
    u.analisis_count||0, u.cv_count||0, u.entrevista_count||0, u.star_count||0,
    u.total_ai_tokens||0,
    (Array.isArray(u.tags) ? u.tags.join(';') : ''),
  ].map(v => `"${String(v).replace(/"/g,'""')}"`))
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
  const blob = new Blob(['﻿'+csv], { type:'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url
  a.download = `usuarios-optimizalk-${new Date().toISOString().slice(0,10)}.csv`
  document.body.appendChild(a); a.click()
  document.body.removeChild(a); URL.revokeObjectURL(url)
}

function CrmUsersTab({ adminFetch, defaultPremiumStatus = 'all' }) {
  const [users, setUsers]       = useState([])
  const [total, setTotal]       = useState(0)
  const [offset, setOffset]     = useState(0)
  const [hasMore, setHasMore]   = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [selected, setSelected] = useState(null)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [allChecked, setAllChecked]   = useState(false)
  const [copied, setCopied]     = useState(false)
  const [exporting, setExporting] = useState(false)
  const [availableTags, setAvailableTags] = useState([])
  const [showFilters, setShowFilters]     = useState(false)
  const [bulkTag, setBulkTag]   = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)

  const [filters, setFilters] = useState({
    search: '', premiumStatus: defaultPremiumStatus, featureUsed: '', tag: '', sort: 'created_at_desc',
  })
  const [searchInput, setSearchInput] = useState('')

  const LIMIT = 25

  const load = useCallback(async (f, off, replace) => {
    setLoading(true); setError('')
    const d = await adminFetch('admin_crm_users', {
      search: f.search, premium_status: f.premiumStatus, feature_used: f.featureUsed,
      tag: f.tag, sort: f.sort, offset: off, limit: LIMIT,
    })
    if (d?.ok) {
      const list = d.users || []
      if (replace) setUsers(list); else setUsers(prev => [...prev, ...list])
      setTotal(d.total || 0)
      setHasMore(list.length === LIMIT)
      setOffset(off)
      if (replace) { setSelectedIds(new Set()); setAllChecked(false) }
    } else setError(d?.error || 'Error al cargar usuarios')
    setLoading(false)
  }, [adminFetch])

  const loadTags = useCallback(async () => {
    const d = await adminFetch('admin_user_all_tags')
    if (d?.ok) setAvailableTags(d.tags || [])
  }, [adminFetch])

  useEffect(() => { load(filters, 0, true); loadTags() }, []) // eslint-disable-line

  const applyFilters = (newF) => {
    const f = { ...filters, ...newF }
    setFilters(f); load(f, 0, true)
  }

  const toggleSelect = (id) => setSelectedIds(prev => {
    const s = new Set(prev)
    s.has(id) ? s.delete(id) : s.add(id)
    return s
  })

  const toggleAll = () => {
    if (allChecked) { setSelectedIds(new Set()); setAllChecked(false) }
    else { setSelectedIds(new Set(users.map(u => u.id))); setAllChecked(true) }
  }

  const selectedUsers = users.filter(u => selectedIds.has(u.id))

  const copyEmails = () => {
    const emails = [...new Set(selectedUsers.map(u => u.email).filter(Boolean))]
    navigator.clipboard.writeText(emails.join('\n')).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    })
  }

  const doExport = async () => {
    setExporting(true)
    const d = await adminFetch('admin_crm_export', {
      search: filters.search, premium_status: filters.premiumStatus,
      feature_used: filters.featureUsed, tag: filters.tag, sort: filters.sort,
    })
    if (d?.ok) exportToCsv(d.users || [], filters)
    setExporting(false)
  }

  const addTagToSelected = async () => {
    if (!bulkTag.trim() || selectedIds.size === 0) return
    setBulkBusy(true)
    await Promise.all([...selectedIds].map(uid => adminFetch('admin_user_add_tag', { user_id:uid, tag:bulkTag.trim() })))
    setBulkTag(''); setBulkBusy(false)
    load(filters, 0, true); loadTags()
  }

  if (selected) return (
    <UserDetail user={selected} adminFetch={adminFetch}
      onBack={() => setSelected(null)}
      onUpdated={() => { setSelected(null); load(filters, 0, true) }} />
  )

  const PS_COLORS = { free:'#64748b', active:'#10b981', expired:'#f59e0b', all:'#0077B5' }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8 }}>
        <div style={{ fontSize:13, color:'#64748b' }}>
          {loading ? 'Cargando…' : <><strong style={{ color:'#0d2137' }}>{total}</strong> usuarios</>}
        </div>
        <div style={{ display:'flex', gap:6 }}>
          <button onClick={() => setShowFilters(f => !f)} style={{ ...C.sec, fontSize:12 }}>
            {showFilters ? '▲ Filtros' : '▼ Filtros'}
          </button>
          <button onClick={doExport} disabled={exporting} style={{ ...C.sec, fontSize:12 }}>
            {exporting ? <Spin /> : '⬇ CSV'}
          </button>
        </div>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div style={{ ...C.card, padding:'14px 16px', display:'flex', flexDirection:'column', gap:10 }}>
          {/* Search */}
          <div style={{ display:'flex', gap:6 }}>
            <input style={{ ...C.input, flex:1 }} placeholder="Buscar nombre o email…"
              value={searchInput} onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && applyFilters({ search:searchInput })} />
            <button onClick={() => applyFilters({ search:searchInput })} style={C.pri}>Buscar</button>
            {filters.search && <button onClick={() => { setSearchInput(''); applyFilters({ search:'' }) }} style={C.sec}>✕</button>}
          </div>
          {/* Premium status filter */}
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:'#64748b', marginBottom:6 }}>Estado premium</div>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {PREMIUM_STATUS_OPTS.map(o => (
                <button key={o.v} onClick={() => applyFilters({ premiumStatus:o.v })} style={{
                  ...C.sec, fontSize:11, padding:'4px 10px',
                  background: filters.premiumStatus === o.v ? PS_COLORS[o.v] : undefined,
                  color:      filters.premiumStatus === o.v ? 'white'         : undefined,
                  borderColor: filters.premiumStatus === o.v ? PS_COLORS[o.v] : undefined,
                }}>{o.l}</button>
              ))}
            </div>
          </div>
          {/* Feature filter */}
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:'#64748b', marginBottom:6 }}>Funcionalidad usada</div>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {FEATURE_OPTS.map(o => (
                <button key={o.v} onClick={() => applyFilters({ featureUsed:o.v })} style={{
                  ...C.sec, fontSize:11, padding:'4px 10px',
                  background: filters.featureUsed === o.v ? '#0077B5' : undefined,
                  color:      filters.featureUsed === o.v ? 'white'   : undefined,
                  borderColor: filters.featureUsed === o.v ? '#0077B5' : undefined,
                }}>{o.l}</button>
              ))}
            </div>
          </div>
          {/* Tag filter + Sort */}
          <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
            <div style={{ flex:1, minWidth:140 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#64748b', marginBottom:6 }}>Etiqueta</div>
              <select value={filters.tag} onChange={e => applyFilters({ tag:e.target.value })} style={C.input}>
                <option value=''>Todas las etiquetas</option>
                {availableTags.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div style={{ flex:1, minWidth:140 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#64748b', marginBottom:6 }}>Ordenar por</div>
              <select value={filters.sort} onChange={e => applyFilters({ sort:e.target.value })} style={C.input}>
                {SORT_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div style={{ background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:10, padding:'10px 14px', display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
          <span style={{ fontSize:12, fontWeight:700, color:'#1d4ed8', flex:1 }}>
            {selectedIds.size} usuario{selectedIds.size > 1 ? 's' : ''} seleccionado{selectedIds.size > 1 ? 's' : ''}
          </span>
          <button onClick={copyEmails} style={{ ...C.pri, fontSize:12 }}>
            {copied ? '✓ Copiado' : '📋 Copiar emails'}
          </button>
          <button onClick={() => exportToCsv(selectedUsers, filters)} style={{ ...C.sec, fontSize:12 }}>
            ⬇ CSV selección
          </button>
          <div style={{ display:'flex', gap:4 }}>
            <input value={bulkTag} onChange={e => setBulkTag(e.target.value.toLowerCase())}
              placeholder="Etiqueta a agregar…" style={{ ...C.input, width:140, fontSize:11 }} maxLength={30} />
            <button onClick={addTagToSelected} disabled={bulkBusy || !bulkTag.trim()} style={{ ...C.sec, fontSize:11 }}>
              🏷 Agregar
            </button>
          </div>
          <button onClick={() => { setSelectedIds(new Set()); setAllChecked(false) }} style={{ ...C.sec, fontSize:11 }}>✕</button>
        </div>
      )}

      {/* Error */}
      {error && <ErrBox msg={error} onRetry={() => load(filters, 0, true)} />}

      {/* Table — desktop */}
      <div style={{ ...C.card, overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', minWidth:560 }}>
          <thead>
            <tr>
              <Th ch={<input type="checkbox" checked={allChecked} onChange={toggleAll} style={{ cursor:'pointer' }} />} />
              <Th ch="Usuario" />
              <Th ch="Estado" />
              <Th ch="Actividad" />
              <Th ch="Tokens" />
              <Th ch="Etiquetas" />
              <Th ch="Alta" />
            </tr>
          </thead>
          <tbody>
            {users.map(u => {
              const isSelected = selectedIds.has(u.id)
              const ps = u.premium_status || (u.es_premium ? 'active' : 'free')
              return (
                <tr key={u.id} style={{ background: isSelected ? '#eff6ff' : 'white', cursor:'pointer' }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background='#f8fafc' }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background='white'; else e.currentTarget.style.background='#eff6ff' }}>
                  <Td>
                    <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(u.id)} style={{ cursor:'pointer' }}
                      onClick={e => e.stopPropagation()} />
                  </Td>
                  <Td s={{ maxWidth:180 }}>
                    <div onClick={() => setSelected(u)} style={{ fontWeight:600, fontSize:13, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{u.nombre || '—'}</div>
                    <div onClick={() => setSelected(u)} style={{ fontSize:11, color:'#94a3b8', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{u.email}</div>
                  </Td>
                  <Td s={{ onClick:() => setSelected(u) }}>
                    <span style={{ background:PS_COLORS[ps]+'22', color:PS_COLORS[ps], borderRadius:99, padding:'2px 8px', fontSize:11, fontWeight:700, whiteSpace:'nowrap' }}>
                      {ps === 'free' ? 'Free' : ps === 'active' ? '★ Premium' : '⚠ Vencido'}
                    </span>
                  </Td>
                  <Td s={{ fontSize:12, color:'#64748b', whiteSpace:'nowrap', onClick:() => setSelected(u) }}>{fmtActivity(u)}</Td>
                  <Td s={{ fontSize:11, color:'#64748b', whiteSpace:'nowrap', onClick:() => setSelected(u) }}>
                    {u.total_ai_tokens > 0 ? fmtK(u.total_ai_tokens) : '—'}
                  </Td>
                  <Td s={{ maxWidth:130 }}>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:3 }}>
                      {(Array.isArray(u.tags) ? u.tags : []).map(t => (
                        <span key={t} onClick={() => applyFilters({ tag: filters.tag === t ? '' : t })}
                          style={{ background:'#e0f2fe', color:'#0369a1', borderRadius:99, padding:'1px 6px', fontSize:10, fontWeight:600, cursor:'pointer' }}>{t}</span>
                      ))}
                    </div>
                  </Td>
                  <Td s={{ fontSize:11, color:'#64748b', whiteSpace:'nowrap', onClick:() => setSelected(u) }}>
                    {u.created_at ? new Date(u.created_at).toLocaleDateString('es-AR') : '—'}
                  </Td>
                </tr>
              )
            })}
            {!loading && users.length === 0 && <tr><td colSpan={7}><Empty text="Sin usuarios para este segmento" /></td></tr>}
          </tbody>
        </table>
      </div>

      {loading && <div style={{ textAlign:'center', padding:16 }}><Spin /></div>}
      {hasMore && !loading && (
        <button onClick={() => load(filters, offset + LIMIT, false)} style={{ ...C.sec, width:'100%' }}>
          Cargar más ({offset + LIMIT} / {total})
        </button>
      )}
    </div>
  )
}

// ── Codes Tab ─────────────────────────────────────────────────────────────────
function CodesTab({ adminFetch }) {
  const [promos, setPromos]   = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [form, setForm]       = useState({ code:'', description:'', duration_days:30, max_uses:'' })
  const [creating, setCreating] = useState(false)
  const [msg, setMsg]         = useState({ text:'', ok:true })

  const load = useCallback(async () => {
    setLoading(true); setError('')
    const d = await adminFetch('admin_list_promos')
    if (d?.ok) setPromos(d.promos || [])
    else setError(d?.error || 'Error al cargar códigos')
    setLoading(false)
  }, [adminFetch])

  useEffect(() => { load() }, [load])

  const create = async () => {
    if (!form.code.trim()) return
    setCreating(true); setMsg({ text:'', ok:true })
    const payload = { code:form.code.trim().toUpperCase(), description:form.description, duration_days:Number(form.duration_days) }
    if (form.max_uses) payload.max_uses = Number(form.max_uses)
    const d = await adminFetch('admin_create_promo', payload)
    if (d?.ok) {
      setMsg({ text:'Código creado', ok:true })
      setForm({ code:'', description:'', duration_days:30, max_uses:'' })
      load()
    } else {
      setMsg({ text:d?.error||'Error al crear', ok:false })
    }
    setCreating(false)
  }

  const toggle = async (id, cur) => {
    await adminFetch('admin_toggle_promo', { code_id:id, is_active:!cur })
    load()
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <div style={{ ...C.card, padding:'18px 18px' }}>
        <div style={{ fontWeight:700, fontSize:14, marginBottom:14 }}>Nuevo código promo</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(170px,1fr))', gap:10, marginBottom:12 }}>
          {[
            { key:'code',         label:'Código *',             ph:'BIENVENIDA30', type:'text'   },
            { key:'duration_days',label:'Días de acceso',       ph:'30',           type:'number' },
            { key:'description',  label:'Descripción',          ph:'Opcional',     type:'text'   },
            { key:'max_uses',     label:'Máx. usos (∞ = vacío)', ph:'100',         type:'number' },
          ].map(f => (
            <div key={f.key}>
              <label style={{ fontSize:11, fontWeight:700, color:'#64748b', display:'block', marginBottom:4 }}>{f.label}</label>
              <input type={f.type} placeholder={f.ph} value={form[f.key]}
                onChange={e => setForm(prev => ({ ...prev, [f.key]:e.target.value }))}
                style={C.input} min={f.type==='number'?1:undefined} />
            </div>
          ))}
        </div>
        <button onClick={create} disabled={creating || !form.code.trim()} style={{ ...C.pri, opacity:(creating||!form.code.trim())?0.6:1 }}>
          {creating ? <Spin /> : 'Crear código'}
        </button>
        {msg.text && <div style={{ marginTop:10, fontSize:12, fontWeight:600, color:msg.ok?'#059669':'#dc2626' }}>{msg.text}</div>}
      </div>

      <div style={C.card}>
        <div style={{ padding:'12px 16px', borderBottom:'1px solid #f1f5f9', fontWeight:700, fontSize:14 }}>Códigos activos</div>
        {loading ? <div style={{ textAlign:'center', padding:32 }}><Spin /></div>
          : error ? <div style={{ padding:14 }}><ErrBox msg={error} onRetry={load} /></div>
          : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', minWidth:480 }}>
              <thead><tr>
                {['Código','Descripción','Días','Usos','Vence','Estado'].map(h => <Th key={h} ch={h} />)}
              </tr></thead>
              <tbody>
                {promos.map(p => (
                  <tr key={p.id}>
                    <Td s={{ fontWeight:700 }}>{p.code}</Td>
                    <Td s={{ color:'#64748b' }}>{p.description||'—'}</Td>
                    <Td>{p.duration_days}d</Td>
                    <Td>{p.uses_count}{p.max_uses?`/${p.max_uses}`:''}</Td>
                    <Td s={{ color:'#64748b' }}>{p.expires_at ? new Date(p.expires_at).toLocaleDateString('es-AR') : '—'}</Td>
                    <Td>
                      <button onClick={() => toggle(p.id, p.is_active)} style={p.is_active ? C.pri : C.sec}>
                        {p.is_active ? '✓ Activo' : 'Inactivo'}
                      </button>
                    </Td>
                  </tr>
                ))}
                {promos.length === 0 && <tr><td colSpan={6}><Empty text="Sin códigos creados" /></td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Logs Tab ──────────────────────────────────────────────────────────────────
function LogsTab({ adminFetch }) {
  const [logs, setLogs]       = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [offset, setOffset]   = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const LIMIT = 40

  const load = useCallback(async (off, replace) => {
    setLoading(true); setError('')
    const d = await adminFetch('admin_list_logs', { offset:off, limit:LIMIT })
    if (d?.ok) {
      const list = d.logs || []
      if (replace) setLogs(list)
      else setLogs(prev => [...prev, ...list])
      setHasMore(list.length === LIMIT)
      setOffset(off)
    } else {
      setError(d?.error || 'Error al cargar logs')
    }
    setLoading(false)
  }, [adminFetch])

  useEffect(() => { load(0, true) }, [load])

  const col = a => a.includes('grant')||a.includes('create')||a.includes('activ') ? '#059669'
    : a.includes('revoke')||a.includes('deactiv')||a.includes('cancel') ? '#dc2626' : '#0077B5'

  if (loading && logs.length === 0) return <div style={{ textAlign:'center', padding:60 }}><Spin /></div>
  if (error) return <ErrBox msg={error} onRetry={() => load(0, true)} />

  return (
    <div style={C.card}>
      <div style={{ padding:'12px 16px', borderBottom:'1px solid #f1f5f9', fontWeight:700, fontSize:14 }}>Registro de acciones</div>
      <div style={{ padding:'12px 14px', display:'flex', flexDirection:'column', gap:8 }}>
        {logs.length === 0 && <Empty text="Sin acciones registradas aún" />}
        {logs.map(l => (
          <div key={l.id} style={{ padding:'10px 14px', background:'#f8fafc', borderRadius:10, borderLeft:`3px solid ${col(l.action)}` }}>
            <div style={{ display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:6 }}>
              <div>
                <span style={{ fontSize:12, fontWeight:700, color:col(l.action) }}>{l.action}</span>
                {l.target_type && <span style={{ fontSize:11, color:'#64748b', marginLeft:8 }}>{l.target_type}: {String(l.target_id||'').slice(0,10)}…</span>}
              </div>
              <span style={{ fontSize:11, color:'#94a3b8', whiteSpace:'nowrap' }}>
                {new Date(l.created_at).toLocaleString('es-AR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}
              </span>
            </div>
            {l.details && Object.keys(l.details).length > 0 && (
              <div style={{ fontSize:11, color:'#64748b', marginTop:4, wordBreak:'break-all' }}>{JSON.stringify(l.details)}</div>
            )}
          </div>
        ))}
      </div>
      {loading && logs.length > 0 && <div style={{ textAlign:'center', padding:10 }}><Spin /></div>}
      {hasMore && !loading && (
        <div style={{ padding:'0 14px 14px' }}>
          <button onClick={() => load(offset + LIMIT, false)} style={{ ...C.sec, width:'100%' }}>Cargar más</button>
        </div>
      )}
    </div>
  )
}

// ── Comments Tab ─────────────────────────────────────────────────────────────
const STATUS_LABELS = { pending:'Pendiente', approved:'Aprobado', rejected:'Rechazado', hidden:'Oculto' }
const STATUS_COLORS = { pending:'#f59e0b', approved:'#10b981', rejected:'#dc2626', hidden:'#64748b' }

function StatusBadge({ status }) {
  return (
    <span style={{
      background: (STATUS_COLORS[status] || '#94a3b8') + '22',
      color: STATUS_COLORS[status] || '#94a3b8',
      borderRadius: 99, padding:'2px 8px', fontSize:11, fontWeight:700,
    }}>
      {STATUS_LABELS[status] || status}
    </span>
  )
}

function StarRating({ rating }) {
  if (!rating) return null
  return (
    <span style={{ fontSize:13, letterSpacing:1 }}>
      {'★'.repeat(rating)}{'☆'.repeat(5 - rating)}
    </span>
  )
}

function CommentCard({ c, onAction, onSaved }) {
  const [expanded, setExpanded] = useState(false)
  const [editNombre, setEditNombre]     = useState('')
  const [editComentario, setEditComentario] = useState('')
  const [editReply, setEditReply]       = useState('')
  const [saving, setSaving]   = useState(false)
  const [busy, setBusy]       = useState(false)
  const [msg, setMsg]         = useState('')

  const displayNombre    = c.edited_nombre     || c.nombre
  const displayComentario = c.edited_comentario || c.comentario

  const openEdit = () => {
    setEditNombre(c.edited_nombre || c.nombre || '')
    setEditComentario(c.edited_comentario || c.comentario || '')
    setEditReply(c.admin_reply || '')
    setExpanded(true)
  }

  const handleAction = async (action) => {
    setBusy(true); setMsg('')
    const ok = await onAction(c.id, action)
    setBusy(false)
    if (!ok) setMsg('Error al ejecutar la acción')
  }

  const handleSave = async () => {
    setSaving(true); setMsg('')
    const ok = await onSaved(c.id, {
      nombre: editNombre !== (c.nombre) ? editNombre : undefined,
      comentario: editComentario !== c.comentario ? editComentario : undefined,
      admin_reply: editReply !== (c.admin_reply || '') ? editReply : undefined,
    })
    setSaving(false)
    if (ok) setExpanded(false)
    else setMsg('Error al guardar')
  }

  return (
    <div style={{
      ...C.card, padding:'14px 16px',
      borderLeft:`4px solid ${STATUS_COLORS[c.status] || '#e2e8f0'}`,
      opacity: c.status === 'rejected' ? 0.7 : 1,
    }}>
      {/* Header row */}
      <div style={{ display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:8, marginBottom:8 }}>
        <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
          <div style={{ display:'flex', gap:6, alignItems:'center', flexWrap:'wrap' }}>
            <span style={{ fontWeight:700, fontSize:13 }}>{displayNombre}</span>
            {c.edited_nombre && <span style={{ fontSize:10, color:'#f59e0b' }}>✎ editado</span>}
            <StatusBadge status={c.status} />
            {c.featured && <span style={{ background:'#fef3c7', color:'#d97706', borderRadius:99, padding:'2px 8px', fontSize:11, fontWeight:700 }}>⭐ Destacado</span>}
          </div>
          <div style={{ fontSize:11, color:'#64748b' }}>
            {c.titulo}
            {c.feature && <span style={{ marginLeft:8, background:'#e0f2fe', color:'#0369a1', borderRadius:99, padding:'1px 6px', fontSize:10 }}>{c.feature}</span>}
          </div>
          {c.rating && <StarRating rating={c.rating} />}
        </div>
        <span style={{ fontSize:11, color:'#94a3b8', whiteSpace:'nowrap' }}>
          {new Date(c.created_at).toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'})}
        </span>
      </div>

      {/* Comment text */}
      <p style={{ fontSize:13, color:'#374151', margin:'0 0 10px', lineHeight:1.5 }}>
        {displayComentario}
        {c.edited_comentario && <span style={{ fontSize:10, color:'#f59e0b', marginLeft:6 }}>✎ editado</span>}
      </p>

      {/* Admin reply preview */}
      {c.admin_reply && !expanded && (
        <div style={{ background:'#f0f9ff', borderRadius:8, padding:'8px 12px', fontSize:12, color:'#0369a1', marginBottom:10 }}>
          <strong>Respuesta admin:</strong> {c.admin_reply}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
        {c.status !== 'approved'  && <button disabled={busy} onClick={() => handleAction('approve')}  style={{ ...C.pri,  fontSize:11, padding:'5px 10px' }}>✓ Aprobar</button>}
        {c.status !== 'rejected'  && <button disabled={busy} onClick={() => handleAction('reject')}   style={{ ...C.danger, fontSize:11, padding:'5px 10px' }}>✗ Rechazar</button>}
        {c.status !== 'hidden'    && <button disabled={busy} onClick={() => handleAction('hide')}     style={{ ...C.sec, fontSize:11, padding:'5px 10px' }}>👁 Ocultar</button>}
        {!c.featured              && <button disabled={busy} onClick={() => handleAction('feature')}  style={{ ...C.sec, fontSize:11, padding:'5px 10px' }}>⭐ Destacar</button>}
        {c.featured               && <button disabled={busy} onClick={() => handleAction('unfeature')} style={{ ...C.sec, fontSize:11, padding:'5px 10px' }}>☆ Quitar destaque</button>}
        <button onClick={openEdit} style={{ ...C.sec, fontSize:11, padding:'5px 10px' }}>✎ Editar</button>
        <button disabled={busy} onClick={() => { if (confirm('¿Eliminar este comentario?')) handleAction('delete') }} style={{ ...C.danger, fontSize:11, padding:'5px 10px', marginLeft:'auto' }}>🗑 Eliminar</button>
      </div>

      {msg && <div style={{ fontSize:12, color:'#dc2626', marginTop:6 }}>{msg}</div>}

      {/* Edit panel */}
      {expanded && (
        <div style={{ marginTop:14, borderTop:'1px solid #f1f5f9', paddingTop:14, display:'flex', flexDirection:'column', gap:10 }}>
          <div>
            <label style={{ fontSize:11, fontWeight:700, color:'#64748b', display:'block', marginBottom:4 }}>Nombre público</label>
            <input value={editNombre} onChange={e => setEditNombre(e.target.value)} style={C.input} maxLength={80} />
          </div>
          <div>
            <label style={{ fontSize:11, fontWeight:700, color:'#64748b', display:'block', marginBottom:4 }}>Comentario</label>
            <textarea value={editComentario} onChange={e => setEditComentario(e.target.value)}
              style={{ ...C.input, resize:'vertical', minHeight:70 }} maxLength={300} />
            <div style={{ fontSize:11, color:'#94a3b8', textAlign:'right' }}>{editComentario.length}/300</div>
          </div>
          <div>
            <label style={{ fontSize:11, fontWeight:700, color:'#64748b', display:'block', marginBottom:4 }}>Respuesta del admin (opcional — visible públicamente)</label>
            <textarea value={editReply} onChange={e => setEditReply(e.target.value)}
              style={{ ...C.input, resize:'vertical', minHeight:60 }} placeholder="Dejá vacío para no mostrar respuesta…" maxLength={500} />
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={handleSave} disabled={saving} style={C.pri}>{saving ? 'Guardando…' : '💾 Guardar cambios'}</button>
            <button onClick={() => setExpanded(false)} style={C.sec}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}

function CommentsTab({ adminFetch }) {
  const [stats, setStats]           = useState(null)
  const [comments, setComments]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [statsLoading, setStatsLoading] = useState(true)
  const [error, setError]           = useState('')
  const [statusFilter, setStatusFilter] = useState('pending')
  const [search, setSearch]         = useState('')
  const [searchInput, setSearchInput]   = useState('')
  const [featuredOnly, setFeaturedOnly] = useState(false)
  const [offset, setOffset]         = useState(0)
  const [hasMore, setHasMore]       = useState(false)
  const LIMIT = 20

  const loadStats = useCallback(async () => {
    setStatsLoading(true)
    const d = await adminFetch('admin_comment_stats')
    if (d?.ok) setStats(d.stats)
    setStatsLoading(false)
  }, [adminFetch])

  const loadComments = useCallback(async (off, replace, sf, s, fo) => {
    setLoading(true); setError('')
    const d = await adminFetch('admin_list_comments', {
      status_filter: sf, search: s, featured_only: fo, offset: off, limit: LIMIT,
    })
    if (d?.ok) {
      const list = d.comments || []
      if (replace) setComments(list); else setComments(prev => [...prev, ...list])
      setHasMore(list.length === LIMIT)
      setOffset(off)
    } else {
      setError(d?.error || 'Error al cargar comentarios')
    }
    setLoading(false)
  }, [adminFetch])

  useEffect(() => { loadStats(); loadComments(0, true, statusFilter, search, featuredOnly) }, []) // eslint-disable-line

  const applyFilters = (sf, s, fo) => {
    setStatusFilter(sf); setSearch(s); setFeaturedOnly(fo)
    loadComments(0, true, sf, s, fo)
  }

  const handleAction = async (commentId, action) => {
    if (action === 'delete') {
      const d = await adminFetch('admin_comment_action', { comment_id: commentId, action })
      if (d?.ok) { setComments(prev => prev.filter(c => c.id !== commentId)); loadStats(); return true }
      return false
    }
    const d = await adminFetch('admin_comment_action', { comment_id: commentId, action })
    if (d?.ok) {
      setComments(prev => prev.map(c => {
        if (c.id !== commentId) return c
        const patch = {}
        if (action === 'approve')   { patch.status = 'approved'; patch.moderated_at = new Date().toISOString() }
        if (action === 'reject')    { patch.status = 'rejected'; patch.moderated_at = new Date().toISOString() }
        if (action === 'hide')      { patch.status = 'hidden';   patch.moderated_at = new Date().toISOString() }
        if (action === 'feature')   { patch.featured = true;  patch.status = 'approved' }
        if (action === 'unfeature') { patch.featured = false }
        return { ...c, ...patch }
      }))
      loadStats()
      return true
    }
    return false
  }

  const handleSave = async (commentId, fields) => {
    const payload = { comment_id: commentId }
    if (fields.nombre     !== undefined) payload.nombre     = fields.nombre
    if (fields.comentario !== undefined) payload.comentario = fields.comentario
    if (fields.admin_reply !== undefined) payload.admin_reply = fields.admin_reply
    const d = await adminFetch('admin_comment_edit', payload)
    if (d?.ok) {
      setComments(prev => prev.map(c => {
        if (c.id !== commentId) return c
        return {
          ...c,
          edited_nombre:     fields.nombre     !== undefined ? fields.nombre     : c.edited_nombre,
          edited_comentario: fields.comentario !== undefined ? fields.comentario : c.edited_comentario,
          admin_reply:       fields.admin_reply !== undefined ? fields.admin_reply : c.admin_reply,
        }
      }))
      return true
    }
    return false
  }

  const STATUS_OPTS = [
    { v:'pending',  l:'Pendientes' },
    { v:'approved', l:'Aprobados' },
    { v:'rejected', l:'Rechazados' },
    { v:'hidden',   l:'Ocultos' },
    { v:'all',      l:'Todos' },
  ]

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      {/* Stats bar */}
      {!statsLoading && stats && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(110px,1fr))', gap:10 }}>
          <StatCard label="Total"      value={stats.total}    color="#0077B5" />
          <StatCard label="Pendientes" value={stats.pending}  color="#f59e0b" />
          <StatCard label="Aprobados"  value={stats.approved} color="#10b981" />
          <StatCard label="Ocultos"    value={stats.hidden}   color="#64748b" />
          <StatCard label="Rechazados" value={stats.rejected} color="#dc2626" />
          <StatCard label="Destacados" value={stats.featured} color="#d97706" />
        </div>
      )}

      {/* Filters */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
        {STATUS_OPTS.map(o => (
          <button key={o.v}
            onClick={() => applyFilters(o.v, search, featuredOnly)}
            style={{
              ...C.sec, fontSize:12, padding:'5px 12px',
              background: statusFilter === o.v ? '#0077B5' : undefined,
              color:      statusFilter === o.v ? 'white'   : undefined,
              borderColor: statusFilter === o.v ? '#0077B5' : undefined,
            }}>
            {o.l}
            {o.v !== 'all' && stats?.[o.v] != null && (
              <span style={{ marginLeft:5, background:'rgba(255,255,255,0.25)', borderRadius:99, padding:'0 5px', fontSize:10 }}>
                {stats[o.v]}
              </span>
            )}
          </button>
        ))}
        <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'#475569', cursor:'pointer' }}>
          <input type="checkbox" checked={featuredOnly} onChange={e => applyFilters(statusFilter, search, e.target.checked)} />
          Solo destacados
        </label>
      </div>

      {/* Search */}
      <div style={{ display:'flex', gap:8 }}>
        <input
          style={{ ...C.input, flex:1 }}
          placeholder="Buscar por nombre, título o comentario…"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && applyFilters(statusFilter, searchInput, featuredOnly)}
        />
        <button onClick={() => applyFilters(statusFilter, searchInput, featuredOnly)} style={C.pri}>Buscar</button>
        {search && <button onClick={() => { setSearchInput(''); applyFilters(statusFilter, '', featuredOnly) }} style={C.sec}>✕</button>}
      </div>

      {/* List */}
      {error && <ErrBox msg={error} onRetry={() => loadComments(0, true, statusFilter, search, featuredOnly)} />}
      {loading && comments.length === 0 && <div style={{ textAlign:'center', padding:60 }}><Spin /></div>}
      {!loading && comments.length === 0 && !error && <Empty text="Sin comentarios para este filtro" />}

      {comments.map(c => (
        <CommentCard key={c.id} c={c} onAction={handleAction} onSaved={handleSave} />
      ))}

      {loading && comments.length > 0 && <div style={{ textAlign:'center', padding:10 }}><Spin /></div>}
      {hasMore && !loading && (
        <button onClick={() => loadComments(offset + LIMIT, false, statusFilter, search, featuredOnly)} style={{ ...C.sec, width:'100%' }}>
          Cargar más
        </button>
      )}
    </div>
  )
}

// ── IA Analytics Tab ─────────────────────────────────────────────────────────
function IaTab({ adminFetch }) {
  const [stats, setStats]     = useState(null)
  const [logs, setLogs]       = useState([])
  const [loading, setLoading] = useState(true)
  const [logsLoading, setLogsLoading] = useState(false)
  const [error, setError]     = useState('')
  const [featureFilter, setFeatureFilter] = useState('')
  const [logsOffset, setLogsOffset]       = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const LIMIT = 40

  const loadStats = useCallback(async () => {
    setLoading(true); setError('')
    const d = await adminFetch('admin_ai_stats')
    if (d?.ok) setStats(d)
    else setError(d?.error || 'Error al cargar estadísticas IA')
    setLoading(false)
  }, [adminFetch])

  const loadLogs = useCallback(async (off, replace, feat) => {
    setLogsLoading(true)
    const d = await adminFetch('admin_ai_logs', { offset: off, limit: LIMIT, feature_filter: feat || undefined })
    if (d?.ok) {
      const list = d.logs || []
      if (replace) setLogs(list); else setLogs(prev => [...prev, ...list])
      setHasMore(list.length === LIMIT)
      setLogsOffset(off)
    }
    setLogsLoading(false)
  }, [adminFetch])

  useEffect(() => { loadStats(); loadLogs(0, true, '') }, [loadStats, loadLogs])

  const applyFilter = (feat) => {
    setFeatureFilter(feat)
    loadLogs(0, true, feat)
  }

  if (loading) return <div style={{ textAlign:'center', padding:60 }}><Spin /></div>
  if (error)   return <ErrBox msg={error} onRetry={loadStats} />

  const t30 = stats?.totals_30d || {}
  const t7  = stats?.totals_7d  || {}
  const t24 = stats?.totals_24h || {}
  const byFeature = stats?.by_feature || {}
  const topUsers  = stats?.top_users  || []

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {/* Summary cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))', gap:10 }}>
        <StatCard label="Requests 24h"  value={fmtK(t24.count)}          color="#0077B5" sub={fmtCost(t24.input_tokens, t24.output_tokens)} />
        <StatCard label="Requests 7d"   value={fmtK(t7.count)}           color="#6366f1" sub={fmtCost(t7.input_tokens, t7.output_tokens)} />
        <StatCard label="Requests 30d"  value={fmtK(t30.count)}          color="#0d9488" sub={fmtCost(t30.input_tokens, t30.output_tokens)} />
        <StatCard label="Errores 30d"   value={t30.error_count ?? '—'}   color="#dc2626" />
        <StatCard label="Tokens 30d"    value={fmtK((t30.input_tokens||0)+(t30.output_tokens||0))} color="#f59e0b" />
      </div>

      {/* By feature breakdown */}
      {Object.keys(byFeature).length > 0 && (
        <div style={{ ...C.card }}>
          <div style={{ padding:'12px 16px', borderBottom:'1px solid #f1f5f9', fontWeight:700, fontSize:13 }}>Por feature (30 días)</div>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr>
                  <Th ch="Feature" /><Th ch="Requests" /><Th ch="Tokens in" /><Th ch="Tokens out" /><Th ch="Costo est." /><Th ch="Avg ms" /><Th ch="Errores" />
                </tr>
              </thead>
              <tbody>
                {Object.entries(byFeature).sort((a,b) => (b[1].count||0)-(a[1].count||0)).map(([feat, d]) => (
                  <tr key={feat} style={{ cursor:'pointer' }} onClick={() => applyFilter(featureFilter === feat ? '' : feat)}>
                    <Td><span style={{ fontWeight:700, color:'#0077B5' }}>{feat}</span></Td>
                    <Td>{d.count}</Td>
                    <Td>{fmtK(d.input_tokens)}</Td>
                    <Td>{fmtK(d.output_tokens)}</Td>
                    <Td>{fmtCost(d.input_tokens, d.output_tokens)}</Td>
                    <Td>{d.avg_duration_ms ? `${d.avg_duration_ms}ms` : '—'}</Td>
                    <Td s={{ color: d.error_count > 0 ? '#dc2626' : '#64748b' }}>{d.error_count || 0}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Top users */}
      {topUsers.length > 0 && (
        <div style={{ ...C.card }}>
          <div style={{ padding:'12px 16px', borderBottom:'1px solid #f1f5f9', fontWeight:700, fontSize:13 }}>Top usuarios por tokens (30 días)</div>
          <div style={{ padding:'10px 14px', display:'flex', flexDirection:'column', gap:6 }}>
            {topUsers.map((u, i) => (
              <div key={u.user_id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:12, padding:'6px 0', borderBottom:'1px solid #f8fafc' }}>
                <span style={{ color:'#475569' }}>{i+1}. <span style={{ fontFamily:'monospace', fontSize:11 }}>{String(u.user_id).slice(0,8)}…</span></span>
                <span style={{ color:'#64748b' }}>{u.requests} req · {fmtK(u.total_tokens)} tokens</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent logs */}
      <div style={{ ...C.card }}>
        <div style={{ padding:'12px 16px', borderBottom:'1px solid #f1f5f9', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontWeight:700, fontSize:13 }}>
            Logs recientes
            {featureFilter && <span style={{ marginLeft:8, fontSize:11, background:'#e0f2fe', color:'#0369a1', borderRadius:99, padding:'2px 8px' }}>{featureFilter} <button onClick={() => applyFilter('')} style={{ border:'none', background:'none', cursor:'pointer', color:'#0369a1', fontWeight:700 }}>×</button></span>}
          </div>
          <button onClick={() => loadStats()} style={{ ...C.sec, fontSize:11, padding:'4px 10px' }}>↺ Refrescar</button>
        </div>
        <div style={{ padding:'10px 14px', display:'flex', flexDirection:'column', gap:6 }}>
          {logs.length === 0 && !logsLoading && <Empty text="Sin logs registrados aún" />}
          {logs.map(l => (
            <div key={l.id} style={{ padding:'8px 12px', background:'#f8fafc', borderRadius:9, borderLeft:`3px solid ${l.status_code === 200 ? '#10b981' : l.status_code ? '#dc2626' : '#94a3b8'}`, fontSize:12 }}>
              <div style={{ display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:4 }}>
                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                  <span style={{ fontWeight:700, color:'#0077B5' }}>{l.feature}</span>
                  {l.status_code && l.status_code !== 200 && <span style={{ color:'#dc2626', fontWeight:700 }}>{l.status_code}{l.error_type ? ` · ${l.error_type}` : ''}</span>}
                  {l.input_tokens != null && <span style={{ color:'#64748b' }}>in:{fmtK(l.input_tokens)} out:{fmtK(l.output_tokens)}</span>}
                  {l.duration_ms != null && <span style={{ color:'#94a3b8' }}>{l.duration_ms}ms</span>}
                </div>
                <span style={{ color:'#94a3b8', whiteSpace:'nowrap' }}>
                  {new Date(l.created_at).toLocaleString('es-AR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}
                </span>
              </div>
            </div>
          ))}
        </div>
        {logsLoading && <div style={{ textAlign:'center', padding:10 }}><Spin /></div>}
        {hasMore && !logsLoading && (
          <div style={{ padding:'0 14px 14px' }}>
            <button onClick={() => loadLogs(logsOffset + LIMIT, false, featureFilter)} style={{ ...C.sec, width:'100%' }}>Cargar más</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Revenue / Business Analytics ─────────────────────────────────────────────
const EVENT_COLORS = {
  subscribed: '#16a34a', renewed: '#0077B5', cancelled: '#dc2626',
  paused: '#d97706', reactivated: '#059669', code_redeemed: '#7c3aed',
  manual_grant: '#0891b2', manual_revoke: '#be123c', failed_payment: '#ea580c',
  expired: '#64748b',
}
const EVENT_LABELS = {
  subscribed: 'Alta nueva', renewed: 'Renovación', cancelled: 'Cancelación',
  paused: 'Pausa', reactivated: 'Reactivación', code_redeemed: 'Código',
  manual_grant: 'Alta manual', manual_revoke: 'Revocación', failed_payment: 'Pago fallido',
  expired: 'Expirado',
}
const fmtARS  = n => `$${Number(n || 0).toLocaleString('es-AR')} ARS`
const fmtPct  = n => `${Number(n || 0).toFixed(1)}%`
const fmtTrend = (cur, prev) => {
  if (!prev || prev === 0) return null
  const pct = ((cur - prev) / prev) * 100
  return { pct: Math.abs(pct).toFixed(0), up: pct >= 0 }
}
const LIMIT_EV = 20

function KpiCard({ label, value, sub, trend, accent = '#0077B5' }) {
  return (
    <div style={{ flex:'1 1 140px', minWidth:130, padding:'14px 16px', borderRadius:12,
      background:'white', border:'1px solid rgba(0,119,181,0.12)', boxShadow:'0 1px 4px rgba(0,0,0,0.05)' }}>
      <div style={{ fontSize:11, color:'#64748b', textTransform:'uppercase', letterSpacing:1, marginBottom:6 }}>{label}</div>
      <div style={{ fontSize:20, fontWeight:800, color: accent }}>{value}</div>
      {sub   && <div style={{ fontSize:11, color:'#94a3b8', marginTop:3 }}>{sub}</div>}
      {trend && <div style={{ fontSize:11, marginTop:4, color: trend.up ? '#16a34a' : '#dc2626', fontWeight:600 }}>
        {trend.up ? '↑' : '↓'} {trend.pct}% vs período ant.
      </div>}
    </div>
  )
}

function OriginBar({ label, amount, total, color }) {
  const pct = total > 0 ? Math.round((amount / total) * 100) : 0
  return (
    <div style={{ marginBottom:10 }}>
      <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'#475569', marginBottom:4 }}>
        <span style={{ fontWeight:600 }}>{label}</span>
        <span>{fmtARS(amount)} <span style={{ color:'#94a3b8' }}>({pct}%)</span></span>
      </div>
      <div style={{ height:7, borderRadius:4, background:'#f1f5f9' }}>
        <div style={{ height:'100%', borderRadius:4, background:color, width:`${pct}%`, transition:'width 0.5s' }} />
      </div>
    </div>
  )
}

function EventBadge({ type }) {
  const color = EVENT_COLORS[type] || '#64748b'
  return (
    <span style={{ display:'inline-block', padding:'2px 8px', borderRadius:20, fontSize:10, fontWeight:700,
      background: color + '18', color, border:`1px solid ${color}40`, whiteSpace:'nowrap' }}>
      {EVENT_LABELS[type] || type}
    </span>
  )
}

function RevenueTab({ adminFetch }) {
  const [stats,      setStats]      = useState(null)
  const [monthly,    setMonthly]    = useState([])
  const [events,     setEvents]     = useState([])
  const [evTotal,    setEvTotal]    = useState(0)
  const [evOffset,   setEvOffset]   = useState(0)
  const [evFilter,   setEvFilter]   = useState('all')
  const [payments,   setPayments]   = useState([])
  const [pyTotal,    setPyTotal]    = useState(0)
  const [pyOffset,   setPyOffset]   = useState(0)
  const [loading,    setLoading]    = useState(true)
  const [evLoading,  setEvLoading]  = useState(false)
  const [pyLoading,  setPyLoading]  = useState(false)
  const [error,      setError]      = useState('')
  const [section,    setSection]    = useState('events') // 'events' | 'payments'

  useEffect(() => { loadAll() }, [])
  useEffect(() => { if (!loading) loadEvents(0) }, [evFilter])

  async function loadAll() {
    setLoading(true); setError('')
    try {
      const d = await adminFetch('admin_revenue_stats')
      setStats(d.stats); setMonthly(Array.isArray(d.monthly) ? d.monthly : [])
      await Promise.all([loadEvents(0), loadPayments(0)])
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  async function loadEvents(offset) {
    setEvLoading(true)
    try {
      const d = await adminFetch('admin_subscription_events', { offset, event_type: evFilter })
      setEvents(offset === 0 ? (d.rows || []) : prev => [...prev, ...(d.rows || [])])
      setEvTotal(d.total || 0); setEvOffset(offset)
    } catch {}
    finally { setEvLoading(false) }
  }

  async function loadPayments(offset) {
    setPyLoading(true)
    try {
      const d = await adminFetch('admin_payments_log', { offset })
      setPayments(offset === 0 ? (d.rows || []) : prev => [...prev, ...(d.rows || [])])
      setPyTotal(d.total || 0); setPyOffset(offset)
    } catch {}
    finally { setPyLoading(false) }
  }

  function exportRevenueCsv() {
    if (!monthly.length) return
    const header = 'Mes,Nuevos,Renovaciones,Cancelados,Revenue ARS'
    const rows = monthly.map(m => `${m.month},${m.new_subs},${m.renewals},${m.cancelled},${m.revenue_ars}`)
    const csv = [header, ...rows].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a'); a.href = url; a.download = `revenue_${new Date().toISOString().slice(0,10)}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <div style={{ textAlign:'center', padding:40 }}><Spin /></div>
  if (error)   return <ErrBox msg={error} onRetry={loadAll} />

  const s = stats || {}
  const revTotal = (s.rev_mp || 0) + (s.rev_promo || 0) + (s.rev_manual || 0)
  const revTrend = fmtTrend(s.revenue_30d, s.revenue_prev_30d)
  const subsTrend = fmtTrend(s.new_subs_30d, s.new_subs_prev_30d)
  const last6 = monthly.slice(-6)

  const EVENT_FILTER_OPTS = [
    { v:'all', l:'Todos' }, { v:'subscribed', l:'Altas' }, { v:'renewed', l:'Renovaciones' },
    { v:'cancelled', l:'Cancelaciones' }, { v:'code_redeemed', l:'Códigos' },
    { v:'manual_grant', l:'Manual' }, { v:'failed_payment', l:'Fallidos' },
  ]

  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <div style={{ fontSize:18, fontWeight:800, color:'#0d2137' }}>💰 Revenue Analytics</div>
          <div style={{ fontSize:12, color:'#64748b', marginTop:2 }}>Monetización y ciclo de vida de suscripciones</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={exportRevenueCsv} style={{ fontSize:12, padding:'7px 14px', borderRadius:8,
            border:'1px solid rgba(0,119,181,0.2)', background:'#f8fafc', color:'#0077B5', cursor:'pointer', fontWeight:600 }}>
            ↓ CSV Tendencia
          </button>
          <button onClick={loadAll} style={{ fontSize:12, padding:'7px 14px', borderRadius:8,
            border:'1px solid rgba(0,119,181,0.2)', background:'#f8fafc', color:'#475569', cursor:'pointer' }}>
            ↻ Actualizar
          </button>
        </div>
      </div>

      {/* KPI Row 1: Revenue */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:10, marginBottom:10 }}>
        <KpiCard label="MRR estimado"   value={fmtARS(s.mrr)}  sub={`${s.active_subs || 0} suscripciones × $${(s.monthly_price||3000).toLocaleString('es-AR')}/mes`} accent="#0077B5" />
        <KpiCard label="ARR estimado"   value={fmtARS(s.arr)}  sub="Anualización del MRR actual" accent="#0077B5" />
        <KpiCard label="Rev. 30 días"   value={fmtARS(s.revenue_30d)} trend={revTrend} sub={`${s.payments_30d || 0} pagos aprobados`} accent="#16a34a" />
        <KpiCard label="Rev. este mes"  value={fmtARS(s.revenue_this_month)} sub={`${s.payments_this_month || 0} transacciones`} accent="#059669" />
        <KpiCard label="Rev. total"     value={fmtARS(s.revenue_total)} sub="Pagos MP aprobados" accent="#0891b2" />
      </div>

      {/* KPI Row 2: Subs */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:10, marginBottom:20 }}>
        <KpiCard label="Activos ahora"  value={s.active_subs || 0}   sub={`${s.active_premium || 0} con acceso vigente`} accent="#7c3aed" />
        <KpiCard label="Nuevos (30d)"   value={s.new_subs_30d || 0}  trend={subsTrend} sub="Primeras altas" accent="#16a34a" />
        <KpiCard label="Renovaciones"   value={s.renewals_30d || 0}  sub="Últimos 30 días" accent="#0077B5" />
        <KpiCard label="Cancelados"     value={s.cancelled_30d || 0} sub="Últimos 30 días" accent="#dc2626" />
        <KpiCard label="Churn rate"     value={fmtPct(s.churn_rate)} sub="Cancelados / (activos+cancel.)" accent={s.churn_rate > 10 ? '#dc2626' : '#64748b'} />
        <KpiCard label="Conversión"     value={fmtPct(s.conversion_rate)} sub="Nuevos premium / nuevos usuarios" accent="#d97706" />
      </div>

      {/* Metricas SaaS + Ingresos por origen */}
      <div style={{ display:'flex', gap:16, flexWrap:'wrap', marginBottom:20 }}>

        {/* SaaS metrics card */}
        <div style={{ flex:'1 1 220px', padding:'16px 20px', borderRadius:12,
          background:'white', border:'1px solid rgba(0,119,181,0.12)', boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize:12, fontWeight:700, color:'#3d5a73', textTransform:'uppercase', letterSpacing:1, marginBottom:12 }}>Métricas SaaS</div>
          {[
            ['ARPU',          fmtARS(s.arpu)],
            ['LTV estimado',  fmtARS((s.arpu || 0) * 12)],
            ['Total usuarios',String(s.total_users || 0)],
            ['Nuevos usuarios (30d)', String(s.new_users_30d || 0)],
            ['Usos de códigos', String(s.promo_total_uses || 0)],
            ['Alta manual (30d)', String(s.manual_grants_30d || 0)],
            ['Pagos fallidos (30d)', String(s.failed_payments_30d || 0)],
          ].map(([l, v]) => (
            <div key={l} style={{ display:'flex', justifyContent:'space-between', borderBottom:'1px solid #f1f5f9', padding:'5px 0', fontSize:12 }}>
              <span style={{ color:'#64748b' }}>{l}</span>
              <span style={{ fontWeight:700, color:'#1e293b' }}>{v}</span>
            </div>
          ))}
        </div>

        {/* Revenue by origin */}
        <div style={{ flex:'2 1 280px', padding:'16px 20px', borderRadius:12,
          background:'white', border:'1px solid rgba(0,119,181,0.12)', boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize:12, fontWeight:700, color:'#3d5a73', textTransform:'uppercase', letterSpacing:1, marginBottom:12 }}>Ingresos por origen</div>
          {revTotal === 0
            ? <p style={{ fontSize:12, color:'#94a3b8', textAlign:'center', paddingTop:20 }}>Sin pagos registrados aún.<br/><span style={{fontSize:11}}>Los pagos MP se registran al llegar el primer webhook.</span></p>
            : <>
                <OriginBar label="Mercado Pago"  amount={s.rev_mp}     total={revTotal} color="#0077B5" />
                <OriginBar label="Códigos promo" amount={s.rev_promo}   total={revTotal} color="#7c3aed" />
                <OriginBar label="Manual/Admin"  amount={s.rev_manual}  total={revTotal} color="#0891b2" />
                <div style={{ marginTop:12, fontSize:11, color:'#94a3b8' }}>Total histórico: {fmtARS(revTotal)}</div>
              </>
          }
        </div>
      </div>

      {/* Monthly trend table */}
      <div style={{ marginBottom:20, borderRadius:12, background:'white',
        border:'1px solid rgba(0,119,181,0.12)', boxShadow:'0 1px 4px rgba(0,0,0,0.04)', overflow:'hidden' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 18px', borderBottom:'1px solid #f1f5f9' }}>
          <div style={{ fontSize:12, fontWeight:700, color:'#3d5a73', textTransform:'uppercase', letterSpacing:1 }}>Tendencia mensual (últimos 6 meses)</div>
          <span style={{ fontSize:11, color:'#94a3b8' }}>Solo pagos reales (no estimados)</span>
        </div>
        {last6.length === 0
          ? <p style={{ textAlign:'center', fontSize:12, color:'#94a3b8', padding:20 }}>Sin datos históricos todavía.</p>
          : <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr style={{ background:'#f8fafc' }}>
                  {['Mes','Altas','Renov.','Cancel.','Revenue ARS'].map(h => (
                    <th key={h} style={{ padding:'8px 14px', textAlign:'left', color:'#64748b', fontWeight:600, fontSize:11, borderBottom:'1px solid #e2e8f0' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {last6.map((m, i) => (
                  <tr key={m.month} style={{ background: i % 2 === 0 ? 'white' : '#fafbfc' }}>
                    <td style={{ padding:'8px 14px', fontWeight:700, color:'#0d2137' }}>{m.month}</td>
                    <td style={{ padding:'8px 14px', color: m.new_subs > 0 ? '#16a34a' : '#94a3b8', fontWeight: m.new_subs > 0 ? 700 : 400 }}>
                      {m.new_subs > 0 ? `+${m.new_subs}` : '—'}
                    </td>
                    <td style={{ padding:'8px 14px', color: m.renewals > 0 ? '#0077B5' : '#94a3b8', fontWeight: m.renewals > 0 ? 700 : 400 }}>
                      {m.renewals > 0 ? m.renewals : '—'}
                    </td>
                    <td style={{ padding:'8px 14px', color: m.cancelled > 0 ? '#dc2626' : '#94a3b8', fontWeight: m.cancelled > 0 ? 700 : 400 }}>
                      {m.cancelled > 0 ? `-${m.cancelled}` : '—'}
                    </td>
                    <td style={{ padding:'8px 14px', fontWeight:700, color: m.revenue_ars > 0 ? '#059669' : '#94a3b8' }}>
                      {m.revenue_ars > 0 ? fmtARS(m.revenue_ars) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
        }
      </div>

      {/* Section toggle */}
      <div style={{ display:'flex', gap:8, marginBottom:14 }}>
        {[['events','📋 Eventos de ciclo de vida'],['payments','💳 Pagos registrados']].map(([id, label]) => (
          <button key={id} onClick={() => setSection(id)}
            style={{ padding:'7px 16px', borderRadius:8, fontSize:12, fontWeight: section === id ? 700 : 500, cursor:'pointer',
              background: section === id ? '#0077B5' : '#f8fafc',
              color:       section === id ? 'white'   : '#475569',
              border:      section === id ? 'none'    : '1px solid rgba(0,119,181,0.18)' }}>
            {label}
          </button>
        ))}
      </div>

      {/* Events log */}
      {section === 'events' && (
        <div style={{ borderRadius:12, background:'white', border:'1px solid rgba(0,119,181,0.12)', boxShadow:'0 1px 4px rgba(0,0,0,0.04)', overflow:'hidden' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'12px 16px', borderBottom:'1px solid #f1f5f9', flexWrap:'wrap' }}>
            <span style={{ fontSize:11, color:'#64748b', fontWeight:600, marginRight:4 }}>Filtrar:</span>
            {EVENT_FILTER_OPTS.map(o => (
              <button key={o.v} onClick={() => setEvFilter(o.v)}
                style={{ padding:'4px 12px', borderRadius:20, fontSize:11, cursor:'pointer', fontWeight: evFilter === o.v ? 700 : 400,
                  background: evFilter === o.v ? '#0077B5' : '#f1f5f9',
                  color:       evFilter === o.v ? 'white'   : '#475569',
                  border: 'none' }}>
                {o.l}
              </button>
            ))}
            <span style={{ marginLeft:'auto', fontSize:11, color:'#94a3b8' }}>{evTotal} eventos</span>
          </div>
          {evLoading && events.length === 0
            ? <div style={{ textAlign:'center', padding:24 }}><Spin /></div>
            : events.length === 0
            ? <p style={{ textAlign:'center', fontSize:12, color:'#94a3b8', padding:24 }}>
                Sin eventos registrados aún.<br/>
                <span style={{fontSize:11}}>Los eventos se registran desde ahora en adelante (no retroactivo).</span>
              </p>
            : <>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead>
                    <tr style={{ background:'#f8fafc' }}>
                      {['Evento','Usuario','Origen','Detalle','Fecha'].map(h => (
                        <th key={h} style={{ padding:'8px 12px', textAlign:'left', color:'#64748b', fontWeight:600, fontSize:11, borderBottom:'1px solid #e2e8f0' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((e, i) => (
                      <tr key={e.id} style={{ borderBottom:'1px solid #f8fafc', background: i % 2 === 0 ? 'white' : '#fafbfc' }}>
                        <td style={{ padding:'9px 12px' }}><EventBadge type={e.event_type} /></td>
                        <td style={{ padding:'9px 12px', color:'#1e293b', fontWeight:600, fontSize:11 }}>
                          {e.user_nombre || '—'}<br/>
                          <span style={{ color:'#94a3b8', fontWeight:400 }}>{e.user_email || e.user_id?.slice(0,8) || '—'}</span>
                        </td>
                        <td style={{ padding:'9px 12px' }}>
                          <span style={{ padding:'2px 7px', borderRadius:6, fontSize:10, fontWeight:700,
                            background: e.origen === 'mp' ? '#eff6ff' : e.origen === 'promo' ? '#fdf4ff' : '#f0fdfa',
                            color: e.origen === 'mp' ? '#1d4ed8' : e.origen === 'promo' ? '#7c3aed' : '#0891b2' }}>
                            {e.origen?.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding:'9px 12px', color:'#64748b', fontSize:11, maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {e.code ? `Código: ${e.code}` : e.mp_subscription_id ? e.mp_subscription_id.slice(0,12) + '…' : '—'}
                        </td>
                        <td style={{ padding:'9px 12px', color:'#94a3b8', fontSize:11, whiteSpace:'nowrap' }}>
                          {new Date(e.created_at).toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {events.length < evTotal && (
                  <div style={{ textAlign:'center', padding:'12px 0' }}>
                    <button onClick={() => loadEvents(evOffset + LIMIT_EV)} disabled={evLoading}
                      style={{ padding:'7px 20px', borderRadius:8, fontSize:12, cursor:'pointer', border:'1px solid rgba(0,119,181,0.2)',
                        background:'#f8fafc', color:'#0077B5', fontWeight:600 }}>
                      {evLoading ? 'Cargando…' : `Cargar más (${events.length}/${evTotal})`}
                    </button>
                  </div>
                )}
              </>
          }
        </div>
      )}

      {/* Payments log */}
      {section === 'payments' && (
        <div style={{ borderRadius:12, background:'white', border:'1px solid rgba(0,119,181,0.12)', boxShadow:'0 1px 4px rgba(0,0,0,0.04)', overflow:'hidden' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 16px', borderBottom:'1px solid #f1f5f9' }}>
            <span style={{ fontSize:12, fontWeight:700, color:'#3d5a73' }}>Pagos individuales (MP)</span>
            <span style={{ fontSize:11, color:'#94a3b8' }}>{pyTotal} pagos</span>
          </div>
          {pyLoading && payments.length === 0
            ? <div style={{ textAlign:'center', padding:24 }}><Spin /></div>
            : payments.length === 0
            ? <p style={{ textAlign:'center', fontSize:12, color:'#94a3b8', padding:24 }}>
                Sin pagos registrados.<br/>
                <span style={{fontSize:11}}>Los pagos se registran al recibir el webhook <code>subscription_authorized_payment</code> de MP.</span>
              </p>
            : <>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead>
                    <tr style={{ background:'#f8fafc' }}>
                      {['Usuario','Monto','Estado','MP Payment ID','Fecha pago'].map(h => (
                        <th key={h} style={{ padding:'8px 12px', textAlign:'left', color:'#64748b', fontWeight:600, fontSize:11, borderBottom:'1px solid #e2e8f0' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p, i) => (
                      <tr key={p.id} style={{ borderBottom:'1px solid #f8fafc', background: i % 2 === 0 ? 'white' : '#fafbfc' }}>
                        <td style={{ padding:'9px 12px', color:'#1e293b', fontWeight:600, fontSize:11 }}>
                          {p.user_nombre || '—'}<br/>
                          <span style={{ color:'#94a3b8', fontWeight:400 }}>{p.user_email || '—'}</span>
                        </td>
                        <td style={{ padding:'9px 12px', fontWeight:800, color:'#059669', fontSize:13 }}>
                          ${Number(p.amount).toLocaleString('es-AR')} <span style={{ fontSize:10, color:'#94a3b8', fontWeight:400 }}>{p.currency}</span>
                        </td>
                        <td style={{ padding:'9px 12px' }}>
                          <span style={{ padding:'2px 8px', borderRadius:6, fontSize:10, fontWeight:700,
                            background: p.status === 'approved' ? '#dcfce7' : '#fee2e2',
                            color: p.status === 'approved' ? '#16a34a' : '#dc2626' }}>
                            {p.status === 'approved' ? '✓ Aprobado' : p.status}
                          </span>
                        </td>
                        <td style={{ padding:'9px 12px', color:'#64748b', fontSize:10, fontFamily:'monospace' }}>
                          {p.mp_payment_id ? p.mp_payment_id.slice(0,16) + (p.mp_payment_id.length > 16 ? '…' : '') : '—'}
                        </td>
                        <td style={{ padding:'9px 12px', color:'#94a3b8', fontSize:11, whiteSpace:'nowrap' }}>
                          {new Date(p.payment_date).toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {payments.length < pyTotal && (
                  <div style={{ textAlign:'center', padding:'12px 0' }}>
                    <button onClick={() => loadPayments(pyOffset + LIMIT_EV)} disabled={pyLoading}
                      style={{ padding:'7px 20px', borderRadius:8, fontSize:12, cursor:'pointer', border:'1px solid rgba(0,119,181,0.2)',
                        background:'#f8fafc', color:'#0077B5', fontWeight:600 }}>
                      {pyLoading ? 'Cargando…' : `Cargar más (${payments.length}/${pyTotal})`}
                    </button>
                  </div>
                )}
              </>
          }
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Inteligencia Tab — Product Intelligence Hub ───────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

const INTEL_SUBTABS = [
  { id:'overview',  label:'Overview'   },
  { id:'funnels',   label:'Funnels'    },
  { id:'friccion',  label:'Diagnóstico'},
  { id:'insights',  label:'Insights'   },
  { id:'tracking',  label:'Tracking'   },
]

const SEVERITY_STYLES = {
  danger:  { bg:'#fef2f2', border:'#fecaca', icon:'🔴', label:'Crítico',  text:'#dc2626' },
  warning: { bg:'#fffbeb', border:'#fde68a', icon:'🟡', label:'Atención', text:'#92400e' },
  success: { bg:'#f0fdf4', border:'#bbf7d0', icon:'🟢', label:'Bien',     text:'#15803d' },
  info:    { bg:'#f0f9ff', border:'#bae6fd', icon:'🔵', label:'Info',     text:'#0369a1' },
}

function fmtN(n) { return n == null ? '—' : n >= 1000 ? `${(n/1000).toFixed(1)}k` : String(Math.round(n)) }
function pct(num, den) { return den > 0 ? `${(num / den * 100).toFixed(1)}%` : '—' }
function scorePct(num, den) { return den > 0 ? Math.min(100, Math.round(num / den * 100)) : 0 }

// ── Sub-tab navigation ────────────────────────────────────────────────────────
function IntelSubNav({ active, onChange }) {
  return (
    <div style={{ display:'flex', gap:4, marginBottom:20, flexWrap:'wrap' }}>
      {INTEL_SUBTABS.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)} style={{
          padding:'6px 14px', borderRadius:8, border:'1px solid',
          fontSize:12, fontWeight:600, cursor:'pointer',
          background: active === t.id ? '#0077B5' : 'white',
          borderColor: active === t.id ? '#0077B5' : '#e2e8f0',
          color: active === t.id ? 'white' : '#475569',
        }}>{t.label}</button>
      ))}
    </div>
  )
}

// ── KPI card with optional trend ──────────────────────────────────────────────
function IKpiCard({ label, value, sub, color = '#0077B5', icon }) {
  return (
    <div style={{ ...C.card, padding:'16px 14px', textAlign:'center', minWidth:100, flex:1 }}>
      {icon && <div style={{ fontSize:20, marginBottom:4 }}>{icon}</div>}
      <div style={{ fontSize:24, fontWeight:800, color, lineHeight:1, letterSpacing:'-0.5px' }}>{value ?? '—'}</div>
      <div style={{ fontSize:11, fontWeight:700, color:'#64748b', marginTop:4 }}>{label}</div>
      {sub && <div style={{ fontSize:10, color:'#94a3b8', marginTop:2 }}>{sub}</div>}
    </div>
  )
}

// ── Health gauge (SVG half-circle) ────────────────────────────────────────────
function HealthGauge({ score, label, color }) {
  const R = 44, cx = 55, cy = 54
  const toRad = d => d * Math.PI / 180
  const clampedScore = Math.max(0, Math.min(100, score))
  const sweepDeg = (clampedScore / 100) * 180
  const startX = cx - R, startY = cy
  const endX = cx + R * Math.cos(toRad(-180 + sweepDeg))
  const endY = cy + R * Math.sin(toRad(-180 + sweepDeg))
  const largeArc = sweepDeg > 180 ? 1 : 0
  const scoreColor = score >= 70 ? '#16a34a' : score >= 40 ? '#f59e0b' : '#dc2626'
  return (
    <div style={{ ...C.card, padding:'14px 10px', textAlign:'center', flex:1, minWidth:120 }}>
      <svg width={110} height={72} viewBox="0 0 110 72" style={{ display:'block', margin:'0 auto' }}>
        <path d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`}
          fill="none" stroke="#e2e8f0" strokeWidth={10} />
        {clampedScore > 0 && (
          <path d={`M ${startX} ${startY} A ${R} ${R} 0 ${largeArc} 1 ${endX} ${endY}`}
            fill="none" stroke={color || scoreColor} strokeWidth={10} strokeLinecap="round" />
        )}
        <text x={cx} y={cy + 2} textAnchor="middle" fontSize={18} fontWeight="800" fill={color || scoreColor}>{clampedScore}</text>
        <text x={cx} y={70} textAnchor="middle" fontSize={9} fill="#64748b">{label}</text>
      </svg>
    </div>
  )
}

// ── Sparkline (SVG polyline) ──────────────────────────────────────────────────
function Sparkline({ values, color = '#0077B5', height = 32 }) {
  if (!values?.length) return null
  const max = Math.max(...values, 1)
  const W = 80
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W
    const y = height - (v / max) * (height - 4) - 2
    return `${x},${y}`
  }).join(' ')
  return (
    <svg width={W} height={height} style={{ display:'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
    </svg>
  )
}

// ── Bar chart (SVG grouped) ───────────────────────────────────────────────────
function BarChart({ data, keys, colors, keyLabels, height = 130 }) {
  if (!data?.length) return <Empty text="Sin datos de tendencia aún" />
  const maxVal = Math.max(1, ...data.flatMap(d => keys.map(k => d[k] || 0)))
  const W = 560, PAD = { t:8, r:10, b:28, l:28 }
  const cW = W - PAD.l - PAD.r
  const cH = height - PAD.t - PAD.b
  const colW = cW / data.length
  const groupW = colW * 0.82
  const eachW = Math.floor(groupW / keys.length)

  return (
    <div style={{ overflowX:'auto' }}>
      <svg viewBox={`0 0 ${W} ${height}`} style={{ width:'100%', minWidth:260, maxHeight:height + 20 }}>
        {/* Y gridlines */}
        {[0.25, 0.5, 0.75, 1].map(f => {
          const y = PAD.t + cH - f * cH
          return <line key={f} x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} stroke="#f1f5f9" strokeWidth={1} />
        })}
        {data.map((d, i) => (
          <g key={i} transform={`translate(${PAD.l + i * colW},0)`}>
            {keys.map((k, ki) => {
              const val = d[k] || 0
              const bH = val > 0 ? Math.max(2, (val / maxVal) * cH) : 0
              const x = (colW - groupW) / 2 + ki * eachW
              return (
                <rect key={k} x={x} y={PAD.t + cH - bH} width={Math.max(1, eachW - 2)} height={bH}
                  fill={colors[ki]} rx={2} opacity={0.85} />
              )
            })}
            <text x={colW / 2} y={height - 6} fontSize={8} textAnchor="middle" fill="#94a3b8">{d.week}</text>
          </g>
        ))}
        {[0, 0.5, 1].map((f, i) => (
          <text key={i} x={PAD.l - 3} y={PAD.t + cH - f * cH + 4} fontSize={7} textAnchor="end" fill="#94a3b8">
            {Math.round(maxVal * f)}
          </text>
        ))}
      </svg>
      <div style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap', marginTop:4 }}>
        {keys.map((k, i) => (
          <div key={k} style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, color:'#64748b' }}>
            <span style={{ width:10, height:10, borderRadius:2, background:colors[i], display:'inline-block' }} />
            {keyLabels[i]}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Funnel chart (horizontal bars) ───────────────────────────────────────────
function FunnelBar({ stages }) {
  if (!stages?.length) return <Empty text="Sin datos de funnel" />
  const maxCount = Math.max(1, stages[0]?.count || 1)
  const COLORS = ['#0077B5','#0ea5e9','#38bdf8','#7dd3fc','#bae6fd']
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
      {stages.map((s, i) => {
        const prev = stages[i - 1]
        const dropPct = prev && prev.count > 0 ? Math.round((1 - s.count / prev.count) * 100) : null
        const barW = Math.max(4, (s.count / maxCount) * 100)
        return (
          <div key={i}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:4 }}>
              <div style={{ width:150, fontSize:12, color:'#475569', textAlign:'right', flexShrink:0, fontWeight:500 }}>
                {s.stage}
              </div>
              <div style={{ flex:1, background:'#f1f5f9', borderRadius:6, height:26, overflow:'hidden' }}>
                <div style={{
                  height:'100%', borderRadius:6, width:`${barW}%`,
                  background:COLORS[i] || '#0077B5',
                  transition:'width 0.6s ease',
                }} />
              </div>
              <div style={{ width:120, fontSize:12, fontWeight:700, color:'#0d2137', flexShrink:0 }}>
                {fmtN(s.count)} <span style={{ color:'#94a3b8', fontWeight:500 }}>({s.pct}%)</span>
              </div>
            </div>
            {dropPct !== null && dropPct > 0 && (
              <div style={{ textAlign:'right', paddingRight:130, fontSize:10, color:'#dc2626', marginBottom:2 }}>
                ↓ -{dropPct}% drop-off
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Issue / friction card ─────────────────────────────────────────────────────
function IssueCard({ severity = 'warning', issue, detail, cause }) {
  const s = SEVERITY_STYLES[severity] || SEVERITY_STYLES.info
  return (
    <div style={{ background:s.bg, border:`1px solid ${s.border}`, borderRadius:10, padding:'12px 14px', marginBottom:8 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
        <span style={{ fontSize:14 }}>{s.icon}</span>
        <span style={{ fontWeight:700, fontSize:13, color:s.text }}>{issue}</span>
        <span style={{ marginLeft:'auto', fontSize:10, fontWeight:600, color:s.text, background:`${s.border}60`, borderRadius:99, padding:'2px 8px' }}>{s.label}</span>
      </div>
      <div style={{ fontSize:12, color:'#475569', marginBottom:cause ? 6 : 0 }}>{detail}</div>
      {cause && <div style={{ fontSize:11, color:'#64748b', fontStyle:'italic' }}>Causa probable: {cause}</div>}
    </div>
  )
}

// ── Insight card ──────────────────────────────────────────────────────────────
function InsightCard({ severity, title, desc, action }) {
  const s = SEVERITY_STYLES[severity] || SEVERITY_STYLES.info
  return (
    <div style={{ background:'white', border:`1px solid ${s.border}`, borderLeft:`4px solid ${s.text}`, borderRadius:10, padding:'14px 16px', marginBottom:10 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
        <span>{s.icon}</span>
        <span style={{ fontWeight:700, fontSize:13, color:'#0d2137' }}>{title}</span>
        <span style={{ marginLeft:'auto', fontSize:10, fontWeight:600, color:s.text, background:s.bg, border:`1px solid ${s.border}`, borderRadius:99, padding:'2px 8px' }}>{s.label}</span>
      </div>
      <p style={{ margin:0, fontSize:12, color:'#475569', lineHeight:1.5 }}>{desc}</p>
      {action && <div style={{ marginTop:8, fontSize:11, color:'#0077B5', fontWeight:600 }}>Acción: {action}</div>}
    </div>
  )
}

// ── Health score computations ────────────────────────────────────────────────
function computeHealthScores(ov) {
  if (!ov) return { onboarding:0, engagement:0, conversion:0, platform:0 }
  const onboarding = scorePct(ov.users_analysis, ov.total_users)
  const engagement = scorePct(ov.users_cv, ov.users_analysis)
  const conversionRaw = ov.total_users > 0 ? ov.premium_users / ov.total_users : 0
  const conversion = Math.min(100, Math.round(conversionRaw / 0.12 * 100))
  const aiErr = ov.ai_requests_30d > 0 ? ov.ai_errors_30d / ov.ai_requests_30d : 0
  const platform = Math.min(100, Math.max(0, Math.round(100 - aiErr * 500)))
  return { onboarding, engagement, conversion, platform }
}

// ── Auto-insights ─────────────────────────────────────────────────────────────
function generateInsights(ov) {
  if (!ov) return []
  const insights = []
  const tu = ov.total_users || 0
  const ua = ov.users_analysis || 0
  const uc = ov.users_cv || 0
  const pr = ov.premium_users || 0
  const air = ov.ai_requests_30d || 0
  const aie = ov.ai_errors_30d || 0
  const fp = ov.failed_payments_30d || 0
  const can = ov.events_cancelled_30d || 0
  const lat = ov.avg_ai_latency_ms || 0

  if (tu > 10 && ua / tu < 0.5)
    insights.push({ severity:'danger', title:'Bajo onboarding', desc:`Solo el ${Math.round(ua/tu*100)}% de los usuarios hicieron al menos 1 análisis.`, action:'Revisá el CTA inicial y el flujo de bienvenida.' })

  if (ua > 5 && uc / ua < 0.4)
    insights.push({ severity:'warning', title:'Drop-off análisis → CV', desc:`Solo el ${Math.round(uc/ua*100)}% de quienes analizaron generaron un CV.`, action:'Hacé el CTA de CV más prominente en la pantalla de resultados.' })

  if (tu > 20 && pr / tu < 0.03)
    insights.push({ severity:'danger', title:'Conversión Premium crítica', desc:`${(pr/tu*100).toFixed(1)}% de conversión a premium. La meta mínima viable es 3%.`, action:'Revisá visibilidad del upsell, precio percibido y propuesta de valor premium.' })
  else if (tu > 20 && pr / tu < 0.08)
    insights.push({ severity:'warning', title:'Conversión Premium mejorable', desc:`${(pr/tu*100).toFixed(1)}% de conversión. Meta saludable: 8–15%.`, action:'Probá mejoras en el modal premium y en el momento de presentación del upsell.' })

  if (air > 20 && aie / air > 0.10)
    insights.push({ severity:'danger', title:'Alta tasa de errores IA', desc:`${Math.round(aie/air*100)}% de los requests a Gemini están fallando (${aie} de ${air} en 30d).`, action:'Revisá el tab IA y el estado de la API key.' })

  if (lat > 20000)
    insights.push({ severity:'warning', title:'Latencia IA elevada', desc:`Promedio de ${(lat/1000).toFixed(1)}s en respuestas de Gemini esta semana.`, action:'Considerá reducir el contexto enviado a la IA o hacer streaming.' })

  if (fp >= 3)
    insights.push({ severity:'warning', title:`${fp} pagos fallidos`, desc:`${fp} pagos rechazados por Mercado Pago en los últimos 30 días.`, action:'Revisá el tab Revenue > Pagos para ver los detalles por usuario.' })

  if (can >= 3 && pr > 0 && can / pr > 0.05)
    insights.push({ severity:'warning', title:'Churn elevado', desc:`${can} cancelaciones/vencimientos en 30d sobre ${pr} premiums activos.`, action:'Identificá el patrón de cancelación (timing, features usadas, etc.).' })

  if (ov.mau > 0 && ov.wau / ov.mau > 0.6)
    insights.push({ severity:'success', title:'Excelente retención semanal', desc:`El ${Math.round(ov.wau/ov.mau*100)}% de usuarios activos mensuales también son activos esta semana.` })

  if (ua > 0 && uc / ua >= 0.65)
    insights.push({ severity:'success', title:'Alto engagement análisis → CV', desc:`El ${Math.round(uc/ua*100)}% de quienes analizan también generan CV. Muy buen número.` })

  if (tu > 20 && pr / tu >= 0.10)
    insights.push({ severity:'success', title:'Buena conversión premium', desc:`${(pr/tu*100).toFixed(1)}% de los usuarios son premium. Por encima del promedio SaaS.` })

  if (!insights.length)
    insights.push({ severity:'info', title:'Sin alertas activas', desc:'Todos los indicadores dentro de rangos normales. Volvé cuando haya más actividad para ver insights automáticos.', action:null })

  return insights.sort((a, b) => {
    const order = { danger:0, warning:1, success:2, info:3 }
    return (order[a.severity] ?? 4) - (order[b.severity] ?? 4)
  })
}

// ── Friction detection ────────────────────────────────────────────────────────
function detectFriction(ov, aiFeatures) {
  if (!ov) return { ux:[], tech:[], revenue:[] }
  const ux = [], tech = [], revenue = []
  const tu = ov.total_users || 0, ua = ov.users_analysis || 0
  const uc = ov.users_cv || 0, pr = ov.premium_users || 0
  const ui = ov.users_interview || 0, us = ov.users_star || 0
  const air = ov.ai_requests_30d || 0, aie = ov.ai_errors_30d || 0

  if (tu > 5 && ua / tu < 0.55)
    ux.push({ severity:'high', issue:'Abandono en onboarding', detail:`${Math.round((1 - ua/tu)*100)}% de usuarios no completa el primer análisis.`, cause:'Formulario inicial con fricción, falta de valor percibido o CTA débil en landing.' })

  if (ua > 3 && uc / ua < 0.45)
    ux.push({ severity:'medium', issue:'Drop-off análisis → CV', detail:`${Math.round((1 - uc/ua)*100)}% no pasa del análisis a generar un CV.`, cause:'El CTA de CV puede no ser visible o el flujo post-análisis no lo incentiva suficientemente.' })

  const advUsers = Math.max(ui, us)
  if (tu > 15 && advUsers / tu < 0.08)
    ux.push({ severity:'low', issue:'Features avanzadas poco descubiertas', detail:`Entrevista y STAR tienen adopción < 8% del total de usuarios.`, cause:'Estas features pueden no ser visibles o estar poco promovidas luego del análisis.' })

  if (air > 10 && aie / air > 0.05)
    tech.push({ severity: aie/air > 0.15 ? 'high' : 'medium', issue:`Errores IA: ${(aie/air*100).toFixed(1)}%`, detail:`${aie} errores en ${air} llamadas (30d). Impacta directamente la experiencia del usuario.`, cause:'Rate limits de Gemini, API key con cuota agotada, o timeouts por prompts largos.' })

  if (ov.avg_ai_latency_ms > 18000)
    tech.push({ severity:'medium', issue:`Latencia IA: ${(ov.avg_ai_latency_ms/1000).toFixed(1)}s`, detail:'Las respuestas de Gemini tardan más de 18s en promedio esta semana.', cause:'Prompts demasiado largos o modelo bajo presión. Considera optimizar el contexto.' })

  if (ov.failed_payments_30d >= 2)
    revenue.push({ severity:'high', issue:`${ov.failed_payments_30d} pagos fallidos`, detail:`Pagos rechazados por Mercado Pago en los últimos 30 días.`, cause:'Tarjetas vencidas, fondos insuficientes, o límites de procesamiento de MP.' })

  if (pr > 0 && ov.events_cancelled_30d / pr > 0.08)
    revenue.push({ severity:'high', issue:'Churn rate elevado', detail:`${ov.events_cancelled_30d} cancelaciones/vencimientos sobre ${pr} premiums activos.`, cause:'Revisá si hay un patrón temporal o de features antes de la cancelación.' })

  if (ov.new_subs_30d === 0 && tu > 30)
    revenue.push({ severity:'medium', issue:'Sin nuevas suscripciones (30d)', detail:'No se registraron nuevos pagos premium en los últimos 30 días.', cause:'Evaluar visibilidad del flujo premium, precio actual o saturación del segmento.' })

  return { ux, tech, revenue }
}

// ── Tracking coverage audit (static based on codebase analysis) ───────────────
const TRACKING_EVENTS = [
  { category:'Onboarding',  event:'analysis_started',            params:'mode, has_photo',              ok:true  },
  { category:'Onboarding',  event:'analysis_completed',          params:'duration_ms, puntaje, nivel_seo, mode', ok:true  },
  { category:'Onboarding',  event:'cuestionario_completado',     params:'—',                            ok:true  },
  { category:'Onboarding',  event:'paso_completado',             params:'paso, id',                     ok:true  },
  { category:'CV',          event:'cv_generation_started',       params:'has_pre_answers, has_analysis', ok:true  },
  { category:'CV',          event:'cv_generation_completed',     params:'duration_ms, with_photo, template', ok:true },
  { category:'CV',          event:'cv_quality_scored',           params:'score, nivel, gap_count',      ok:true  },
  { category:'CV',          event:'cv_optimized',                params:'titular_changed, resumen_changed, bullets_improved', ok:true },
  { category:'CV',          event:'cv_gap_form_submitted',       params:'answered_count',               ok:true  },
  { category:'Entrevista',  event:'entrevista_iniciada',         params:'—',                            ok:true  },
  { category:'Entrevista',  event:'entrevista_completada',       params:'puntaje',                      ok:true  },
  { category:'STAR',        event:'star_training_start',         params:'via',                          ok:true  },
  { category:'STAR',        event:'star_feedback_received',      params:'puntaje, question_idx',        ok:true  },
  { category:'Premium',     event:'premium_modal_shown',         params:'—',                            ok:true  },
  { category:'Premium',     event:'premium_checkout_opened',     params:'—',                            ok:true  },
  { category:'Premium',     event:'premium_activated',           params:'—',                            ok:true  },
  { category:'Auth',        event:'auth_login',                  params:'—',                            ok:true  },
  { category:'Auth',        event:'auth_register',               params:'—',                            ok:true  },
  { category:'Errores',     event:'app_error',                   params:'feature, error_type',          ok:true  },
  { category:'Entrevista',  event:'timing_entrevista',           params:'duration_ms',                  ok:false, note:'Sin timing de duración total' },
  { category:'STAR',        event:'timing_star',                 params:'duration_ms',                  ok:false, note:'Sin timing de duración total' },
  { category:'Premium',     event:'premium_payment_success',     params:'amount',                       ok:false, note:'No hay evento client-side post-pago' },
  { category:'Premium',     event:'subscription_renewal',        params:'—',                            ok:false, note:'Solo se registra en Worker, no en GA4' },
  { category:'CV',          event:'cv_download',                 params:'template, format',             ok:false, note:'Solo "cv_save_desktop" sin parámetros' },
]

function TrackingSection() {
  const categories = [...new Set(TRACKING_EVENTS.map(e => e.category))]
  const total = TRACKING_EVENTS.length
  const covered = TRACKING_EVENTS.filter(e => e.ok).length
  const health = Math.round(covered / total * 100)
  const healthColor = health >= 80 ? '#16a34a' : health >= 60 ? '#f59e0b' : '#dc2626'

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:20, flexWrap:'wrap' }}>
        <div style={{ ...C.card, padding:'12px 20px', display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ fontSize:24, fontWeight:800, color:healthColor }}>{health}%</div>
          <div>
            <div style={{ fontSize:12, fontWeight:700, color:'#0d2137' }}>Cobertura de tracking</div>
            <div style={{ fontSize:11, color:'#64748b' }}>{covered}/{total} eventos cubiertos</div>
          </div>
        </div>
        <div style={{ fontSize:12, color:'#64748b', maxWidth:360 }}>
          Auditoría basada en análisis del código fuente. Los eventos marcados con ✗ son oportunidades de mejora.
        </div>
      </div>

      {categories.map(cat => {
        const events = TRACKING_EVENTS.filter(e => e.category === cat)
        return (
          <div key={cat} style={{ marginBottom:16 }}>
            <div style={{ fontSize:12, fontWeight:700, color:'#64748b', marginBottom:8, textTransform:'uppercase', letterSpacing:'0.5px' }}>{cat}</div>
            <div style={{ ...C.card, overflow:'hidden' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ background:'#f8fafc' }}>
                    <Th ch="Estado" />
                    <Th ch="Evento" />
                    <Th ch="Parámetros" />
                    <Th ch="Nota" />
                  </tr>
                </thead>
                <tbody>
                  {events.map((ev, i) => (
                    <tr key={i}>
                      <Td><span style={{ fontSize:14 }}>{ev.ok ? '✅' : '❌'}</span></Td>
                      <Td><code style={{ fontSize:11, background:'#f1f5f9', padding:'2px 6px', borderRadius:4, color:'#0d2137' }}>{ev.event}</code></Td>
                      <Td s={{ fontSize:11, color:'#64748b', maxWidth:200 }}>{ev.params}</Td>
                      <Td s={{ fontSize:11, color: ev.ok ? '#94a3b8' : '#dc2626' }}>{ev.note || '—'}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Overview section ──────────────────────────────────────────────────────────
function OverviewSection({ ov, trend, aiFeatures }) {
  const scores = computeHealthScores(ov)
  const errorRate = ov && ov.ai_requests_30d > 0
    ? `${(ov.ai_errors_30d / ov.ai_requests_30d * 100).toFixed(1)}%` : '0%'

  return (
    <div>
      {/* KPIs — usuarios */}
      <div style={{ fontSize:12, fontWeight:700, color:'#64748b', marginBottom:8, textTransform:'uppercase', letterSpacing:'0.5px' }}>Actividad</div>
      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
        <IKpiCard label="Usuarios totales" value={fmtN(ov?.total_users)}     icon="👥" />
        <IKpiCard label="Premium activos"  value={fmtN(ov?.premium_users)}   icon="⭐" color="#f59e0b" />
        <IKpiCard label="DAU"              value={fmtN(ov?.dau)}             icon="📅" sub="24h" />
        <IKpiCard label="WAU"              value={fmtN(ov?.wau)}             icon="📅" sub="7d" />
        <IKpiCard label="MAU"              value={fmtN(ov?.mau)}             icon="📅" sub="30d" />
        <IKpiCard label="Nuevos (7d)"      value={fmtN(ov?.users_7d)}        icon="🆕" color="#16a34a" />
      </div>

      {/* KPIs — features */}
      <div style={{ fontSize:12, fontWeight:700, color:'#64748b', marginBottom:8, textTransform:'uppercase', letterSpacing:'0.5px' }}>Uso de features (total acumulado)</div>
      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
        <IKpiCard label="Análisis"       value={fmtN(ov?.total_analyses)}   icon="🔍" sub={`${fmtN(ov?.analyses_7d)} esta semana`} />
        <IKpiCard label="CVs generados"  value={fmtN(ov?.total_cvs)}        icon="📄" sub={`${fmtN(ov?.cvs_7d)} esta semana`} />
        <IKpiCard label="Entrevistas"    value={fmtN(ov?.total_interviews)}  icon="🎤" />
        <IKpiCard label="STAR sessions"  value={fmtN(ov?.total_star)}        icon="⭐" />
        <IKpiCard label="Requests IA (30d)" value={fmtN(ov?.ai_requests_30d)} icon="🤖" sub={`${errorRate} errores`} color={ov?.ai_errors_30d > 0 ? '#dc2626' : '#0077B5'} />
        <IKpiCard label="Latencia IA"    value={ov?.avg_ai_latency_ms ? `${(ov.avg_ai_latency_ms/1000).toFixed(1)}s` : '—'} icon="⚡" sub="promedio 7d" color={ov?.avg_ai_latency_ms > 15000 ? '#f59e0b' : '#0077B5'} />
      </div>

      {/* Health scores */}
      <div style={{ fontSize:12, fontWeight:700, color:'#64748b', marginBottom:8, textTransform:'uppercase', letterSpacing:'0.5px' }}>Health scores</div>
      <div style={{ display:'flex', gap:8, marginBottom:20, flexWrap:'wrap' }}>
        <HealthGauge score={scores.onboarding} label="Onboarding"  color="#0077B5" />
        <HealthGauge score={scores.engagement} label="Engagement"  color="#0ea5e9" />
        <HealthGauge score={scores.conversion} label="Conversión"  color="#f59e0b" />
        <HealthGauge score={scores.platform}   label="Plataforma"  color="#16a34a" />
      </div>

      {/* Trend chart */}
      <div style={{ fontSize:12, fontWeight:700, color:'#64748b', marginBottom:10, textTransform:'uppercase', letterSpacing:'0.5px' }}>Tendencia semanal (8 semanas)</div>
      <div style={{ ...C.card, padding:'16px 14px', marginBottom:16 }}>
        <BarChart
          data={trend || []}
          keys={['new_users','analyses','cvs','new_premiums']}
          colors={['#0077B5','#38bdf8','#7dd3fc','#f59e0b']}
          keyLabels={['Nuevos usuarios','Análisis','CVs','Nuevos premiums']}
          height={130}
        />
      </div>

      {/* AI feature breakdown */}
      {aiFeatures?.length > 0 && (
        <>
          <div style={{ fontSize:12, fontWeight:700, color:'#64748b', marginBottom:8, textTransform:'uppercase', letterSpacing:'0.5px' }}>IA por feature (30d)</div>
          <div style={{ ...C.card, overflow:'hidden', marginBottom:16 }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr><Th ch="Feature" /><Th ch="Requests" /><Th ch="Errores" /><Th ch="Error %" /><Th ch="Latencia" /><Th ch="Tokens" /></tr>
              </thead>
              <tbody>
                {aiFeatures.map((f, i) => (
                  <tr key={i}>
                    <Td><code style={{ fontSize:11, background:'#f1f5f9', padding:'2px 6px', borderRadius:4 }}>{f.feature}</code></Td>
                    <Td>{fmtN(f.requests)}</Td>
                    <Td s={{ color: f.errors > 0 ? '#dc2626' : '#94a3b8' }}>{f.errors}</Td>
                    <Td s={{ color: f.error_rate > 10 ? '#dc2626' : f.error_rate > 5 ? '#f59e0b' : '#16a34a', fontWeight:700 }}>{f.error_rate}%</Td>
                    <Td s={{ color: f.avg_duration_ms > 20000 ? '#f59e0b' : '#475569' }}>{f.avg_duration_ms ? `${(f.avg_duration_ms/1000).toFixed(1)}s` : '—'}</Td>
                    <Td>{fmtK(f.total_tokens)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

// ── GA4 empty / diagnostic panel ─────────────────────────────────────────────
function Ga4EmptyDiag({ diag, days, onRetry, onExpand }) {
  const [show, setShow] = useState(false)
  const rowCount = diag?.row_count ?? 0
  const stepTotals = diag?.step_totals_found || {}
  const anyEvents = Object.values(stepTotals).some(v => v > 0)

  const reason = !diag?.has_funnelTable
    ? 'GA4 no devolvió funnelTable en la respuesta.'
    : rowCount === 0
    ? `GA4 no encontró sesiones con estos eventos en los últimos ${days} días.`
    : !anyEvents
    ? `GA4 devolvió ${rowCount} filas pero ninguna matchea los nombres de los pasos del funnel.`
    : 'Los datos existen pero los conteos son 0 para todos los pasos.'

  return (
    <div style={{ padding:'16px', background:'#f8fafc', borderRadius:10, border:'1px solid #e2e8f0' }}>
      <div style={{ display:'flex', alignItems:'flex-start', gap:10, marginBottom:8 }}>
        <span style={{ fontSize:20 }}>📭</span>
        <div>
          <div style={{ fontWeight:700, fontSize:13, color:'#0d2137', marginBottom:4 }}>Sin datos GA4 ({days}d)</div>
          <div style={{ fontSize:12, color:'#475569', lineHeight:1.6 }}>{reason}</div>
        </div>
      </div>

      {rowCount === 0 && days < 90 && (
        <div style={{ marginBottom:8 }}>
          <div style={{ fontSize:12, color:'#64748b', marginBottom:6 }}>
            Probables causas:
          </div>
          <ul style={{ margin:0, paddingLeft:18, fontSize:12, color:'#475569', lineHeight:1.8 }}>
            <li>Los eventos se empezaron a trackear hace poco y GA4 no tiene histórico aún (demora 24-48h)</li>
            <li>En los últimos {days} días no hubo usuarios que dispararan <code style={{ fontSize:11, background:'#f1f5f9', padding:'1px 4px', borderRadius:3 }}>analysis_started</code></li>
            <li>El measurement ID de la app no coincide con la propiedad GA4 que estamos leyendo</li>
          </ul>
        </div>
      )}

      {!anyEvents && rowCount > 0 && (
        <div style={{ marginBottom:8, fontSize:12, color:'#475569' }}>
          GA4 devolvió pasos con otros nombres. Abrí el diagnóstico para ver cuáles.
        </div>
      )}

      <div style={{ display:'flex', gap:8, marginTop:10, flexWrap:'wrap' }}>
        {days < 90 && <button onClick={onExpand} style={{ ...C.sec, fontSize:11, padding:'4px 12px' }}>Probar con 90 días</button>}
        <button onClick={onRetry} style={{ ...C.sec, fontSize:11, padding:'4px 12px' }}>↺ Reintentar</button>
        <button onClick={() => setShow(s => !s)} style={{ ...C.sec, fontSize:11, padding:'4px 12px' }}>
          {show ? 'Ocultar' : 'Ver'} diagnóstico
        </button>
      </div>

      {show && (
        <div style={{ marginTop:12, padding:'10px 12px', background:'#1e293b', borderRadius:8, overflowX:'auto' }}>
          <pre style={{ margin:0, fontSize:10, color:'#94a3b8', fontFamily:'monospace', whiteSpace:'pre-wrap', wordBreak:'break-all' }}>
            {JSON.stringify(diag, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

// ── GA4 funnel source badge ───────────────────────────────────────────────────
function SourceBadge({ source }) {
  const styles = {
    ga4:      { background:'#fff8e1', color:'#f59e0b', border:'1px solid #fde68a' },
    supabase: { background:'#f0f9ff', color:'#0369a1', border:'1px solid #bae6fd' },
  }
  const labels = { ga4:'GA4 · sesiones reales', supabase:'Supabase · usuarios registrados' }
  const s = styles[source] || styles.supabase
  return (
    <span style={{ ...s, fontSize:10, fontWeight:700, borderRadius:99, padding:'2px 8px' }}>
      {labels[source] || source}
    </span>
  )
}

// ── Funnels section ───────────────────────────────────────────────────────────
function FunnelsSection({ ov, funnel, adminFetch }) {
  const stages = funnel?.stages || []
  const [ga4, setGa4] = useState(null)
  const [ga4Loading, setGa4Loading] = useState(false)
  const [ga4Error, setGa4Error] = useState('')
  const [ga4Days, setGa4Days] = useState(30)

  const loadGa4 = useCallback(async (days) => {
    setGa4Loading(true); setGa4Error('')
    const d = await adminFetch('admin_ga4_funnel', { days })
    if (d?.ok && d.not_configured) {
      setGa4({ not_configured: true })
    } else if (d?.ok) {
      setGa4(d)
    } else {
      setGa4Error(d?.error || 'Error al obtener datos de GA4')
    }
    setGa4Loading(false)
  }, [adminFetch])

  useEffect(() => { loadGa4(ga4Days) }, [loadGa4, ga4Days])

  return (
    <div>
      {/* GA4 funnel — real sessions */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12, flexWrap:'wrap' }}>
        <div style={{ fontSize:12, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.5px' }}>Funnel de conversión</div>
        <SourceBadge source="ga4" />
        <div style={{ marginLeft:'auto', display:'flex', gap:6, alignItems:'center' }}>
          {[7, 30, 90].map(d => (
            <button key={d} onClick={() => setGa4Days(d)} style={{
              padding:'3px 10px', borderRadius:6, fontSize:11, fontWeight:600, cursor:'pointer',
              border:'1px solid', borderColor: ga4Days === d ? '#0077B5' : '#e2e8f0',
              background: ga4Days === d ? '#0077B5' : 'white',
              color: ga4Days === d ? 'white' : '#475569',
            }}>{d}d</button>
          ))}
          <button onClick={() => loadGa4(ga4Days)} style={{ ...C.sec, padding:'3px 10px', fontSize:11 }}>↺</button>
        </div>
      </div>
      <div style={{ ...C.card, padding:'20px 16px', marginBottom:20 }}>
        {ga4Loading ? (
          <div style={{ textAlign:'center', padding:24 }}><Spin /></div>
        ) : ga4?.not_configured ? (
          <div style={{ padding:'16px', background:'#fff8e1', borderRadius:10, border:'1px solid #fde68a' }}>
            <div style={{ fontWeight:700, fontSize:13, color:'#92400e', marginBottom:6 }}>GA4 no configurado</div>
            <div style={{ fontSize:12, color:'#78350f', lineHeight:1.6 }}>
              Para ver el funnel con sesiones reales (incluyendo usuarios anónimos), agregá el secret <code style={{ background:'#fef3c7', padding:'1px 5px', borderRadius:4 }}>GA4_CREDENTIALS_JSON</code> en Cloudflare Workers con el contenido del nuevo JSON de cuenta de servicio.
            </div>
          </div>
        ) : ga4Error ? (
          <ErrBox msg={ga4Error} onRetry={() => loadGa4(ga4Days)} />
        ) : ga4?.stages?.length > 0 ? (
          <FunnelBar stages={ga4.stages} />
        ) : ga4 ? (
          <Ga4EmptyDiag diag={ga4.diag} days={ga4Days} onRetry={() => loadGa4(ga4Days)} onExpand={() => setGa4Days(90)} />
        ) : null}
      </div>

      {/* Supabase funnel — registered users */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12, flexWrap:'wrap' }}>
        <div style={{ fontSize:12, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.5px' }}>Adopción acumulada</div>
        <SourceBadge source="supabase" />
      </div>
      <div style={{ ...C.card, padding:'20px 16px', marginBottom:20 }}>
        <FunnelBar stages={stages} />
      </div>

      {/* Feature adoption bars */}
      <div style={{ fontSize:12, fontWeight:700, color:'#64748b', marginBottom:12, textTransform:'uppercase', letterSpacing:'0.5px' }}>Adopción por feature (usuarios únicos)</div>
      <div style={{ ...C.card, padding:'16px', marginBottom:20 }}>
        {[
          { label:'Análisis de perfil',   count: ov?.users_analysis,  total: ov?.total_users, color:'#0077B5' },
          { label:'Generación de CV',     count: ov?.users_cv,        total: ov?.total_users, color:'#0ea5e9' },
          { label:'Simulador entrevista', count: ov?.users_interview,  total: ov?.total_users, color:'#38bdf8' },
          { label:'Entrenador STAR',      count: ov?.users_star,      total: ov?.total_users, color:'#7dd3fc' },
          { label:'Premium',              count: ov?.premium_users,   total: ov?.total_users, color:'#f59e0b' },
        ].map((row, i) => {
          const pctVal = row.total > 0 ? (row.count / row.total * 100) : 0
          return (
            <div key={i} style={{ marginBottom:10 }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4 }}>
                <span style={{ fontWeight:600, color:'#0d2137' }}>{row.label}</span>
                <span style={{ color:'#64748b' }}>{fmtN(row.count)} / {fmtN(row.total)} ({pctVal.toFixed(1)}%)</span>
              </div>
              <div style={{ background:'#f1f5f9', borderRadius:6, height:8, overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${Math.max(0, Math.min(100, pctVal))}%`, background:row.color, borderRadius:6, transition:'width 0.5s' }} />
              </div>
            </div>
          )
        })}
      </div>

      {/* Summary metrics */}
      <div style={{ ...C.card, padding:'16px' }}>
        <div style={{ display:'flex', gap:20, flexWrap:'wrap' }}>
          <div style={{ textAlign:'center', padding:'12px 20px' }}>
            <div style={{ fontSize:28, fontWeight:800, color:'#0077B5' }}>{pct(funnel?.users_both_analysis_cv || 0, ov?.users_analysis || 1)}</div>
            <div style={{ fontSize:11, color:'#64748b', marginTop:4 }}>analizaron → generaron CV</div>
            <div style={{ fontSize:10, color:'#94a3b8', marginTop:2 }}>{fmtN(funnel?.users_both_analysis_cv)} usuarios</div>
          </div>
          <div style={{ textAlign:'center', padding:'12px 20px' }}>
            <div style={{ fontSize:28, fontWeight:800, color:'#f59e0b' }}>{pct(ov?.premium_users || 0, ov?.users_analysis || 1)}</div>
            <div style={{ fontSize:11, color:'#64748b', marginTop:4 }}>analizaron → se volvieron premium</div>
          </div>
          <div style={{ textAlign:'center', padding:'12px 20px' }}>
            <div style={{ fontSize:28, fontWeight:800, color:'#16a34a' }}>{(ov?.total_analyses / Math.max(1, ov?.users_analysis) || 0).toFixed(1)}×</div>
            <div style={{ fontSize:11, color:'#64748b', marginTop:4 }}>análisis por usuario (promedio)</div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main InteligenicaTab ──────────────────────────────────────────────────────
function InteligenicaTab({ adminFetch }) {
  const [subTab, setSubTab] = useState('overview')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    const d = await adminFetch('admin_analytics_overview')
    if (d?.ok) setData(d)
    else setError(d?.error || 'Error al cargar analytics')
    setLoading(false)
  }, [adminFetch])

  useEffect(() => { load() }, [load])

  if (loading) return <div style={{ textAlign:'center', padding:60 }}><Spin /></div>
  if (error)   return <ErrBox msg={error} onRetry={load} />

  const ov = data?.overview || {}
  const funnel = data?.funnel || {}
  const trend = data?.trend || []
  const aiFeatures = data?.ai_features || []
  const insights = generateInsights(ov)
  const friction = detectFriction(ov, aiFeatures)

  const sectionStyle = { marginBottom:0 }

  return (
    <div style={sectionStyle}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, flexWrap:'wrap', gap:8 }}>
        <div>
          <div style={{ fontSize:16, fontWeight:800, color:'#0d2137' }}>Inteligencia de Producto</div>
          <div style={{ fontSize:12, color:'#64748b', marginTop:2 }}>KPIs, funnels, diagnóstico y tracking — actualizado ahora</div>
        </div>
        <button onClick={load} style={{ ...C.sec, fontSize:12 }}>Actualizar</button>
      </div>

      <IntelSubNav active={subTab} onChange={setSubTab} />

      {subTab === 'overview' && <OverviewSection ov={ov} trend={trend} aiFeatures={aiFeatures} />}

      {subTab === 'funnels' && <FunnelsSection ov={ov} funnel={funnel} adminFetch={adminFetch} />}

      {subTab === 'friccion' && (
        <div>
          {friction.ux.length === 0 && friction.tech.length === 0 && friction.revenue.length === 0 ? (
            <div style={{ ...C.card, padding:'24px', textAlign:'center', color:'#16a34a', fontWeight:600 }}>
              Sin problemas detectados. Todo parece estar funcionando bien.
            </div>
          ) : (
            <>
              {friction.ux.length > 0 && (
                <>
                  <div style={{ fontSize:12, fontWeight:700, color:'#64748b', marginBottom:8, textTransform:'uppercase', letterSpacing:'0.5px' }}>UX / Flujo de usuario</div>
                  {friction.ux.map((f, i) => <IssueCard key={i} {...f} />)}
                </>
              )}
              {friction.tech.length > 0 && (
                <>
                  <div style={{ fontSize:12, fontWeight:700, color:'#64748b', marginTop:16, marginBottom:8, textTransform:'uppercase', letterSpacing:'0.5px' }}>Técnicos</div>
                  {friction.tech.map((f, i) => <IssueCard key={i} {...f} />)}
                </>
              )}
              {friction.revenue.length > 0 && (
                <>
                  <div style={{ fontSize:12, fontWeight:700, color:'#64748b', marginTop:16, marginBottom:8, textTransform:'uppercase', letterSpacing:'0.5px' }}>Revenue</div>
                  {friction.revenue.map((f, i) => <IssueCard key={i} {...f} />)}
                </>
              )}
            </>
          )}
        </div>
      )}

      {subTab === 'insights' && (
        <div>
          <div style={{ fontSize:12, color:'#64748b', marginBottom:14 }}>
            {insights.length} insight{insights.length !== 1 ? 's' : ''} generados automáticamente a partir de los datos actuales.
          </div>
          {insights.map((ins, i) => <InsightCard key={i} {...ins} />)}
        </div>
      )}

      {subTab === 'tracking' && <TrackingSection />}
    </div>
  )
}

// ── Main Panel — sin overlays, sin drawers ────────────────────────────────────
export default function AdminPanel({ authToken, onClose }) {
  const [tab, setTab] = useState('dashboard')
  const adminFetch = useAdminFetch(authToken)
  const cur = TABS.find(t => t.id === tab)

  return (
    <>
      <style>{`
        @keyframes admspin { to { transform: rotate(360deg) } }

        /* ── Admin layout ── */
        .adm-root {
          position: fixed; inset: 0; z-index: 200;
          display: flex; flex-direction: column;
          background: #f0f4f8;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
        .adm-header {
          background: white; border-bottom: 1px solid #e2e8f0;
          display: flex; align-items: center; gap: 12px;
          padding: 14px 20px; flex-shrink: 0;
        }
        .adm-body {
          flex: 1; display: flex; overflow: hidden;
        }
        /* Desktop sidebar */
        .adm-sidebar {
          width: 200px; min-width: 200px; background: white;
          border-right: 1px solid #e2e8f0;
          display: flex; flex-direction: column;
          overflow-y: auto;
        }
        /* Mobile tabs strip — hidden on desktop */
        .adm-tabs-strip {
          display: none;
        }
        .adm-content {
          flex: 1; overflow-y: auto;
          padding: 22px 20px;
          -webkit-overflow-scrolling: touch;
        }
        .adm-nav-btn {
          display: flex; align-items: center; gap: 10px;
          width: 100%; text-align: left;
          padding: 10px 12px; border-radius: 9px;
          border: none; cursor: pointer; margin-bottom: 2px;
          font-size: 13px; transition: background 0.15s;
        }

        /* ── Mobile (≤ 600px) ── */
        @media (max-width: 600px) {
          .adm-sidebar  { display: none; }
          .adm-tabs-strip {
            display: flex; overflow-x: auto; background: white;
            border-bottom: 1px solid #e2e8f0; flex-shrink: 0;
            -webkit-overflow-scrolling: touch; scrollbar-width: none;
          }
          .adm-tabs-strip::-webkit-scrollbar { display: none; }
          .adm-tab-btn {
            display: flex; flex-direction: column; align-items: center; gap: 2px;
            padding: 10px 14px; border: none; background: transparent;
            cursor: pointer; flex-shrink: 0; font-size: 10px; font-weight: 700;
            color: #94a3b8; white-space: nowrap; border-bottom: 2px solid transparent;
            transition: all 0.15s;
          }
          .adm-tab-btn.active { color: #0077B5; border-bottom-color: #0077B5; }
          .adm-content { padding: 14px 12px; }
        }
      `}</style>

      <div className="adm-root">
        {/* ── Header (always visible) ── */}
        <div className="adm-header">
          <div style={{ fontWeight:800, fontSize:15, color:'#0d2137', flex:1 }}>
            {cur?.icon} {cur?.label}
            <span style={{ fontSize:11, fontWeight:500, color:'#94a3b8', marginLeft:8 }}>Admin</span>
          </div>
          <button
            onClick={onClose}
            style={{ ...C.sec, padding:'6px 14px', fontSize:13 }}>
            ✕ Cerrar
          </button>
        </div>

        {/* ── Mobile tab strip ── */}
        <div className="adm-tabs-strip" role="tablist">
          {TABS.map(t => (
            <button key={t.id} role="tab"
              className={`adm-tab-btn${tab === t.id ? ' active' : ''}`}
              onClick={() => setTab(t.id)}>
              <span style={{ fontSize:18 }}>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Body ── */}
        <div className="adm-body">
          {/* Desktop sidebar */}
          <div className="adm-sidebar">
            <nav style={{ padding:'10px 8px', flex:1 }}>
              {TABS.map(t => (
                <button key={t.id} className="adm-nav-btn"
                  onClick={() => setTab(t.id)}
                  style={{
                    background: tab === t.id ? 'rgba(0,119,181,0.09)' : 'transparent',
                    color: tab === t.id ? '#0077B5' : '#475569',
                    fontWeight: tab === t.id ? 700 : 500,
                  }}>
                  <span style={{ fontSize:16 }}>{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Content */}
          <div className="adm-content">
            <div style={{ maxWidth:860 }}>
              {tab === 'dashboard'    && <Dashboard        adminFetch={adminFetch} />}
              {tab === 'users'        && <CrmUsersTab      adminFetch={adminFetch} />}
              {tab === 'premium'      && <CrmUsersTab      adminFetch={adminFetch} defaultPremiumStatus="active" />}
              {tab === 'revenue'      && <RevenueTab       adminFetch={adminFetch} />}
              {tab === 'inteligencia' && <InteligenicaTab  adminFetch={adminFetch} />}
              {tab === 'codes'        && <CodesTab         adminFetch={adminFetch} />}
              {tab === 'comentarios'  && <CommentsTab      adminFetch={adminFetch} />}
              {tab === 'logs'         && <LogsTab          adminFetch={adminFetch} />}
              {tab === 'ia'           && <IaTab            adminFetch={adminFetch} />}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

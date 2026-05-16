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
  { id:'dashboard',   label:'Dashboard',    icon:'📊' },
  { id:'users',       label:'Usuarios',     icon:'👥' },
  { id:'premium',     label:'Premium',      icon:'⭐' },
  { id:'codes',       label:'Códigos',      icon:'🎫' },
  { id:'comentarios', label:'Comentarios',  icon:'💬' },
  { id:'logs',        label:'Logs',         icon:'📋' },
  { id:'ia',          label:'IA',           icon:'🤖' },
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
              {tab === 'dashboard'   && <Dashboard     adminFetch={adminFetch} />}
              {tab === 'users'       && <CrmUsersTab   adminFetch={adminFetch} />}
              {tab === 'premium'     && <CrmUsersTab   adminFetch={adminFetch} defaultPremiumStatus="active" />}
              {tab === 'codes'       && <CodesTab      adminFetch={adminFetch} />}
              {tab === 'comentarios' && <CommentsTab   adminFetch={adminFetch} />}
              {tab === 'logs'        && <LogsTab       adminFetch={adminFetch} />}
              {tab === 'ia'          && <IaTab         adminFetch={adminFetch} />}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

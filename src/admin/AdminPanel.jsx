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
  { id:'dashboard', label:'Dashboard',  icon:'📊' },
  { id:'users',     label:'Usuarios',   icon:'👥' },
  { id:'premium',   label:'Premium',    icon:'⭐' },
  { id:'codes',     label:'Códigos',    icon:'🎫' },
  { id:'logs',      label:'Logs',       icon:'📋' },
  { id:'ia',        label:'IA',         icon:'🤖' },
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

      <div style={{ borderTop:'1px solid #f1f5f9', paddingTop:16, marginTop: detail ? 0 : 8 }}>
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

// ── Users Tab ─────────────────────────────────────────────────────────────────
function UsersTab({ adminFetch, premiumOnly }) {
  const [users, setUsers]     = useState([])
  const [search, setSearch]   = useState('')
  const [offset, setOffset]   = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [selected, setSelected] = useState(null)
  const LIMIT = 20

  const load = useCallback(async (q, off, replace) => {
    setLoading(true); setError('')
    const body = { search:q, offset:off, limit:LIMIT }
    if (premiumOnly) body.premium_only = true
    const d = await adminFetch('admin_users', body)
    if (d?.ok) {
      const list = d.users || []
      if (replace) setUsers(list)
      else setUsers(prev => [...prev, ...list])
      setHasMore(list.length === LIMIT)
      setOffset(off)
    } else {
      setError(d?.error || 'Error al cargar usuarios')
    }
    setLoading(false)
  }, [adminFetch, premiumOnly])

  useEffect(() => { load('', 0, true) }, [load])

  if (selected) return (
    <UserDetail
      user={selected}
      adminFetch={adminFetch}
      onBack={() => setSelected(null)}
      onUpdated={() => { setSelected(null); load(search, 0, true) }}
    />
  )

  return (
    <div style={C.card}>
      <div style={{ padding:'14px 16px', borderBottom:'1px solid #f1f5f9', display:'flex', gap:8 }}>
        <input
          placeholder={premiumOnly ? 'Buscar en premium...' : 'Nombre o email...'}
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && load(search, 0, true)}
          style={C.input}
        />
        <button onClick={() => load(search, 0, true)} style={C.pri}>Buscar</button>
      </div>

      {error ? (
        <div style={{ padding:16 }}><ErrBox msg={error} onRetry={() => load(search, 0, true)} /></div>
      ) : (
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', minWidth:360 }}>
            <thead><tr><Th ch="Usuario" /><Th ch="Plan" /><Th ch="Registro" /></tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} onClick={() => setSelected(u)} style={{ cursor:'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background='#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.background='white'}>
                  <Td>
                    <div style={{ fontWeight:600 }}>{u.nombre || '—'}</div>
                    <div style={{ fontSize:11, color:'#94a3b8', marginTop:1 }}>{u.email}</div>
                  </Td>
                  <Td><Badge premium={u.es_premium} hasta={u.premium_hasta} /></Td>
                  <Td s={{ color:'#64748b', fontSize:12 }}>
                    {u.created_at ? new Date(u.created_at).toLocaleDateString('es-AR') : '—'}
                  </Td>
                </tr>
              ))}
              {!loading && users.length === 0 && <tr><td colSpan={3}><Empty /></td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {loading && <div style={{ textAlign:'center', padding:16 }}><Spin /></div>}
      {hasMore && !loading && (
        <div style={{ padding:'10px 14px', borderTop:'1px solid #f1f5f9' }}>
          <button onClick={() => load(search, offset + LIMIT, false)} style={{ ...C.sec, width:'100%' }}>Cargar más</button>
        </div>
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
              {tab === 'dashboard' && <Dashboard adminFetch={adminFetch} />}
              {tab === 'users'     && <UsersTab  adminFetch={adminFetch} />}
              {tab === 'premium'   && <UsersTab  adminFetch={adminFetch} premiumOnly />}
              {tab === 'codes'     && <CodesTab  adminFetch={adminFetch} />}
              {tab === 'logs'      && <LogsTab   adminFetch={adminFetch} />}
              {tab === 'ia'        && <IaTab     adminFetch={adminFetch} />}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

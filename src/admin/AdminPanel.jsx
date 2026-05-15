import { useState, useEffect, useCallback, useRef } from 'react'
import { WORKER_URL, WORKER_HEADERS, LI_GRADIENT } from '../constants.js'

// ── Styles ──────────────────────────────────────────────────────────────────
const C = {
  card:    { background: 'white', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 1px 6px rgba(0,0,0,0.05)' },
  pri:     { background: LI_GRADIENT, color: 'white', border: 'none', borderRadius: 9, padding: '8px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' },
  sec:     { background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 9, padding: '8px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' },
  danger:  { background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 9, padding: '8px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' },
  input:   { border: '1px solid #e2e8f0', borderRadius: 9, padding: '8px 12px', fontSize: 13, width: '100%', outline: 'none', background: 'white', boxSizing: 'border-box' },
}
const TABS = [
  { id: 'dashboard', label: 'Dashboard',  icon: '📊' },
  { id: 'users',     label: 'Usuarios',   icon: '👥' },
  { id: 'premium',   label: 'Premium',    icon: '⭐' },
  { id: 'codes',     label: 'Códigos',    icon: '🎫' },
  { id: 'logs',      label: 'Logs',       icon: '📋' },
]

// ── Helpers ──────────────────────────────────────────────────────────────────
function Spin() {
  return (
    <span style={{ display:'inline-block', width:16, height:16,
      border:'2px solid rgba(0,119,181,0.25)', borderTopColor:'#0077B5',
      borderRadius:'50%', animation:'admspin 0.7s linear infinite', flexShrink: 0 }} />
  )
}

function ErrMsg({ msg, onRetry }) {
  return (
    <div style={{ padding:'20px 24px', borderRadius:12, background:'#fef2f2',
      border:'1px solid #fecaca', color:'#dc2626', fontSize:13 }}>
      <div style={{ fontWeight:700, marginBottom:6 }}>Error al cargar</div>
      <div style={{ color:'#991b1b', marginBottom: onRetry ? 12 : 0 }}>{msg}</div>
      {onRetry && <button onClick={onRetry} style={C.sec}>Reintentar</button>}
    </div>
  )
}

function Empty({ text }) {
  return (
    <div style={{ textAlign:'center', padding:'40px 20px', color:'#94a3b8', fontSize:13 }}>
      {text}
    </div>
  )
}

function Th({ children }) {
  return <th style={{ padding:'8px 12px', textAlign:'left', fontSize:11, fontWeight:700, color:'#64748b', background:'#f8fafc', whiteSpace:'nowrap' }}>{children}</th>
}
function Td({ children, style }) {
  return <td style={{ padding:'10px 12px', fontSize:13, borderTop:'1px solid #f1f5f9', verticalAlign:'middle', ...style }}>{children}</td>
}

function Badge({ premium, hasta }) {
  if (premium) {
    const label = hasta ? `Premium · ${new Date(hasta).toLocaleDateString('es-AR',{day:'numeric',month:'short'})}` : 'Premium'
    return <span style={{ background:LI_GRADIENT, color:'white', borderRadius:99, padding:'2px 10px', fontWeight:700, fontSize:11 }}>{label}</span>
  }
  return <span style={{ background:'#f1f5f9', color:'#64748b', borderRadius:99, padding:'2px 10px', fontWeight:600, fontSize:11 }}>Free</span>
}

// ── useAdminFetch: fetch con timeout + error uniforme ─────────────────────
function useAdminFetch(authToken) {
  return useCallback(async (action, body = {}) => {
    const controller = new AbortController()
    const tid = setTimeout(() => controller.abort(), 15000) // 15s timeout
    try {
      const res = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { ...WORKER_HEADERS, Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ action, ...body }),
        signal: controller.signal,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        return { ok: false, error: err.error || `HTTP ${res.status}` }
      }
      return res.json()
    } catch (e) {
      if (e.name === 'AbortError') return { ok: false, error: 'Tiempo de espera agotado (15s)' }
      return { ok: false, error: e.message || 'Error de red' }
    } finally {
      clearTimeout(tid)
    }
  }, [authToken])
}

// ── Dashboard ────────────────────────────────────────────────────────────────
function StatCard({ label, value, color, sub }) {
  return (
    <div style={{ ...C.card, padding:'18px 16px', textAlign:'center' }}>
      <div style={{ fontSize:26, fontWeight:800, color: color || '#0077B5', lineHeight:1 }}>{value ?? '—'}</div>
      <div style={{ fontSize:11, fontWeight:600, color:'#64748b', marginTop:4 }}>{label}</div>
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
    if (d.ok) setStats(d.stats)
    else setError(d.error || 'Error al obtener estadísticas')
    setLoading(false)
  }, [adminFetch])

  useEffect(() => { load() }, [load])

  if (loading) return <div style={{ textAlign:'center', padding:60 }}><Spin /></div>
  if (error) return <ErrMsg msg={error} onRetry={load} />
  if (!stats) return null

  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))', gap:14 }}>
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
  const [detail, setDetail] = useState(null)
  const [detailErr, setDetailErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(30)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState({ text:'', ok:true })

  const loadDetail = useCallback(async () => {
    setLoading(true); setDetailErr('')
    const d = await adminFetch('admin_user_detail', { user_id: user.id })
    if (d.ok) setDetail(d)
    else setDetailErr(d.error || 'Error al cargar detalle')
    setLoading(false)
  }, [user.id, adminFetch])

  useEffect(() => { loadDetail() }, [loadDetail])

  const grantPremium = async () => {
    setBusy(true); setMsg({ text:'', ok:true })
    const d = await adminFetch('admin_grant_premium', { user_id: user.id, days })
    if (d.ok) {
      setMsg({ text:`Premium hasta ${new Date(d.premium_hasta).toLocaleDateString('es-AR')}`, ok:true })
      onUpdated()
    } else {
      setMsg({ text: d.error || 'Error', ok:false })
    }
    setBusy(false)
  }

  const revokePremium = async () => {
    if (!confirm(`¿Revocar premium de ${user.nombre || user.email}?`)) return
    setBusy(true); setMsg({ text:'', ok:true })
    const d = await adminFetch('admin_revoke_premium', { user_id: user.id })
    if (d.ok) {
      setMsg({ text:'Premium revocado', ok:true })
      onUpdated()
    } else {
      setMsg({ text: d.error || 'Error', ok:false })
    }
    setBusy(false)
  }

  return (
    <div style={{ ...C.card, padding:'20px 22px', maxWidth:520 }}>
      <button onClick={onBack} style={{ ...C.sec, fontSize:12, marginBottom:18 }}>← Volver</button>

      <div style={{ fontWeight:700, fontSize:16, marginBottom:2 }}>{user.nombre || user.email}</div>
      <div style={{ fontSize:12, color:'#64748b', marginBottom:16 }}>
        {user.email} &nbsp;·&nbsp; <Badge premium={user.es_premium} hasta={user.premium_hasta} />
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:20 }}><Spin /></div>
      ) : detailErr ? (
        <ErrMsg msg={detailErr} onRetry={loadDetail} />
      ) : detail && (
        <>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:18 }}>
            <StatCard label="Análisis"    value={detail.analisis_count}   color="#0077B5" />
            <StatCard label="CVs"         value={detail.cv_count}          color="#6366f1" />
            <StatCard label="Entrevistas" value={detail.entrevista_count}  color="#0d9488" />
          </div>
          {detail.historial?.length > 0 && (
            <div style={{ marginBottom:18 }}>
              <div style={{ fontSize:12, fontWeight:700, color:'#64748b', marginBottom:8 }}>Últimas actividades</div>
              <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                {detail.historial.slice(0,5).map(h => (
                  <div key={h.id} style={{ fontSize:12, color:'#475569', display:'flex', justifyContent:'space-between' }}>
                    <span>{h.tipo} — {h.titulo || '—'}</span>
                    <span style={{ color:'#94a3b8' }}>{new Date(h.created_at).toLocaleDateString('es-AR')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <div style={{ borderTop:'1px solid #f1f5f9', paddingTop:16 }}>
        <div style={{ fontSize:12, fontWeight:700, color:'#64748b', marginBottom:10 }}>Gestión de acceso</div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
          <select value={days} onChange={e => setDays(Number(e.target.value))} style={{ ...C.input, width:100 }}>
            {[7,14,30,60,90,180,365].map(n => <option key={n} value={n}>{n} días</option>)}
          </select>
          <button onClick={grantPremium} disabled={busy} style={{ ...C.pri, opacity: busy ? 0.6 : 1 }}>
            {busy ? <Spin /> : '✓ Otorgar premium'}
          </button>
          {user.es_premium && (
            <button onClick={revokePremium} disabled={busy} style={{ ...C.danger, opacity: busy ? 0.6 : 1 }}>
              Revocar
            </button>
          )}
        </div>
        {msg.text && (
          <div style={{ marginTop:10, fontSize:12, fontWeight:600, color: msg.ok ? '#059669' : '#dc2626' }}>
            {msg.text}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Users Tab ─────────────────────────────────────────────────────────────────
function UsersTab({ adminFetch, premiumOnly }) {
  const [users, setUsers] = useState([])
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)
  const LIMIT = 20
  const searchRef = useRef(search)
  searchRef.current = search

  const load = useCallback(async (q, off, replace) => {
    setLoading(true); setError('')
    const body = { search: q, offset: off, limit: LIMIT }
    if (premiumOnly) body.premium_only = true
    const d = await adminFetch('admin_users', body)
    if (d.ok) {
      const list = d.users || []
      if (replace) setUsers(list)
      else setUsers(prev => [...prev, ...list])
      setHasMore(list.length === LIMIT)
      setOffset(off)
    } else {
      setError(d.error || 'Error al cargar usuarios')
    }
    setLoading(false)
  }, [adminFetch, premiumOnly])

  useEffect(() => { load('', 0, true) }, [load])

  const handleSearch = () => { load(search, 0, true) }
  const loadMore = () => { load(searchRef.current, offset + LIMIT, false) }

  if (selected) {
    return (
      <UserDetail
        user={selected}
        adminFetch={adminFetch}
        onBack={() => setSelected(null)}
        onUpdated={() => { setSelected(null); load(search, 0, true) }}
      />
    )
  }

  return (
    <div style={C.card}>
      <div style={{ padding:'16px 18px', borderBottom:'1px solid #f1f5f9', display:'flex', gap:8 }}>
        <input
          placeholder={premiumOnly ? 'Buscar en premium...' : 'Buscar por nombre o email...'}
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          style={{ ...C.input }}
        />
        <button onClick={handleSearch} style={C.pri}>Buscar</button>
      </div>

      {error ? (
        <div style={{ padding:16 }}><ErrMsg msg={error} onRetry={() => load(search, 0, true)} /></div>
      ) : (
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', minWidth:380 }}>
            <thead><tr><Th>Usuario</Th><Th>Plan</Th><Th>Registro</Th></tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} onClick={() => setSelected(u)}
                  style={{ cursor:'pointer', transition:'background 0.1s' }}
                  onMouseEnter={e => e.currentTarget.style.background='#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.background='white'}>
                  <Td>
                    <div style={{ fontWeight:600 }}>{u.nombre || '—'}</div>
                    <div style={{ fontSize:11, color:'#94a3b8', marginTop:1 }}>{u.email}</div>
                  </Td>
                  <Td><Badge premium={u.es_premium} hasta={u.premium_hasta} /></Td>
                  <Td style={{ color:'#64748b', fontSize:12 }}>
                    {u.created_at ? new Date(u.created_at).toLocaleDateString('es-AR') : '—'}
                  </Td>
                </tr>
              ))}
              {!loading && users.length === 0 && (
                <tr><td colSpan={3}><Empty text="Sin resultados" /></td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {loading && <div style={{ textAlign:'center', padding:20 }}><Spin /></div>}

      {hasMore && !loading && (
        <div style={{ padding:'12px 16px', borderTop:'1px solid #f1f5f9' }}>
          <button onClick={loadMore} style={{ ...C.sec, width:'100%' }}>Cargar más</button>
        </div>
      )}
    </div>
  )
}

// ── Codes Tab ─────────────────────────────────────────────────────────────────
function CodesTab({ adminFetch }) {
  const [promos, setPromos] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ code:'', description:'', duration_days:30, max_uses:'' })
  const [creating, setCreating] = useState(false)
  const [msg, setMsg] = useState({ text:'', ok:true })

  const load = useCallback(async () => {
    setLoading(true); setError('')
    const d = await adminFetch('admin_list_promos')
    if (d.ok) setPromos(d.promos || [])
    else setError(d.error || 'Error al cargar códigos')
    setLoading(false)
  }, [adminFetch])

  useEffect(() => { load() }, [load])

  const create = async () => {
    if (!form.code.trim()) return
    setCreating(true); setMsg({ text:'', ok:true })
    const payload = {
      code: form.code.trim().toUpperCase(),
      description: form.description,
      duration_days: Number(form.duration_days),
    }
    if (form.max_uses) payload.max_uses = Number(form.max_uses)
    const d = await adminFetch('admin_create_promo', payload)
    if (d.ok) {
      setMsg({ text:'Código creado correctamente', ok:true })
      setForm({ code:'', description:'', duration_days:30, max_uses:'' })
      load()
    } else {
      setMsg({ text: d.error || 'Error al crear', ok:false })
    }
    setCreating(false)
  }

  const toggle = async (id, current) => {
    await adminFetch('admin_toggle_promo', { code_id: id, is_active: !current })
    load()
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {/* Create form */}
      <div style={{ ...C.card, padding:'18px 20px' }}>
        <div style={{ fontWeight:700, fontSize:14, marginBottom:14 }}>Nuevo código promo</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:10, marginBottom:14 }}>
          <div>
            <label style={{ fontSize:11, fontWeight:700, color:'#64748b', display:'block', marginBottom:4 }}>Código *</label>
            <input placeholder="BIENVENIDA30" value={form.code}
              onChange={e => setForm(f => ({...f, code:e.target.value}))} style={C.input} />
          </div>
          <div>
            <label style={{ fontSize:11, fontWeight:700, color:'#64748b', display:'block', marginBottom:4 }}>Días de acceso</label>
            <input type="number" min={1} value={form.duration_days}
              onChange={e => setForm(f => ({...f, duration_days:e.target.value}))} style={C.input} />
          </div>
          <div>
            <label style={{ fontSize:11, fontWeight:700, color:'#64748b', display:'block', marginBottom:4 }}>Descripción</label>
            <input placeholder="Descripción opcional" value={form.description}
              onChange={e => setForm(f => ({...f, description:e.target.value}))} style={C.input} />
          </div>
          <div>
            <label style={{ fontSize:11, fontWeight:700, color:'#64748b', display:'block', marginBottom:4 }}>Máx. usos (vacío = ∞)</label>
            <input type="number" min={1} placeholder="100" value={form.max_uses}
              onChange={e => setForm(f => ({...f, max_uses:e.target.value}))} style={C.input} />
          </div>
        </div>
        <button onClick={create} disabled={creating || !form.code.trim()}
          style={{ ...C.pri, opacity: creating || !form.code.trim() ? 0.6 : 1 }}>
          {creating ? <Spin /> : 'Crear código'}
        </button>
        {msg.text && (
          <div style={{ marginTop:10, fontSize:12, fontWeight:600, color: msg.ok ? '#059669' : '#dc2626' }}>{msg.text}</div>
        )}
      </div>

      {/* List */}
      <div style={C.card}>
        <div style={{ padding:'14px 18px', borderBottom:'1px solid #f1f5f9', fontWeight:700, fontSize:14 }}>
          Códigos existentes
        </div>
        {loading ? (
          <div style={{ textAlign:'center', padding:32 }}><Spin /></div>
        ) : error ? (
          <div style={{ padding:16 }}><ErrMsg msg={error} onRetry={load} /></div>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', minWidth:480 }}>
              <thead><tr><Th>Código</Th><Th>Descripción</Th><Th>Días</Th><Th>Usos</Th><Th>Vence</Th><Th>Estado</Th></tr></thead>
              <tbody>
                {promos.map(p => (
                  <tr key={p.id}>
                    <Td style={{ fontWeight:700 }}>{p.code}</Td>
                    <Td style={{ color:'#64748b' }}>{p.description || '—'}</Td>
                    <Td>{p.duration_days}d</Td>
                    <Td>{p.uses_count}{p.max_uses ? `/${p.max_uses}` : ''}</Td>
                    <Td style={{ color:'#64748b' }}>{p.expires_at ? new Date(p.expires_at).toLocaleDateString('es-AR') : '—'}</Td>
                    <Td>
                      <button onClick={() => toggle(p.id, p.is_active)}
                        style={p.is_active ? C.pri : C.sec}>
                        {p.is_active ? '✓ Activo' : 'Inactivo'}
                      </button>
                    </Td>
                  </tr>
                ))}
                {promos.length === 0 && (
                  <tr><td colSpan={6}><Empty text="Sin códigos creados" /></td></tr>
                )}
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
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const LIMIT = 40

  const load = useCallback(async (off, replace) => {
    setLoading(true); setError('')
    const d = await adminFetch('admin_list_logs', { offset: off, limit: LIMIT })
    if (d.ok) {
      const list = d.logs || []
      if (replace) setLogs(list)
      else setLogs(prev => [...prev, ...list])
      setHasMore(list.length === LIMIT)
      setOffset(off)
    } else {
      setError(d.error || 'Error al cargar logs')
    }
    setLoading(false)
  }, [adminFetch])

  useEffect(() => { load(0, true) }, [load])

  const color = a => {
    if (a.includes('grant') || a.includes('create') || a.includes('activ')) return '#059669'
    if (a.includes('revoke') || a.includes('deactiv') || a.includes('cancel')) return '#dc2626'
    return '#0077B5'
  }

  if (loading && logs.length === 0) return <div style={{ textAlign:'center', padding:60 }}><Spin /></div>
  if (error) return <ErrMsg msg={error} onRetry={() => load(0, true)} />

  return (
    <div style={C.card}>
      <div style={{ padding:'14px 18px', borderBottom:'1px solid #f1f5f9', fontWeight:700, fontSize:14 }}>
        Registro de acciones
      </div>
      <div style={{ padding:'12px 16px', display:'flex', flexDirection:'column', gap:8 }}>
        {logs.length === 0 && <Empty text="Sin acciones registradas aún" />}
        {logs.map(l => (
          <div key={l.id} style={{
            padding:'10px 14px', background:'#f8fafc', borderRadius:10,
            borderLeft:`3px solid ${color(l.action)}`,
          }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8, flexWrap:'wrap' }}>
              <div>
                <span style={{ fontSize:12, fontWeight:700, color:color(l.action) }}>{l.action}</span>
                {l.target_type && (
                  <span style={{ fontSize:11, color:'#64748b', marginLeft:8 }}>
                    {l.target_type}: {String(l.target_id || '').slice(0,12)}{l.target_id?.length > 12 ? '…' : ''}
                  </span>
                )}
              </div>
              <span style={{ fontSize:11, color:'#94a3b8', whiteSpace:'nowrap' }}>
                {new Date(l.created_at).toLocaleString('es-AR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}
              </span>
            </div>
            {l.details && Object.keys(l.details).length > 0 && (
              <div style={{ fontSize:11, color:'#64748b', marginTop:4, wordBreak:'break-all' }}>
                {JSON.stringify(l.details)}
              </div>
            )}
          </div>
        ))}
      </div>
      {hasMore && !loading && (
        <div style={{ padding:'0 16px 16px' }}>
          <button onClick={() => load(offset + LIMIT, false)} style={{ ...C.sec, width:'100%' }}>Cargar más</button>
        </div>
      )}
      {loading && logs.length > 0 && <div style={{ textAlign:'center', padding:12 }}><Spin /></div>}
    </div>
  )
}

// ── Main Panel ────────────────────────────────────────────────────────────────
export default function AdminPanel({ authToken, onClose }) {
  const [tab, setTab] = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const adminFetch = useAdminFetch(authToken)

  const currentTab = TABS.find(t => t.id === tab)

  return (
    <>
      <style>{`
        @keyframes admspin { to { transform: rotate(360deg) } }
        .adm-nav-btn:hover { background: rgba(0,119,181,0.06) !important; }
        @media (max-width: 640px) {
          .adm-sidebar { display: none !important; }
          .adm-sidebar.open { display: flex !important; position: fixed; inset: 0; z-index: 300; width: 220px !important; box-shadow: 4px 0 24px rgba(0,0,0,0.15); }
          .adm-overlay { display: block !important; }
          .adm-topbar { display: flex !important; }
        }
      `}</style>

      <div style={{ position:'fixed', inset:0, zIndex:200, display:'flex', background:'#f0f4f8', overflow:'hidden' }}>

        {/* Mobile overlay */}
        <div className="adm-overlay"
          style={{ display:'none', position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:299 }}
          onClick={() => setSidebarOpen(false)} />

        {/* Sidebar */}
        <div className={`adm-sidebar${sidebarOpen ? ' open' : ''}`}
          style={{ width:210, minWidth:210, background:'white', borderRight:'1px solid #e2e8f0',
            display:'flex', flexDirection:'column', zIndex:300, height:'100%' }}>

          <div style={{ padding:'18px 20px 16px', borderBottom:'1px solid #f1f5f9' }}>
            <div style={{ fontWeight:800, fontSize:14, color:'#0d2137' }}>Admin Panel</div>
            <div style={{ fontSize:11, color:'#94a3b8', marginTop:1 }}>OptimizaLK</div>
          </div>

          <nav style={{ flex:1, padding:'10px 8px', overflowY:'auto' }}>
            {TABS.map(t => (
              <button key={t.id} className="adm-nav-btn"
                onClick={() => { setTab(t.id); setSidebarOpen(false) }}
                style={{
                  display:'flex', alignItems:'center', gap:10, width:'100%', textAlign:'left',
                  padding:'10px 12px', borderRadius:9, border:'none', cursor:'pointer', marginBottom:2,
                  background: tab === t.id ? 'rgba(0,119,181,0.09)' : 'transparent',
                  color: tab === t.id ? '#0077B5' : '#475569',
                  fontWeight: tab === t.id ? 700 : 500, fontSize:13, transition:'all 0.15s',
                }}>
                <span style={{ fontSize:16 }}>{t.icon}</span>
                {t.label}
              </button>
            ))}
          </nav>

          <div style={{ padding:'10px 8px', borderTop:'1px solid #f1f5f9' }}>
            <button onClick={onClose} style={{ ...C.sec, width:'100%', justifyContent:'center', display:'flex' }}>
              ✕ Cerrar panel
            </button>
          </div>
        </div>

        {/* Main */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>

          {/* Mobile top bar */}
          <div className="adm-topbar"
            style={{ display:'none', alignItems:'center', gap:12, padding:'12px 16px',
              background:'white', borderBottom:'1px solid #e2e8f0', flexShrink:0 }}>
            <button onClick={() => setSidebarOpen(s => !s)}
              style={{ ...C.sec, padding:'6px 10px', fontSize:18, lineHeight:1 }}>☰</button>
            <div style={{ fontWeight:700, fontSize:14, color:'#0d2137' }}>
              {currentTab?.icon} {currentTab?.label}
            </div>
            <button onClick={onClose} style={{ ...C.sec, padding:'6px 10px', marginLeft:'auto', fontSize:12 }}>✕</button>
          </div>

          {/* Content scroll */}
          <div style={{ flex:1, overflowY:'auto', padding:'24px 20px' }}>
            <div style={{ maxWidth:860, marginBottom:8 }}>
              <h1 style={{ fontSize:18, fontWeight:800, color:'#0d2137', marginBottom:20 }}>
                {currentTab?.icon} {currentTab?.label}
              </h1>
              {tab === 'dashboard' && <Dashboard adminFetch={adminFetch} />}
              {tab === 'users'     && <UsersTab  adminFetch={adminFetch} />}
              {tab === 'premium'   && <UsersTab  adminFetch={adminFetch} premiumOnly />}
              {tab === 'codes'     && <CodesTab  adminFetch={adminFetch} />}
              {tab === 'logs'      && <LogsTab   adminFetch={adminFetch} />}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

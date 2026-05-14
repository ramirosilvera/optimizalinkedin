import { useState, useEffect, useCallback } from 'react'
import { WORKER_URL, WORKER_HEADERS, LI_GRADIENT } from '../constants.js'

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'users',     label: 'Usuarios',  icon: '👥' },
  { id: 'premium',   label: 'Premium',   icon: '⭐' },
  { id: 'codes',     label: 'Códigos',   icon: '🎫' },
  { id: 'logs',      label: 'Logs',      icon: '📋' },
]

const CARD = { background: 'white', border: '1px solid rgba(0,119,181,0.12)', borderRadius: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', padding: '20px 24px' }
const BTN_PRI = { background: LI_GRADIENT, color: 'white', border: 'none', borderRadius: 10, padding: '8px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }
const BTN_SEC = { background: '#f0f4f8', color: '#3d5a73', border: '1px solid rgba(0,119,181,0.15)', borderRadius: 10, padding: '8px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }
const BTN_DANGER = { background: '#fef2f2', color: '#dc2626', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 10, padding: '8px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }
const INPUT = { border: '1px solid rgba(0,119,181,0.2)', borderRadius: 10, padding: '8px 12px', fontSize: 13, width: '100%', outline: 'none', background: 'white' }

function Spinner() {
  return <span style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid rgba(0,119,181,0.3)', borderTopColor: '#0077B5', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
}

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{ ...CARD, textAlign: 'center' }}>
      <div style={{ fontSize: 28, fontWeight: 800, color: color || '#0077B5' }}>{value ?? '—'}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

function UserRow({ u, onSelect, isSelected }) {
  const date = u.created_at ? new Date(u.created_at).toLocaleDateString('es-AR') : '—'
  return (
    <tr
      onClick={() => onSelect(u)}
      style={{ cursor: 'pointer', background: isSelected ? 'rgba(0,119,181,0.06)' : 'white', transition: 'background 0.15s' }}>
      <td style={{ padding: '10px 12px', fontSize: 13, borderBottom: '1px solid #f1f5f9' }}>
        {u.nombre || '—'}
        <span style={{ marginLeft: 6, fontSize: 11, color: '#94a3b8' }}>{u.email}</span>
      </td>
      <td style={{ padding: '10px 12px', fontSize: 12, borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' }}>
        {u.es_premium
          ? <span style={{ background: LI_GRADIENT, color: 'white', borderRadius: 99, padding: '2px 10px', fontWeight: 700, fontSize: 11 }}>Premium</span>
          : <span style={{ background: '#f1f5f9', color: '#64748b', borderRadius: 99, padding: '2px 10px', fontWeight: 600, fontSize: 11 }}>Free</span>}
      </td>
      <td style={{ padding: '10px 12px', fontSize: 12, color: '#64748b', borderBottom: '1px solid #f1f5f9' }}>{date}</td>
    </tr>
  )
}

function Dashboard({ adminFetch }) {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    adminFetch('admin_stats')
      .then(d => { if (d.ok) setStats(d.stats); else setError(d.error || 'Error') })
      .catch(() => setError('Error de red'))
      .finally(() => setLoading(false))
  }, [adminFetch])

  if (loading) return <div style={{ textAlign: 'center', padding: 60 }}><Spinner /></div>
  if (error) return <div style={{ color: '#dc2626', padding: 24 }}>{error}</div>
  if (!stats) return null

  const until = stats.premium_users > 0 && stats.active_subs >= 0
    ? `${stats.active_subs} activas`
    : undefined

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16 }}>
      <StatCard label="Usuarios totales"   value={stats.total_users}    color="#0077B5" />
      <StatCard label="Usuarios premium"   value={stats.premium_users}  color="#6366f1" sub={until} />
      <StatCard label="Suscripciones MP"   value={stats.active_subs}    color="#0d9488" sub="autorizadas" />
      <StatCard label="Análisis totales"   value={stats.total_analyses} color="#0ea5e9" />
      <StatCard label="CVs generados"      value={stats.total_cvs}      color="#8b5cf6" />
      <StatCard label="Leads capturados"   value={stats.total_leads}    color="#f59e0b" />
      <StatCard label="Nuevos (7 días)"    value={stats.new_users_7d}   color="#10b981" />
    </div>
  )
}

function UserDetail({ user, adminFetch, onBack, onUpdated }) {
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [grantDays, setGrantDays] = useState(30)
  const [actionLoading, setActionLoading] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    adminFetch('admin_user_detail', { user_id: user.id })
      .then(d => { if (d.ok) setDetail(d) })
      .finally(() => setLoading(false))
  }, [user.id, adminFetch])

  const grantPremium = async () => {
    setActionLoading(true)
    setMsg('')
    const d = await adminFetch('admin_grant_premium', { user_id: user.id, days: grantDays })
    setMsg(d.ok ? `Premium otorgado hasta ${new Date(d.premium_hasta).toLocaleDateString('es-AR')}` : d.error || 'Error')
    if (d.ok) onUpdated()
    setActionLoading(false)
  }

  const revokePremium = async () => {
    if (!confirm(`¿Revocar premium de ${user.nombre || user.email}?`)) return
    setActionLoading(true)
    setMsg('')
    const d = await adminFetch('admin_revoke_premium', { user_id: user.id })
    setMsg(d.ok ? 'Premium revocado' : d.error || 'Error')
    if (d.ok) onUpdated()
    setActionLoading(false)
  }

  return (
    <div style={{ ...CARD, maxWidth: 480 }}>
      <button onClick={onBack} style={{ ...BTN_SEC, marginBottom: 16, fontSize: 12 }}>← Volver</button>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{user.nombre || user.email}</div>
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>{user.email} · ID: {user.id.slice(0, 8)}...</div>

      {loading ? <Spinner /> : detail && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
          <StatCard label="Análisis"   value={detail.analisis_count}   color="#0077B5" />
          <StatCard label="CVs"        value={detail.cv_count}          color="#6366f1" />
          <StatCard label="Entrevistas" value={detail.entrevista_count} color="#0d9488" />
        </div>
      )}

      <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 10, background: user.es_premium ? 'rgba(99,102,241,0.08)' : '#f8fafc', border: `1px solid ${user.es_premium ? 'rgba(99,102,241,0.2)' : '#e2e8f0'}` }}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>Estado: </span>
        <span style={{ fontSize: 13, color: user.es_premium ? '#6366f1' : '#64748b', fontWeight: 600 }}>
          {user.es_premium ? `Premium${user.premium_hasta ? ` hasta ${new Date(user.premium_hasta).toLocaleDateString('es-AR')}` : ''}` : 'Free'}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={grantDays} onChange={e => setGrantDays(Number(e.target.value))}
          style={{ ...INPUT, width: 110 }}>
          {[7, 14, 30, 60, 90, 180, 365].map(d => <option key={d} value={d}>{d} días</option>)}
        </select>
        <button onClick={grantPremium} disabled={actionLoading} style={BTN_PRI}>
          {actionLoading ? <Spinner /> : 'Otorgar Premium'}
        </button>
        {user.es_premium && (
          <button onClick={revokePremium} disabled={actionLoading} style={BTN_DANGER}>
            Revocar
          </button>
        )}
      </div>
      {msg && <div style={{ marginTop: 12, fontSize: 12, color: msg.includes('Error') || msg.includes('error') ? '#dc2626' : '#059669' }}>{msg}</div>}
    </div>
  )
}

function UsersTab({ adminFetch, premiumOnly }) {
  const [users, setUsers] = useState([])
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(null)
  const LIMIT = 20

  const load = useCallback(async (q, off, replace) => {
    setLoading(true)
    const body = { search: q, offset: off, limit: LIMIT }
    if (premiumOnly) body.premium_only = true
    const d = await adminFetch('admin_users', body)
    if (d.ok) {
      if (replace) setUsers(d.users)
      else setUsers(prev => [...prev, ...d.users])
      setHasMore(d.users.length === LIMIT)
    }
    setLoading(false)
  }, [adminFetch, premiumOnly])

  useEffect(() => { load('', 0, true) }, [load])

  const handleSearch = () => { setOffset(0); load(search, 0, true) }
  const loadMore = () => { const next = offset + LIMIT; setOffset(next); load(search, next, false) }

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
    <div style={CARD}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          placeholder={premiumOnly ? 'Buscar en premium...' : 'Buscar por nombre o email...'}
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          style={{ ...INPUT }}
        />
        <button onClick={handleSearch} style={BTN_PRI}>Buscar</button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#64748b' }}>Usuario</th>
              <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#64748b' }}>Plan</th>
              <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#64748b' }}>Registro</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <UserRow key={u.id} u={u} onSelect={setSelected} isSelected={selected?.id === u.id} />
            ))}
            {!loading && users.length === 0 && (
              <tr><td colSpan={3} style={{ textAlign: 'center', padding: 32, color: '#94a3b8', fontSize: 13 }}>Sin resultados</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 20 }}><Spinner /></div>}
      {hasMore && !loading && (
        <button onClick={loadMore} style={{ ...BTN_SEC, marginTop: 12, width: '100%' }}>Cargar más</button>
      )}
    </div>
  )
}

function CodesTab({ adminFetch }) {
  const [promos, setPromos] = useState([])
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ code: '', description: '', duration_days: 30, max_uses: '' })
  const [creating, setCreating] = useState(false)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const d = await adminFetch('admin_list_promos')
    if (d.ok) setPromos(d.promos)
    setLoading(false)
  }, [adminFetch])

  useEffect(() => { load() }, [load])

  const create = async () => {
    if (!form.code.trim()) return
    setCreating(true)
    setMsg('')
    const body = { code: form.code.trim().toUpperCase(), description: form.description, duration_days: Number(form.duration_days) }
    if (form.max_uses) body.max_uses = Number(form.max_uses)
    const d = await adminFetch('admin_create_promo', body)
    setMsg(d.ok ? 'Código creado' : d.error || 'Error')
    if (d.ok) { setForm({ code: '', description: '', duration_days: 30, max_uses: '' }); load() }
    setCreating(false)
  }

  const toggle = async (id, current) => {
    await adminFetch('admin_toggle_promo', { code_id: id, is_active: !current })
    load()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Create form */}
      <div style={CARD}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>Nuevo código promo</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Código *</label>
            <input placeholder="BIENVENIDA30" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} style={INPUT} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Días de acceso</label>
            <input type="number" min={1} value={form.duration_days} onChange={e => setForm(f => ({ ...f, duration_days: e.target.value }))} style={INPUT} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Descripción</label>
            <input placeholder="Descripción opcional" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={INPUT} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Máx. usos (vacío = ilimitado)</label>
            <input type="number" min={1} placeholder="ej: 100" value={form.max_uses} onChange={e => setForm(f => ({ ...f, max_uses: e.target.value }))} style={INPUT} />
          </div>
        </div>
        <button onClick={create} disabled={creating || !form.code.trim()} style={{ ...BTN_PRI, opacity: creating || !form.code.trim() ? 0.6 : 1 }}>
          {creating ? <Spinner /> : 'Crear código'}
        </button>
        {msg && <div style={{ marginTop: 10, fontSize: 12, color: msg.includes('Error') || msg.includes('error') ? '#dc2626' : '#059669' }}>{msg}</div>}
      </div>

      {/* List */}
      <div style={CARD}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>Códigos existentes</div>
        {loading ? <div style={{ textAlign: 'center', padding: 24 }}><Spinner /></div> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['Código', 'Descripción', 'Días', 'Usos', 'Vence', 'Estado'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#64748b' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {promos.map(p => (
                  <tr key={p.id} style={{ background: 'white' }}>
                    <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700, borderBottom: '1px solid #f1f5f9' }}>{p.code}</td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: '#64748b', borderBottom: '1px solid #f1f5f9' }}>{p.description || '—'}</td>
                    <td style={{ padding: '10px 12px', fontSize: 13, borderBottom: '1px solid #f1f5f9' }}>{p.duration_days}d</td>
                    <td style={{ padding: '10px 12px', fontSize: 12, borderBottom: '1px solid #f1f5f9' }}>
                      {p.uses_count}{p.max_uses ? `/${p.max_uses}` : ''}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: '#64748b', borderBottom: '1px solid #f1f5f9' }}>
                      {p.expires_at ? new Date(p.expires_at).toLocaleDateString('es-AR') : '—'}
                    </td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9' }}>
                      <button
                        onClick={() => toggle(p.id, p.is_active)}
                        style={p.is_active ? BTN_PRI : BTN_SEC}>
                        {p.is_active ? 'Activo' : 'Inactivo'}
                      </button>
                    </td>
                  </tr>
                ))}
                {promos.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: 32, color: '#94a3b8', fontSize: 13 }}>Sin códigos creados</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function LogsTab({ adminFetch }) {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const LIMIT = 30

  const load = useCallback(async (off, replace) => {
    setLoading(true)
    const d = await adminFetch('admin_list_logs', { offset: off, limit: LIMIT })
    if (d.ok) {
      if (replace) setLogs(d.logs)
      else setLogs(prev => [...prev, ...d.logs])
      setHasMore(d.logs.length === LIMIT)
    }
    setLoading(false)
  }, [adminFetch])

  useEffect(() => { load(0, true) }, [load])

  const loadMore = () => { const next = offset + LIMIT; setOffset(next); load(next, false) }

  const actionColor = (action) => {
    if (action.includes('grant') || action.includes('create') || action.includes('activate')) return '#059669'
    if (action.includes('revoke') || action.includes('deactivate')) return '#dc2626'
    return '#0077B5'
  }

  return (
    <div style={CARD}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>Registro de acciones</div>
      {loading && logs.length === 0 ? <div style={{ textAlign: 'center', padding: 24 }}><Spinner /></div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {logs.map(l => (
            <div key={l.id} style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: 10, borderLeft: `3px solid ${actionColor(l.action)}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: actionColor(l.action) }}>{l.action}</span>
                  {l.target_type && <span style={{ fontSize: 11, color: '#64748b', marginLeft: 8 }}>{l.target_type}: {(l.target_id || '').slice(0, 12)}...</span>}
                </div>
                <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>
                  {new Date(l.created_at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              {l.details && Object.keys(l.details).length > 0 && (
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                  {JSON.stringify(l.details)}
                </div>
              )}
            </div>
          ))}
          {logs.length === 0 && <div style={{ textAlign: 'center', padding: 32, color: '#94a3b8', fontSize: 13 }}>Sin acciones registradas</div>}
        </div>
      )}
      {hasMore && !loading && (
        <button onClick={loadMore} style={{ ...BTN_SEC, marginTop: 12, width: '100%' }}>Cargar más</button>
      )}
    </div>
  )
}

export default function AdminPanel({ authToken, onClose }) {
  const [tab, setTab] = useState('dashboard')

  const adminFetch = useCallback(async (action, body = {}) => {
    const res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { ...WORKER_HEADERS, Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ action, ...body }),
    })
    return res.json()
  }, [authToken])

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', background: '#f0f4f8', overflow: 'hidden' }}>

        {/* Sidebar */}
        <div style={{ width: 200, minWidth: 200, background: 'white', borderRight: '1px solid rgba(0,119,181,0.12)', display: 'flex', flexDirection: 'column', padding: '24px 0' }}>
          <div style={{ padding: '0 20px 20px', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: '#0d2137' }}>Admin Panel</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>OptimizaLK</div>
          </div>
          <nav style={{ flex: 1, padding: '12px 8px' }}>
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                  padding: '10px 12px', borderRadius: 10, border: 'none', cursor: 'pointer',
                  background: tab === t.id ? 'rgba(0,119,181,0.08)' : 'transparent',
                  color: tab === t.id ? '#0077B5' : '#475569',
                  fontWeight: tab === t.id ? 700 : 500,
                  fontSize: 13, marginBottom: 2, transition: 'all 0.15s',
                }}>
                <span style={{ fontSize: 15 }}>{t.icon}</span>
                {t.label}
              </button>
            ))}
          </nav>
          <div style={{ padding: '12px 8px' }}>
            <button onClick={onClose} style={{ ...BTN_SEC, width: '100%', justifyContent: 'center', display: 'flex' }}>
              ✕ Cerrar
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <div style={{ maxWidth: 900 }}>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0d2137', marginBottom: 24 }}>
              {TABS.find(t => t.id === tab)?.icon} {TABS.find(t => t.id === tab)?.label}
            </h1>

            {tab === 'dashboard' && <Dashboard adminFetch={adminFetch} />}
            {tab === 'users'     && <UsersTab adminFetch={adminFetch} />}
            {tab === 'premium'   && <UsersTab adminFetch={adminFetch} premiumOnly />}
            {tab === 'codes'     && <CodesTab adminFetch={adminFetch} />}
            {tab === 'logs'      && <LogsTab  adminFetch={adminFetch} />}
          </div>
        </div>
      </div>
    </>
  )
}

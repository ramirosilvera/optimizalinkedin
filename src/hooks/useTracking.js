import { useState } from 'react'
import { SUPABASE_URL, SUPABASE_KEY } from '../constants'

export function useTracking() {
  const [trackingColumnas, setTrackingColumnas] = useState([])
  const [trackingCards, setTrackingCards] = useState([])
  const [trackingLoading, setTrackingLoading] = useState(false)
  const [showAddCard, setShowAddCard] = useState(null)
  const [newCardForm, setNewCardForm] = useState({ empresa: '', puesto: '', link_aviso: '', fecha_aplicacion: new Date().toISOString().slice(0, 10), notas: '' })
  const [editCard, setEditCard] = useState(null)
  const [showAddColumna, setShowAddColumna] = useState(false)
  const [newColumnaName, setNewColumnaName] = useState('')
  const [newColumnaColor, setNewColumnaColor] = useState('#64748b')
  const [renameColumna, setRenameColumna] = useState(null)
  const [trackingError, setTrackingError] = useState('')

  const sbUserFetch = (path, options = {}) => {
    const at = localStorage.getItem('ol_at')
    return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...options,
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${at}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
        ...options.headers,
      },
    })
  }

  const DEFAULT_COLUMNAS = [
    { nombre: 'Radar Laboral',    color: '#c2185b', orden: 0 },
    { nombre: 'Aplicado',         color: '#64748b', orden: 1 },
    { nombre: 'Entrevista',       color: '#0077B5', orden: 2 },
    { nombre: 'Proceso Avanzado', color: '#d97706', orden: 3 },
    { nombre: 'Oferta',           color: '#16a34a', orden: 4 },
    { nombre: 'Cerrado',          color: '#dc2626', orden: 5 },
  ]

  const loadTracking = async () => {
    const uid = localStorage.getItem('ol_uid')
    if (!uid) return
    setTrackingLoading(true)
    setTrackingError('')
    try {
      const [colRes, cardRes] = await Promise.all([
        sbUserFetch(`kanban_columnas?user_id=eq.${uid}&order=orden.asc`),
        sbUserFetch(`postulaciones?user_id=eq.${uid}&order=orden.asc,created_at.desc`),
      ])
      let cols  = await colRes.json().catch(() => [])
      const cards = await cardRes.json().catch(() => [])
      if (!Array.isArray(cols) || cols.error) throw new Error(cols.message || 'Error cargando columnas')
      if (cols.length === 0) {
        const seeds = DEFAULT_COLUMNAS.map(c => ({ ...c, user_id: uid }))
        const seedRes = await sbUserFetch('kanban_columnas', {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify(seeds),
        })
        const seeded = await seedRes.json().catch(() => [])
        cols = Array.isArray(seeded) ? seeded.sort((a, b) => a.orden - b.orden) : []
      } else {
        // Migration: insert "Radar Laboral" for users who signed up before this column existed
        const hasRadar = cols.some(c => c.nombre === 'Radar Laboral')
        if (!hasRadar) {
          const seedRes = await sbUserFetch('kanban_columnas', {
            method: 'POST',
            headers: { Prefer: 'return=representation' },
            body: JSON.stringify({ user_id: uid, nombre: 'Radar Laboral', color: '#c2185b', orden: -1 }),
          })
          const seeded = await seedRes.json().catch(() => null)
          const newCol = Array.isArray(seeded) ? seeded[0] : seeded
          if (newCol?.id) cols = [newCol, ...cols].sort((a, b) => a.orden - b.orden)
        }
      }
      setTrackingColumnas(cols)
      setTrackingCards(Array.isArray(cards) ? cards : [])
    } catch (e) {
      setTrackingError(e.message || 'Error cargando postulaciones')
    } finally {
      setTrackingLoading(false)
    }
  }

  const createCard = async (columnaId, form) => {
    const uid = localStorage.getItem('ol_uid')
    const res = await sbUserFetch('postulaciones', {
      method: 'POST',
      body: JSON.stringify({ ...form, user_id: uid, columna_id: columnaId }),
    })
    const data = await res.json().catch(() => [])
    if (!res.ok) throw new Error(data.message || 'Error al crear')
    const card = Array.isArray(data) ? data[0] : data
    setTrackingCards(prev => [card, ...prev])
    return card
  }

  const updateCard = async (id, patch) => {
    const res = await sbUserFetch(`postulaciones?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
    })
    const data = await res.json().catch(() => [])
    if (!res.ok) throw new Error(data.message || 'Error al actualizar')
    const updated = Array.isArray(data) ? data[0] : data
    setTrackingCards(prev => prev.map(c => c.id === id ? { ...c, ...updated } : c))
    return updated
  }

  const deleteCard = async (id) => {
    await sbUserFetch(`postulaciones?id=eq.${id}`, { method: 'DELETE', headers: { Prefer: '' } })
    setTrackingCards(prev => prev.filter(c => c.id !== id))
  }

  const createColumna = async (nombre, color) => {
    const uid = localStorage.getItem('ol_uid')
    const maxOrden = trackingColumnas.reduce((m, c) => Math.max(m, c.orden), -1)
    const res = await sbUserFetch('kanban_columnas', {
      method: 'POST',
      body: JSON.stringify({ user_id: uid, nombre, color, orden: maxOrden + 1 }),
    })
    const data = await res.json().catch(() => [])
    if (!res.ok) throw new Error(data.message || 'Error al crear columna')
    const col = Array.isArray(data) ? data[0] : data
    setTrackingColumnas(prev => [...prev, col])
    return col
  }

  const updateColumna = async (id, patch) => {
    const res = await sbUserFetch(`kanban_columnas?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
    const data = await res.json().catch(() => [])
    if (!res.ok) throw new Error(data.message || 'Error al actualizar columna')
    const updated = Array.isArray(data) ? data[0] : data
    setTrackingColumnas(prev => prev.map(c => c.id === id ? { ...c, ...updated } : c))
  }

  const deleteColumna = async (id) => {
    await sbUserFetch(`kanban_columnas?id=eq.${id}`, { method: 'DELETE', headers: { Prefer: '' } })
    setTrackingColumnas(prev => prev.filter(c => c.id !== id))
    setTrackingCards(prev => prev.map(c => c.columna_id === id ? { ...c, columna_id: null } : c))
  }

  const moveCard = async (cardId, newColumnaId) => {
    setTrackingCards(prev => prev.map(c => c.id === cardId ? { ...c, columna_id: newColumnaId } : c))
    await updateCard(cardId, { columna_id: newColumnaId }).catch(() => {})
  }

  return {
    trackingColumnas, setTrackingColumnas,
    trackingCards, setTrackingCards,
    trackingLoading, setTrackingLoading,
    showAddCard, setShowAddCard,
    newCardForm, setNewCardForm,
    editCard, setEditCard,
    showAddColumna, setShowAddColumna,
    newColumnaName, setNewColumnaName,
    newColumnaColor, setNewColumnaColor,
    renameColumna, setRenameColumna,
    trackingError, setTrackingError,
    loadTracking,
    createCard,
    updateCard,
    deleteCard,
    createColumna,
    updateColumna,
    deleteColumna,
    moveCard,
  }
}

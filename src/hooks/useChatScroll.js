/**
 * useChatScroll — auto-scroll inteligente para el chat de entrenamiento
 *
 * Reglas:
 * 1. Si el usuario está "al fondo" → hacer scroll automático cuando llega
 *    un mensaje nuevo (coach o candidato).
 * 2. Si el usuario SUBIÓ para leer mensajes anteriores → NO hacer scroll
 *    automático. Mostrar un badge "↓ Nuevo mensaje" para invitarlo a bajar.
 * 3. Al abrir el teclado en iOS → re-scroll al fondo para que el último
 *    mensaje quede visible sobre el teclado.
 *
 * Estrategia para detectar "al fondo":
 * - Usamos IntersectionObserver en el elemento sentinel al final de la lista.
 * - Es más preciso que comparar scrollTop + clientHeight vs scrollHeight
 *   (evita falsos negativos por sub-pixel rounding en iOS).
 */

import { useState, useEffect, useRef, useCallback } from 'react'

// Margen de tolerancia: si el sentinel está a menos de este % visible
// consideramos que el usuario NO está al fondo
const SENTINEL_THRESHOLD = 0.1

export function useChatScroll({ messagesCount, keyboardVisible }) {
  const containerRef = useRef(null)   // el div con overflow-y: auto
  const sentinelRef  = useRef(null)   // div vacío al final de la lista
  const isAtBottomRef = useRef(true)  // evita re-renders por cada pixel de scroll
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [hasNewMessage, setHasNewMessage] = useState(false)

  // ── IntersectionObserver en el sentinel ──────────────────────────────────
  useEffect(() => {
    const sentinel = sentinelRef.current
    const container = containerRef.current
    if (!sentinel || !container) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        const visible = entry.intersectionRatio >= SENTINEL_THRESHOLD
        isAtBottomRef.current = visible
        setIsAtBottom(visible)
        if (visible) setHasNewMessage(false) // ya ve el final → limpiar badge
      },
      {
        root: container,        // observar relativo al contenedor de chat
        threshold: SENTINEL_THRESHOLD,
      }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [])

  // ── Scroll automático al recibir nuevo mensaje ────────────────────────────
  useEffect(() => {
    if (messagesCount === 0) return

    if (isAtBottomRef.current) {
      // Usuario estaba al fondo → scroll suave al nuevo mensaje
      scrollToBottom('smooth')
    } else {
      // Usuario subió → mostrar badge sin forzar scroll
      setHasNewMessage(true)
    }
  // Solo reaccionar cuando cambia la cantidad de mensajes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messagesCount])

  // ── Re-scroll cuando el teclado abre en iOS ──────────────────────────────
  // Cuando el teclado aparece, el visual viewport se reduce y el último
  // mensaje puede quedar tapado. Si el usuario estaba al fondo, re-hacemos
  // scroll para compensar.
  useEffect(() => {
    if (keyboardVisible && isAtBottomRef.current) {
      // Pequeño delay para que el layout se estabilice después del resize
      const t = setTimeout(() => scrollToBottom('smooth'), 120)
      return () => clearTimeout(t)
    }
  }, [keyboardVisible])

  // ── API pública ───────────────────────────────────────────────────────────
  const scrollToBottom = useCallback((behavior = 'smooth') => {
    const container = containerRef.current
    if (!container) return

    // scrollIntoView en el sentinel: más confiable que scrollTop = scrollHeight
    // porque IntersectionObserver ya está observando este elemento
    if (sentinelRef.current) {
      sentinelRef.current.scrollIntoView({ behavior, block: 'end' })
    } else {
      container.scrollTo({ top: container.scrollHeight, behavior })
    }
  }, [])

  const handleScrollToBottomBtn = useCallback(() => {
    scrollToBottom('smooth')
    setHasNewMessage(false)
  }, [scrollToBottom])

  return {
    containerRef,
    sentinelRef,
    isAtBottom,
    hasNewMessage,
    scrollToBottom,
    handleScrollToBottomBtn,
  }
}
